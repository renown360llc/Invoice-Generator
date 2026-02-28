import { loadLayout } from './components/layout.js';
import { dbGetConsultants, dbSaveConsultant, dbDeleteConsultant, dbGetTimesheetsCountForConsultant } from './modules/db-consultants.js';
import { dbGetTimesheetsForYear } from './modules/db-timesheets.js';
import { debounce, createRenderScheduler } from './modules/utils.js';
import {
    getSharedFilters,
    setSharedFilters,
    clearSharedFilters,
    getPagePrefs,
    setPagePrefs,
    countAppliedFilters
} from './modules/crm-filters.js';

let consultants = [];
let yearTimesheets = [];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = String(now.getMonth() + 1).padStart(2, '0');

const shared = getSharedFilters();
const prefs = getPagePrefs('consultants');

let currentFilter = normalizeConsultantStatus(prefs.status || 'active'); // all | active | inactive
let searchQuery = String(shared.search || '').trim().toLowerCase();
let sortState = {
    key: prefs.sortKey || 'name',
    dir: prefs.sortDir === 'desc' ? 'desc' : 'asc'
};

let selectedYear = Number(shared.year) || defaultYear;
let selectedMonth = shared.month || defaultMonth;
let filterCurrency = normalizeCurrency(shared.currency);
let filterClient = normalizeTextFilter(shared.client);
let filterW2 = normalizeTextFilter(shared.w2);

const els = {};
const requestRender = createRenderScheduler(() => renderTable());

document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
        console.error('[consultants] Fatal init error:', err);
        document.body.innerHTML += `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff8f8;z-index:9999;flex-direction:column;gap:0.75rem;font-family:system-ui;"><span style="font-size:2.5rem">⚠️</span><h2 style="margin:0;color:#dc2626">Failed to load Consultants</h2><p style="margin:0;color:#6b7280;font-size:0.875rem">${err.message}</p><button onclick="location.reload()" style="padding:0.5rem 1.25rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer">Reload</button></div>`;
    });
});

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('toast--show'), 10);
    setTimeout(() => {
        toast.classList.remove('toast--show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatMoney(amount, currency) {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD'
        }).format(Number(amount) || 0);
    } catch (err) {
        return `${currency || 'USD'} ${(Number(amount) || 0).toFixed(2)}`;
    }
}

function isConsultantActive(consultant) {
    if (!consultant) return false;
    if (consultant.status === 'inactive' || consultant.status === 'pending') return false;
    if (consultant.end_date && consultant.end_date < new Date().toISOString().slice(0, 10)) return false;
    return true;
}

function updateFormRequirements() {
    const status = els.status?.value || 'active';
    const isPending = status === 'pending';

    const reqEls = {
        startDate: document.getElementById('startDateReq'),
        billRate: document.getElementById('billRateReq'),
        commissionRate: document.getElementById('commissionRateReq')
    };

    if (reqEls.startDate) reqEls.startDate.style.display = isPending ? 'none' : 'inline';
    if (reqEls.billRate) reqEls.billRate.style.display = isPending ? 'none' : 'inline';
    if (reqEls.commissionRate) reqEls.commissionRate.style.display = isPending ? 'none' : 'inline';
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

    const monthNum = Number(selectedMonth);
    const start = new Date(Date.UTC(selectedYear, monthNum - 1, 1));
    const end = new Date(Date.UTC(selectedYear, monthNum, 0));

    return {
        start: toIso(start),
        end: toIso(end),
        monthKey: `${selectedYear}-${String(monthNum).padStart(2, '0')}`,
        label: `${monthLabel(selectedMonth)} ${selectedYear}`
    };
}

function buildCoverageSet(range) {
    const covered = new Set();

    yearTimesheets.forEach((row) => {
        if (row.consultant_id && (!range.monthKey || String(row.period_start || '').slice(0, 7) === range.monthKey)) {
            covered.add(String(row.consultant_id));
        }
    });

    return covered;
}

function renderTable() {
    if (!els.tbody) return;

    const range = getPeriodRange();
    const coverageSet = buildCoverageSet(range);

    let filtered = consultants.filter((consultant) => {
        if (searchQuery) {
            const hay = `${consultant.name || ''} ${consultant.client || ''} ${consultant.w2_company || ''}`.toLowerCase();
            if (!hay.includes(searchQuery)) return false;
        }

        const active = isConsultantActive(consultant);
        const isPending = consultant.status === 'pending';
        if (currentFilter === 'active' && !active) return false;
        if (currentFilter === 'pending' && !isPending) return false;
        if (currentFilter === 'inactive' && (active || isPending)) return false;

        if (filterCurrency !== 'all' && normalizeCurrency(consultant.currency || 'USD') !== filterCurrency) return false;
        if (filterClient !== 'all' && normalizeTextFilter(consultant.client) !== filterClient) return false;
        if (filterW2 !== 'all' && normalizeTextFilter(consultant.w2_company) !== filterW2) return false;

        return true;
    });

    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    filtered.sort((a, b) => {
        const dir = sortState.dir === 'desc' ? -1 : 1;

        const valueFor = (row) => {
            switch (sortState.key) {
                case 'name': return row.name || '';
                case 'client': return `${row.client || ''} ${row.w2_company || ''}`.trim();
                case 'start_date': return row.start_date || '';
                case 'end_date': return row.end_date || '';
                case 'bill_rate': return Number(row.bill_rate) || 0;
                case 'status':
                    if (row.status === 'active') return 2;
                    if (row.status === 'pending') return 1;
                    return 0;
                case 'coverage': return coverageSet.has(String(row.id)) ? 1 : 0;
                default: return '';
            }
        };

        const av = valueFor(a);
        const bv = valueFor(b);

        if (typeof av === 'number' && typeof bv === 'number') {
            return (av - bv) * dir;
        }

        return collator.compare(String(av), String(bv)) * dir;
    });

    updateSortIndicators();
    updateFilterSummary(filtered.length, range.label);

    if (filtered.length === 0) {
        els.tbody.innerHTML = `
            <tr>
                <td colspan="8" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">🕵️</span>
                        <p class="empty-state__text">No consultants found</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    els.tbody.innerHTML = filtered.map((consultant) => {
        const active = isConsultantActive(consultant);
        const isPending = consultant.status === 'pending';
        let statusClass = 'status-inactive';
        let statusText = 'Inactive';

        if (active) {
            statusClass = 'status-active';
            statusText = 'Active';
        } else if (isPending) {
            statusClass = 'status-pending';
            statusText = 'Pending (Onboarding)';
        }
        const currency = normalizeCurrency(consultant.currency || 'USD');
        const hasTimesheet = coverageSet.has(String(consultant.id));

        const coverageBadge = hasTimesheet
            ? '<span class="status-badge status-active">Has Timesheet</span>'
            : `<span class="status-badge status-missing">No Timesheet (${escapeHtml(range.label)})</span>`;


        const coverageAction = hasTimesheet
            ? ''
            : `<a class="btn btn--outline btn--sm" href="timesheets.html" data-action="add-timesheet" data-consultant="${consultant.name || ''}">Add in Timesheets</a>`;

        return `
            <tr>
                <td style="font-weight: 600;">${escapeHtml(consultant.name || '')}</td>
                <td>
                    <div>${escapeHtml(consultant.client || '—')}</div>
                    <div style="font-size:12px;color:var(--text-tertiary);">W2: ${escapeHtml(consultant.w2_company || '—')}</div>
                </td>
                <td>${escapeHtml(consultant.start_date || '—')}</td>
                <td>${escapeHtml(consultant.end_date || '—')}</td>
                <td>
                    <div>Bill: ${formatMoney(Number(consultant.bill_rate) || 0, currency)} / hr</div>
                    <div style="font-size:12px;color:var(--text-tertiary);">Comm: ${formatMoney(Number(consultant.commission_rate) || 0, currency)} / hr</div>
                    <div style="font-size:12px;color:var(--text-tertiary);">Currency: ${currency}</div>
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${coverageBadge}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn--outline btn--sm edit-btn" data-id="${consultant.id}">Edit</button>
                    <button class="btn btn--ghost btn--sm delete-btn" data-id="${consultant.id}">Delete</button>
                    ${coverageAction}
                </td>
            </tr>
        `;
    }).join('');

}

/**
 * Handle delegating clicks to table buttons
 */
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;

    // Edit button
    const editBtn = target.closest('.edit-btn');
    if (editBtn) {
        const id = editBtn.dataset.id;
        if (id) openModal(id);
        return;
    }

    // Delete button
    const deleteBtn = target.closest('.delete-btn');
    if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        if (id) {
            _pendingDeleteId = id;
            openDeleteModal(id);
        }
        return;
    }

});

function isModalOpen() {
    return Boolean(els.modal?.classList.contains('is-open'));
}

function populateFilterOptions() {
    const currencyCodes = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR']);
    consultants.forEach((consultant) => currencyCodes.add(normalizeCurrency(consultant.currency || 'USD')));

    const clientMap = collectLabelMap(consultants.map(c => c.client));
    const w2Map = collectLabelMap(consultants.map(c => c.w2_company));

    setSelectOptions(els.currencyFilter, 'All Currencies', Array.from(currencyCodes).sort((a, b) => a.localeCompare(b)), filterCurrency);
    setSelectOptions(els.clientFilter, 'All Clients', Array.from(clientMap.entries()).sort((a, b) => a[1].localeCompare(b[1])), filterClient, true);
    setSelectOptions(els.w2Filter, 'All W2 Companies', Array.from(w2Map.entries()).sort((a, b) => a[1].localeCompare(b[1])), filterW2, true);
}

function setSelectOptions(select, allLabel, options, selectedValue, hasPairs = false) {
    if (!select) return;

    const html = [`<option value="all">${allLabel}</option>`];
    if (hasPairs) {
        options.forEach(([value, label]) => {
            html.push(`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`);
        });
    } else {
        options.forEach((value) => {
            html.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
        });
    }

    select.innerHTML = html.join('');

    const valid = hasPairs ? options.map(([value]) => value) : options;
    const normalized = valid.includes(selectedValue) ? selectedValue : 'all';
    select.value = normalized;

    if (select === els.currencyFilter) filterCurrency = normalizeCurrency(normalized);
    if (select === els.clientFilter) filterClient = normalizeTextFilter(normalized);
    if (select === els.w2Filter) filterW2 = normalizeTextFilter(normalized);
}

function updateSortIndicators() {
    document.querySelectorAll('.sort-button').forEach((button) => {
        const key = button.dataset.sort;
        const icon = button.querySelector('.sort-icon');
        const active = key === sortState.key;

        button.classList.toggle('is-active', active);
        if (!icon) return;

        if (!active) {
            icon.textContent = '↕';
        } else {
            icon.textContent = sortState.dir === 'asc' ? '▲' : '▼';
        }
    });
}

function setSort(key) {
    if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        sortState = { key, dir: 'asc' };
    }

    setPagePrefs('consultants', {
        status: currentFilter,
        sortKey: sortState.key,
        sortDir: sortState.dir
    });

    requestRender();
}

// Track original rates so we can detect changes in handleSave
let _originalBillRate = null;
let _originalCommissionRate = null;

function openModal(id = null) {
    clearFormErrors();
    els.form?.reset();

    if (els.consultantId) els.consultantId.value = '';
    if (els.currency) els.currency.value = 'USD';
    if (els.deleteBtn) els.deleteBtn.style.display = 'none';

    if (id) {
        const consultant = consultants.find((item) => item.id === id);
        if (!consultant) return;

        if (els.modalTitle) els.modalTitle.textContent = 'Edit Consultant';
        if (els.modalSubtitle) els.modalSubtitle.textContent = 'Update consultant details and billing setup.';
        if (els.saveBtn) els.saveBtn.textContent = 'Update Consultant';
        if (els.deleteBtn) els.deleteBtn.style.display = 'inline-flex';

        if (els.consultantId) els.consultantId.value = consultant.id;
        if (els.name) els.name.value = consultant.name || '';
        if (els.status) els.status.value = consultant.status || 'active';
        if (els.client) els.client.value = consultant.client || '';
        if (els.w2Company) els.w2Company.value = consultant.w2_company || '';
        if (els.startDate) els.startDate.value = consultant.start_date || '';
        if (els.endDate) els.endDate.value = consultant.end_date || '';
        if (els.billRate) els.billRate.value = Number(consultant.bill_rate) > 0 ? String(Number(consultant.bill_rate)) : '';
        if (els.commissionRate) els.commissionRate.value = Number(consultant.commission_rate) > 0 ? String(Number(consultant.commission_rate)) : '';
        if (els.currency) els.currency.value = normalizeCurrency(consultant.currency || 'USD');

        // Store original rates for change detection
        _originalBillRate = Number(consultant.bill_rate) || 0;
        _originalCommissionRate = Number(consultant.commission_rate) || 0;
    } else {
        if (els.modalTitle) els.modalTitle.textContent = 'Add New Consultant';
        if (els.modalSubtitle) els.modalSubtitle.textContent = 'Create a consultant profile for invoices and timesheets.';
        if (els.saveBtn) els.saveBtn.textContent = 'Save Consultant';
        // No original rates for new consultants
        _originalBillRate = null;
        _originalCommissionRate = null;
    }

    els.modal?.classList.add('is-open');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => els.name?.focus());
}

function closeModal() {
    els.modal?.classList.remove('is-open');
    document.body.classList.remove('modal-open');
}

function handleModalBackdropClick(event) {
    if (event.target === els.modal) closeModal();
}

function handleGlobalKeydown(event) {
    if (event.key === 'Escape' && isModalOpen()) closeModal();
}

function validateConsultantForm() {
    clearFormErrors();

    const status = els.status?.value || 'active';
    const name = String(els.name?.value || '').trim();
    const startDate = String(els.startDate?.value || '').trim();
    const endDate = String(els.endDate?.value || '').trim();
    const currency = normalizeCurrency(els.currency?.value || '');
    const billRateRaw = String(els.billRate?.value || '').trim();
    const commissionRateRaw = String(els.commissionRate?.value || '').trim();
    const hasBillRate = billRateRaw !== '';
    const hasCommissionRate = commissionRateRaw !== '';
    const billRate = hasBillRate ? Number(billRateRaw) : 0;
    const commissionRate = hasCommissionRate ? Number(commissionRateRaw) : 0;

    let valid = true;

    if (!name) {
        setFieldError('name', 'Name is required.');
        valid = false;
    }

    if (!currency || currency === 'all') {
        setFieldError('currency', 'Currency is required.');
        valid = false;
    }

    // Only require these if status is 'active'
    if (status === 'active') {
        if (!startDate) {
            setFieldError('startDate', 'Start date is required for active consultants.');
            valid = false;
        }

        if (!hasBillRate && !hasCommissionRate) {
            setFieldError('billRate', 'Enter either Bill Rate or Commission.');
            setFieldError('commissionRate', 'Enter either Bill Rate or Commission.');
            valid = false;
        }

        if (hasBillRate && hasCommissionRate) {
            setFieldError('billRate', 'Use only one: Bill Rate or Commission.');
            setFieldError('commissionRate', 'Use only one: Bill Rate or Commission.');
            valid = false;
        }
    }

    // Rate format validation (if entered)
    if (hasBillRate && (!Number.isFinite(billRate) || billRate <= 0)) {
        setFieldError('billRate', 'Bill rate must be greater than 0.');
        valid = false;
    }

    if (hasCommissionRate && (!Number.isFinite(commissionRate) || commissionRate <= 0)) {
        setFieldError('commissionRate', 'Commission must be greater than 0.');
        valid = false;
    }

    if (startDate && endDate && endDate < startDate) {
        setFieldError('endDate', 'End date cannot be before start date.');
        valid = false;
    }

    return valid;
}

async function handleSave(event) {
    event.preventDefault();

    if (!validateConsultantForm()) return;

    const billRateRaw = String(els.billRate?.value || '').trim();
    const commissionRateRaw = String(els.commissionRate?.value || '').trim();

    const id = String(els.consultantId?.value || '').trim();
    const payload = {
        name: String(els.name?.value || '').trim(),
        status: els.status?.value || 'active',
        client: String(els.client?.value || '').trim(),
        w2_company: String(els.w2Company?.value || '').trim(),
        start_date: String(els.startDate?.value || '').trim() || null,
        end_date: String(els.endDate?.value || '').trim() || null,
        bill_rate: billRateRaw ? Number(billRateRaw) : 0,
        commission_rate: commissionRateRaw ? Number(commissionRateRaw) : 0,
        currency: normalizeCurrency(els.currency?.value || 'USD')
    };

    if (id) payload.id = id;

    if (els.saveBtn) {
        els.saveBtn.disabled = true;
        els.saveBtn.textContent = 'Saving...';
    }

    try {
        await dbSaveConsultant(payload);

        // Rate-change alert: if bill_rate or commission_rate changed, warn about pending timesheets
        if (id && (_originalBillRate !== null || _originalCommissionRate !== null)) {
            const billChanged = _originalBillRate !== null && payload.bill_rate !== _originalBillRate;
            const commChanged = _originalCommissionRate !== null && payload.commission_rate !== _originalCommissionRate;

            if (billChanged || commChanged) {
                try {
                    const { dbGetTimesheetsCountForConsultant } = await import('./modules/db-consultants.js');
                    // We want pending-only count. For simplicity, get total count and note it.
                    // (A full pending-only count would need a separate DB call; we show total for quick feedback)
                    const rateLabel = billChanged
                        ? `Bill Rate → $${payload.bill_rate.toFixed(2)}/hr`
                        : `Commission → $${payload.commission_rate.toFixed(2)}/hr`;
                    showToast(`⚠️ ${rateLabel} — Future timesheet pulls will use this new rate. Existing invoiced timesheets are unaffected.`, 'info');
                } catch (_) { /* non-fatal */ }
            }
        }

        showToast('Consultant saved', 'success');
        closeModal();
        await fetchData();
    } catch (err) {
        console.error(err);
        showToast('Failed to save consultant', 'error');
    } finally {
        if (els.saveBtn) {
            els.saveBtn.disabled = false;
            els.saveBtn.textContent = id ? 'Update Consultant' : 'Save Consultant';
        }
    }
}

// pending delete state for the modal
let _pendingDeleteId = null;

async function openDeleteModal(id) {
    const consultant = consultants.find(item => item.id === id);
    if (!consultant) return;

    _pendingDeleteId = id;

    // Populate modal text
    const nameEl = document.getElementById('deleteConsultantName');
    const warningEl = document.getElementById('deleteModalWarning');
    const safeEl = document.getElementById('deleteModalSafeMsg');
    const countEl = document.getElementById('deleteTimesheetCount');
    const confirmBtn = document.getElementById('deleteConfirmModalBtn');
    const btnLabel = document.getElementById('deleteConfirmBtnLabel');

    if (nameEl) nameEl.textContent = consultant.name || 'this consultant';

    // Reset modal state while loading count
    if (warningEl) warningEl.style.display = 'none';
    if (safeEl) safeEl.style.display = 'none';
    if (confirmBtn) { confirmBtn.disabled = true; }
    if (btnLabel) btnLabel.textContent = 'Checking...';

    // Show modal
    const deleteModal = document.getElementById('deleteConsultantModal');
    if (deleteModal) deleteModal.style.display = 'flex';

    // Fetch timesheet count asynchronously
    try {
        const count = await dbGetTimesheetsCountForConsultant(id);
        if (count > 0) {
            if (countEl) countEl.textContent = String(count);
            if (warningEl) warningEl.style.display = 'block';
        } else {
            if (safeEl) safeEl.style.display = 'block';
        }
    } catch (err) {
        console.warn('Could not fetch timesheet count:', err);
        // Still allow deletion even if count lookup failed
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; }
        if (btnLabel) btnLabel.textContent = 'Delete Consultant';
    }
}

function closeDeleteModal() {
    _pendingDeleteId = null;
    const deleteModal = document.getElementById('deleteConsultantModal');
    if (deleteModal) deleteModal.style.display = 'none';
}

async function deleteConsultant(id) {
    const consultant = consultants.find(item => item.id === id);
    if (!consultant) return;

    try {
        await dbDeleteConsultant(id);
        showToast('Consultant deleted', 'success');
        if (String(els.consultantId?.value || '') === id) closeModal();
        closeDeleteModal();
        await fetchData();
    } catch (err) {
        console.error(err);
        showToast('Failed to delete consultant', 'error');
    }
}

async function fetchData() {
    try {
        const [consultantsData, timesheetData] = await Promise.all([
            dbGetConsultants(),
            dbGetTimesheetsForYear(selectedYear).catch((timesheetErr) => {
                console.warn('Timesheets lookup failed, continuing without coverage badges:', timesheetErr);
                return [];
            })
        ]);

        consultants = consultantsData || [];
        yearTimesheets = timesheetData || [];

        populateFilterOptions();
        requestRender();
    } catch (err) {
        console.error(err);
        showToast('Failed to load CRM data', 'error');
    }
}

function cacheElements() {
    els.modal = document.getElementById('consultantModal');
    els.form = document.getElementById('consultantForm');

    els.modalTitle = document.getElementById('modalTitle');
    els.modalSubtitle = document.querySelector('.modal-subtitle');

    els.consultantId = document.getElementById('consultantId');
    els.name = document.getElementById('name');
    els.status = document.getElementById('status');
    els.client = document.getElementById('client');
    els.w2Company = document.getElementById('w2Company');
    els.startDate = document.getElementById('startDate');
    els.endDate = document.getElementById('endDate');
    els.billRate = document.getElementById('billRate');
    els.commissionRate = document.getElementById('commissionRate');
    els.currency = document.getElementById('currency');

    els.saveBtn = document.getElementById('saveBtn');
    els.deleteBtn = document.getElementById('deleteConsultantBtn');

    els.addConsultantBtn = document.getElementById('addConsultantBtn');
    els.closeModalBtn = document.getElementById('closeModalBtn');
    els.cancelBtn = document.getElementById('cancelBtn');

    els.searchInput = document.getElementById('searchInput');
    els.statusFilter = document.getElementById('statusFilter');
    els.currencyFilter = document.getElementById('currencyFilter');
    els.clientFilter = document.getElementById('clientFilter');
    els.w2Filter = document.getElementById('w2Filter');
    els.yearFilter = document.getElementById('yearFilter');
    els.monthFilter = document.getElementById('monthFilter');
    els.allMonthsToggleBtn = document.getElementById('allMonthsToggleBtn');
    els.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    els.filterSummary = document.getElementById('consultantsFilterSummary');

    els.tbody = document.getElementById('consultantsBody');

    els.errorName = document.getElementById('nameError');
    els.errorStartDate = document.getElementById('startDateError');
    els.errorEndDate = document.getElementById('endDateError');
    els.errorBillRate = document.getElementById('billRateError');
    els.errorCommissionRate = document.getElementById('commissionRateError');
    els.errorCurrency = document.getElementById('currencyError');
}

function setupPeriodControls() {
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

    updateAllMonthsToggleLabel();
}

function bindPageEvents() {
    els.addConsultantBtn?.addEventListener('click', () => openModal());
    els.closeModalBtn?.addEventListener('click', closeModal);
    els.cancelBtn?.addEventListener('click', closeModal);
    els.deleteBtn?.addEventListener('click', async () => {
        const id = String(els.consultantId?.value || '').trim();
        if (!id) return;
        closeModal(); // close the edit modal first
        await openDeleteModal(id);
    });

    // Delete confirmation modal buttons
    document.getElementById('deleteCancelModalBtn')?.addEventListener('click', closeDeleteModal);
    document.getElementById('deleteConfirmModalBtn')?.addEventListener('click', async () => {
        if (_pendingDeleteId) await deleteConsultant(_pendingDeleteId);
    });

    els.status?.addEventListener('change', updateFormRequirements);
    els.form?.addEventListener('submit', handleSave);
    els.modal?.addEventListener('click', handleModalBackdropClick);
    document.addEventListener('keydown', handleGlobalKeydown);

    document.querySelectorAll('.sort-button').forEach((button) => {
        button.addEventListener('click', () => setSort(button.dataset.sort));
    });

    const handleSearch = debounce((event) => {
        searchQuery = event.target.value.trim().toLowerCase();
        persistSharedFilters();
        requestRender();
    }, 120);
    els.searchInput?.addEventListener('input', handleSearch);

    els.statusFilter?.addEventListener('change', (event) => {
        currentFilter = normalizeConsultantStatus(event.target.value);
        setPagePrefs('consultants', {
            status: currentFilter,
            sortKey: sortState.key,
            sortDir: sortState.dir
        });
        requestRender();
    });

    els.currencyFilter?.addEventListener('change', (event) => {
        filterCurrency = normalizeCurrency(event.target.value);
        persistSharedFilters();
        requestRender();
    });

    els.clientFilter?.addEventListener('change', (event) => {
        filterClient = normalizeTextFilter(event.target.value);
        persistSharedFilters();
        requestRender();
    });

    els.w2Filter?.addEventListener('change', (event) => {
        filterW2 = normalizeTextFilter(event.target.value);
        persistSharedFilters();
        requestRender();
    });

    els.yearFilter?.addEventListener('change', async (event) => {
        selectedYear = Number(event.target.value);
        persistSharedFilters();
        await fetchData();
    });

    els.monthFilter?.addEventListener('change', () => {
        selectedMonth = els.monthFilter.value;
        persistSharedFilters();
        updateAllMonthsToggleLabel();
        requestRender();
    });

    els.allMonthsToggleBtn?.addEventListener('click', () => {
        selectedMonth = selectedMonth === 'all' ? defaultMonth : 'all';
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        persistSharedFilters();
        updateAllMonthsToggleLabel();
        requestRender();
    });

    els.resetFiltersBtn?.addEventListener('click', async () => {
        const fresh = clearSharedFilters({ keepPeriod: false });
        currentFilter = 'active';
        searchQuery = String(fresh.search || '').trim().toLowerCase();
        selectedYear = fresh.year;
        selectedMonth = fresh.month;
        filterCurrency = normalizeCurrency(fresh.currency);
        filterClient = normalizeTextFilter(fresh.client);
        filterW2 = normalizeTextFilter(fresh.w2);

        if (els.searchInput) els.searchInput.value = searchQuery;
        if (els.statusFilter) els.statusFilter.value = currentFilter;

        setupPeriodControls();
        populateFilterOptions();

        setPagePrefs('consultants', {
            status: currentFilter,
            sortKey: sortState.key,
            sortDir: sortState.dir
        });

        await fetchData();
    });

    els.tbody?.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const editButton = target.closest('.edit-btn');
        if (editButton) {
            const id = editButton.getAttribute('data-id');
            if (id) openModal(id);
            return;
        }

        const deleteButton = target.closest('.delete-btn');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            if (id) await openDeleteModal(id);
            return;
        }

        const addTimesheetLink = target.closest('[data-action="add-timesheet"]');
        if (addTimesheetLink) {
            const consultantName = addTimesheetLink.getAttribute('data-consultant') || '';
            setSharedFilters({
                year: selectedYear,
                month: selectedMonth,
                currency: filterCurrency,
                client: filterClient,
                w2: filterW2,
                search: consultantName
            });
        }
    });
}

function persistSharedFilters() {
    setSharedFilters({
        year: selectedYear,
        month: selectedMonth,
        currency: filterCurrency,
        client: filterClient,
        w2: filterW2,
        search: searchQuery
    });
}

function setFieldError(field, message) {
    const errorMap = {
        name: els.errorName,
        startDate: els.errorStartDate,
        endDate: els.errorEndDate,
        billRate: els.errorBillRate,
        commissionRate: els.errorCommissionRate,
        currency: els.errorCurrency
    };

    const node = errorMap[field];
    if (node) node.textContent = message;
}

function clearFormErrors() {
    [
        els.errorName,
        els.errorStartDate,
        els.errorEndDate,
        els.errorBillRate,
        els.errorCommissionRate,
        els.errorCurrency
    ].forEach((node) => {
        if (node) node.textContent = '';
    });
}

function updateFilterSummary(total, periodLabel) {
    if (!els.filterSummary) return;

    const applied = countAppliedFilters(
        {
            year: selectedYear,
            month: selectedMonth,
            currency: filterCurrency,
            client: filterClient,
            w2: filterW2,
            search: searchQuery,
            status: currentFilter
        },
        {
            year: defaultYear,
            month: defaultMonth,
            currency: 'all',
            client: 'all',
            w2: 'all',
            search: '',
            status: 'active'
        }
    );

    els.filterSummary.textContent = `${applied} filter${applied === 1 ? '' : 's'} applied • ${total} consultants • ${periodLabel}`;
}

function updateAllMonthsToggleLabel() {
    if (!els.allMonthsToggleBtn) return;
    els.allMonthsToggleBtn.textContent = selectedMonth === 'all' ? 'All Months: ON' : 'All Months: OFF';
}

async function init() {
    await loadLayout('consultants');
    cacheElements();
    setupPeriodControls();
    bindPageEvents();

    if (els.statusFilter) els.statusFilter.value = currentFilter;
    if (els.searchInput) els.searchInput.value = searchQuery;

    await fetchData();
    updateSortIndicators();
}

function normalizeConsultantStatus(value) {
    const normalized = String(value || 'active').trim().toLowerCase();
    if (normalized === 'all' || normalized === 'inactive' || normalized === 'pending') return normalized;
    return 'active';
}

function normalizeCurrency(value) {
    const normalized = String(value || 'all').trim();
    if (!normalized || normalized.toLowerCase() === 'all') return 'all';
    return normalized.toUpperCase();
}

function normalizeTextFilter(value) {
    const normalized = String(value || 'all').trim().toLowerCase();
    return normalized || 'all';
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

function monthLabel(month) {
    if (month === 'all') return 'All Months';
    const idx = Number(month) - 1;
    return MONTHS[idx] || month;
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
