import { loadLayout } from './components/layout.js';
import { showToast, debounce, createRenderScheduler } from './modules/utils.js';
import { dbGetTimesheetsForYear } from './modules/db-timesheets.js';
import {
    getSharedFilters,
    setSharedFilters,
    clearSharedFilters,
    getPagePrefs,
    setPagePrefs,
    countAppliedFilters
} from './modules/crm-filters.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = String(now.getMonth() + 1).padStart(2, '0');

const shared = getSharedFilters();
const analyticsPrefs = getPagePrefs('analytics');

let selectedYear = Number(shared.year) || defaultYear;
let selectedMonth = shared.month || defaultMonth;
let selectedCurrency = normalizeCurrency(shared.currency);
let selectedClient = normalizeTextFilter(shared.client);
let selectedW2 = normalizeTextFilter(shared.w2);
let selectedStatus = normalizeStatusFilter(shared.status);
let searchTerm = String(shared.search || '').trim().toLowerCase();
let pivotMetric = analyticsPrefs.pivotMetric === 'revenue' ? 'revenue' : 'hours';

let rawRows = [];

const els = {};
const requestRender = createRenderScheduler(() => renderAll());

document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
        console.error('[analytics] Fatal init error:', err);
        document.body.innerHTML += `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff8f8;z-index:9999;flex-direction:column;gap:0.75rem;font-family:system-ui;"><span style="font-size:2.5rem">⚠️</span><h2 style="margin:0;color:#dc2626">Failed to load Analytics</h2><p style="margin:0;color:#6b7280;font-size:0.875rem">${err.message}</p><button onclick="location.reload()" style="padding:0.5rem 1.25rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer">Reload</button></div>`;
    });
});

async function init() {
    await loadLayout('analytics');
    cacheElements();
    setupFilters();
    bindEvents();
    await refreshData();
}

function cacheElements() {
    els.yearFilter = document.getElementById('yearFilter');
    els.monthFilter = document.getElementById('snapshotMonthFilter');
    els.allMonthsToggleBtn = document.getElementById('allMonthsToggleBtn');
    els.currencyFilter = document.getElementById('currencyFilter');
    els.clientFilter = document.getElementById('clientFilter');
    els.w2Filter = document.getElementById('w2Filter');
    els.statusFilter = document.getElementById('statusFilter');
    els.searchInput = document.getElementById('consultantSearch');
    els.clearFiltersBtn = document.getElementById('clearFiltersBtn');
    els.refreshBtn = document.getElementById('refreshBtn');
    els.exportCsvBtn = document.getElementById('exportCsvBtn');
    els.copyCsvBtn = document.getElementById('copyCsvBtn');
    els.hoursMetricBtn = document.getElementById('pivotHoursBtn');
    els.revenueMetricBtn = document.getElementById('pivotRevenueBtn');

    els.analyticsMeta = document.getElementById('analyticsMeta');
    els.filterSummary = document.getElementById('analyticsFilterSummary');

    els.totalHoursCard = document.getElementById('totalHoursCard');
    els.projectedRevenueCard = document.getElementById('projectedRevenueCard');
    els.activeConsultantsCard = document.getElementById('activeConsultantsCard');

    els.monthSnapshotBody = document.getElementById('monthSnapshotBody');
    els.pivotHeadRow = document.getElementById('pivotHeadRow');
    els.pivotBody = document.getElementById('pivotBody');
    els.pivotTitle = document.getElementById('pivotTitle');
    els.monthSnapshotTitle = document.getElementById('monthSnapshotTitle');
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

    updatePivotMetricButtons();
    updateAllMonthsToggleLabel();
}

function bindEvents() {
    els.yearFilter?.addEventListener('change', async (e) => {
        selectedYear = Number(e.target.value);
        persistShared();
        await refreshData();
    });

    els.monthFilter?.addEventListener('change', () => {
        selectedMonth = els.monthFilter.value;
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

    els.currencyFilter?.addEventListener('change', () => {
        selectedCurrency = normalizeCurrency(els.currencyFilter.value);
        persistShared();
        requestRender();
    });

    els.clientFilter?.addEventListener('change', () => {
        selectedClient = normalizeTextFilter(els.clientFilter.value);
        persistShared();
        requestRender();
    });

    els.w2Filter?.addEventListener('change', () => {
        selectedW2 = normalizeTextFilter(els.w2Filter.value);
        persistShared();
        requestRender();
    });

    els.statusFilter?.addEventListener('change', () => {
        selectedStatus = normalizeStatusFilter(els.statusFilter.value);
        persistShared();
        requestRender();
    });

    const handleSearch = debounce(() => {
        searchTerm = els.searchInput.value.trim().toLowerCase();
        persistShared();
        requestRender();
    }, 120);
    els.searchInput?.addEventListener('input', handleSearch);

    els.refreshBtn?.addEventListener('click', async () => {
        await refreshData();
    });

    els.clearFiltersBtn?.addEventListener('click', () => {
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
        if (els.statusFilter) els.statusFilter.value = selectedStatus;
        if (els.searchInput) els.searchInput.value = searchTerm;

        updateAllMonthsToggleLabel();
        populateFilterOptions();
        requestRender();
    });

    els.exportCsvBtn?.addEventListener('click', () => {
        const csv = buildPivotCsv();
        downloadCsv(`consultant-pivot-${selectedYear}.csv`, csv);
    });

    els.copyCsvBtn?.addEventListener('click', async () => {
        const csv = buildPivotCsv();
        await copyToClipboard(csv);
    });

    els.hoursMetricBtn?.addEventListener('click', () => {
        pivotMetric = 'hours';
        setPagePrefs('analytics', { pivotMetric });
        updatePivotMetricButtons();
        renderPivot(getFilteredRows());
    });

    els.revenueMetricBtn?.addEventListener('click', () => {
        pivotMetric = 'revenue';
        setPagePrefs('analytics', { pivotMetric });
        updatePivotMetricButtons();
        renderPivot(getFilteredRows());
    });

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        const goBtn = target.closest('.open-timesheets-btn');
        if (!goBtn) return;

        const consultant = goBtn.getAttribute('data-consultant') || '';
        setSharedFilters({
            year: selectedYear,
            month: selectedMonth,
            currency: selectedCurrency,
            client: selectedClient,
            w2: selectedW2,
            status: selectedStatus,
            search: consultant
        });
        window.location.href = 'timesheets.html';
    });
}

async function refreshData() {
    setMeta('Loading analytics...');
    try {
        const rows = await dbGetTimesheetsForYear(selectedYear);
        rawRows = normalizeRows(rows);
        populateFilterOptions();
        requestRender();
    } catch (err) {
        console.error(err);
        rawRows = [];
        requestRender();
        showToast('Failed to load analytics', 'error');
    }
}

function normalizeRows(rows) {
    return (rows || []).map((row) => {
        const consultant = Array.isArray(row.consultants) ? row.consultants[0] : (row.consultants || {});
        const hours = Number(row.hours_worked) || 0;
        const billRate = Number(consultant.bill_rate) || 0;
        const currency = normalizeCurrency(consultant.currency || 'USD');

        return {
            id: row.id,
            consultant_id: row.consultant_id,
            consultant_name: consultant.name || 'Unknown',
            client: consultant.client || '-',
            w2_company: consultant.w2_company || '-',
            bill_rate: billRate,
            currency,
            hours,
            projected: hours * billRate,
            period_start: row.period_start || '',
            month_key: String(row.period_start || '').slice(0, 7),
            status: normalizeStatusFilter(row.status || (row.invoice_number ? 'invoiced' : 'pending')),
            invoice_number: String(row.invoice_number || '').trim()
        };
    });
}

function populateFilterOptions() {
    const currencySet = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR']);
    rawRows.forEach(row => currencySet.add(normalizeCurrency(row.currency)));

    const clientMap = collectLabelMap(rawRows.map(row => row.client));
    const w2Map = collectLabelMap(rawRows.map(row => row.w2_company));

    setSelectOptions(els.currencyFilter, 'All Currencies', Array.from(currencySet).sort((a, b) => a.localeCompare(b)), selectedCurrency);
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
    const validValues = hasLabelPairs ? options.map(([value]) => value) : options;
    const normalized = validValues.includes(selectedValue) ? selectedValue : 'all';
    select.value = normalized;

    if (select === els.currencyFilter) selectedCurrency = normalizeCurrency(normalized);
    if (select === els.clientFilter) selectedClient = normalizeTextFilter(normalized);
    if (select === els.w2Filter) selectedW2 = normalizeTextFilter(normalized);
}

function getFilteredRows() {
    return rawRows
        .filter(row => selectedCurrency === 'all' || row.currency === selectedCurrency)
        .filter(row => selectedClient === 'all' || normalizeTextFilter(row.client) === selectedClient)
        .filter(row => selectedW2 === 'all' || normalizeTextFilter(row.w2_company) === selectedW2)
        .filter(row => selectedStatus === 'all' || row.status === selectedStatus)
        .filter(row => {
            if (!searchTerm) return true;
            const hay = `${row.consultant_name} ${row.client} ${row.w2_company}`.toLowerCase();
            return hay.includes(searchTerm);
        });
}

function renderAll() {
    const filtered = getFilteredRows();
    const monthRows = getMonthRows(filtered);

    renderSummary(monthRows);
    renderKpis(monthRows);
    renderMonthSnapshot(monthRows);
    renderPivot(filtered);
    updateFilterSummary();
}

function renderSummary(monthRows) {
    const monthLabel = selectedMonth === 'all'
        ? `All Months ${selectedYear}`
        : `${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}`;

    const consultantsCount = new Set(monthRows.map(row => row.consultant_id)).size;
    const hours = monthRows.reduce((sum, row) => sum + row.hours, 0);

    const byCurrency = aggregateByCurrency(monthRows);
    const revenueText = formatCurrencyGroup(byCurrency);

    setMeta(`Month: ${monthLabel} • Consultants: ${consultantsCount} • Hours: ${hours.toFixed(2)} • Revenue: ${revenueText}`);

    if (els.monthSnapshotTitle) {
        els.monthSnapshotTitle.textContent = `Selected Month View (${monthLabel})`;
    }

    if (els.pivotTitle) {
        els.pivotTitle.textContent = `Pivot (${pivotMetric === 'hours' ? 'Hours' : 'Revenue'}) by Consultant and Month`;
    }
}

function renderKpis(monthRows) {
    const totalHours = monthRows.reduce((sum, row) => sum + row.hours, 0);
    const consultants = new Set(monthRows.map(row => row.consultant_id)).size;
    const byCurrency = aggregateByCurrency(monthRows);

    if (els.totalHoursCard) els.totalHoursCard.textContent = totalHours.toFixed(2);
    if (els.activeConsultantsCard) els.activeConsultantsCard.textContent = String(consultants);

    if (!els.projectedRevenueCard) return;

    const entries = Object.entries(byCurrency).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) {
        els.projectedRevenueCard.textContent = formatMoney(0, 'USD');
        return;
    }

    els.projectedRevenueCard.innerHTML = entries
        .map(([currency, amount]) => `<div style="font-size:0.875rem;line-height:1.35;">${formatMoney(amount, currency)}</div>`)
        .join('');
}

function renderMonthSnapshot(rows) {
    if (!els.monthSnapshotBody) return;

    const grouped = new Map();

    rows.forEach((row) => {
        const key = `${row.consultant_id}|${row.currency}`;
        const current = grouped.get(key) || {
            consultant_id: row.consultant_id,
            consultant_name: row.consultant_name,
            client: row.client,
            w2_company: row.w2_company,
            currency: row.currency,
            hours: 0,
            projected: 0,
            statuses: new Set(),
            invoices: new Set()
        };

        current.hours += row.hours;
        current.projected += row.projected;
        current.statuses.add(row.status);
        if (row.invoice_number) current.invoices.add(row.invoice_number);

        grouped.set(key, current);
    });

    const list = Array.from(grouped.values())
        .sort((a, b) => b.hours - a.hours);

    if (list.length === 0) {
        els.monthSnapshotBody.innerHTML = `
            <tr>
                <td colspan="8" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">📉</span>
                        <p class="empty-state__text">No timesheets for selected filters.</p>
                        <p class="empty-state__text" style="font-size:0.8125rem;">Add timesheets to populate analytics.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    els.monthSnapshotBody.innerHTML = list.map((row) => {
        const status = row.statuses.size === 1 ? Array.from(row.statuses)[0] : 'mixed';
        const invoiceLink = row.invoices.size === 0
            ? 'unbilled'
            : row.invoices.size === 1
                ? Array.from(row.invoices)[0]
                : 'multiple';

        return `
            <tr>
                <td>${escapeHtml(row.consultant_name)}</td>
                <td>${escapeHtml(row.client)}</td>
                <td>${escapeHtml(row.w2_company)}</td>
                <td>${row.hours.toFixed(2)}</td>
                <td>${formatMoney(row.projected, row.currency)}</td>
                <td>${renderStatusBadge(status)}</td>
                <td>${escapeHtml(invoiceLink)}</td>
                <td>
                    <button class="btn btn--outline btn--sm open-timesheets-btn" data-consultant="${escapeHtml(row.consultant_name)}">View/Edit in Timesheets</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPivot(rows) {
    if (!els.pivotHeadRow || !els.pivotBody) return;

    const monthKeys = MONTHS.map((_, idx) => `${selectedYear}-${String(idx + 1).padStart(2, '0')}`);
    els.pivotHeadRow.innerHTML = '<th>Consultant</th><th>Currency</th>' + MONTHS.map(label => `<th>${label}</th>`).join('');

    const consultants = new Map();

    rows.forEach((row) => {
        const key = `${row.consultant_id}|${row.currency}`;
        const current = consultants.get(key) || {
            consultant_name: row.consultant_name,
            currency: row.currency,
            cells: {}
        };

        const cell = current.cells[row.month_key] || { hours: 0, projected: 0 };
        cell.hours += row.hours;
        cell.projected += row.projected;
        current.cells[row.month_key] = cell;

        consultants.set(key, current);
    });

    const list = Array.from(consultants.values())
        .sort((a, b) => a.consultant_name.localeCompare(b.consultant_name));

    if (list.length === 0) {
        els.pivotBody.innerHTML = '<tr><td colspan="14" class="table__empty">No pivot data for selected filters.</td></tr>';
        return;
    }

    els.pivotBody.innerHTML = list.map((consultant) => {
        const cells = monthKeys.map((monthKey) => {
            const cell = consultant.cells[monthKey];
            if (!cell) return '<td>-</td>';

            if (pivotMetric === 'revenue') {
                return `<td>${formatMoney(cell.projected, consultant.currency)}</td>`;
            }

            return `<td>${cell.hours.toFixed(2)}</td>`;
        }).join('');

        return `
            <tr>
                <td style="font-weight:600;">${escapeHtml(consultant.consultant_name)}</td>
                <td>${consultant.currency}</td>
                ${cells}
            </tr>
        `;
    }).join('');
}

function getMonthRows(filteredRows) {
    if (selectedMonth === 'all') return filteredRows;
    const key = `${selectedYear}-${selectedMonth}`;
    return filteredRows.filter(row => row.month_key === key);
}

function aggregateByCurrency(rows) {
    return rows.reduce((acc, row) => {
        acc[row.currency] = (acc[row.currency] || 0) + row.projected;
        return acc;
    }, {});
}

function formatCurrencyGroup(byCurrency) {
    const entries = Object.entries(byCurrency).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) return formatMoney(0, 'USD');
    return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(' | ');
}

function updateFilterSummary() {
    if (!els.filterSummary) return;

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

    els.filterSummary.textContent = `${applied} filter${applied === 1 ? '' : 's'} applied`;
}

function updatePivotMetricButtons() {
    els.hoursMetricBtn?.classList.toggle('is-active', pivotMetric === 'hours');
    els.revenueMetricBtn?.classList.toggle('is-active', pivotMetric === 'revenue');
}

function updateAllMonthsToggleLabel() {
    if (!els.allMonthsToggleBtn) return;
    els.allMonthsToggleBtn.textContent = selectedMonth === 'all' ? 'All Months: ON' : 'All Months: OFF';
}

function buildPivotCsv() {
    const filtered = getFilteredRows();
    const monthKeys = MONTHS.map((_, idx) => `${selectedYear}-${String(idx + 1).padStart(2, '0')}`);

    const map = new Map();

    filtered.forEach((row) => {
        const key = `${row.consultant_id}|${row.currency}`;
        const current = map.get(key) || {
            consultant: row.consultant_name,
            currency: row.currency,
            cells: {}
        };

        const cell = current.cells[row.month_key] || { hours: 0, projected: 0 };
        cell.hours += row.hours;
        cell.projected += row.projected;
        current.cells[row.month_key] = cell;

        map.set(key, current);
    });

    const rows = Array.from(map.values())
        .sort((a, b) => a.consultant.localeCompare(b.consultant));

    const header = ['Consultant', 'Currency', ...MONTHS];
    const lines = [header.join(',')];

    rows.forEach((row) => {
        const values = [
            csvSafe(row.consultant),
            csvSafe(row.currency)
        ];

        monthKeys.forEach((monthKey) => {
            const cell = row.cells[monthKey];
            if (!cell) {
                values.push('');
                return;
            }

            if (pivotMetric === 'revenue') {
                values.push(csvSafe(cell.projected.toFixed(2)));
            } else {
                values.push(csvSafe(cell.hours.toFixed(2)));
            }
        });

        lines.push(values.join(','));
    });

    return lines.join('\n');
}

function downloadCsv(filename, content) {
    try {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
        showToast('CSV exported', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to export CSV', 'error');
    }
}

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        showToast('CSV copied to clipboard', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to copy CSV', 'error');
    }
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

function setMeta(text) {
    if (els.analyticsMeta) els.analyticsMeta.textContent = text;
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
    if (input === 'pending' || input === 'invoiced') return input;
    return 'all';
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

function renderStatusBadge(status) {
    if (status === 'invoiced') return '<span class="status-badge status-invoiced">Invoiced</span>';
    if (status === 'pending') return '<span class="status-badge status-pending">Pending</span>';
    return '<span class="status-badge status-mixed">Mixed</span>';
}

function csvSafe(value) {
    const text = String(value ?? '');
    if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
