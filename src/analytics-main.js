import { loadLayout } from './components/layout.js';
import { showToast, debounce, createRenderScheduler } from './modules/utils.js';
import { dbGetTimesheetsForYear } from './modules/db-timesheets.js';
import { getInvoices } from './database.js';
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
const CURRENCY_COLORS = {
    USD: '#2563eb',
    CAD: '#0f766e',
    EUR: '#7c3aed',
    GBP: '#ea580c',
    AUD: '#dc2626'
};
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
let currentSavedViewId = String(analyticsPrefs.savedViewId || '');

let rawRows = [];
let rawInvoices = [];

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

let activeTab = 'overview';
let activeKpiFilter = null;
let drawerData = null;

function cacheElements() {
    els.yearFilter = document.getElementById('yearFilter');
    els.monthFilter = document.getElementById('snapshotMonthFilter');
    els.allMonthsToggleBtn = document.getElementById('allMonthsToggleBtn');
    els.periodLabel = document.getElementById('periodLabel');
    els.periodLabelText = document.getElementById('periodLabelText');
    els.periodJumpMenu = document.getElementById('periodJumpMenu');
    els.periodJumpYear = document.getElementById('periodJumpYear');
    els.periodJumpMonths = document.getElementById('periodJumpMonths');
    els.periodJumpAllBtn = document.getElementById('periodJumpAllBtn');
    els.currencyFilter = document.getElementById('currencyFilter');
    els.clientFilter = document.getElementById('clientFilter');
    els.w2Filter = document.getElementById('w2Filter');
    els.statusFilter = document.getElementById('statusFilter');
    els.searchInput = document.getElementById('consultantSearch');
    els.clearFiltersBtn = document.getElementById('clearFiltersBtn');
    els.refreshBtn = document.getElementById('refreshBtn');
    els.savedViewSelect = document.getElementById('savedViewSelect');
    els.savedViewName = document.getElementById('savedViewName');
    els.saveViewBtn = document.getElementById('saveViewBtn');
    els.updateViewBtn = document.getElementById('updateViewBtn');
    els.deleteViewBtn = document.getElementById('deleteViewBtn');
    els.savedViewMeta = document.getElementById('savedViewMeta');
    els.exportCsvBtn = document.getElementById('exportCsvBtn');
    els.copyCsvBtn = document.getElementById('copyCsvBtn');
    els.hoursMetricBtn = document.getElementById('pivotHoursBtn');
    els.revenueMetricBtn = document.getElementById('pivotRevenueBtn');

    els.analyticsMeta = document.getElementById('analyticsMeta');
    els.analyticsPeriodTitle = document.getElementById('analyticsPeriodTitle');
    els.analyticsConsultantsStat = document.getElementById('analyticsConsultantsStat');
    els.analyticsHoursStat = document.getElementById('analyticsHoursStat');
    els.analyticsCurrenciesStat = document.getElementById('analyticsCurrenciesStat');

    els.totalHoursCard = document.getElementById('totalHoursCard');
    els.projectedRevenueCard = document.getElementById('projectedRevenueCard');
    els.activeConsultantsCard = document.getElementById('activeConsultantsCard');
    els.billingCoverageCard = document.getElementById('billingCoverageCard');
    els.billingCoverageSub = document.getElementById('billingCoverageSub');
    els.topClientInsight = document.getElementById('topClientInsight');
    els.topConsultantInsight = document.getElementById('topConsultantInsight');
    els.billingInsight = document.getElementById('billingInsight');

    els.monthSnapshotBody = document.getElementById('monthSnapshotBody');
    els.pivotHeadRow = document.getElementById('pivotHeadRow');
    els.pivotBody = document.getElementById('pivotBody');
    els.pivotTitle = document.getElementById('pivotTitle');
    els.monthSnapshotTitle = document.getElementById('monthSnapshotTitle');

    // Tabs
    els.tabBtns = document.querySelectorAll('.analytics-tabs__btn');
    els.panels = document.querySelectorAll('.analytics-panel');
    els.detailTabBadge = document.getElementById('detailTabBadge');

    // Drawer
    els.drawerOverlay = document.getElementById('drawerOverlay');
    els.detailDrawer = document.getElementById('detailDrawer');
    els.drawerTitle = document.getElementById('drawerTitle');
    els.drawerBody = document.getElementById('drawerBody');
    els.drawerCloseBtn = document.getElementById('drawerCloseBtn');
    els.drawerCloseFooter = document.getElementById('drawerCloseFooter');
    els.drawerOpenTimesheets = document.getElementById('drawerOpenTimesheets');

    // New analytics
    els.actualRevenueCard = document.getElementById('actualRevenueCard');
    els.actualRevenueSub = document.getElementById('actualRevenueSub');
    els.totalHoursLabelMeta = document.getElementById('totalHoursLabelMeta');
    els.actualRevenueLabelMeta = document.getElementById('actualRevenueLabelMeta');
    els.projectedRevenueLabelMeta = document.getElementById('projectedRevenueLabelMeta');
    els.consultantsLabelMeta = document.getElementById('consultantsLabelMeta');
    els.billingCoverageLabelMeta = document.getElementById('billingCoverageLabelMeta');
    els.revenueTrendBars = document.getElementById('revenueTrendBars');
    els.invoiceStatusDist = document.getElementById('invoiceStatusDist');
    els.invoiceStatusLegend = document.getElementById('invoiceStatusLegend');
    els.agingBuckets = document.getElementById('agingBuckets');
    els.commissionInsight = document.getElementById('commissionInsight');
    els.unbilledInsight = document.getElementById('unbilledInsight');
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
    updatePeriodLabel();
    renderPeriodJumpMenu();
    renderSavedViews();
}

function bindEvents() {
    els.yearFilter?.addEventListener('change', async (e) => {
        selectedYear = Number(e.target.value);
        persistShared();
        updatePeriodLabel();
        await refreshData();
    });

    els.monthFilter?.addEventListener('change', () => {
        selectedMonth = els.monthFilter.value;
        persistShared();
        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        requestRender();
    });

    els.allMonthsToggleBtn?.addEventListener('click', () => {
        selectedMonth = selectedMonth === 'all' ? defaultMonth : 'all';
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        persistShared();
        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        requestRender();
    });

    els.periodLabel?.addEventListener('click', (event) => {
        event.stopPropagation();
        togglePeriodJumpMenu();
    });

    els.periodJumpYear?.addEventListener('change', async (event) => {
        selectedYear = Number(event.target.value) || defaultYear;
        if (els.yearFilter) els.yearFilter.value = String(selectedYear);
        persistShared();
        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        await refreshData();
    });

    els.periodJumpMonths?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-month]');
        if (!(button instanceof HTMLElement)) return;
        selectedMonth = String(button.dataset.month || defaultMonth);
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        persistShared();
        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        closePeriodJumpMenu();
        requestRender();
    });

    els.periodJumpAllBtn?.addEventListener('click', () => {
        selectedMonth = 'all';
        if (els.monthFilter) els.monthFilter.value = selectedMonth;
        persistShared();
        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        closePeriodJumpMenu();
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

    els.clearFiltersBtn?.addEventListener('click', async () => {
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

        // Remove active KPI highlight
        document.querySelectorAll('.kpi-card--interactive').forEach(c => c.classList.remove('is-active'));
        activeKpiFilter = null;

        updateAllMonthsToggleLabel();
        updatePeriodLabel();
        populateFilterOptions();
        await refreshData();
    });

    els.savedViewSelect?.addEventListener('change', async () => {
        const id = String(els.savedViewSelect.value || '');
        currentSavedViewId = id;
        setPagePrefs('analytics', { savedViewId: currentSavedViewId, pivotMetric });
        renderSavedViews();
        if (!id) return;
        const view = listSavedViews('analytics').find((item) => item.id === id);
        if (view) await applySavedView(view);
    });

    els.saveViewBtn?.addEventListener('click', () => {
        const name = String(els.savedViewName?.value || '').trim();
        if (!name) {
            showToast('Enter a name for this saved view.', 'error');
            return;
        }
        const saved = saveSavedView('analytics', {
            name,
            state: captureSavedViewState()
        });
        currentSavedViewId = saved.id;
        setPagePrefs('analytics', { savedViewId: currentSavedViewId, pivotMetric });
        renderSavedViews();
        showToast('Saved view created.', 'success');
    });

    els.updateViewBtn?.addEventListener('click', () => {
        if (!currentSavedViewId) return;
        const existing = listSavedViews('analytics').find((item) => item.id === currentSavedViewId);
        const name = String(els.savedViewName?.value || existing?.name || '').trim();
        if (!name) {
            showToast('Enter a name for this saved view.', 'error');
            return;
        }
        saveSavedView('analytics', {
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
        deleteSavedView('analytics', currentSavedViewId);
        currentSavedViewId = '';
        setPagePrefs('analytics', { savedViewId: '', pivotMetric });
        renderSavedViews();
        showToast('Saved view deleted.', 'success');
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

    // ── Tab Switching ──
    els.tabBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // ── KPI Card Drill-Down ──
    document.querySelectorAll('.kpi-card--interactive').forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            handleKpiClick(filter);
        });
    });

    // ── Insight Card Drill-Through ──
    document.querySelectorAll('.insight-card--clickable').forEach(card => {
        card.addEventListener('click', () => {
            handleInsightClick(card);
        });
    });

    // ── Detail Table Row Click → Drawer ──
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        if (els.periodJumpMenu && !els.periodJumpMenu.hidden && !target.closest('.crm-toolbar__period-wrap')) {
            closePeriodJumpMenu();
        }

        // Pivot row expand
        const summaryRow = target.closest('.pivot-row--summary');
        if (summaryRow) {
            const detailId = summaryRow.dataset.detailId;
            const detailRow = document.getElementById(detailId);
            if (detailRow) {
                summaryRow.classList.toggle('is-expanded');
                detailRow.classList.toggle('is-visible');
            }
            return;
        }

        // Detail table row → open drawer
        const tableRow = target.closest('#monthSnapshotBody tr[data-consultant-id]');
        if (tableRow) {
            const consultantId = tableRow.dataset.consultantId;
            const currency = tableRow.dataset.currency;
            openDrawer(consultantId, currency);
            return;
        }
    });

    // ── Drawer close ──
    els.drawerCloseBtn?.addEventListener('click', closeDrawer);
    els.drawerCloseFooter?.addEventListener('click', closeDrawer);
    els.drawerOverlay?.addEventListener('click', closeDrawer);
    els.drawerOpenTimesheets?.addEventListener('click', () => {
        if (!drawerData) return;
        setSharedFilters({
            year: selectedYear,
            month: selectedMonth,
            currency: selectedCurrency,
            client: selectedClient,
            w2: selectedW2,
            status: selectedStatus,
            search: drawerData.consultant_name
        });
        window.location.href = 'timesheets.html';
    });

    // Keyboard: Escape closes drawer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePeriodJumpMenu();
        if (e.key === 'Escape' && els.detailDrawer?.classList.contains('is-open')) {
            closeDrawer();
        }
    });
}

async function refreshData() {
    setMeta('Loading analytics...');
    try {
        const [rows, invoices] = await Promise.all([
            dbGetTimesheetsForYear(selectedYear),
            getInvoices()
        ]);
        rawRows = normalizeRows(rows);
        rawInvoices = invoices || [];
        populateFilterOptions();
        requestRender();
    } catch (err) {
        console.error(err);
        rawRows = [];
        rawInvoices = [];
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
            notes: consultant.notes || '',
            client: consultant.client || '-',
            w2_company: consultant.w2_company || '-',
            bill_rate: billRate,
            commission_rate: Number(consultant.commission_rate) || 0,
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
            const hay = `${row.consultant_name} ${row.notes || ''} ${row.client} ${row.w2_company}`.toLowerCase();
            return hay.includes(searchTerm);
        });
}

function renderAll() {
    const filtered = getFilteredRows();
    const monthRows = getMonthRows(filtered);

    renderSummary(monthRows);
    renderKpis(monthRows);
    renderInsights(monthRows);
    renderMonthSnapshot(monthRows);
    renderPivot(filtered);
    updateSummaryMeta(monthRows);

    // New analytics (invoice-based)
    renderActualRevenue();
    renderRevenueTrend(filtered);
    renderInvoiceStatusDist();
    renderAgingBuckets();
    renderCommissionInsight(monthRows);
    renderUnbilledAlert(monthRows);

    // Update detail tab badge count
    const grouped = buildMonthSnapshotGroups(monthRows);
    if (els.detailTabBadge) els.detailTabBadge.textContent = String(grouped.length);
}

function renderSummary(monthRows) {
    const monthLabel = selectedMonth === 'all'
        ? `All Months ${selectedYear}`
        : `${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}`;

    const consultantsCount = new Set(monthRows.map(row => row.consultant_id)).size;
    const hours = monthRows.reduce((sum, row) => sum + row.hours, 0);

    const byCurrency = aggregateByCurrency(monthRows);
    const revenueText = formatCurrencyGroup(byCurrency);
    const currencyCount = Object.keys(byCurrency).length;

    setMeta(`Month: ${monthLabel} • Consultants: ${consultantsCount} • Hours: ${hours.toFixed(2)} • Revenue: ${revenueText}`);
    if (els.analyticsPeriodTitle) els.analyticsPeriodTitle.textContent = monthLabel;
    if (els.analyticsConsultantsStat) els.analyticsConsultantsStat.textContent = String(consultantsCount);
    if (els.analyticsHoursStat) els.analyticsHoursStat.textContent = hours.toFixed(2);
    if (els.analyticsCurrenciesStat) els.analyticsCurrenciesStat.textContent = String(currencyCount);

    if (els.monthSnapshotTitle) {
        els.monthSnapshotTitle.textContent = `Selected Month Performance (${monthLabel})`;
    }

    if (els.pivotTitle) {
        els.pivotTitle.textContent = `Pivot (${pivotMetric === 'hours' ? 'Hours' : 'Revenue'}) by Consultant and Month`;
    }
}

function renderKpis(monthRows) {
    const totalHours = monthRows.reduce((sum, row) => sum + row.hours, 0);
    const consultants = new Set(monthRows.map(row => row.consultant_id)).size;
    const byCurrency = aggregateByCurrency(monthRows);
    const invoicedHours = monthRows
        .filter(row => row.status === 'invoiced')
        .reduce((sum, row) => sum + row.hours, 0);
    const coveragePct = totalHours > 0 ? (invoicedHours / totalHours) * 100 : 0;

    if (els.totalHoursCard) els.totalHoursCard.textContent = totalHours.toFixed(2);
    if (els.activeConsultantsCard) els.activeConsultantsCard.textContent = String(consultants);
    if (els.billingCoverageCard) els.billingCoverageCard.textContent = `${Math.round(coveragePct)}%`;
    if (els.totalHoursLabelMeta) els.totalHoursLabelMeta.textContent = `(${getSelectedPeriodShortLabel()})`;
    if (els.consultantsLabelMeta) els.consultantsLabelMeta.textContent = `(Active ${getSelectedPeriodShortLabel()})`;
    if (els.billingCoverageLabelMeta) els.billingCoverageLabelMeta.textContent = `(${getSelectedPeriodShortLabel()})`;
    if (els.billingCoverageSub) {
        els.billingCoverageSub.textContent = `${invoicedHours.toFixed(2)} invoiced hrs of ${totalHours.toFixed(2)} total`;
    }
    if (els.projectedRevenueLabelMeta) {
        els.projectedRevenueLabelMeta.textContent = `(${getSelectedPeriodShortLabel()})`;
    }

    if (!els.projectedRevenueCard) return;

    const entries = Object.entries(byCurrency).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) {
        els.projectedRevenueCard.textContent = formatMoney(0, 'USD');
        return;
    }

    els.projectedRevenueCard.innerHTML = `<div class="kpi-card__stack">${entries
        .map(([currency, amount]) => `<div class="kpi-card__stack-item">${formatMoney(amount, currency)}</div>`)
        .join('')}</div>`;
}

function renderInsights(monthRows) {
    renderTopClientInsight(monthRows);
    renderTopConsultantInsight(monthRows);
    renderBillingInsight(monthRows);
}

function buildMonthSnapshotGroups(rows) {
    const grouped = new Map();

    rows.forEach((row) => {
        const key = `${row.consultant_id}|${row.currency}`;
        const current = grouped.get(key) || {
            consultant_id: row.consultant_id,
            consultant_name: row.consultant_name,
            notes: row.notes || '',
            client: row.client,
            w2_company: row.w2_company,
            currency: row.currency,
            bill_rate: row.bill_rate,
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

    return Array.from(grouped.values())
        .sort((a, b) => (b.projected - a.projected) || (b.hours - a.hours));
}

function renderMonthSnapshot(rows) {
    if (!els.monthSnapshotBody) return;

    const list = buildMonthSnapshotGroups(rows);

    if (list.length === 0) {
        els.monthSnapshotBody.innerHTML = `
            <tr>
                <td colspan="7" class="table__empty">
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
        const invoiceLink = renderInvoiceLink(row.invoices);
        const rateType = row.bill_rate > 0 ? `${row.currency} ${row.bill_rate.toFixed(2)}/hr` : `${row.currency} rate unavailable`;

        return `
            <tr data-consultant-id="${escapeHtml(row.consultant_id)}" data-currency="${escapeHtml(row.currency)}" style="cursor:pointer;" title="Click to view details">
                <td>
                    <div class="analytics-person">
                        <span class="analytics-person__name" style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
                            <span>${escapeHtml(row.consultant_name)}</span>
                            ${renderNoteTooltip(row.notes)}
                        </span>
                        <span class="analytics-person__meta">${escapeHtml(rateType)}</span>
                    </div>
                </td>
                <td>${escapeHtml(row.client)}</td>
                <td>${escapeHtml(row.w2_company)}</td>
                <td>${row.hours.toFixed(2)}</td>
                <td>${formatMoney(row.projected, row.currency)}</td>
                <td>${renderStatusBadge(status)}</td>
                <td>${invoiceLink}</td>
            </tr>
        `;
    }).join('');
}

function renderPivot(rows) {
    if (!els.pivotHeadRow || !els.pivotBody) return;

    const monthKeys = MONTHS.map((_, idx) => `${selectedYear}-${String(idx + 1).padStart(2, '0')}`);
    els.pivotHeadRow.innerHTML = '<th></th><th>Consultant</th><th>Currency</th><th>Total</th>';

    const consultants = new Map();

    rows.forEach((row) => {
        const key = `${row.consultant_id}|${row.currency}`;
        const current = consultants.get(key) || {
            consultant_name: row.consultant_name,
            notes: row.notes || '',
            currency: row.currency,
            cells: {}
        };

        const cell = current.cells[row.month_key] || { hours: 0, projected: 0 };
        cell.hours += row.hours;
        cell.projected += row.projected;
        current.cells[row.month_key] = cell;

        consultants.set(key, current);
    });

    const list = Array.from(consultants.entries())
        .sort((a, b) => a[1].consultant_name.localeCompare(b[1].consultant_name));

    if (list.length === 0) {
        els.pivotBody.innerHTML = '<tr><td colspan="4" class="table__empty">No pivot data for selected filters.</td></tr>';
        return;
    }

    const chevronSvg = '<svg class="pivot-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 5 7 7-7 7"/></svg>';

    els.pivotBody.innerHTML = list.map(([key, consultant], idx) => {
        const totalHours = Object.values(consultant.cells).reduce((s, c) => s + c.hours, 0);
        const totalRevenue = Object.values(consultant.cells).reduce((s, c) => s + c.projected, 0);
        const totalVal = pivotMetric === 'revenue'
            ? formatMoney(totalRevenue, consultant.currency)
            : totalHours.toFixed(2);

        const detailId = `pivot-detail-${idx}`;

        // Monthly breakdown grid
        const monthCells = monthKeys.map((monthKey, mIdx) => {
            const cell = consultant.cells[monthKey];
            if (!cell) return '';
            const val = pivotMetric === 'revenue'
                ? formatMoney(cell.projected, consultant.currency)
                : cell.hours.toFixed(2);
            return `<div class="pivot-month-cell"><span class="pivot-month-cell__label">${MONTHS[mIdx]}</span><span class="pivot-month-cell__value">${val}</span></div>`;
        }).filter(Boolean).join('');

        return `
            <tr class="pivot-row--summary" data-detail-id="${detailId}">
                <td>${chevronSvg}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
                        <span>${escapeHtml(consultant.consultant_name)}</span>
                        ${renderNoteTooltip(consultant.notes)}
                    </div>
                </td>
                <td>${consultant.currency}</td>
                <td style="font-weight:700;">${totalVal}</td>
            </tr>
            <tr class="pivot-row--detail" id="${detailId}">
                <td colspan="4">
                    <div class="pivot-month-grid">${monthCells || '<span style="color:var(--text-tertiary);font-size:0.78rem;">No monthly data</span>'}</div>
                </td>
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

function updateSummaryMeta(monthRows) {
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
    const monthLabel = selectedMonth === 'all'
        ? `All months in ${selectedYear}`
        : `${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}`;
    const filterText = applied > 0
        ? `${applied} extra filter${applied === 1 ? '' : 's'} active`
        : 'Default filter set';
    const consultantsCount = new Set(monthRows.map(row => row.consultant_id)).size;
    const hours = monthRows.reduce((sum, row) => sum + row.hours, 0);
    setMeta(`Month: ${monthLabel} • Consultants: ${consultantsCount} • Hours: ${hours.toFixed(2)} • ${filterText}`);
}

function renderTopClientInsight(rows) {
    if (!els.topClientInsight) return;

    const map = new Map();
    rows.forEach((row) => {
        const key = row.client;
        const current = map.get(key) || {
            name: row.client,
            hours: 0,
            projected: {},
            consultants: new Set()
        };
        current.hours += row.hours;
        current.projected[row.currency] = (current.projected[row.currency] || 0) + row.projected;
        current.consultants.add(row.consultant_id);
        map.set(key, current);
    });

    const top = Array.from(map.values())
        .filter(entry => entry.name && entry.name !== '-')
        .sort((a, b) => (b.hours - a.hours) || (totalCurrencyAmount(b.projected) - totalCurrencyAmount(a.projected)))[0];

    if (!top) {
        els.topClientInsight.innerHTML = `
            <div class="insight-card__eyebrow">Top Client</div>
            <div class="insight-card__title">No client data yet</div>
            <div class="insight-card__body">Add timesheets for the selected period to identify top-billing clients.</div>
        `;
        return;
    }

    els.topClientInsight.innerHTML = `
        <div class="insight-card__eyebrow">Top Client</div>
        <div class="insight-card__title">${escapeHtml(top.name)}</div>
        <div class="insight-card__body">Highest projected value in the current period.</div>
        <div class="insight-card__meta">
            <div class="insight-card__meta-row"><span>Projected revenue</span><strong>${escapeHtml(formatCurrencyGroup(top.projected))}</strong></div>
            <div class="insight-card__meta-row"><span>Hours logged</span><strong>${top.hours.toFixed(2)}</strong></div>
            <div class="insight-card__meta-row"><span>Consultants</span><strong>${top.consultants.size}</strong></div>
        </div>
        <div class="insight-card__drill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 5 7 7-7 7"/></svg> View in Detail</div>
    `;
    els.topClientInsight.dataset.drillValue = normalizeTextFilter(top.name);
}

function renderTopConsultantInsight(rows) {
    if (!els.topConsultantInsight) return;

    const map = new Map();
    rows.forEach((row) => {
        const key = `${row.consultant_id}|${row.currency}`;
        const current = map.get(key) || {
            name: row.consultant_name,
            currency: row.currency,
            client: row.client,
            hours: 0,
            projected: 0,
            pendingHours: 0
        };
        current.hours += row.hours;
        current.projected += row.projected;
        if (row.status === 'pending') current.pendingHours += row.hours;
        map.set(key, current);
    });

    const top = Array.from(map.values())
        .sort((a, b) => (b.hours - a.hours) || (b.projected - a.projected))[0];

    if (!top) {
        els.topConsultantInsight.innerHTML = `
            <div class="insight-card__eyebrow">Top Consultant</div>
            <div class="insight-card__title">No consultant data yet</div>
            <div class="insight-card__body">Consultant-level performance appears here once hours are added.</div>
        `;
        return;
    }

    els.topConsultantInsight.innerHTML = `
        <div class="insight-card__eyebrow">Top Consultant</div>
        <div class="insight-card__title">${escapeHtml(top.name)}</div>
        <div class="insight-card__body">${escapeHtml(top.client || 'No client assigned')} • ${escapeHtml(top.currency)}</div>
        <div class="insight-card__meta">
            <div class="insight-card__meta-row"><span>Projected revenue</span><strong>${formatMoney(top.projected, top.currency)}</strong></div>
            <div class="insight-card__meta-row"><span>Total hours</span><strong>${top.hours.toFixed(2)}</strong></div>
            <div class="insight-card__meta-row"><span>Pending hours</span><strong>${top.pendingHours.toFixed(2)}</strong></div>
        </div>
        <div class="insight-card__drill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 5 7 7-7 7"/></svg> View in Detail</div>
    `;
    els.topConsultantInsight.dataset.drillValue = top.name;
}

function renderBillingInsight(rows) {
    if (!els.billingInsight) return;

    const pendingHours = rows.filter(row => row.status === 'pending').reduce((sum, row) => sum + row.hours, 0);
    const invoicedHours = rows.filter(row => row.status === 'invoiced').reduce((sum, row) => sum + row.hours, 0);
    const pendingRevenue = aggregateByCurrency(rows.filter(row => row.status === 'pending'));
    const invoicedRevenue = aggregateByCurrency(rows.filter(row => row.status === 'invoiced'));
    const hasData = pendingHours > 0 || invoicedHours > 0;

    if (!hasData) {
        els.billingInsight.innerHTML = `
            <div class="insight-card__eyebrow">Billing Status</div>
            <div class="insight-card__title">No billing data yet</div>
            <div class="insight-card__body">This view will separate pending and invoiced hours for the selected period.</div>
        `;
        return;
    }

    els.billingInsight.innerHTML = `
        <div class="insight-card__eyebrow">Billing Status</div>
        <div class="insight-card__title">${invoicedHours >= pendingHours ? 'Mostly invoiced' : 'Pending work needs attention'}</div>
        <div class="insight-card__body">Use this to spot hours that still need an invoice.</div>
        <div class="insight-card__meta">
            <div class="insight-card__meta-row"><span>Pending</span><strong>${pendingHours.toFixed(2)} hrs • ${escapeHtml(formatCurrencyGroup(pendingRevenue))}</strong></div>
            <div class="insight-card__meta-row"><span>Invoiced</span><strong>${invoicedHours.toFixed(2)} hrs • ${escapeHtml(formatCurrencyGroup(invoicedRevenue))}</strong></div>
            <div class="insight-card__meta-row"><span>Coverage</span><strong>${Math.round((invoicedHours / Math.max(invoicedHours + pendingHours, 1)) * 100)}%</strong></div>
        </div>
        <div class="insight-card__drill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 5 7 7-7 7"/></svg> View pending in Detail</div>
    `;
    els.billingInsight.dataset.drillValue = 'pending';
}

/* ============================================================
   Tab Switching
   ============================================================ */
function switchTab(tabId) {
    activeTab = tabId;
    els.tabBtns?.forEach(btn => {
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });
    els.panels?.forEach(panel => {
        panel.classList.toggle('is-visible', panel.id === `panel-${tabId}`);
    });
}

/* ============================================================
   KPI Card Drill-Down
   ============================================================ */
function handleKpiClick(filter) {
    // Remove active from all KPI cards
    document.querySelectorAll('.kpi-card--interactive').forEach(c => c.classList.remove('is-active'));

    if (filter === 'all') {
        // Reset status filter and switch to detail
        selectedStatus = 'all';
        if (els.statusFilter) els.statusFilter.value = 'all';
        activeKpiFilter = null;
        persistShared();
        requestRender();
        switchTab('detail');
        return;
    }

    if (filter === 'pending') {
        const toggledStatus = selectedStatus === 'pending' ? 'all' : 'pending';
        selectedStatus = toggledStatus;
        if (els.statusFilter) els.statusFilter.value = toggledStatus;
        activeKpiFilter = toggledStatus === 'pending' ? 'pending' : null;

        if (toggledStatus === 'pending') {
            document.getElementById('kpiBilling')?.classList.add('is-active');
        }

        persistShared();
        requestRender();
        switchTab('detail');
        return;
    }

    // For revenue / consultants, just switch to detail tab
    const card = document.querySelector(`.kpi-card--interactive[data-filter="${filter}"]`);
    if (card) card.classList.add('is-active');
    switchTab('detail');
}

/* ============================================================
   Insight Card Drill-Through
   ============================================================ */
function handleInsightClick(card) {
    const drill = card.dataset.drill;
    const value = card.dataset.drillValue;
    if (!value) return;

    if (drill === 'client') {
        selectedClient = normalizeTextFilter(value);
        if (els.clientFilter) els.clientFilter.value = selectedClient;
        persistShared();
        requestRender();
        switchTab('detail');
        return;
    }

    if (drill === 'consultant') {
        searchTerm = value.toLowerCase();
        if (els.searchInput) els.searchInput.value = value;
        persistShared();
        requestRender();
        switchTab('detail');
        return;
    }

    if (drill === 'billing') {
        selectedStatus = 'pending';
        if (els.statusFilter) els.statusFilter.value = 'pending';
        persistShared();
        requestRender();
        switchTab('detail');
        return;
    }
}

/* ============================================================
   Detail Drawer
   ============================================================ */
function openDrawer(consultantId, currency) {
    const filtered = getFilteredRows();
    const monthRows = getMonthRows(filtered);
    const rows = monthRows.filter(r => r.consultant_id === consultantId && r.currency === currency);
    if (rows.length === 0) return;

    const first = rows[0];
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.projected, 0);
    const invoiceNums = [...new Set(rows.map(r => r.invoice_number).filter(Boolean))];
    const statuses = [...new Set(rows.map(r => r.status))];
    const statusLabel = statuses.length === 1 ? capitalize(statuses[0]) : 'Mixed';

    drawerData = { consultant_name: first.consultant_name, consultant_id: consultantId, currency };

    if (els.drawerTitle) els.drawerTitle.textContent = first.consultant_name;

    // Build monthly bar chart from year data
    const yearRows = filtered.filter(r => r.consultant_id === consultantId && r.currency === currency);
    const monthlyHours = {};
    yearRows.forEach(r => { monthlyHours[r.month_key] = (monthlyHours[r.month_key] || 0) + r.hours; });
    const maxH = Math.max(...Object.values(monthlyHours), 1);
    const barHtml = MONTHS.map((label, idx) => {
        const key = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
        const h = monthlyHours[key] || 0;
        const pct = Math.round((h / maxH) * 100);
        return `<div class="drawer-bar__col"><div class="drawer-bar__fill" style="height:${pct}%"></div><div class="drawer-bar__label">${label}</div></div>`;
    }).join('');

    if (els.drawerBody) {
        els.drawerBody.innerHTML = `
            <div class="drawer-meta">
                <div class="drawer-meta__row"><span class="drawer-meta__label">Client</span><span class="drawer-meta__value">${escapeHtml(first.client)}</span></div>
                <div class="drawer-meta__row"><span class="drawer-meta__label">W2 Company</span><span class="drawer-meta__value">${escapeHtml(first.w2_company)}</span></div>
                <div class="drawer-meta__row"><span class="drawer-meta__label">Notes</span><span class="drawer-meta__value">${escapeHtml(first.notes || '—')}</span></div>
                <div class="drawer-meta__row"><span class="drawer-meta__label">Bill Rate</span><span class="drawer-meta__value">${first.bill_rate > 0 ? `${currency} ${first.bill_rate.toFixed(2)}/hr` : 'N/A'}</span></div>
                <div class="drawer-meta__row"><span class="drawer-meta__label">Hours (period)</span><span class="drawer-meta__value">${totalHours.toFixed(2)}</span></div>
                <div class="drawer-meta__row"><span class="drawer-meta__label">Revenue (period)</span><span class="drawer-meta__value">${formatMoney(totalRevenue, currency)}</span></div>
                <div class="drawer-meta__row"><span class="drawer-meta__label">Status</span><span class="drawer-meta__value">${statusLabel}</span></div>
                <div class="drawer-meta__row"><span class="drawer-meta__label">Invoices</span><span class="drawer-meta__value">${invoiceNums.length > 0 ? escapeHtml(invoiceNums.join(', ')) : 'Unbilled'}</span></div>
            </div>
            <div class="drawer-section">
                <div class="drawer-section__title">Hours by Month (${selectedYear})</div>
                <div class="drawer-bar">${barHtml}</div>
            </div>
        `;
    }

    els.detailDrawer?.classList.add('is-open');
    els.drawerOverlay?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closeDrawer() {
    els.detailDrawer?.classList.remove('is-open');
    els.drawerOverlay?.classList.remove('is-open');
    document.body.style.overflow = '';
    drawerData = null;
}

function renderNoteTooltip(notes) {
    const text = String(notes || '').trim();
    if (!text) return '';
    return `
        <div class="note-tooltip-container" aria-label="Consultant note">
            <span class="note-tooltip-trigger">📝</span>
            <div class="note-tooltip">${escapeHtml(text)}</div>
        </div>
    `;
}

function updatePivotMetricButtons() {
    els.hoursMetricBtn?.classList.toggle('is-active', pivotMetric === 'hours');
    els.revenueMetricBtn?.classList.toggle('is-active', pivotMetric === 'revenue');
}

function updateAllMonthsToggleLabel() {
    if (!els.allMonthsToggleBtn) return;
    els.allMonthsToggleBtn.textContent = selectedMonth === 'all' ? 'All Months: ON' : 'All Months: OFF';
}

function updatePeriodLabel() {
    const el = els.periodLabelText || els.periodLabel;
    if (!el) return;
    if (selectedMonth === 'all') {
        el.textContent = `${selectedYear}`;
    } else {
        const mIdx = Number(selectedMonth) - 1;
        el.textContent = `${MONTHS[mIdx]} ${selectedYear}`;
    }
    renderPeriodJumpMenu();
}

function renderPeriodJumpMenu() {
    if (els.periodLabel) {
        els.periodLabel.setAttribute('aria-expanded', String(Boolean(els.periodJumpMenu && !els.periodJumpMenu.hidden)));
    }

    if (els.periodJumpYear) {
        const years = [];
        for (let y = defaultYear + 1; y >= defaultYear - 4; y -= 1) years.push(y);
        els.periodJumpYear.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
        els.periodJumpYear.value = String(selectedYear);
    }

    if (els.periodJumpAllBtn) {
        els.periodJumpAllBtn.classList.toggle('is-active', selectedMonth === 'all');
    }

    if (els.periodJumpMonths) {
        els.periodJumpMonths.innerHTML = MONTHS.map((label, idx) => {
            const value = String(idx + 1).padStart(2, '0');
            const active = selectedMonth === value ? ' is-active' : '';
            return `<button type="button" class="crm-toolbar__period-month${active}" data-month="${value}">${label}</button>`;
        }).join('');
    }
}

function togglePeriodJumpMenu(forceOpen) {
    if (!els.periodJumpMenu) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : els.periodJumpMenu.hidden;
    els.periodJumpMenu.hidden = !shouldOpen;
    renderPeriodJumpMenu();
}

function closePeriodJumpMenu() {
    if (!els.periodJumpMenu || els.periodJumpMenu.hidden) return;
    els.periodJumpMenu.hidden = true;
    renderPeriodJumpMenu();
}

/* ============================================================
   1. Actual (Collected) Revenue
   ============================================================ */
function renderActualRevenue() {
    if (!els.actualRevenueCard) return;
    if (els.actualRevenueLabelMeta) {
        els.actualRevenueLabelMeta.textContent = `(Paid ${getSelectedPeriodShortLabel()})`;
    }

    const paidInvoices = rawInvoices.filter(inv => String(inv.status || '').toLowerCase() === 'paid');
    const byCurrency = {};
    paidInvoices.forEach(inv => {
        const curr = String(inv.invoice_meta?.currency || 'USD').toUpperCase();
        const dist = getInvoiceDistribution(inv);
        
        for (const [monthKey, amount] of Object.entries(dist)) {
            if (!monthKey.startsWith(String(selectedYear))) continue;
            if (selectedMonth !== 'all') {
                const mk = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
                if (monthKey !== mk) continue;
            }
            byCurrency[curr] = (byCurrency[curr] || 0) + amount;
        }
    });

    const entries = Object.entries(byCurrency).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) {
        els.actualRevenueCard.textContent = formatMoney(0, 'USD');
    } else if (entries.length === 1) {
        els.actualRevenueCard.textContent = formatMoney(entries[0][1], entries[0][0]);
    } else {
        els.actualRevenueCard.innerHTML = `<div class="kpi-card__stack">${entries
            .map(([c, a]) => `<div class="kpi-card__stack-item">${formatMoney(a, c)}</div>`)
            .join('')}</div>`;
    }
}

function getSelectedPeriodContextLabel() {
    if (selectedMonth === 'all') return `All Months ${selectedYear}`;
    const mIdx = Number(selectedMonth) - 1;
    return `${MONTHS[mIdx]} ${selectedYear}`;
}

function getSelectedPeriodShortLabel() {
    if (selectedMonth === 'all') return `${selectedYear}`;
    const mIdx = Number(selectedMonth) - 1;
    return `${MONTHS[mIdx]} ${selectedYear}`;
}

function getInvoiceDistribution(inv) {
    const dist = {};
    const ts = String(inv.paid_date || inv.invoice_meta?.dateRaw || inv.created_at || '').trim();
    let fallbackMonth = '';
    if (/^\d{4}-\d{2}-\d{2}/.test(ts)) {
        fallbackMonth = ts.slice(0, 7);
    } else if (inv.created_at) {
        const d = new Date(inv.created_at);
        fallbackMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const invTotal = inv.totals?.total || 0;

    if (!inv || !inv.invoice_number) {
        if (fallbackMonth) dist[fallbackMonth] = invTotal;
        return dist;
    }

    const num = String(inv.invoice_number).trim();
    const matchingRows = rawRows.filter(r => String(r.invoice_number || '').trim() === num && r.month_key);
    
    if (matchingRows.length === 0) {
        if (fallbackMonth) dist[fallbackMonth] = invTotal;
        return dist;
    }

    const totalProjected = matchingRows.reduce((sum, r) => sum + (r.projected || 0), 0);

    matchingRows.forEach(r => {
        const share = totalProjected > 0 ? (r.projected || 0) / totalProjected : (1 / matchingRows.length);
        dist[r.month_key] = (dist[r.month_key] || 0) + (invTotal * share);
    });

    return dist;
}

function getInvoiceMonths(inv) {
    return Object.keys(getInvoiceDistribution(inv));
}

function renderRevenueTrend(filteredRows) {
    if (!els.revenueTrendBars) return;

    const monthKeys = MONTHS.map((_, idx) => `${selectedYear}-${String(idx + 1).padStart(2, '0')}`);

    // Projected from timesheets
    const projectedByMonth = {};
    filteredRows.forEach(row => {
        projectedByMonth[row.month_key] = (projectedByMonth[row.month_key] || 0) + row.projected;
    });

    // Collected from paid invoices (respecting currency filter)
    const collectedByMonth = {};
    rawInvoices.filter(inv => {
        if (String(inv.status || '').toLowerCase() !== 'paid') return false;
        const invCurr = String(inv.invoice_meta?.currency || 'USD').toUpperCase();
        if (selectedCurrency !== 'all' && invCurr !== selectedCurrency) return false;
        return true;
    }).forEach(inv => {
        const dist = getInvoiceDistribution(inv);
        for (const [monthKey, amount] of Object.entries(dist)) {
            if (monthKey.startsWith(String(selectedYear))) {
                collectedByMonth[monthKey] = (collectedByMonth[monthKey] || 0) + amount;
            }
        }
    });

    const allValues = [...Object.values(projectedByMonth), ...Object.values(collectedByMonth)];
    const maxVal = Math.max(...allValues, 1);
    const currencyStr = selectedCurrency === 'all' ? '' : selectedCurrency;

    if (allValues.every(v => v === 0)) {
        els.revenueTrendBars.className = 'analytics-trend-chart analytics-trend-chart--empty';
        els.revenueTrendBars.innerHTML = `<div>No revenue data for ${selectedYear} yet.</div>`;
        return;
    }

    // Nice Y-axis ticks (3 ticks)
    const niceMax = niceRoundUp(maxVal);
    const ticks = [0, niceMax / 2, niceMax];

    // SVG dimensions in viewBox units
    const vW = 600, vH = 220;
    const padL = 60, padR = 20, padT = 28, padB = 28;
    const chartW = vW - padL - padR;
    const chartH = vH - padT - padB;
    const groupW = chartW / 12;
    const barW = groupW * 0.34;
    const gap = 3;

    // Grid lines
    const gridLines = ticks.map(t => {
        const y = padT + chartH - (t / niceMax) * chartH;
        return `<line x1="${padL}" y1="${y}" x2="${vW - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="0.75" stroke-dasharray="3,3"/>`;
    }).join('');

    // Y-axis labels
    const yLabels = ticks.map(t => {
        const y = padT + chartH - (t / niceMax) * chartH;
        return `<text x="${padL - 8}" y="${y + 3}" text-anchor="end" fill="#94a3b8" font-size="9" font-weight="600" font-family="inherit">${formatCompactNumber(t)}</text>`;
    }).join('');

    // Bars per month with hover value labels (Tableau-style)
    const bars = monthKeys.map((mk, idx) => {
        const proj = projectedByMonth[mk] || 0;
        const coll = collectedByMonth[mk] || 0;
        const projH = niceMax > 0 ? (proj / niceMax) * chartH : 0;
        const collH = niceMax > 0 ? (coll / niceMax) * chartH : 0;
        const groupX = padL + idx * groupW + groupW / 2;
        const baseY = padT + chartH;
        const projTip = `${MONTHS[idx]}: Projected ${formatMoney(proj, currencyStr)}`;
        const collTip = `${MONTHS[idx]}: Collected ${formatMoney(coll, currencyStr)}`;

        // Value labels positioned above bars
        const projLabel = proj > 0 ? `<text class="bar-val-label bar-val-label--proj" x="${groupX - barW / 2 - gap / 2}" y="${baseY - projH - 5}" text-anchor="middle" fill="#64748b" font-size="7.5" font-weight="700" font-family="inherit">${formatCompactNumber(proj)}</text>` : '';
        const collLabel = coll > 0 ? `<text class="bar-val-label bar-val-label--coll" x="${groupX + barW / 2 + gap / 2}" y="${baseY - collH - 5}" text-anchor="middle" fill="#2563eb" font-size="7.5" font-weight="700" font-family="inherit">${formatCompactNumber(coll)}</text>` : '';

        // Invisible hover zone for the entire group
        const hoverZone = `<rect x="${padL + idx * groupW}" y="${padT}" width="${groupW}" height="${chartH + 4}" fill="transparent" class="trend-bar-hover-zone"/>`;

        return `
            <g class="trend-bar-group">
                ${hoverZone}
                <rect x="${groupX - barW - gap / 2}" y="${baseY - projH}" width="${barW}" height="${Math.max(projH, 0)}" rx="3" fill="#cbd5e1" opacity="0.75"><title>${escapeHtml(projTip)}</title></rect>
                <rect x="${groupX + gap / 2}" y="${baseY - collH}" width="${barW}" height="${Math.max(collH, 0)}" rx="3" fill="#3b82f6"><title>${escapeHtml(collTip)}</title></rect>
                ${projLabel}
                ${collLabel}
            </g>
        `;
    }).join('');

    // X-axis labels
    const xLabels = monthKeys.map((mk, idx) => {
        const groupX = padL + idx * groupW + groupW / 2;
        return `<text x="${groupX}" y="${vH - 6}" text-anchor="middle" fill="#94a3b8" font-size="9" font-weight="600" font-family="inherit">${MONTHS[idx]}</text>`;
    }).join('');

    // Baseline
    const baseline = `<line x1="${padL}" y1="${padT + chartH}" x2="${vW - padR}" y2="${padT + chartH}" stroke="#cbd5e1" stroke-width="1"/>`;

    els.revenueTrendBars.className = 'analytics-trend-chart';
    els.revenueTrendBars.innerHTML = `
        <svg viewBox="0 0 ${vW} ${vH}" preserveAspectRatio="xMidYMid meet" style="width:100%; height:auto; display:block;">
            <style>
                .bar-val-label { opacity: 0; transition: opacity 0.15s ease; pointer-events: none; }
                .trend-bar-group:hover .bar-val-label { opacity: 1; }
                .trend-bar-group:hover .trend-bar-hover-zone { fill: rgba(0,0,0,0.02); }
            </style>
            ${gridLines}
            ${baseline}
            ${yLabels}
            ${bars}
            ${xLabels}
        </svg>
    `;
}

function niceRoundUp(val) {
    if (val <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    const norm = val / mag;
    if (norm <= 1) return mag;
    if (norm <= 2) return 2 * mag;
    if (norm <= 5) return 5 * mag;
    return 10 * mag;
}

/* ============================================================
   3. Invoice Status Distribution
   ============================================================ */
function renderInvoiceStatusDist() {
    if (!els.invoiceStatusDist) return;

    const statusDefs = [
        { key: 'paid',    label: 'Paid',    color: '#22c55e' },
        { key: 'sent',    label: 'Sent',    color: '#f59e0b' },
        { key: 'overdue', label: 'Overdue', color: '#ef4444' },
        { key: 'draft',   label: 'Draft',   color: '#94a3b8' }
    ];

    const counts = { paid: 0, sent: 0, overdue: 0, draft: 0 };
    const amounts = { paid: 0, sent: 0, overdue: 0, draft: 0 };
    const amountsByCurrency = { paid: {}, sent: {}, overdue: {}, draft: {} };
    const today = new Date();

    // Filter invoices by selected month
    const filteredInvoices = rawInvoices.filter(inv => {
        const months = getInvoiceMonths(inv);
        
        // At least one month must match year
        if (!months.some(mk => mk.startsWith(String(selectedYear)))) return false;
        
        if (selectedMonth !== 'all') {
            const mk = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
            if (!months.includes(mk)) return false;
        }
        return true;
    });

    filteredInvoices.forEach(inv => {
        let status = String(inv.status || 'draft').toLowerCase();
        if (status === 'sent' && inv.invoice_meta?.dueDateRaw) {
            const due = new Date(inv.invoice_meta.dueDateRaw);
            if (due < today) status = 'overdue';
        }
        if (!counts.hasOwnProperty(status)) status = 'draft';
        
        const curr = normalizeCurrency(inv.invoice_meta?.currency || 'USD');
        const dist = getInvoiceDistribution(inv);
        
        // Calculate the slice of the invoice that belongs to the current filter
        let validAmount = 0;
        const months = Object.keys(dist);
        if (selectedMonth !== 'all') {
            const mk = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
            validAmount = dist[mk] || 0;
        } else {
            for (const [mk, amt] of Object.entries(dist)) {
                if (mk.startsWith(String(selectedYear))) validAmount += amt;
            }
        }
        
        // Count as 1 invoice in this view, but amount is strictly proportional
        counts[status]++;
        amounts[status] += validAmount;
        amountsByCurrency[status][curr] = (amountsByCurrency[status][curr] || 0) + validAmount;
    });

    const totalCount = Object.values(counts).reduce((s, c) => s + c, 0);
    const allCurrencies = [...new Set(Object.values(amountsByCurrency).flatMap(m => Object.keys(m)))].sort();

    if (totalCount === 0) {
        els.invoiceStatusDist.innerHTML = `<div class="analytics-status-dist__empty">No invoices for ${getSelectedPeriodShortLabel()}.</div>`;
        if (els.invoiceStatusLegend) els.invoiceStatusLegend.innerHTML = '';
        return;
    }

    // Show currency legend if multiple currencies
    if (els.invoiceStatusLegend) {
        els.invoiceStatusLegend.innerHTML = allCurrencies.length > 1
            ? allCurrencies.map(c => `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.6rem;font-weight:700;color:var(--text-tertiary);"><span style="width:6px;height:6px;border-radius:50%;background:${getCurrencyColor(c)}"></span>${escapeHtml(c)}</span>`).join('')
            : '';
    }

    // Build SVG donut
    const size = 110, cx = size / 2, cy = size / 2, r = 40, strokeW = 14;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = statusDefs.map(sd => {
        const count = counts[sd.key];
        const pct = count / totalCount;
        const dashLen = pct * circ;
        const dashArr = `${dashLen} ${circ - dashLen}`;
        const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${sd.color}" stroke-width="${strokeW}" stroke-dasharray="${dashArr}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"><title>${sd.label}: ${count} (${formatCompactNumber(amounts[sd.key])})</title></circle>`;
        offset += dashLen;
        return arc;
    }).join('');

    // Stat rows with per-currency breakdown
    const statRows = statusDefs.map(sd => {
        const count = counts[sd.key];
        const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
        const currBreakdown = allCurrencies.length > 1
            ? allCurrencies.map(c => {
                const a = amountsByCurrency[sd.key][c] || 0;
                return `<span style="color:${a > 0 ? getCurrencyColor(c) : 'var(--text-tertiary)'};" title="${escapeHtml(c)}: ${formatMoney(a, c)}">${formatCompactNumber(a)}</span>`;
            }).join(' ')
            : `<span>${formatCompactNumber(amounts[sd.key])}</span>`;
        return `
            <div class="status-stat-row">
                <span class="status-stat-row__dot" style="background:${sd.color}"></span>
                <span class="status-stat-row__label">${sd.label}</span>
                <span class="status-stat-row__count">${count}</span>
                <span class="status-stat-row__pct">${pct}%</span>
                <span class="status-stat-row__amt">${currBreakdown}</span>
            </div>
        `;
    }).join('');

    els.invoiceStatusDist.innerHTML = `
        <div class="status-donut-layout">
            <div class="status-donut-ring">
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${strokeW}"/>
                    ${arcs}
                </svg>
                <div class="status-donut-center">
                    <div class="status-donut-center__count">${totalCount}</div>
                    <div class="status-donut-center__label">Invoices</div>
                </div>
            </div>
            <div class="status-stat-list">${statRows}</div>
        </div>
    `;
}

/* ============================================================
   4. Collections Aging Buckets
   ============================================================ */
function renderAgingBuckets() {
    if (!els.agingBuckets) return;

    const today = new Date();
    const buckets = [
        { label: '0–30 days', min: 0, max: 30, cls: 'current', count: 0, amount: 0 },
        { label: '31–60 days', min: 31, max: 60, cls: 'warning', count: 0, amount: 0 },
        { label: '61–90 days', min: 61, max: 90, cls: 'danger', count: 0, amount: 0 },
        { label: '90+ days', min: 91, max: 9999, cls: 'critical', count: 0, amount: 0 }
    ];

    // Only outstanding invoices (sent/overdue)
    const outstanding = rawInvoices.filter(inv => {
        const s = String(inv.status || '').toLowerCase();
        return s === 'sent' || s === 'overdue';
    });

    outstanding.forEach(inv => {
        const invoiceDateStr = String(inv.invoice_meta?.dateRaw || inv.created_at || '');
        const invoiceDate = new Date(invoiceDateStr);
        if (isNaN(invoiceDate.getTime())) return;

        const daysSince = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));
        const bucket = buckets.find(b => daysSince >= b.min && daysSince <= b.max);
        if (bucket) {
            bucket.count++;
            bucket.amount += (inv.totals?.total || 0);
        }
    });

    els.agingBuckets.innerHTML = buckets.map(b => `
        <div class="aging-bucket aging-bucket--${b.cls}">
            <div class="aging-bucket__label">${b.label}</div>
            <div class="aging-bucket__count">${b.count}</div>
            <div class="aging-bucket__amount">${formatMoney(b.amount, 'USD')}</div>
        </div>
    `).join('');
}

/* ============================================================
   5. Commission Tracking
   ============================================================ */
function renderCommissionInsight(monthRows) {
    if (!els.commissionInsight) return;

    // Group by consultant, calculate commissions
    const consultants = new Map();
    monthRows.forEach(row => {
        const key = row.consultant_id;
        const current = consultants.get(key) || {
            name: row.consultant_name,
            revenue: 0,
            commissionRate: 0,
            currency: row.currency
        };
        current.revenue += row.projected;
        // We need commission_rate from raw data - check if it's in the row
        if (row.commission_rate) current.commissionRate = row.commission_rate;
        consultants.set(key, current);
    });

    // Also try to get commission from rawRows (might have it from consultant object)
    const withCommission = Array.from(consultants.values()).filter(c => c.commissionRate > 0);

    if (withCommission.length === 0) {
        els.commissionInsight.innerHTML = `
            <div class="insight-card__eyebrow">Commission Tracking</div>
            <div class="insight-card__title">No commission rates set</div>
            <div class="insight-card__body">Set commission_rate on consultants to track earned commissions here.</div>
        `;
        return;
    }

    const totalCommission = withCommission.reduce((sum, c) => sum + (c.revenue * c.commissionRate / 100), 0);
    const topEarner = withCommission.sort((a, b) => (b.revenue * b.commissionRate / 100) - (a.revenue * a.commissionRate / 100))[0];

    els.commissionInsight.innerHTML = `
        <div class="insight-card__eyebrow">Commission Tracking</div>
        <div class="insight-card__title">${formatMoney(totalCommission, topEarner.currency)}</div>
        <div class="insight-card__body">Total commissions earned across ${withCommission.length} consultant(s) this period.</div>
        <div class="insight-card__meta">
            <div class="insight-card__meta-row"><span>Top earner</span><strong>${escapeHtml(topEarner.name)}</strong></div>
            <div class="insight-card__meta-row"><span>Their rate</span><strong>${topEarner.commissionRate}%</strong></div>
            <div class="insight-card__meta-row"><span>Their commission</span><strong>${formatMoney(topEarner.revenue * topEarner.commissionRate / 100, topEarner.currency)}</strong></div>
        </div>
    `;
}

/* ============================================================
   6. Unbilled Hours Alert
   ============================================================ */
function renderUnbilledAlert(monthRows) {
    if (!els.unbilledInsight) return;

    const pending = monthRows.filter(row => row.status === 'pending');
    if (pending.length === 0) {
        els.unbilledInsight.innerHTML = `
            <div class="insight-card__eyebrow">✅ Unbilled Hours</div>
            <div class="insight-card__title">All clear</div>
            <div class="insight-card__body">All hours have been invoiced for the selected period.</div>
        `;
        els.unbilledInsight.style.borderLeftColor = '#22c55e';
        return;
    }

    // Group by consultant
    const byConsultant = new Map();
    pending.forEach(row => {
        const key = row.consultant_id;
        const current = byConsultant.get(key) || { name: row.consultant_name, hours: 0, projected: 0, currency: row.currency };
        current.hours += row.hours;
        current.projected += row.projected;
        byConsultant.set(key, current);
    });

    const sorted = Array.from(byConsultant.values()).sort((a, b) => b.hours - a.hours);
    const totalUnbilled = sorted.reduce((s, c) => s + c.hours, 0);
    const top3 = sorted.slice(0, 3);

    els.unbilledInsight.style.borderLeftColor = totalUnbilled > 100 ? '#ef4444' : '#f59e0b';
    els.unbilledInsight.innerHTML = `
        <div class="insight-card__eyebrow">⚠ Unbilled Hours Alert</div>
        <div class="insight-card__title">${totalUnbilled.toFixed(1)} hours unbilled</div>
        <div class="insight-card__body">${sorted.length} consultant(s) with pending hours that need invoicing.</div>
        <div class="insight-card__meta">
            ${top3.map(c => `
                <div class="insight-card__meta-row">
                    <span>${escapeHtml(c.name)}</span>
                    <strong>${c.hours.toFixed(1)} hrs • ${formatMoney(c.projected, c.currency)}</strong>
                </div>
            `).join('')}
        </div>
    `;
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

function captureSavedViewState() {
    return {
        year: selectedYear,
        month: selectedMonth,
        currency: selectedCurrency,
        client: selectedClient,
        w2: selectedW2,
        status: selectedStatus,
        search: searchTerm,
        pivotMetric
    };
}

function renderSavedViews() {
    const views = listSavedViews('analytics');
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
    pivotMetric = state.pivotMetric === 'revenue' ? 'revenue' : 'hours';

    if (els.yearFilter) els.yearFilter.value = String(selectedYear);
    if (els.monthFilter) els.monthFilter.value = selectedMonth;
    if (els.statusFilter) els.statusFilter.value = selectedStatus;
    if (els.searchInput) els.searchInput.value = searchTerm;

    updatePivotMetricButtons();
    persistShared();
    setPagePrefs('analytics', { savedViewId: currentSavedViewId, pivotMetric });
    updateAllMonthsToggleLabel();
    updatePeriodLabel();
    await refreshData();
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
    const value = Number(amount) || 0;
    const code = String(currency || 'USD').toUpperCase();
    try {
        let formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: code
        }).format(value);
        if (code === 'USD' && formatted.startsWith('$')) {
            formatted = `US${formatted}`;
        }
        return formatted;
    } catch (err) {
        return `${code} ${value.toFixed(2)}`;
    }
}

function formatCompactMoney(amount, currency) {
    const value = Number(amount) || 0;
    const code = String(currency || 'USD').toUpperCase();
    try {
        let formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: code,
            notation: 'compact',
            maximumFractionDigits: value >= 100000 ? 1 : 2
        }).format(value);
        if (code === 'USD' && formatted.startsWith('$')) {
            formatted = `US${formatted}`;
        }
        return formatted;
    } catch (err) {
        return formatMoney(value, code);
    }
}

function formatCompactNumber(amount) {
    const value = Number(amount) || 0;
    try {
        return new Intl.NumberFormat('en-US', {
            notation: 'compact',
            maximumFractionDigits: value >= 100000 ? 1 : 2
        }).format(value);
    } catch (err) {
        return value.toFixed(2);
    }
}

function getDensityOpacity(value, maxValue, min = 0.12, spread = 0.76) {
    const amount = Number(value) || 0;
    if (amount <= 0) return 0;
    const normalized = Math.max(0, Math.min(1, amount / Math.max(maxValue, 1)));
    return Math.max(min, Math.min(1, min + (normalized * spread)));
}

function getCurrencyColor(currency) {
    const key = String(currency || 'USD').toUpperCase();
    if (CURRENCY_COLORS[key]) return CURRENCY_COLORS[key];
    const palette = ['#2563eb', '#14b8a6', '#8b5cf6', '#ea580c', '#dc2626', '#64748b'];
    const hash = key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palette[hash % palette.length];
}

function buildStatusDistributionTitle(status, row) {
    const invoiceLabel = `${row.count} invoice${row.count === 1 ? '' : 's'}`;
    const currencySummary = Object.entries(row.byCurrency)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([currency, amount]) => `${currency}: ${formatMoney(amount, currency)}`)
        .join(' • ');
    const metricLabel = row.totalAmount > 0
        ? currencySummary
        : 'No billed amount yet';
    return `${status.charAt(0).toUpperCase() + status.slice(1)} • ${invoiceLabel} • ${metricLabel}`;
}

function renderStatusBadge(status) {
    if (status === 'invoiced') return '<span class="status-badge status-invoiced">Invoiced</span>';
    if (status === 'pending') return '<span class="status-badge status-pending">Pending</span>';
    return '<span class="status-badge status-mixed">Mixed</span>';
}

function renderInvoiceLink(invoices) {
    if (!invoices || invoices.size === 0) {
        return '<span class="invoice-pill invoice-pill--unbilled">Unbilled</span>';
    }
    if (invoices.size === 1) {
        return `<span class="invoice-pill invoice-pill--linked">${escapeHtml(Array.from(invoices)[0])}</span>`;
    }
    return '<span class="invoice-pill invoice-pill--multiple">Multiple invoices</span>';
}

function totalCurrencyAmount(map = {}) {
    return Object.values(map).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
}

function findLabel(values, normalizedValue) {
    const hit = values.find((value) => normalizeTextFilter(value) === normalizedValue);
    return hit || normalizedValue;
}

function capitalize(value) {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
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
