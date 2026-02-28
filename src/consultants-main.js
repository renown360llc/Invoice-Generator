import { loadLayout } from './components/layout.js';
import { dbGetConsultants, dbSaveConsultant, dbDeleteConsultant } from './modules/db-consultants.js';
import { dbGetTimesheetsForYear } from './modules/db-timesheets.js';
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

document.addEventListener('DOMContentLoaded', init);

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
    if (consultant.status === 'inactive') return false;
    if (consultant.end_date && consultant.end_date < new Date().toISOString().slice(0, 10)) return false;
    return true;
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
        if (currentFilter === 'active' && !active) return false;
        if (currentFilter === 'inactive' && active) return false;

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
                case 'status': return isConsultantActive(row) ? 1 : 0;
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
        const activeClass = active ? 'status-active' : 'status-inactive';
        const activeText = active ? 'Active' : 'Inactive';
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
                <td><span class="status-badge ${activeClass}">${activeText}</span></td>
                <td>${coverageBadge}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn--outline btn--sm edit-btn" data-id="${consultant.id}">Edit</button>
                    <button class="btn btn--ghost btn--sm delete-btn" data-id="${consultant.id}">Delete</button>
                    ${coverageAction}
                </td>
            </tr>
        `;
    }).join('');

    els.tbody.querySelectorAll('.edit-btn').forEach((button) => {
        button.addEventListener('click', () => openModal(button.dataset.id));
    });

    els.tbody.querySelectorAll('.delete-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!button.dataset.id) return;
            await deleteConsultant(button.dataset.id);
        });
    });

    els.tbody.querySelectorAll('[data-action="add-timesheet"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const consultantName = link.getAttribute('data-consultant') || '';
            setSharedFilters({
                year: selectedYear,
                month: selectedMonth,
                currency: filterCurrency,
                client: filterClient,
                w2: filterW2,
                search: consultantName
            });
        });
    });
}

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

    renderTable();
}

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
        if (els.client) els.client.value = consultant.client || '';
        if (els.w2Company) els.w2Company.value = consultant.w2_company || '';
        if (els.startDate) els.startDate.value = consultant.start_date || '';
        if (els.endDate) els.endDate.value = consultant.end_date || '';
        if (els.billRate) els.billRate.value = Number(consultant.bill_rate) > 0 ? String(Number(consultant.bill_rate)) : '';
        if (els.commissionRate) els.commissionRate.value = Number(consultant.commission_rate) > 0 ? String(Number(consultant.commission_rate)) : '';
        if (els.currency) els.currency.value = normalizeCurrency(consultant.currency || 'USD');
    } else {
        if (els.modalTitle) els.modalTitle.textContent = 'Add New Consultant';
        if (els.modalSubtitle) els.modalSubtitle.textContent = 'Create a consultant profile for invoices and timesheets.';
        if (els.saveBtn) els.saveBtn.textContent = 'Save Consultant';
        if (els.startDate) els.startDate.value = new Date().toISOString().slice(0, 10);
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

    if (!startDate) {
        setFieldError('startDate', 'Start date is required.');
        valid = false;
    }

    if (!currency || currency === 'all') {
        setFieldError('currency', 'Currency is required.');
        valid = false;
    }

    if (hasBillRate && (!Number.isFinite(billRate) || billRate <= 0)) {
        setFieldError('billRate', 'Bill rate must be greater than 0.');
        valid = false;
    }

    if (hasCommissionRate && (!Number.isFinite(commissionRate) || commissionRate <= 0)) {
        setFieldError('commissionRate', 'Commission must be greater than 0.');
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
        client: String(els.client?.value || '').trim(),
        w2_company: String(els.w2Company?.value || '').trim(),
        start_date: String(els.startDate?.value || '').trim(),
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

async function deleteConsultant(id) {
    const consultant = consultants.find(item => item.id === id);
    if (!consultant) return;

    if (!confirm(`Delete consultant "${consultant.name}"?`)) return;

    try {
        await dbDeleteConsultant(id);
        showToast('Consultant deleted', 'success');
        if (String(els.consultantId?.value || '') === id) closeModal();
        await fetchData();
    } catch (err) {
        console.error(err);
        showToast('Failed to delete consultant', 'error');
    }
}

async function fetchData() {
    try {
        consultants = await dbGetConsultants();

        try {
            yearTimesheets = await dbGetTimesheetsForYear(selectedYear);
        } catch (timesheetErr) {
            console.warn('Timesheets lookup failed, continuing without coverage badges:', timesheetErr);
            yearTimesheets = [];
        }

        populateFilterOptions();
        renderTable();
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
        await deleteConsultant(id);
    });

    els.form?.addEventListener('submit', handleSave);
    els.modal?.addEventListener('click', handleModalBackdropClick);
    document.addEventListener('keydown', handleGlobalKeydown);

    document.querySelectorAll('.sort-button').forEach((button) => {
        button.addEventListener('click', () => setSort(button.dataset.sort));
    });

    els.searchInput?.addEventListener('input', (event) => {
        searchQuery = event.target.value.trim().toLowerCase();
        persistSharedFilters();
        renderTable();
    });

    els.statusFilter?.addEventListener('change', (event) => {
        currentFilter = normalizeConsultantStatus(event.target.value);
        setPagePrefs('consultants', {
            status: currentFilter,
            sortKey: sortState.key,
            sortDir: sortState.dir
        });
        renderTable();
    });

    els.currencyFilter?.addEventListener('change', (event) => {
        filterCurrency = normalizeCurrency(event.target.value);
        persistSharedFilters();
        renderTable();
    });

    els.clientFilter?.addEventListener('change', (event) => {
        filterClient = normalizeTextFilter(event.target.value);
        persistSharedFilters();
        renderTable();
    });

    els.w2Filter?.addEventListener('change', (event) => {
        filterW2 = normalizeTextFilter(event.target.value);
        persistSharedFilters();
        renderTable();
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
        renderTable();
    });

    els.allMonthsToggleBtn?.addEventListener('click', () => {
        selectedMonth = selectedMonth === 'all' ? defaultMonth : 'all';
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        persistSharedFilters();
        updateAllMonthsToggleLabel();
        renderTable();
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
    if (normalized === 'all' || normalized === 'inactive') return normalized;
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
