import { getCurrentUser } from './auth.js';
import { getInvoices, updateInvoiceStatus } from './database.js';
import { supabase } from './config.js';
import { generatePDF } from './modules/pdf.js';
import { dbGetConsultants } from './modules/db-consultants.js';
import { debounce, showToast } from './modules/utils.js';
import './security.js';

// ── Linked timesheets helper ──────────────────────────────────────────────────
async function fetchLinkedTimesheets(invoiceId, invoiceNumber) {
    if (!invoiceId && !invoiceNumber) return [];

    const ids = new Set();
    const conditions = [];
    if (invoiceId) conditions.push(`invoice_id.eq.${invoiceId}`);
    if (invoiceNumber) conditions.push(`invoice_number.eq.${invoiceNumber}`);

    const { data, error } = await supabase
        .from('timesheets')
        .select(`
            id,
            period_start,
            period_end,
            hours_worked,
            status,
            invoice_number,
            consultants ( id, name, client, bill_rate, currency )
        `)
        .or(conditions.join(','));

    if (error) {
        console.warn('Could not fetch linked timesheets:', error);
        return [];
    }
    // Deduplicate by id
    const seen = new Set();
    return (data || []).filter(row => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
    });
}

const STORAGE_KEY = 'invoice_pro_invoice_filters_v2';
const ITEMS_PER_PAGE = 20;
const DEFAULT_FILTERS = {
    search: '',
    consultant: 'all',
    status: 'all',
    currency: 'all',
    due: 'all',
    amount: 'all',
    sort: 'date-desc'
};

const state = {
    user: null,
    allInvoices: [],
    filteredInvoices: [],
    consultantsById: new Map(),
    filters: loadFilters(),
    currentPage: 1,
    invoiceToDelete: null,
    invoiceToPay: null,
    channel: null
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
        console.error('[invoices] Fatal init error:', err);
        document.body.innerHTML += `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff8f8;z-index:9999;flex-direction:column;gap:0.75rem;font-family:system-ui;"><span style="font-size:2.5rem">⚠️</span><h2 style="margin:0;color:#dc2626">Failed to load Invoices</h2><p style="margin:0;color:#6b7280;font-size:0.875rem">${err.message}</p><button onclick="location.reload()" style="padding:0.5rem 1.25rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer">Reload</button></div>`;
    });
});

async function init() {
    state.user = await getCurrentUser();
    if (!state.user) {
        return;
    }

    cacheElements();
    hydrateFilterControls();
    bindEvents();
    await loadInvoices();
    setupBroadcastSync();
}

function cacheElements() {
    els.searchInput = document.getElementById('searchInput');
    els.consultantFilter = document.getElementById('consultantFilter');
    els.statusFilter = document.getElementById('statusFilter');
    els.currencyFilter = document.getElementById('currencyFilter');
    els.dueFilter = document.getElementById('dueFilter');
    els.amountFilter = document.getElementById('amountFilter');
    els.sortSelect = document.getElementById('sortSelect');
    els.clearFiltersBtn = document.getElementById('clearFiltersBtn');
    els.filtersMeta = document.getElementById('filtersMeta');

    els.refreshBtn = document.getElementById('refreshBtn');
    els.exportCsvBtn = document.getElementById('exportCsvBtn');

    els.tableBody = document.getElementById('invoicesBody');
    els.pagination = document.getElementById('pagination');

    els.deleteModal = document.getElementById('deleteModal');
    els.deleteInvoiceMeta = document.getElementById('deleteInvoiceMeta');
    els.confirmDeleteBtn = document.getElementById('confirmDelete');
    els.cancelDeleteBtn = document.getElementById('cancelDelete');

    els.paidModal = document.getElementById('paidDateModal');
    els.paidDateInput = document.getElementById('paidDateInput');
    els.confirmPaidBtn = document.getElementById('confirmPaidDate');
    els.cancelPaidBtn = document.getElementById('cancelPaidDate');
}

function closeAllRowMenus() {
    document.querySelectorAll('.invoice-row-menu.show').forEach((menu) => {
        menu.classList.remove('show');
    });

    document.querySelectorAll('[data-action="toggle-menu"][aria-expanded="true"]').forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
    });
}

function toggleRowMenu(invoiceId, button) {
    const menu = document.getElementById(`invoice-menu-${invoiceId}`);
    if (!menu) return;

    const shouldOpen = !menu.classList.contains('show');
    closeAllRowMenus();

    if (!shouldOpen) return;

    menu.classList.add('show');
    button.setAttribute('aria-expanded', 'true');
}

function hydrateFilterControls() {
    if (els.searchInput) els.searchInput.value = state.filters.search;
    if (els.statusFilter) els.statusFilter.value = state.filters.status;
    if (els.currencyFilter) els.currencyFilter.value = state.filters.currency;
    if (els.dueFilter) els.dueFilter.value = state.filters.due;
    if (els.amountFilter) els.amountFilter.value = state.filters.amount;
    if (els.sortSelect) els.sortSelect.value = state.filters.sort;
}

function bindEvents() {
    els.searchInput?.addEventListener('input', debounce((event) => {
        state.filters.search = String(event.target.value || '').trim();
        state.currentPage = 1;
        persistFilters();
        applyFiltersAndRender();
    }, 180));

    els.consultantFilter?.addEventListener('change', (event) => {
        state.filters.consultant = event.target.value;
        state.currentPage = 1;
        persistFilters();
        applyFiltersAndRender();
    });

    els.statusFilter?.addEventListener('change', (event) => {
        state.filters.status = event.target.value;
        state.currentPage = 1;
        persistFilters();
        applyFiltersAndRender();
    });

    els.currencyFilter?.addEventListener('change', (event) => {
        state.filters.currency = event.target.value;
        state.currentPage = 1;
        persistFilters();
        applyFiltersAndRender();
    });

    els.sortSelect?.addEventListener('change', (event) => {
        state.filters.sort = event.target.value;
        state.currentPage = 1;
        persistFilters();
        applyFiltersAndRender();
    });

    els.dueFilter?.addEventListener('change', (event) => {
        state.filters.due = event.target.value;
        state.currentPage = 1;
        persistFilters();
        applyFiltersAndRender();
    });

    els.amountFilter?.addEventListener('change', (event) => {
        state.filters.amount = event.target.value;
        state.currentPage = 1;
        persistFilters();
        applyFiltersAndRender();
    });

    els.clearFiltersBtn?.addEventListener('click', () => {
        state.filters = { ...DEFAULT_FILTERS };
        state.currentPage = 1;
        hydrateFilterControls();
        populateConsultantFilterOptions();
        populateCurrencyFilterOptions();
        persistFilters();
        applyFiltersAndRender();
    });

    els.refreshBtn?.addEventListener('click', async () => {
        els.refreshBtn.disabled = true;
        try {
            await loadInvoices();
            showToast('Invoices refreshed', 'success');
        } finally {
            els.refreshBtn.disabled = false;
        }
    });

    els.exportCsvBtn?.addEventListener('click', () => {
        exportFilteredInvoicesToCSV();
    });

    els.tableBody?.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        // Catch non-button row clicks for inline expansion
        const isButton = target.closest('[data-action]') || target.closest('.dropdown-menu');
        if (!isButton) {
            const row = target.closest('tr[data-invoice-id]');
            if (row) {
                const invoiceId = row.dataset.invoiceId;
                const panel = document.getElementById(`items-panel-${invoiceId}`);
                if (panel) {
                    const isExpanded = panel.style.display !== 'none';
                    panel.style.display = isExpanded ? 'none' : 'table-row';
                    row.classList.toggle('invoice-row--expanded', !isExpanded);
                }
                closeAllRowMenus();
                return;
            }
        }

        const button = target.closest('[data-action]');
        if (!(button instanceof HTMLButtonElement)) return;

        const action = button.dataset.action;
        const invoiceId = button.dataset.id;
        if (!action || !invoiceId) return;

        if (action === 'toggle-menu') {
            event.stopPropagation();
            toggleRowMenu(invoiceId, button);
            return;
        }

        const invoice = state.allInvoices.find((entry) => entry.id === invoiceId);
        if (!invoice) {
            showToast('Invoice no longer exists in memory. Refresh and try again.', 'error');
            return;
        }

        closeAllRowMenus();

        if (action === 'edit') {
            window.location.href = `app.html?invoice_number=${encodeURIComponent(invoice.invoice_number)}`;
            return;
        }

        if (action === 'download') {
            generatePDF(invoice);
            showToast('PDF download started', 'success');
            return;
        }

        if (action === 'email') {
            handleEmailInvoice(invoice);
            return;
        }

        if (action === 'delete') {
            openDeleteModal(invoice);
            return;
        }

        if (action === 'mark-sent') {
            await updateStatus(invoice, 'sent');
            return;
        }

        if (action === 'mark-paid' || action === 'edit-paid-date') {
            openPaidModal(invoice);
            return;
        }

        if (action === 'reopen') {
            await updateStatus(invoice, 'sent');
        }

        if (action === 'expand-ts') {
            const panelRow = document.getElementById(`ts-panel-${invoiceId}`);
            const contentEl = document.getElementById(`ts-panel-content-${invoiceId}`);
            if (!panelRow) return;

            const isOpen = panelRow.style.display !== 'none';
            if (isOpen) {
                panelRow.style.display = 'none';
                return;
            }

            panelRow.style.display = '';

            // Only fetch once (already populated check)
            if (contentEl && contentEl.dataset.loaded === '1') return;

            try {
                const invNumber = button.dataset.invNumber || '';
                const rows = await fetchLinkedTimesheets(invoiceId, invNumber);
                if (!contentEl) return;

                if (rows.length === 0) {
                    contentEl.innerHTML = '<span style="color:#9ca3af;">No linked timesheets for this invoice.</span>';
                } else {
                    const cols = rows.map(row => {
                        const c = Array.isArray(row.consultants) ? row.consultants[0] : (row.consultants || {});
                        const currency = (c.currency || 'USD').toUpperCase();
                        const rate = Number(c.bill_rate || 0).toFixed(2);
                        const hours = Number(row.hours_worked || 0).toFixed(2);
                        const amount = (Number(hours) * Number(c.bill_rate || 0)).toFixed(2);
                        return `
                            <div style="display:grid;grid-template-columns:1.5fr 1.5fr 1fr 0.75fr 0.75fr 0.75fr;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid #f1f5f9;align-items:center;font-size:0.8125rem;">
                                <span style="font-weight:600;color:#111827;">${escapeHtml(c.name || '—')}</span>
                                <span style="color:#374151;">${escapeHtml(c.client || '—')}</span>
                                <span style="color:#6b7280;">${row.period_start || '—'} → ${row.period_end || '—'}</span>
                                <span style="text-align:right;">${hours} hrs</span>
                                <span style="text-align:right;">${currency} ${rate}/hr</span>
                                <span style="text-align:right;font-weight:600;color:#111827;">${currency} ${amount}</span>
                            </div>`;
                    }).join('');

                    contentEl.innerHTML = `
                        <div style="margin-bottom:0.5rem;font-weight:600;color:#374151;font-size:0.75rem;letter-spacing:0.05em;text-transform:uppercase;">Linked Timesheets</div>
                        <div style="display:grid;grid-template-columns:1.5fr 1.5fr 1fr 0.75fr 0.75fr 0.75fr;gap:0.5rem;padding:0.35rem 0;font-size:0.7rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;">
                            <span>Consultant</span><span>Client</span><span>Period</span><span style="text-align:right;">Hours</span><span style="text-align:right;">Rate</span><span style="text-align:right;">Amount</span>
                        </div>
                        ${cols}
                    `;
                }
                contentEl.dataset.loaded = '1';
            } catch (err) {
                if (contentEl) contentEl.innerHTML = '<span style="color:#ef4444;">Failed to load timesheets.</span>';
            }
            return;
        }
    });

    els.pagination?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const button = target.closest('[data-page]');
        if (!(button instanceof HTMLButtonElement)) return;

        const page = Number(button.dataset.page);
        if (!Number.isFinite(page) || page < 1) return;

        state.currentPage = page;
        renderTable();
        renderPagination();
        persistFilters();
        renderFiltersMeta();
    });

    els.confirmDeleteBtn?.addEventListener('click', async () => {
        if (!state.invoiceToDelete) return;

        const invoice = state.invoiceToDelete;
        els.confirmDeleteBtn.disabled = true;

        try {
            await unlinkTimesheetsForInvoice(invoice);

            const { error } = await supabase
                .from('invoices')
                .delete()
                .eq('id', invoice.id)
                .eq('user_id', state.user.id);

            if (error) throw error;

            closeDeleteModal();
            showToast(`Invoice ${invoice.invoice_number} deleted`, 'success');
            await loadInvoices();
        } catch (err) {
            console.error(err);
            showToast('Failed to delete invoice', 'error');
        } finally {
            els.confirmDeleteBtn.disabled = false;
        }
    });

    els.cancelDeleteBtn?.addEventListener('click', closeDeleteModal);

    els.confirmPaidBtn?.addEventListener('click', async () => {
        if (!state.invoiceToPay) return;

        const paidDate = String(els.paidDateInput?.value || '').trim();
        if (!paidDate) {
            showToast('Please select a payment date', 'error');
            return;
        }

        els.confirmPaidBtn.disabled = true;
        try {
            await updateInvoiceStatus(state.invoiceToPay.id, 'paid', paidDate);
            await markTimesheetsInvoiced(state.invoiceToPay);
            const invoiceNumber = state.invoiceToPay.invoice_number;
            closePaidModal();
            showToast(`Invoice ${invoiceNumber} marked as paid`, 'success');
            await loadInvoices();
        } catch (err) {
            console.error(err);
            showToast('Failed to update invoice status', 'error');
        } finally {
            els.confirmPaidBtn.disabled = false;
        }
    });

    els.cancelPaidBtn?.addEventListener('click', closePaidModal);

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.closest('.invoice-row-actions')) {
            closeAllRowMenus();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        closeAllRowMenus();
        closeDeleteModal();
        closePaidModal();
    });
}

async function loadInvoices() {
    setLoadingTable();

    try {
        const [invoices, consultants] = await Promise.all([
            getInvoices(state.user),
            dbGetConsultants().catch(() => [])
        ]);

        state.allInvoices = Array.isArray(invoices) ? invoices : [];
        state.consultantsById = new Map((consultants || []).map((consultant) => [String(consultant.id), consultant]));

        populateConsultantFilterOptions();
        populateCurrencyFilterOptions();
        applyFiltersAndRender();
    } catch (err) {
        console.error(err);
        state.allInvoices = [];
        state.filteredInvoices = [];
        setEmptyTable('Failed to load invoices. Please refresh.');
        renderPagination();
        renderFiltersMeta();
        showToast('Error loading invoices', 'error');
    }
}

function populateConsultantFilterOptions() {
    if (!els.consultantFilter) return;

    const options = extractConsultantOptions();
    const html = ['<option value="all">All Consultants</option>'];

    options.forEach((option) => {
        html.push(`<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`);
    });

    els.consultantFilter.innerHTML = html.join('');

    const optionValues = new Set(options.map((option) => option.value));
    if (state.filters.consultant !== 'all' && !optionValues.has(state.filters.consultant)) {
        state.filters.consultant = 'all';
        persistFilters();
    }

    els.consultantFilter.value = state.filters.consultant;
}

function populateCurrencyFilterOptions() {
    if (!els.currencyFilter) return;

    const currencies = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR']);
    state.allInvoices.forEach((invoice) => currencies.add(getInvoiceCurrency(invoice)));

    const sorted = Array.from(currencies).sort((a, b) => a.localeCompare(b));
    const html = ['<option value="all">All Currencies</option>'];

    sorted.forEach((currency) => {
        html.push(`<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`);
    });

    els.currencyFilter.innerHTML = html.join('');

    if (state.filters.currency !== 'all' && !currencies.has(state.filters.currency)) {
        state.filters.currency = 'all';
        persistFilters();
    }

    els.currencyFilter.value = state.filters.currency;
}

function applyFiltersAndRender() {
    const query = state.filters.search.toLowerCase();

    state.filteredInvoices = state.allInvoices.filter((invoice) => {
        if (query) {
            const clientName = String(invoice.client_info?.name || '').toLowerCase();
            const invoiceNumber = String(invoice.invoice_number || '').toLowerCase();
            if (!clientName.includes(query) && !invoiceNumber.includes(query)) {
                return false;
            }
        }

        const status = getEffectiveStatus(invoice);
        if (state.filters.status !== 'all' && status !== state.filters.status) {
            return false;
        }

        const currency = getInvoiceCurrency(invoice);
        if (state.filters.currency !== 'all' && currency !== state.filters.currency) {
            return false;
        }

        if (!invoiceMatchesDue(invoice, state.filters.due)) {
            return false;
        }

        if (!invoiceMatchesAmount(invoice, state.filters.amount)) {
            return false;
        }

        if (!invoiceMatchesConsultant(invoice, state.filters.consultant)) {
            return false;
        }

        return true;
    });

    sortInvoices(state.filteredInvoices, state.filters.sort);

    const totalPages = Math.max(1, Math.ceil(state.filteredInvoices.length / ITEMS_PER_PAGE));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    renderTable();
    renderPagination();
    renderFiltersMeta();
}

function sortInvoices(list, sortBy) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    list.sort((a, b) => {
        if (sortBy === 'date-desc') {
            return getInvoiceDateTimestamp(b) - getInvoiceDateTimestamp(a);
        }

        if (sortBy === 'date-asc') {
            return getInvoiceDateTimestamp(a) - getInvoiceDateTimestamp(b);
        }

        if (sortBy === 'amount-desc') {
            return getInvoiceAmount(b) - getInvoiceAmount(a);
        }

        if (sortBy === 'amount-asc') {
            return getInvoiceAmount(a) - getInvoiceAmount(b);
        }

        if (sortBy === 'client-asc') {
            return collator.compare(String(a.client_info?.name || ''), String(b.client_info?.name || ''));
        }

        if (sortBy === 'invoice-asc') {
            return collator.compare(String(a.invoice_number || ''), String(b.invoice_number || ''));
        }

        return 0;
    });
}

function renderItemsBreakdown(invoice, currency) {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    if (items.length === 0) {
        return `<div style="text-align:center; padding: 1.5rem; color: #94a3b8; font-size: 0.875rem;">No line items found.</div>`;
    }

    const rows = items.map(item => {
        const rateDisplay = formatAmountValue(item.rate);
        const amountDisplay = formatAmountValue(item.amount);
        let metaHtml = '';
        if (item.consultant) metaHtml += `<span><strong>Consultant:</strong> ${escapeHtml(item.consultant)}</span>`;
        if (item.period) metaHtml += `<span><strong>Period:</strong> ${escapeHtml(item.period)}</span>`;

        return `
            <tr>
                <td>
                    <div class="items-breakdown-item-name">${escapeHtml(item.desc || 'Item')}</div>
                    ${metaHtml ? `<div class="items-breakdown-item-meta">${metaHtml}</div>` : ''}
                </td>
                <td class="text-right">${item.qty || 1}</td>
                <td class="text-right">${currency || '$'} ${rateDisplay}</td>
                <td class="text-right"><strong>${currency || '$'} ${amountDisplay}</strong></td>
            </tr>
        `;
    }).join('');

    return `
        <div class="items-panel-container">
            <table class="items-breakdown-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th class="text-right">Qty</th>
                        <th class="text-right">Rate</th>
                        <th class="text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function renderTable() {
    if (!els.tableBody) return;

    if (state.filteredInvoices.length === 0) {
        setEmptyTable('No invoices found for selected filters.');
        return;
    }

    const startIndex = (state.currentPage - 1) * ITEMS_PER_PAGE;
    const pageInvoices = state.filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    els.tableBody.innerHTML = pageInvoices.map((invoice) => {
        const invoiceDate = formatDate(getInvoiceDateRaw(invoice) || invoice.created_at);
        const status = getEffectiveStatus(invoice);
        const currency = getInvoiceCurrency(invoice);
        const amount = formatAmountValue(getInvoiceAmount(invoice));
        const clientName = escapeHtml(invoice.client_info?.name || 'N/A');
        const fromName = escapeHtml(getInvoiceFromName(invoice));
        const clientMeta = escapeHtml(getInvoiceClientMeta(invoice));

        return `
            <tr class="invoice-row--clickable" data-invoice-id="${invoice.id}">
                <td class="invoice-cell--number">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <svg class="invoice-row-chevron" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="14" height="14" style="color: #cbd5e1; transition: transform 0.2s ease; flex-shrink:0;">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                        <strong>${escapeHtml(invoice.invoice_number || '—')}</strong>
                    </div>
                </td>
                <td class="invoice-cell--client" title="${clientName}">
                    <div class="invoice-client">
                        <span class="invoice-client__name">${clientName}</span>
                        <span class="invoice-client__meta" title="${clientMeta}">${clientMeta}</span>
                    </div>
                </td>
                <td class="invoice-cell--from" title="${fromName}">${fromName}</td>
                <td class="invoice-cell--date">${invoiceDate}</td>
                <td class="invoice-cell--payment">${renderPaymentSummary(invoice, status)}</td>
                <td class="invoice-cell--status">${renderStatusChip(status)}</td>
                <td class="invoice-cell--currency">${currency}</td>
                <td class="invoice-cell--amount"><strong>${amount}</strong></td>
                <td class="invoice-cell--actions">
                    <div class="actions-row invoice-row-actions">
                        ${renderPrimaryAction(invoice, status)}
                        <button
                            class="action-btn action-btn--menu"
                            data-action="toggle-menu"
                            data-id="${invoice.id}"
                            aria-haspopup="true"
                            aria-expanded="false"
                            title="More actions"
                        >
                            More
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>
                        <div id="invoice-menu-${invoice.id}" class="dropdown-menu invoice-row-menu">
                            <div class="dropdown-label">Invoice Actions</div>
                            <button class="dropdown-item" data-action="edit" data-id="${invoice.id}">Edit invoice</button>
                            <button class="dropdown-item" data-action="download" data-id="${invoice.id}">Download PDF</button>
                            <button class="dropdown-item" data-action="email" data-id="${invoice.id}">Send by email</button>
                            <button class="dropdown-item" data-action="expand-ts" data-id="${invoice.id}" data-inv-number="${escapeHtml(invoice.invoice_number || '')}">Linked timesheets</button>
                            ${renderSecondaryStatusMenuAction(invoice, status)}
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item dropdown-item--danger" data-action="delete" data-id="${invoice.id}">Delete invoice</button>
                        </div>
                    </div>
                </td>
            </tr>
            <tr id="items-panel-${invoice.id}" style="display:none;" class="items-breakdown-row">
                <td colspan="9" style="padding:0;">
                    ${renderItemsBreakdown(invoice, currency)}
                </td>
            </tr>
            <tr id="ts-panel-${invoice.id}" style="display:none;">
                <td colspan="9" style="padding:0;">
                    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:0.875rem 1.25rem;">
                        <div id="ts-panel-content-${invoice.id}" style="font-size:0.8125rem;color:#6b7280;">Loading...</div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPrimaryAction(invoice, effectiveStatus) {
    if (effectiveStatus === 'draft') {
        return `<button class="action-btn action-btn--primary invoice-primary-action" data-action="mark-sent" data-id="${invoice.id}">Mark Sent</button>`;
    }

    if (effectiveStatus === 'sent' || effectiveStatus === 'overdue') {
        return `<button class="action-btn action-btn--primary invoice-primary-action" data-action="mark-paid" data-id="${invoice.id}">Mark Paid</button>`;
    }

    return `<button class="action-btn invoice-primary-action" data-action="download" data-id="${invoice.id}">PDF</button>`;
}

function renderSecondaryStatusMenuAction(invoice, effectiveStatus) {
    if (effectiveStatus !== 'paid') {
        return '';
    }

    return `
        <div class="dropdown-divider"></div>
        <div class="dropdown-label">Payment</div>
        <button class="dropdown-item" data-action="edit-paid-date" data-id="${invoice.id}">Edit payment date</button>
        <div class="dropdown-divider"></div>
        <div class="dropdown-label">Status</div>
        <button class="dropdown-item" data-action="reopen" data-id="${invoice.id}">Set status to sent</button>
    `;
}

function renderPagination() {
    if (!els.pagination) return;

    const totalPages = Math.ceil(state.filteredInvoices.length / ITEMS_PER_PAGE);
    if (totalPages <= 1) {
        els.pagination.innerHTML = '';
        return;
    }

    const parts = [];

    if (state.currentPage > 1) {
        parts.push(`<button class="btn btn--sm" data-page="${state.currentPage - 1}">← Previous</button>`);
    }

    for (let page = 1; page <= totalPages; page += 1) {
        if (page === state.currentPage) {
            parts.push(`<button class="btn btn--primary btn--sm" disabled>${page}</button>`);
            continue;
        }

        if (page === 1 || page === totalPages || Math.abs(page - state.currentPage) <= 1) {
            parts.push(`<button class="btn btn--sm" data-page="${page}">${page}</button>`);
            continue;
        }

        if (Math.abs(page - state.currentPage) === 2) {
            parts.push('<span style="padding: 0.5rem;">...</span>');
        }
    }

    if (state.currentPage < totalPages) {
        parts.push(`<button class="btn btn--sm" data-page="${state.currentPage + 1}">Next →</button>`);
    }

    els.pagination.innerHTML = parts.join('');
}

function renderFiltersMeta() {
    if (!els.filtersMeta) return;

    const appliedFilters = [
        state.filters.search,
        state.filters.consultant !== 'all' ? state.filters.consultant : '',
        state.filters.status !== 'all' ? state.filters.status : '',
        state.filters.currency !== 'all' ? state.filters.currency : '',
        state.filters.due !== 'all' ? state.filters.due : '',
        state.filters.amount !== 'all' ? state.filters.amount : ''
    ].filter(Boolean).length;

    const totalPages = Math.max(1, Math.ceil(state.filteredInvoices.length / ITEMS_PER_PAGE));

    els.filtersMeta.textContent = `${appliedFilters} filter${appliedFilters === 1 ? '' : 's'} applied • ${state.filteredInvoices.length}/${state.allInvoices.length} invoices • Page ${state.currentPage}/${totalPages}`;
}

function setLoadingTable() {
    if (!els.tableBody) return;

    els.tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="table__empty">
                <div class="empty-state">
                    <span class="empty-state__icon">⏳</span>
                    <p class="empty-state__text">Loading invoices...</p>
                </div>
            </td>
        </tr>
    `;
}

function setEmptyTable(message) {
    if (!els.tableBody) return;

    els.tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="table__empty">
                <div class="empty-state">
                    <span class="empty-state__icon">📭</span>
                    <p class="empty-state__text">${escapeHtml(message)}</p>
                    <a href="app.html" class="btn btn--primary btn--sm">Create invoice</a>
                </div>
            </td>
        </tr>
    `;
}

function openDeleteModal(invoice) {
    state.invoiceToDelete = invoice;
    if (els.deleteInvoiceMeta) {
        els.deleteInvoiceMeta.textContent = `Invoice ${invoice.invoice_number || '—'} • Client ${invoice.client_info?.name || 'N/A'}`;
    }
    if (els.deleteModal) {
        els.deleteModal.style.display = 'flex';
    }
}

function closeDeleteModal() {
    state.invoiceToDelete = null;
    if (els.deleteModal) {
        els.deleteModal.style.display = 'none';
    }
}

function openPaidModal(invoice) {
    state.invoiceToPay = invoice;
    if (els.paidDateInput) {
        if (invoice.paid_date) {
            els.paidDateInput.value = invoice.paid_date;
        } else {
            els.paidDateInput.value = new Date().toISOString().slice(0, 10);
        }
    }
    if (els.paidModal) {
        els.paidModal.style.display = 'flex';
    }
}

function closePaidModal() {
    state.invoiceToPay = null;
    if (els.paidModal) {
        els.paidModal.style.display = 'none';
    }
}

async function updateStatus(invoice, nextStatus) {
    try {
        await updateInvoiceStatus(invoice.id, nextStatus);

        if (nextStatus === 'sent' || nextStatus === 'paid') {
            await markTimesheetsInvoiced(invoice);
        }

        showToast(`Invoice ${invoice.invoice_number} updated to ${nextStatus}`, 'success');
        await loadInvoices();
    } catch (err) {
        console.error(err);
        showToast('Failed to update invoice status', 'error');
    }
}

function handleEmailInvoice(invoice) {
    const email = String(invoice.client_info?.email || '').trim();
    if (!email) {
        showToast('Client email is missing', 'error');
        return;
    }

    const subject = `Invoice ${invoice.invoice_number} from ${invoice.business_info?.name || 'Your Company'}`;
    const total = formatMoney(getInvoiceAmount(invoice), getInvoiceCurrency(invoice));
    const body = `Hi ${invoice.client_info?.name || ''},\n\nPlease find attached invoice ${invoice.invoice_number} for ${total}.\n\nThank you,\n${invoice.business_info?.name || ''}`;

    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showToast('Opening email client...', 'success');
}

async function unlinkTimesheetsForInvoice(invoice) {
    const patch = {
        invoice_id: null,
        invoice_number: null,
        status: 'pending'
    };

    const tableExistsGuard = (error) => {
        if (!error) return;
        if (error.code === '42P01') return;
        throw error;
    };

    const { error: byIdError } = await supabase
        .from('timesheets')
        .update(patch)
        .eq('user_id', state.user.id)
        .eq('invoice_id', invoice.id);

    tableExistsGuard(byIdError);

    const { error: byNumberError } = await supabase
        .from('timesheets')
        .update(patch)
        .eq('user_id', state.user.id)
        .eq('invoice_number', invoice.invoice_number);

    tableExistsGuard(byNumberError);
}

async function markTimesheetsInvoiced(invoice) {
    const patch = {
        status: 'invoiced',
        invoice_number: invoice.invoice_number
    };

    const tableExistsGuard = (error) => {
        if (!error) return;
        if (error.code === '42P01') return;
        throw error;
    };

    const { error: byIdError } = await supabase
        .from('timesheets')
        .update(patch)
        .eq('user_id', state.user.id)
        .eq('invoice_id', invoice.id);

    tableExistsGuard(byIdError);

    const { error: byNumberError } = await supabase
        .from('timesheets')
        .update(patch)
        .eq('user_id', state.user.id)
        .eq('invoice_number', invoice.invoice_number);

    tableExistsGuard(byNumberError);
}

function extractConsultantOptions() {
    const map = new Map();

    state.allInvoices.forEach((invoice) => {
        const items = Array.isArray(invoice.items) ? invoice.items : [];
        items.forEach((item) => {
            const consultantId = String(item.consultant_id || '').trim();
            const consultantName = String(item.consultant || '').trim();

            if (consultantId) {
                const key = `id:${consultantId}`;
                const canonicalName = consultantName || state.consultantsById.get(consultantId)?.name || `Consultant ${consultantId.slice(0, 8)}`;
                if (!map.has(key)) {
                    map.set(key, { value: key, label: canonicalName });
                }
                return;
            }

            if (!consultantName) return;
            const key = `name:${consultantName.toLowerCase()}`;
            if (!map.has(key)) {
                map.set(key, { value: key, label: consultantName });
            }
        });
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

function invoiceMatchesConsultant(invoice, consultantFilter) {
    if (!consultantFilter || consultantFilter === 'all') return true;

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    if (consultantFilter.startsWith('id:')) {
        const id = consultantFilter.slice(3);
        return items.some((item) => String(item.consultant_id || '').trim() === id);
    }

    if (consultantFilter.startsWith('name:')) {
        const targetName = consultantFilter.slice(5);
        return items.some((item) => String(item.consultant || '').trim().toLowerCase() === targetName);
    }

    return true;
}

function invoiceMatchesDue(invoice, dueFilter) {
    if (!dueFilter || dueFilter === 'all') return true;
    const status = getEffectiveStatus(invoice);

    const dueTimestamp = Date.parse(getDueDateRaw(invoice));
    if (Number.isNaN(dueTimestamp)) {
        return dueFilter === 'no-due';
    }

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const ms30 = 30 * 24 * 60 * 60 * 1000;

    if (dueFilter === 'overdue') {
        return status !== 'paid' && dueTimestamp < todayStart;
    }

    if (dueFilter === 'next-7') {
        return status !== 'paid' && dueTimestamp >= todayStart && dueTimestamp <= todayStart + ms7;
    }

    if (dueFilter === 'next-30') {
        return status !== 'paid' && dueTimestamp >= todayStart && dueTimestamp <= todayStart + ms30;
    }

    if (dueFilter === 'no-due') {
        return false;
    }

    return true;
}

function invoiceMatchesAmount(invoice, amountFilter) {
    if (!amountFilter || amountFilter === 'all') return true;

    const amount = getInvoiceAmount(invoice);
    if (amountFilter === 'under-1000') return amount < 1000;
    if (amountFilter === '1000-5000') return amount >= 1000 && amount <= 5000;
    if (amountFilter === '5000-10000') return amount > 5000 && amount <= 10000;
    if (amountFilter === 'over-10000') return amount > 10000;

    return true;
}

function getInvoiceAmount(invoice) {
    return Number(invoice.totals?.total) || 0;
}

function getInvoiceCurrency(invoice) {
    return String(invoice.invoice_meta?.currency || 'USD').toUpperCase();
}

function getInvoiceDateRaw(invoice) {
    return String(invoice.invoice_meta?.dateRaw || invoice.invoice_meta?.date || '').trim();
}

function getDueDateRaw(invoice) {
    return String(invoice.invoice_meta?.dueDateRaw || invoice.invoice_meta?.dueDate || '').trim();
}

function getInvoiceConsultantSummary(invoice) {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const names = Array.from(new Set(items.map((item) => {
        const consultantId = String(item.consultant_id || '').trim();
        const directName = String(item.consultant || '').trim();
        if (directName) return directName;
        if (consultantId) return String(state.consultantsById.get(consultantId)?.name || '').trim();
        return '';
    }).filter(Boolean)));

    if (names.length === 0) {
        return '';
    }

    if (names.length === 1) {
        return names[0];
    }

    return `${names[0]} +${names.length - 1} more`;
}

function getInvoicePeriodSummary(invoice) {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const periods = Array.from(new Set(items.map((item) => String(item.period || '').trim()).filter(Boolean)));

    if (periods.length === 0) {
        return '';
    }

    if (periods.length === 1) {
        return periods[0];
    }

    return `${periods.length} billing periods`;
}

function getInvoiceFromName(invoice) {
    return String(invoice.business_info?.name || '').trim() || '—';
}

function getInvoiceClientMeta(invoice) {
    const periodSummary = getInvoicePeriodSummary(invoice);
    return periodSummary || 'No billing period';
}

function renderPaymentSummary(invoice, effectiveStatus) {
    if (effectiveStatus === 'paid') {
        const paidDate = escapeHtml(getPaymentReceivedDateDisplay(invoice, effectiveStatus));
        return `
            <div class="invoice-payment">
                <span class="invoice-payment__label invoice-payment__label--paid">Received</span>
                <span class="invoice-payment__date ${paidDate === 'null' ? 'invoice-payment__date--muted' : ''}">${paidDate}</span>
            </div>
        `;
    }

    const dueDate = formatDate(getDueDateRaw(invoice));
    const hasDueDate = dueDate !== '—';
    const labelClass = effectiveStatus === 'overdue' ? 'invoice-payment__label invoice-payment__label--overdue' : 'invoice-payment__label';
    const displayDate = hasDueDate ? dueDate : 'No due date';
    const dateClass = hasDueDate ? 'invoice-payment__date' : 'invoice-payment__date invoice-payment__date--muted';

    return `
        <div class="invoice-payment">
            <span class="${labelClass}">${effectiveStatus === 'overdue' ? 'Overdue' : 'Due'}</span>
            <span class="${dateClass}">${escapeHtml(displayDate)}</span>
        </div>
    `;
}

function getPaymentReceivedDateDisplay(invoice, effectiveStatus) {
    if (effectiveStatus !== 'paid') return 'null';

    const paidDateRaw = String(invoice.paid_date || '').trim();
    if (!paidDateRaw) return 'null';

    const formatted = formatDate(paidDateRaw);
    return formatted === '—' ? 'null' : formatted;
}

function getInvoiceDateTimestamp(invoice) {
    const raw = getInvoiceDateRaw(invoice);
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;

    const created = Date.parse(String(invoice.created_at || ''));
    if (!Number.isNaN(created)) return created;

    return 0;
}

function getEffectiveStatus(invoice) {
    const status = String(invoice.status || 'draft').toLowerCase();
    if (status !== 'sent') {
        return status === 'paid' ? 'paid' : status === 'draft' ? 'draft' : 'draft';
    }

    const dueRaw = getDueDateRaw(invoice);
    const dueTs = Date.parse(dueRaw);
    if (Number.isNaN(dueTs)) return 'sent';

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return dueTs < todayStart ? 'overdue' : 'sent';
}

function renderStatusChip(status) {
    const normalized = String(status || 'draft').toLowerCase();

    if (normalized === 'sent') {
        return '<span class="status-chip status-chip--sent">Sent</span>';
    }

    if (normalized === 'paid') {
        return '<span class="status-chip status-chip--paid">Paid</span>';
    }

    if (normalized === 'overdue') {
        return '<span class="status-chip status-chip--overdue">Overdue</span>';
    }

    return '<span class="status-chip status-chip--draft">Draft</span>';
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

function formatAmountValue(amount) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const cleanStr = String(dateString).length === 10 ? `${dateString}T12:00:00` : String(dateString);
    const parsed = Date.parse(cleanStr);
    if (Number.isNaN(parsed)) return '—';

    return new Date(parsed).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function setupBroadcastSync() {
    state.channel = new BroadcastChannel('app_channel');
    state.channel.onmessage = async (event) => {
        if (event.data?.type !== 'invoice_saved') return;
        await loadInvoices();
        showToast('Invoice list updated', 'success');
    };
}

function exportFilteredInvoicesToCSV() {
    if (state.filteredInvoices.length === 0) {
        showToast('No invoices to export', 'info');
        return;
    }

    const rows = [];
    rows.push(['Invoice Number', 'Amount', 'Currency', 'Payment Received', 'Status', 'Client']);

    const totalsByCurrency = new Map();

    state.filteredInvoices.forEach(invoice => {
        const invNum = String(invoice.invoice_number || '—').replace(/"/g, '""');
        const amount = Number(getInvoiceAmount(invoice) || 0);
        const currency = String(getInvoiceCurrency(invoice) || 'USD');
        const status = getEffectiveStatus(invoice);
        const clientName = String(invoice.client_info?.name || '—').replace(/"/g, '""');
        const rawDate = invoice.paid_date || '';
        
        let paymentReceived = '';
        if (status === 'paid' && rawDate) {
            paymentReceived = formatDate(rawDate);
        }

        rows.push([
            `"${invNum}"`,
            amount.toFixed(2),
            `"${currency}"`,
            `"${paymentReceived}"`,
            `"${status}"`,
            `"${clientName}"`
        ]);

        if (!totalsByCurrency.has(currency)) {
            totalsByCurrency.set(currency, 0);
        }
        totalsByCurrency.set(currency, totalsByCurrency.get(currency) + amount);
    });

    rows.push([]);
    rows.push(['TOTALS', '', '', '', '', '']);
    
    Array.from(totalsByCurrency.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([currency, total]) => {
        rows.push([
            `"${currency} Total"`,
            total.toFixed(2),
            `"${currency}"`,
            '',
            '',
            ''
        ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `invoices_report_${dateStr}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Report generated successfully', 'success');
}

function loadFilters() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_FILTERS };

        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_FILTERS,
            search: String(parsed.search || ''),
            consultant: String(parsed.consultant || 'all'),
            status: String(parsed.status || 'all'),
            currency: String(parsed.currency || 'all').toUpperCase() === 'ALL' ? 'all' : String(parsed.currency || 'all').toUpperCase(),
            due: String(parsed.due || 'all'),
            amount: String(parsed.amount || 'all'),
            sort: String(parsed.sort || DEFAULT_FILTERS.sort)
        };
    } catch (err) {
        return { ...DEFAULT_FILTERS };
    }
}

function persistFilters() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.filters));
    } catch (err) {
        console.warn('Failed to persist invoice filters', err);
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
