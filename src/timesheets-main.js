import { loadLayout } from './components/layout.js';
import {
    dbGetTimesheetsForYear,
    dbUpdateTimesheet,
    dbDeleteTimesheet,
    dbUpsertTimesheets
} from './modules/db-timesheets.js';
import { dbGetConsultants } from './modules/db-consultants.js';
import { showToast, debounce, createRenderScheduler } from './modules/utils.js';
import {
    getSharedFilters,
    setSharedFilters,
    clearSharedFilters,
    getPagePrefs,
    setPagePrefs,
    countAppliedFilters
} from './modules/crm-filters.js';
import { listSavedViews, saveSavedView, deleteSavedView } from './modules/saved-views.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = String(now.getMonth() + 1).padStart(2, '0');

const shared = getSharedFilters();
const pagePrefs = getPagePrefs('timesheets');

let selectedYear = Number(shared.year) || defaultYear;
let selectedMonth = shared.month || defaultMonth;
let selectedCurrency = normalizeCurrency(shared.currency);
let selectedClient = normalizeTextFilter(shared.client);
let selectedW2 = normalizeTextFilter(shared.w2);
let selectedStatus = normalizeStatusFilter(shared.status);
let searchTerm = String(shared.search || '').trim().toLowerCase();
let currentSavedViewId = String(pagePrefs.savedViewId || '');

let rawRows = [];
let consultants = [];
let rowsByConsultant = new Map();

let modalMode = 'add';
let modalTimesheetId = null;
let modalConsultantId = null;
let modalDefaultPeriod = { start: '', end: '' };

const els = {};
const requestRender = createRenderScheduler(() => renderTable());

document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
        console.error('[timesheets] Fatal init error:', err);
        document.body.innerHTML += `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff8f8;z-index:9999;flex-direction:column;gap:0.75rem;font-family:system-ui;"><span style="font-size:2.5rem">⚠️</span><h2 style="margin:0;color:#dc2626">Failed to load Timesheets</h2><p style="margin:0;color:#6b7280;font-size:0.875rem">${err.message}</p><button onclick="location.reload()" style="padding:0.5rem 1.25rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer">Reload</button></div>`;
    });
});

async function init() {
    await loadLayout('timesheets');
    cacheElements();
    setupFilters();
    bindEvents();
    bindModalEvents();
    await refreshData();
}

function cacheElements() {
    els.yearFilter = document.getElementById('yearFilter');
    els.monthFilter = document.getElementById('monthFilter');
    els.allMonthsToggleBtn = document.getElementById('allMonthsToggleBtn');
    els.currencyFilter = document.getElementById('currencyFilter');
    els.clientFilter = document.getElementById('clientFilter');
    els.w2Filter = document.getElementById('w2Filter');
    els.statusFilter = document.getElementById('statusFilter');
    els.searchInput = document.getElementById('searchInput');
    els.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    els.savedViewSelect = document.getElementById('savedViewSelect');
    els.savedViewName = document.getElementById('savedViewName');
    els.saveViewBtn = document.getElementById('saveViewBtn');
    els.updateViewBtn = document.getElementById('updateViewBtn');
    els.deleteViewBtn = document.getElementById('deleteViewBtn');
    els.savedViewMeta = document.getElementById('savedViewMeta');
    els.timesheetMeta = document.getElementById('timesheetMeta');
    els.periodTitle = document.getElementById('timesheetPeriodTitle');
    els.consultantsStat = document.getElementById('timesheetConsultantsStat');
    els.hoursStat = document.getElementById('timesheetHoursStat');
    els.invoicedStat = document.getElementById('timesheetInvoicedStat');
    els.tbody = document.getElementById('timesheetBody');

    els.modal = document.getElementById('tsModal');
    els.modalTitle = document.getElementById('tsModalTitle');
    els.modalSubtitle = document.getElementById('tsModalSubtitle');
    els.modalConsultant = document.getElementById('tsModalConsultant');
    els.modalStart = document.getElementById('tsModalStart');
    els.modalEnd = document.getElementById('tsModalEnd');
    els.modalHours = document.getElementById('tsModalHours');
    els.modalStatus = document.getElementById('tsModalStatus');
    els.modalInvoice = document.getElementById('tsModalInvoice');
    els.modalSave = document.getElementById('tsModalSave');
    els.modalDelete = document.getElementById('tsModalDelete');
    els.modalClose = document.getElementById('tsModalClose');
    els.modalCancel = document.getElementById('tsModalCancel');
}

function setupFilters() {
    const years = [];
    for (let y = defaultYear + 1; y >= defaultYear - 4; y -= 1) years.push(y);

    if (els.yearFilter) {
        els.yearFilter.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        els.yearFilter.value = String(selectedYear);
    }

    if (els.monthFilter) {
        els.monthFilter.innerHTML = `<option value="all">All Months</option>${MONTHS.map((label, idx) => (
            `<option value="${String(idx + 1).padStart(2, '0')}">${label}</option>`
        )).join('')}`;
        els.monthFilter.value = selectedMonth;
    }

    if (els.statusFilter) els.statusFilter.value = selectedStatus;
    if (els.searchInput) els.searchInput.value = searchTerm;
    renderSavedViews();

    updateAllMonthsToggleLabel();
    updatePeriodLabel();
}

function bindEvents() {
    els.yearFilter?.addEventListener('change', async (e) => {
        selectedYear = Number(e.target.value);
        persistShared();
        await refreshData();
    });

    els.monthFilter?.addEventListener('change', (e) => {
        selectedMonth = e.target.value;
        persistShared();
        updateAllMonthsToggleLabel();
        requestRender();
    });

    els.allMonthsToggleBtn?.addEventListener('click', () => {
        selectedMonth = selectedMonth === 'all' ? defaultMonth : 'all';
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        persistShared();
        updateAllMonthsToggleLabel();
        requestRender();
    });

    /* ── Period Prev / Next arrows ── */
    document.getElementById('periodPrevBtn')?.addEventListener('click', async () => {
        let m = selectedMonth === 'all' ? 1 : Number(selectedMonth);
        let y = selectedYear;
        m -= 1;
        if (m < 1) { m = 12; y -= 1; }
        selectedYear = y;
        selectedMonth = String(m).padStart(2, '0');
        if (els.yearFilter) els.yearFilter.value = String(y);
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        persistShared();
        await refreshData();
    });
    document.getElementById('periodNextBtn')?.addEventListener('click', async () => {
        let m = selectedMonth === 'all' ? 12 : Number(selectedMonth);
        let y = selectedYear;
        m += 1;
        if (m > 12) { m = 1; y += 1; }
        selectedYear = y;
        selectedMonth = String(m).padStart(2, '0');
        if (els.yearFilter) els.yearFilter.value = String(y);
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        persistShared();
        await refreshData();
    });


    els.currencyFilter?.addEventListener('change', (e) => {
        selectedCurrency = normalizeCurrency(e.target.value);
        persistShared();
        requestRender();
    });

    els.clientFilter?.addEventListener('change', (e) => {
        selectedClient = normalizeTextFilter(e.target.value);
        persistShared();
        requestRender();
    });

    els.w2Filter?.addEventListener('change', (e) => {
        selectedW2 = normalizeTextFilter(e.target.value);
        persistShared();
        requestRender();
    });

    els.statusFilter?.addEventListener('change', (e) => {
        selectedStatus = normalizeStatusFilter(e.target.value);
        persistShared();
        requestRender();
    });

    const handleSearch = debounce((e) => {
        searchTerm = e.target.value.trim().toLowerCase();
        persistShared();
        requestRender();
    }, 120);
    els.searchInput?.addEventListener('input', handleSearch);

    els.resetFiltersBtn?.addEventListener('click', () => {
        const fresh = clearSharedFilters({ keepPeriod: false });
        selectedYear = fresh.year;
        selectedMonth = fresh.month;
        selectedCurrency = normalizeCurrency(fresh.currency);
        selectedClient = normalizeTextFilter(fresh.client);
        selectedW2 = normalizeTextFilter(fresh.w2);
        selectedStatus = normalizeStatusFilter(fresh.status);
        searchTerm = String(fresh.search || '').trim().toLowerCase();

        if (els.yearFilter) els.yearFilter.value = String(selectedYear);
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        if (els.searchInput) els.searchInput.value = searchTerm;

        updateAllMonthsToggleLabel();
        populateFilterOptions();
        requestRender();
    });

    els.savedViewSelect?.addEventListener('change', async (event) => {
        const id = String(event.target.value || '');
        currentSavedViewId = id;
        setPagePrefs('timesheets', { savedViewId: currentSavedViewId });
        renderSavedViews();
        if (!id) return;
        const view = listSavedViews('timesheets').find((item) => item.id === id);
        if (view) await applySavedView(view);
    });

    els.saveViewBtn?.addEventListener('click', () => {
        const name = String(els.savedViewName?.value || '').trim();
        if (!name) {
            showToast('Enter a name for this saved view.', 'error');
            return;
        }
        const saved = saveSavedView('timesheets', {
            name,
            state: captureSavedViewState()
        });
        currentSavedViewId = saved.id;
        setPagePrefs('timesheets', { savedViewId: currentSavedViewId });
        renderSavedViews();
        showToast('Saved view created.', 'success');
    });

    els.updateViewBtn?.addEventListener('click', () => {
        if (!currentSavedViewId) return;
        const existing = listSavedViews('timesheets').find((item) => item.id === currentSavedViewId);
        const name = String(els.savedViewName?.value || existing?.name || '').trim();
        if (!name) {
            showToast('Enter a name for this saved view.', 'error');
            return;
        }
        saveSavedView('timesheets', {
            id: currentSavedViewId,
            name,
            state: captureSavedViewState()
        });
        renderSavedViews();
        showToast('Saved view updated.', 'success');
    });

    els.deleteViewBtn?.addEventListener('click', () => {
        if (!currentSavedViewId) return;
        if (!confirm('Delete this saved view?')) return;
        deleteSavedView('timesheets', currentSavedViewId);
        currentSavedViewId = '';
        setPagePrefs('timesheets', { savedViewId: '' });
        renderSavedViews();
        showToast('Saved view deleted.', 'success');
    });

    document.addEventListener('click', async (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        const deleteBtn = target.closest('.ts-delete-row');
        if (deleteBtn) {
            const id = deleteBtn.getAttribute('data-id');
            if (!id) return;
            if (!confirm('Delete this timesheet?')) return;
            await deleteTimesheet(id);
            return;
        }

        const addBtn = target.closest('.ts-add-row');
        if (addBtn) {
            modalMode = 'add';
            modalTimesheetId = null;
            modalConsultantId = addBtn.getAttribute('data-consultant');
            modalDefaultPeriod = {
                start: addBtn.getAttribute('data-start') || '',
                end: addBtn.getAttribute('data-end') || ''
            };

            openModal({
                consultant: getConsultantName(modalConsultantId),
                start: modalDefaultPeriod.start,
                end: modalDefaultPeriod.end,
                hours: 0,
                status: 'pending',
                invoice: ''
            });
            return;
        }

        const editBtn = target.closest('.ts-edit-row');
        if (editBtn) {
            const id = editBtn.getAttribute('data-id');
            const consultantId = editBtn.getAttribute('data-consultant');
            const ts = rawRows.find(r => r.id === id);
            if (!ts) return;

            // Block editing of invoiced timesheets
            if (ts.status === 'invoiced' && !editBtn.classList.contains('ts-edit-invoiced')) {
                showToast('This timesheet is linked to an invoice. Edit the invoice to make changes.', 'error');
                return;
            }

            modalMode = 'edit';
            modalTimesheetId = id;
            modalConsultantId = consultantId;

            const isInvoiced = ts.status === 'invoiced';
            openModal({
                consultant: getConsultantName(consultantId),
                start: ts.period_start,
                end: ts.period_end,
                hours: ts.hours,
                status: ts.status,
                invoice: ts.invoice_number || '',
                locked: isInvoiced // passed to openModal to show a warning
            });
            return;
        }
    });
}

function bindModalEvents() {
    els.modalClose?.addEventListener('click', closeModal);
    els.modalCancel?.addEventListener('click', closeModal);

    els.modal?.addEventListener('click', (e) => {
        if (e.target === els.modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.modal?.classList.contains('is-open')) {
            closeModal();
        }
    });

    els.modalSave?.addEventListener('click', saveFromModal);
    els.modalDelete?.addEventListener('click', async () => {
        if (!modalTimesheetId) return;
        if (!confirm('Delete this timesheet?')) return;
        await deleteTimesheet(modalTimesheetId);
        closeModal();
    });
}

async function refreshData() {
    setMeta('Loading timesheets...');
    try {
        const [rows, consultantsData] = await Promise.all([
            dbGetTimesheetsForYear(selectedYear),
            dbGetConsultants()
        ]);

        consultants = consultantsData || [];
        rawRows = normalizeRows(rows);
        rowsByConsultant = buildRowsIndex(rawRows);
        populateFilterOptions();
        requestRender();
    } catch (err) {
        console.error(err);
        consultants = [];
        rawRows = [];
        rowsByConsultant = new Map();
        requestRender();
        showToast('Failed to load timesheets', 'error');
    }
}

function normalizeRows(rows) {
    return (rows || []).map((row) => {
        const consultant = Array.isArray(row.consultants) ? row.consultants[0] : (row.consultants || {});
        const currency = normalizeCurrency(consultant.currency || 'USD');

        return {
            id: row.id,
            consultant_id: row.consultant_id,
            consultant_name: consultant.name || 'Unknown',
            client: consultant.client || '-',
            w2_company: consultant.w2_company || '-',
            bill_rate: Number(consultant.bill_rate) || 0,
            currency,
            period_start: row.period_start,
            period_end: row.period_end,
            hours: Number(row.hours_worked) || 0,
            status: normalizeStatusFilter(row.status || (row.invoice_number ? 'invoiced' : 'pending')),
            invoice_number: row.invoice_number || ''
        };
    });
}

function buildRowsIndex(rows) {
    const index = new Map();
    (rows || []).forEach((row) => {
        const key = String(row.consultant_id || '');
        if (!key) return;
        const list = index.get(key) || [];
        list.push(row);
        index.set(key, list);
    });
    return index;
}

function populateFilterOptions() {
    const currencyMap = new Map();
    ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].forEach(code => currencyMap.set(code, code));

    rawRows.forEach(r => currencyMap.set(normalizeCurrency(r.currency), normalizeCurrency(r.currency)));
    consultants.forEach(c => currencyMap.set(normalizeCurrency(c.currency || 'USD'), normalizeCurrency(c.currency || 'USD')));

    const clientMap = collectLabelMap([
        ...rawRows.map(r => r.client),
        ...consultants.map(c => c.client)
    ]);

    const w2Map = collectLabelMap([
        ...rawRows.map(r => r.w2_company),
        ...consultants.map(c => c.w2_company)
    ]);

    setSelectOptions(els.currencyFilter, 'All Currencies', Array.from(currencyMap.values()).sort((a, b) => a.localeCompare(b)), selectedCurrency);
    setSelectOptions(els.clientFilter, 'All Clients', Array.from(clientMap.entries()).sort((a, b) => a[1].localeCompare(b[1])), selectedClient, true);
    setSelectOptions(els.w2Filter, 'All W2 Companies', Array.from(w2Map.entries()).sort((a, b) => a[1].localeCompare(b[1])), selectedW2, true);

    if (els.statusFilter) els.statusFilter.value = selectedStatus;
}

function setSelectOptions(select, allLabel, options, selectedValue, hasLabelPairs = false) {
    if (!select) return;

    const html = [`<option value="all">${allLabel}</option>`];
    if (hasLabelPairs) {
        options.forEach(([value, label]) => {
            html.push(`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`);
        });
    } else {
        options.forEach((value) => {
            html.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
        });
    }

    select.innerHTML = html.join('');

    const normalized = normalizeSelectValue(selectedValue, hasLabelPairs ? options.map(([v]) => v) : options);
    select.value = normalized;

    if (select === els.currencyFilter) selectedCurrency = normalizeCurrency(normalized);
    if (select === els.clientFilter) selectedClient = normalizeTextFilter(normalized);
    if (select === els.w2Filter) selectedW2 = normalizeTextFilter(normalized);
}

function normalizeSelectValue(value, options) {
    if (value === 'all') return 'all';
    return options.includes(value) ? value : 'all';
}

function getPeriodRange() {
    if (selectedMonth === 'all') {
        return {
            start: `${selectedYear}-01-01`,
            end: `${selectedYear}-12-31`,
            monthKey: null,
            label: `All Months ${selectedYear}`
        };
    }

    const m = Number(selectedMonth);
    const start = new Date(Date.UTC(selectedYear, m - 1, 1));
    const end = new Date(Date.UTC(selectedYear, m, 0));
    return {
        start: toIso(start),
        end: toIso(end),
        monthKey: `${selectedYear}-${String(m).padStart(2, '0')}`,
        label: `${MONTHS[m - 1]} ${selectedYear}`
    };
}

function getFilteredRows() {
    const range = getPeriodRange();

    const visibleConsultants = consultants
        .filter(c => isConsultantInRange(c, range))
        .filter(c => selectedCurrency === 'all' || normalizeCurrency(c.currency || 'USD') === selectedCurrency)
        .filter(c => selectedClient === 'all' || normalizeTextFilter(c.client) === selectedClient)
        .filter(c => selectedW2 === 'all' || normalizeTextFilter(c.w2_company) === selectedW2)
        .filter(c => {
            if (!searchTerm) return true;
            const hay = `${c.name || ''} ${c.client || ''} ${c.w2_company || ''}`.toLowerCase();
            return hay.includes(searchTerm);
        });

    const rows = visibleConsultants.map((consultant) => {
        const consultantRows = (rowsByConsultant.get(String(consultant.id)) || []).filter((row) => (
            !range.monthKey || String(row.period_start || '').slice(0, 7) === range.monthKey
        ));

        const hours = consultantRows.reduce((sum, row) => sum + row.hours, 0);
        const statuses = Array.from(new Set(consultantRows.map(r => r.status)));
        const statusDisplay = consultantRows.length === 0
            ? 'none'
            : (statuses.length === 1 ? statuses[0] : 'mixed');

        const invoiceNumbers = Array.from(new Set(
            consultantRows
                .map(r => String(r.invoice_number || '').trim())
                .filter(Boolean)
        ));

        const invoiceDisplay = consultantRows.length === 0
            ? 'unbilled'
            : invoiceNumbers.length === 0
                ? 'unbilled'
                : invoiceNumbers.length === 1
                    ? invoiceNumbers[0]
                    : 'multiple';

        if (selectedStatus !== 'all' && !consultantRows.some(r => r.status === selectedStatus)) {
            return null;
        }

        const primary = pickPrimaryTimesheet(consultantRows);

        return {
            consultant_id: consultant.id,
            consultant_name: consultant.name || 'Unknown',
            client: consultant.client || '-',
            w2_company: consultant.w2_company || '-',
            bill_rate: Number(consultant.bill_rate) || 0,
            currency: normalizeCurrency(consultant.currency || 'USD'),
            period_start: primary?.period_start || range.start,
            period_end: primary?.period_end || range.end,
            hours,
            status: statusDisplay,
            invoice_number: invoiceDisplay,
            times: consultantRows,
            primary
        };
    }).filter(Boolean);

    rows.sort((a, b) => a.consultant_name.localeCompare(b.consultant_name));
    return rows;
}

function renderTable() {
    if (!els.tbody) return;

    const rows = getFilteredRows();
    const range = getPeriodRange();

    const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
    const invoicedHours = rows
        .filter((row) => row.status === 'invoiced')
        .reduce((sum, row) => sum + row.hours, 0);
    if (els.periodTitle) els.periodTitle.textContent = range.label;
    if (els.consultantsStat) els.consultantsStat.textContent = String(rows.length);
    if (els.hoursStat) els.hoursStat.textContent = totalHours.toFixed(2);
    if (els.invoicedStat) els.invoicedStat.textContent = invoicedHours.toFixed(2);
    updateSummaryMeta(range.label, rows.length, totalHours);

    if (rows.length === 0) {
        els.tbody.innerHTML = `
            <tr>
                <td colspan="10" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">🧾</span>
                        <p class="empty-state__text">No data yet for these filters.</p>
                        <p class="empty-state__text" style="font-size:0.8125rem;">Use <strong>Add</strong> to create timesheets, or generate from New Invoice.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    els.tbody.innerHTML = rows.map((row) => {
        const hasEntries = row.times.length > 0;
        const isInvoiced = row.status === 'invoiced';

        let actions;
        if (!hasEntries) {
            actions = `<button class="btn btn--primary btn--sm ts-add-row" data-consultant="${row.consultant_id}" data-start="${row.period_start}" data-end="${row.period_end}">Add</button>`;
        } else if (isInvoiced) {
            // Locked row — show invoice link and a subtle unlock hint
            actions = `
                <span style="font-size:0.75rem;color:#6b7280;display:inline-flex;align-items:center;gap:0.25rem;">🔒 Invoiced</span>
                <button class="btn btn--ghost btn--sm ts-edit-row ts-edit-invoiced" title="This timesheet is invoiced. Click to view (editing blocked)." data-id="${row.primary.id}" data-consultant="${row.consultant_id}" style="color:#9ca3af;">View</button>
            `;
        } else {
            actions = `
                <button class="btn btn--outline btn--sm ts-edit-row" data-id="${row.primary.id}" data-consultant="${row.consultant_id}">Edit</button>
                <button class="btn btn--ghost btn--sm ts-delete-row" data-id="${row.primary.id}">Delete</button>
            `;
        }

        const rowStyle = isInvoiced ? 'background:#fafafa; opacity:0.9;' : '';

        return `
            <tr style="${rowStyle}">
                <td>
                    <div style="font-weight:600;">${escapeHtml(row.consultant_name)}</div>
                    <div style="font-size:12px;color:var(--text-tertiary);">${row.currency} ${(row.bill_rate || 0).toFixed(2)}/hr</div>
                </td>
                <td>${escapeHtml(row.client)}</td>
                <td>${escapeHtml(row.w2_company)}</td>
                <td>${row.period_start || '—'}</td>
                <td>${row.period_end || '—'}</td>
                <td>${row.hours.toFixed(2)}</td>
                <td>${renderStatusBadge(row.status)}</td>
                <td>${escapeHtml(row.invoice_number)}</td>
                <td>${row.currency}</td>
                <td><div class="ts-inline-controls">${actions}</div></td>
            </tr>
        `;
    }).join('');
}

function renderStatusBadge(status) {
    if (status === 'invoiced') {
        return '<span class="status-badge status-invoiced">Invoiced</span>';
    }
    if (status === 'pending') {
        return '<span class="status-badge status-pending">Pending</span>';
    }
    if (status === 'mixed') {
        return '<span class="status-badge status-mixed">Mixed</span>';
    }
    return '<span style="color:var(--text-tertiary);">—</span>';
}

function isConsultantInRange(consultant, range) {
    if (consultant.status === 'pending') return false; // Hide from timesheets
    const start = consultant.start_date || '0000-01-01';
    const end = consultant.end_date || '9999-12-31';
    return start <= range.end && end >= range.start;
}

function openModal(data) {
    if (!els.modal) return;

    if (els.modalTitle) {
        els.modalTitle.textContent = modalMode === 'add' ? 'Add Timesheet' : 'Edit Timesheet';
    }
    if (els.modalSubtitle) {
        els.modalSubtitle.textContent = modalMode === 'add'
            ? 'Create a new timesheet entry for the selected consultant.'
            : 'Update hours and period. Invoice linkage is managed from the invoice flow.';
    }

    if (els.modalDelete) {
        els.modalDelete.style.display = modalMode === 'edit' ? 'inline-flex' : 'none';
    }

    if (els.modalConsultant) els.modalConsultant.value = data.consultant || '';
    if (els.modalStart) els.modalStart.value = data.start || '';
    if (els.modalEnd) els.modalEnd.value = data.end || '';
    if (els.modalHours) els.modalHours.value = typeof data.hours === 'number' ? data.hours : 0;
    if (els.modalStatus) els.modalStatus.value = normalizeStatusFilter(data.status || 'pending');
    if (els.modalInvoice) els.modalInvoice.value = data.invoice || '';
    const hasInvoiceLink = Boolean((data.invoice || '').trim());
    const invoicedOption = els.modalStatus?.querySelector('option[value="invoiced"]');
    if (els.modalStatus) {
        if (hasInvoiceLink) {
            els.modalStatus.value = 'invoiced';
            els.modalStatus.disabled = true;
        } else {
            els.modalStatus.disabled = false;
        }
    }
    if (invoicedOption) {
        invoicedOption.disabled = !hasInvoiceLink;
        if (!hasInvoiceLink && els.modalStatus?.value === 'invoiced') {
            els.modalStatus.value = 'pending';
        }
    }

    els.modal.classList.add('is-open');
    document.body.classList.add('modal-open');
}

function closeModal() {
    if (!els.modal) return;
    els.modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    modalMode = 'add';
    modalTimesheetId = null;
    modalConsultantId = null;
    modalDefaultPeriod = { start: '', end: '' };
}

async function saveFromModal() {
    const start = els.modalStart?.value || '';
    const end = els.modalEnd?.value || '';
    const hours = Number(els.modalHours?.value);
    const status = normalizeStatusFilter(els.modalStatus?.value || 'pending');
    const invoice = (els.modalInvoice?.value || '').trim();

    if (!start || !end) {
        showToast('Period start and end are required', 'error');
        return;
    }

    if (start > end) {
        showToast('Period start cannot be after period end', 'error');
        return;
    }

    if (!Number.isFinite(hours) || hours < 0) {
        showToast('Hours must be zero or greater', 'error');
        return;
    }

    if (!invoice && status === 'invoiced') {
        showToast('Invoiced status is set automatically when an invoice is saved.', 'error');
        return;
    }

    try {
        if (modalMode === 'add') {
            if (!modalConsultantId) {
                showToast('Consultant is missing for this action', 'error');
                return;
            }
            await dbUpsertTimesheets([{
                consultant_id: modalConsultantId,
                period_start: start || modalDefaultPeriod.start,
                period_end: end || modalDefaultPeriod.end,
                hours_worked: hours,
                status: 'pending',
                invoice_number: null
            }]);
        } else if (modalMode === 'edit' && modalTimesheetId) {
            await dbUpdateTimesheet(modalTimesheetId, {
                period_start: start,
                period_end: end,
                hours_worked: hours,
                status,
                invoice_number: invoice || null
            });
        }

        showToast('Timesheet saved', 'success');
        closeModal();
        await refreshData();
    } catch (err) {
        console.error(err);
        showToast('Failed to save timesheet', 'error');
    }
}

async function deleteTimesheet(id) {
    try {
        await dbDeleteTimesheet(id);
        showToast('Timesheet deleted', 'success');
        await refreshData();
    } catch (err) {
        console.error(err);
        showToast('Failed to delete timesheet', 'error');
    }
}

function pickPrimaryTimesheet(times) {
    if (!Array.isArray(times) || times.length === 0) return null;
    return [...times].sort((a, b) => {
        const aDate = String(a.period_start || '');
        const bDate = String(b.period_start || '');
        if (aDate === bDate) return String(a.id).localeCompare(String(b.id));
        return bDate.localeCompare(aDate);
    })[0];
}


function updateSummaryMeta(periodLabel, totalConsultants, totalHours) {
    const applied = countAppliedFilters(
        {
            year: selectedYear,
            month: selectedMonth,
            currency: selectedCurrency,
            client: selectedClient,
            w2: selectedW2,
            status: selectedStatus,
            search: searchTerm
        },
        {
            year: defaultYear,
            month: defaultMonth,
            currency: 'all',
            client: 'all',
            w2: 'all',
            status: 'all',
            search: ''
        }
    );
    const filterText = applied > 0
        ? `${applied} extra filter${applied === 1 ? '' : 's'} active`
        : 'Default filter set';
    setMeta(`${periodLabel} • ${totalConsultants} consultants • ${totalHours.toFixed(2)} hours • ${filterText}`);
}

function updateAllMonthsToggleLabel() {
    if (!els.allMonthsToggleBtn) return;
    els.allMonthsToggleBtn.textContent = selectedMonth === 'all' ? 'All Months: ON' : 'All Months: OFF';
}

function updatePeriodLabel() {
    const el = document.getElementById('periodLabel');
    if (!el) return;
    if (selectedMonth === 'all') {
        el.textContent = `${selectedYear}`;
    } else {
        const mIdx = Number(selectedMonth) - 1;
        el.textContent = `${MONTHS[mIdx]} ${selectedYear}`;
    }
}

function collectLabelMap(values = []) {
    const map = new Map();
    values.forEach((raw) => {
        const label = String(raw || '').trim();
        if (!label || label === '-') return;
        const key = label.toLowerCase();
        if (!map.has(key)) map.set(key, label);
    });
    return map;
}

function setMeta(text) {
    if (els.timesheetMeta) els.timesheetMeta.textContent = text;
}

function persistShared() {
    setSharedFilters({
        year: selectedYear,
        month: selectedMonth,
        currency: selectedCurrency,
        client: selectedClient,
        w2: selectedW2,
        status: selectedStatus,
        search: searchTerm
    });
}

function captureSavedViewState() {
    return {
        year: selectedYear,
        month: selectedMonth,
        currency: selectedCurrency,
        client: selectedClient,
        w2: selectedW2,
        status: selectedStatus,
        search: searchTerm
    };
}

function renderSavedViews() {
    const views = listSavedViews('timesheets');
    if (els.savedViewSelect) {
        els.savedViewSelect.innerHTML = ['<option value="">Saved Views</option>', ...views.map((view) => (
            `<option value="${escapeHtml(view.id)}">${escapeHtml(view.name)}</option>`
        ))].join('');
        els.savedViewSelect.value = views.some((view) => view.id === currentSavedViewId) ? currentSavedViewId : '';
    }

    const activeView = views.find((view) => view.id === currentSavedViewId);
    if (els.savedViewName) {
        if (document.activeElement !== els.savedViewName || !els.savedViewName.value.trim()) {
            els.savedViewName.value = activeView?.name || '';
        }
    }
    if (els.savedViewMeta) {
        const totalText = views.length
            ? `${views.length} saved view${views.length === 1 ? '' : 's'}`
            : 'No saved views yet';
        els.savedViewMeta.textContent = activeView
            ? `Active: ${activeView.name} • ${totalText}`
            : totalText;
    }
    if (els.updateViewBtn) els.updateViewBtn.disabled = !activeView;
    if (els.deleteViewBtn) els.deleteViewBtn.disabled = !activeView;
}

async function applySavedView(view) {
    const state = view?.state || {};
    selectedYear = Number(state.year) || defaultYear;
    selectedMonth = state.month || defaultMonth;
    selectedCurrency = normalizeCurrency(state.currency);
    selectedClient = normalizeTextFilter(state.client);
    selectedW2 = normalizeTextFilter(state.w2);
    selectedStatus = normalizeStatusFilter(state.status);
    searchTerm = String(state.search || '').trim().toLowerCase();

    if (els.yearFilter) els.yearFilter.value = String(selectedYear);
    if (els.monthFilter) els.monthFilter.value = selectedMonth;
    if (els.statusFilter) els.statusFilter.value = selectedStatus;
    if (els.searchInput) els.searchInput.value = searchTerm;

    persistShared();
    updateAllMonthsToggleLabel();
    await refreshData();
}

function getConsultantName(id) {
    const consultant = consultants.find(c => String(c.id) === String(id));
    return consultant?.name || 'Consultant';
}

function normalizeCurrency(value) {
    const input = String(value || 'all').trim();
    if (!input || input.toLowerCase() === 'all') return 'all';
    return input.toUpperCase();
}

function normalizeTextFilter(value) {
    const input = String(value || 'all').trim().toLowerCase();
    return input || 'all';
}

function normalizeStatusFilter(value) {
    const input = String(value || 'all').trim().toLowerCase();
    if (input === 'pending' || input === 'invoiced' || input === 'mixed') return input;
    return 'all';
}

function findLabel(values, normalizedValue) {
    const hit = values.find((value) => normalizeTextFilter(value) === normalizedValue);
    return hit || normalizedValue;
}

function capitalize(value) {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function toIso(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
