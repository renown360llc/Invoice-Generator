import { getCurrentUser } from './auth.js';
import { getInvoices, updateInvoiceStatus, recordInvoicePayment, deleteInvoicePayment } from './database.js';
import { supabase } from './config.js';
import { generatePDF } from './modules/pdf.js';
import { dbGetConsultants } from './modules/db-consultants.js';
import { getAccessContext, getReadOnlyMessage } from './modules/access-control.js';
import { debounce, showToast } from './modules/utils.js';
import './security.js';

// ── Linked timesheets helper ──────────────────────────────────────────────────
async function fetchLinkedTimesheets(invoiceId, invoiceNumber) {
    if (!invoiceId && !invoiceNumber) return [];
    const user = await getCurrentUser();
    if (!user) return [];

    const conditions = [];
    if (invoiceId) conditions.push(`invoice_id.eq.${invoiceId}`);
    if (invoiceNumber) conditions.push(`invoice_number.eq.${invoiceNumber}`);

    let query = supabase
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
        .eq('user_id', user.id);

    if (conditions.length > 0) {
        query = query.or(conditions.join(','));
    }

    const { data, error } = await query;

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

let STORAGE_KEY = 'invoice_pro_invoice_filters_v2';
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
    totalInvoiceCount: 0,
    totalInvoicePages: 1,
    loadRequestId: 0,
    invoiceToDelete: null,
    invoiceToPay: null,
    channel: null,
    isReadOnlyUser: false
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
        console.error('[invoices] Fatal init error:', err);
        showFatalInitError('Failed to load Invoices', err.message || 'Unknown error');
    });
});

function showFatalInitError(title, message, reloadLabel = 'Reload') {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff8f8;z-index:9999;flex-direction:column;gap:0.75rem;font-family:system-ui;padding:1.5rem;text-align:center;';

    const icon = document.createElement('span');
    icon.style.fontSize = '2.5rem';
    icon.textContent = '⚠️';

    const heading = document.createElement('h2');
    heading.style.cssText = 'margin:0;color:#dc2626;font-size:1.25rem;';
    heading.textContent = title;

    const paragraph = document.createElement('p');
    paragraph.style.cssText = 'margin:0;color:#6b7280;font-size:0.875rem;max-width:32rem;';
    paragraph.textContent = message || 'Unknown error';

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = 'padding:0.5rem 1.25rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;';
    button.textContent = reloadLabel;
    button.addEventListener('click', () => location.reload());

    overlay.append(icon, heading, paragraph, button);
    document.body.appendChild(overlay);
}

async function init() {
    state.user = await getCurrentUser();
    if (!state.user) {
        return;
    }
    const access = await getAccessContext(state.user).catch(() => ({
        role: 'viewer',
        isReadOnly: true,
        profile: null
    }));
    state.isReadOnlyUser = Boolean(access?.isReadOnly);

    // Scope localStorage to this user so filter state doesn't bleed between accounts
    STORAGE_KEY = `invoice_pro_invoice_filters_v2_${String(state.user.id).slice(-12)}`;

    cacheElements();
    applyAccessRestrictions();
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
    els.sortableHeaders = Array.from(document.querySelectorAll('#invoicesTable th.sortable'));

    els.tableBody = document.getElementById('invoicesBody');
    els.invoiceCards = document.getElementById('invoiceCards'); // Mobile accordion container
    els.pagination = document.getElementById('pagination');

    els.deleteModal = document.getElementById('deleteModal');
    els.deleteInvoiceMeta = document.getElementById('deleteInvoiceMeta');
    els.confirmDeleteBtn = document.getElementById('confirmDelete');
    els.cancelDeleteBtn = document.getElementById('cancelDelete');

    els.paymentModal = document.getElementById('paymentInfoModal');
    els.modalStatusInput = document.getElementById('modalStatusInput');
    els.paymentLedgerBody = document.getElementById('paymentLedgerBody');
    els.summaryTotal = document.getElementById('summaryTotal');
    els.summaryPaid = document.getElementById('summaryPaid');
    els.summaryBalance = document.getElementById('summaryBalance');
    els.addPaymentBtn = document.getElementById('addPaymentBtn');
    els.saveStatusBtn = document.getElementById('saveStatusBtn');
    els.cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    els.closePaymentModal = document.getElementById('closePaymentModal');
}

function closeAllRowMenus() {
    document.querySelectorAll('.invoice-row-menu.show').forEach((menu) => {
        menu.classList.remove('show');
    });

    document.querySelectorAll('[data-action="toggle-menu"][aria-expanded="true"]').forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
    });
}

function blockReadOnlyAction(feature = 'this action') {
    if (!state.isReadOnlyUser) return false;
    showToast(getReadOnlyMessage(feature), 'info');
    return true;
}

function ensureReadOnlyBanner() {
    const existing = document.getElementById('invoiceReadOnlyBanner');
    if (!state.isReadOnlyUser) {
        existing?.remove();
        return;
    }

    let banner = existing;
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'invoiceReadOnlyBanner';
        banner.style.cssText = 'display:flex;align-items:flex-start;gap:0.75rem;padding:0.9rem 1rem;margin:0 0 1rem;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:12px;';

        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:1.1rem;line-height:1;';
        icon.textContent = '🔒';

        const content = document.createElement('div');
        content.style.cssText = 'display:flex;flex-direction:column;gap:0.2rem;min-width:0;';

        const heading = document.createElement('strong');
        heading.textContent = 'Read-only access';

        const message = document.createElement('span');
        message.textContent = getReadOnlyMessage('invoice management');

        content.append(heading, message);
        banner.append(icon, content);
    }

    const anchor = document.querySelector('.invoices-filters-grid') || document.getElementById('filtersMeta');
    if (anchor && !banner.isConnected) {
        anchor.parentElement?.insertBefore(banner, anchor);
    }
}

function applyAccessRestrictions() {
    if (!state.isReadOnlyUser) return;

    ensureReadOnlyBanner();

    const disableIds = [
        'saveStatusBtn',
        'addPaymentBtn',
        'confirmDelete',
        'editPaymentBtn',
        'saveBtn',
        'invoiceUnlockBtn'
    ];

    disableIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
        el.title = getReadOnlyMessage('editing invoices');
    });

    const paymentInputs = [
        'newPaymentDate',
        'newPaymentAmount',
        'newPaymentUsd',
        'newPaymentNote',
        'modalStatusInput'
    ];
    paymentInputs.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = true;
    });

    const paymentModal = document.getElementById('paymentInfoModal');
    if (paymentModal) {
        paymentModal.querySelectorAll('button, input, select, textarea').forEach((el) => {
            if (el.id === 'cancelPaymentBtn' || el.id === 'closePaymentModal') return;
            if (el.id === 'downloadPdfBtn' || el.id === 'emailBtn') return;
            el.disabled = true;
        });
    }

    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
        deleteModal.querySelectorAll('button').forEach((el) => {
            if (el.id === 'cancelDelete') return;
            el.disabled = true;
        });
    }
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

    // Column Sorting Click Handler
    document.querySelector('#invoicesTable thead')?.addEventListener('click', (event) => {
        const th = event.target.closest('th.sortable');
        if (!th) return;

        const key = th.dataset.sortKey;
        const currentSort = state.filters.sort;
        const [currentKey, currentDir] = currentSort.split('-');

        let nextDir = 'desc';
        if (key === currentKey) {
            nextDir = currentDir === 'desc' ? 'asc' : 'desc';
        } else {
            // Default directions for new columns
            if (['client', 'company', 'invoice', 'status'].includes(key)) nextDir = 'asc';
        }

        state.filters.sort = `${key}-${nextDir}`;
        state.currentPage = 1;

        if (els.sortSelect) els.sortSelect.value = state.filters.sort;
        persistFilters();
        applyFiltersAndRender();
    });

    els.exportCsvBtn?.addEventListener('click', () => {
        void exportFilteredInvoicesToCSV();
    });

    const handleInvoiceActions = async (event) => {
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

        const toggleBtn = target.closest('[data-card-toggle]');
        if (toggleBtn) {
            const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            const body = toggleBtn.nextElementSibling;
            
            // Close all
            document.querySelectorAll('[data-card-toggle]').forEach(b => {
                b.setAttribute('aria-expanded', 'false');
                if (b.nextElementSibling) b.nextElementSibling.hidden = true;
            });
            
            if (!isExpanded) {
                toggleBtn.setAttribute('aria-expanded', 'true');
                if (body) body.hidden = false;
            }
            return;
        }

        const button = target.closest('[data-action]');
        if (!(button instanceof HTMLButtonElement || button.tagName === 'BUTTON')) return;

        const action = button.dataset.action;
        const invoiceId = button.dataset.id;
        if (!action || !invoiceId) return;

        if (state.isReadOnlyUser && ['delete', 'mark-sent', 'mark-paid', 'edit-payment-info', 'edit-paid-date', 'reopen'].includes(action)) {
            showToast(getReadOnlyMessage('invoice editing'), 'info');
            return;
        }

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

        if (action === 'mark-sent' || action === 'mark-paid' || action === 'edit-paid-date' || action === 'reopen' || action === 'edit-payment-info') {
            openPaymentInfoModal(invoice);
            return;
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
                    contentEl.replaceChildren(createInlineStatusMessage('No linked timesheets for this invoice.', '#9ca3af'));
                } else {
                    contentEl.replaceChildren(renderLinkedTimesheetsPanel(rows));
                }
                contentEl.dataset.loaded = '1';
            } catch (err) {
                if (contentEl) contentEl.replaceChildren(createInlineStatusMessage('Failed to load timesheets.', '#ef4444'));
            }
            return;
        }
    };

    document.addEventListener('click', handleInvoiceActions);

    els.pagination?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const button = target.closest('[data-page]');
        if (!(button instanceof HTMLButtonElement)) return;

        const page = Number(button.dataset.page);
        if (!Number.isFinite(page) || page < 1) return;

        state.currentPage = page;
        persistFilters();
        void loadInvoices();
    });

    els.confirmDeleteBtn?.addEventListener('click', async () => {
        if (state.isReadOnlyUser) {
            showToast(getReadOnlyMessage('invoice deletion'), 'info');
            return;
        }
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

    // Close Modal Button
    els.closePaymentModal?.addEventListener('click', closePaidModal);
    els.cancelPaymentBtn?.addEventListener('click', closePaidModal);

    // Save Status ONLY (Manual override)
    els.saveStatusBtn?.addEventListener('click', async () => {
        if (state.isReadOnlyUser) {
            showToast(getReadOnlyMessage('invoice status changes'), 'info');
            return;
        }
        if (!state.invoiceToPay) return;
        const nextStatus = els.modalStatusInput?.value || 'sent';
        els.saveStatusBtn.disabled = true;
        try {
            await updateInvoiceStatus(state.invoiceToPay.id, nextStatus);
            
            if (['sent', 'partially_paid', 'paid'].includes(nextStatus)) {
                await markTimesheetsInvoiced(state.invoiceToPay);
            }

            showToast(`Status updated to ${nextStatus}`, 'success');
            closePaidModal();
            await loadInvoices();
        } catch (err) {
            console.error(err);
            showToast('Failed to update status', 'error');
        } finally {
            els.saveStatusBtn.disabled = false;
        }
    });

    // Add/Update Payment Installment
    els.addPaymentBtn?.addEventListener('click', async () => {
        if (state.isReadOnlyUser) {
            showToast(getReadOnlyMessage('payment changes'), 'info');
            return;
        }
        if (!state.invoiceToPay) return;
        
        const date = document.getElementById('newPaymentDate')?.value;
        const amount = document.getElementById('newPaymentAmount')?.value;
        const usdAmount = document.getElementById('newPaymentUsd')?.value;
        const note = document.getElementById('newPaymentNote')?.value;

        if (!amount || Number(amount) <= 0) {
            showToast('Please enter a valid payment amount', 'error');
            return;
        }

        const btn = els.addPaymentBtn;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = state.editingPaymentId ? 'Updating...' : 'Recording...';

        try {
            const updated = await recordInvoicePayment(state.invoiceToPay.id, {
                id: state.editingPaymentId,
                date,
                amount,
                usdAmount,
                note
            });
            
            showToast(state.editingPaymentId ? 'Payment updated' : `Recorded payment of ${amount}`, 'success');
            
            // Re-render modal with new data
            state.invoiceToPay = updated;
            openPaymentInfoModal(updated);
            resetPaymentForm();
            await loadInvoices(); // Refresh grid
        } catch (err) {
            console.error(err);
            showToast('Error recording payment: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // Ledger Actions (Delete/Edit)
    els.paymentLedgerBody?.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.ledger-delete');
        const editBtn = e.target.closest('.ledger-edit');
        if (!state.invoiceToPay) return;
        if (state.isReadOnlyUser) {
            showToast(getReadOnlyMessage('payment changes'), 'info');
            return;
        }

        if (deleteBtn) {
            const paymentId = deleteBtn.dataset.paymentId;
            if (!confirm('Are you sure you want to delete this payment installment?')) return;

            try {
                const updated = await deleteInvoicePayment(state.invoiceToPay.id, paymentId);
                showToast('Payment deleted', 'info');
                state.invoiceToPay = updated;
                openPaymentInfoModal(updated);
                await loadInvoices(); // Refresh grid
            } catch (err) {
                console.error(err);
                showToast('Error deleting payment', 'error');
            }
        }

        if (editBtn) {
            const paymentId = editBtn.dataset.paymentId;
            startEditingPayment(paymentId);
        }
    });

    document.getElementById('cancelEditBtn')?.addEventListener('click', resetPaymentForm);

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
    const requestId = ++state.loadRequestId;
    setLoadingTable();

    try {
        const consultants = await dbGetConsultants().catch(() => []);
        if (requestId !== state.loadRequestId) return;
        state.consultantsById = new Map((consultants || []).map((consultant) => [String(consultant.id), consultant]));
        normalizeConsultantFilterSelection();

        const invoicesResult = await getInvoices(state.user, {
            page: state.currentPage,
            pageSize: ITEMS_PER_PAGE,
            filters: state.filters,
            sort: state.filters.sort,
            paginate: true
        });

        if (requestId !== state.loadRequestId) return;

        const pageInvoices = Array.isArray(invoicesResult)
            ? invoicesResult
            : (invoicesResult.data || []);
        const totalCount = Array.isArray(invoicesResult)
            ? pageInvoices.length
            : Number(invoicesResult.count) || 0;
        const totalPages = Array.isArray(invoicesResult)
            ? Math.max(1, Math.ceil(pageInvoices.length / ITEMS_PER_PAGE))
            : Number(invoicesResult.totalPages) || Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

        if (state.currentPage > totalPages) {
            state.currentPage = totalPages;
            persistFilters();
            return loadInvoices();
        }

        state.allInvoices = pageInvoices;
        state.filteredInvoices = pageInvoices;
        state.totalInvoiceCount = totalCount;
        state.totalInvoicePages = totalPages;

        populateConsultantFilterOptions();
        populateCurrencyFilterOptions();
        renderTable();
        renderPagination();
        renderFiltersMeta();
    } catch (err) {
        console.error(err);
        if (requestId !== state.loadRequestId) return;
        state.allInvoices = [];
        state.filteredInvoices = [];
        state.totalInvoiceCount = 0;
        state.totalInvoicePages = 1;
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
    state.currentPage = 1;
    void loadInvoices();
}

function sortInvoices(list, sortBy) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    list.sort((a, b) => {
        if (sortBy === 'date-desc') return getInvoiceDateTimestamp(b) - getInvoiceDateTimestamp(a);
        if (sortBy === 'date-asc') return getInvoiceDateTimestamp(a) - getInvoiceDateTimestamp(b);
        if (sortBy === 'amount-desc') return getInvoiceAmount(b) - getInvoiceAmount(a);
        if (sortBy === 'amount-asc') return getInvoiceAmount(a) - getInvoiceAmount(b);
        if (sortBy === 'client-asc') return collator.compare(String(a.client_info?.name || ''), String(b.client_info?.name || ''));
        if (sortBy === 'client-desc') return collator.compare(String(b.client_info?.name || ''), String(a.client_info?.name || ''));
        if (sortBy === 'invoice-asc') return collator.compare(String(a.invoice_number || ''), String(b.invoice_number || ''));
        if (sortBy === 'invoice-desc') return collator.compare(String(b.invoice_number || ''), String(a.invoice_number || ''));
        if (sortBy === 'company-asc') return collator.compare(String(a.company_info?.name || ''), String(b.company_info?.name || ''));
        if (sortBy === 'company-desc') return collator.compare(String(b.company_info?.name || ''), String(a.company_info?.name || ''));
        if (sortBy === 'status-asc') return collator.compare(getEffectiveStatus(a), getEffectiveStatus(b));
        if (sortBy === 'status-desc') return collator.compare(getEffectiveStatus(b), getEffectiveStatus(a));
        if (sortBy === 'currency-asc') return collator.compare(getInvoiceCurrency(a), getInvoiceCurrency(b));
        if (sortBy === 'currency-desc') return collator.compare(getInvoiceCurrency(b), getInvoiceCurrency(a));

        if (sortBy === 'payment-asc') {
            const balA = a.totals?.balance_due ?? (getInvoiceAmount(a) - (a.totals?.amount_paid || 0));
            const balB = b.totals?.balance_due ?? (getInvoiceAmount(b) - (b.totals?.amount_paid || 0));
            return balB - balA; // Most Owed first
        }
        if (sortBy === 'payment-desc') {
            const balA = a.totals?.balance_due ?? (getInvoiceAmount(a) - (a.totals?.amount_paid || 0));
            const balB = b.totals?.balance_due ?? (getInvoiceAmount(b) - (b.totals?.amount_paid || 0));
            return balA - balB; // Least Owed first
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

    // Update Header Sort Icons
    (els.sortableHeaders || []).forEach(th => {
        const key = th.dataset.sortKey;
        const [activeKey, activeDir] = state.filters.sort.split('-');
        
        th.classList.toggle('active', key === activeKey);
        th.classList.remove('sort-asc', 'sort-desc');
        if (key === activeKey) {
            th.classList.add(`sort-${activeDir}`);
        }
    });

    if (state.filteredInvoices.length === 0) {
        setEmptyTable('No invoices found for selected filters.');
        return;
    }

    const pageInvoices = state.filteredInvoices;

    els.tableBody.innerHTML = pageInvoices.map((invoice) => {
        const invoiceDate = formatDate(getInvoiceDateRaw(invoice) || invoice.created_at);
        const status = getEffectiveStatus(invoice);
        const currency = getInvoiceCurrency(invoice);
        const amount = formatAmountValue(getInvoiceAmount(invoice));
        
        const usdReceived = invoice.totals?.usd_received_amount;
        const amountPaid = Number(invoice.totals?.amount_paid) || 0;
        const balanceDue = Number(invoice.totals?.balance_due) ?? (getInvoiceAmount(invoice) - amountPaid);
        
        let currencyColumn = currency;
        let amountColumn = `<strong>${amount}</strong>`;

        if (status === 'partially_paid') {
            amountColumn = `
                <div style="display:flex; flex-direction:column; justify-content:center; gap:0.2rem;">
                    <div style="font-size:0.9rem; font-weight:700;">${amount}</div>
                    <div style="font-size:0.75rem; color:#059669; font-weight:600;">Paid: ${formatAmountValue(amountPaid)}</div>
                    <div style="font-size:0.75rem; color:#d97706; font-weight:600;">Due: ${formatAmountValue(Math.max(0, balanceDue))}</div>
                </div>
            `;
        } else if (usdReceived && status === 'paid') {
             currencyColumn = `
                 <div style="display:flex; flex-direction:column; justify-content:center; gap:0.25rem;">
                     <span>${currency}</span>
                     <hr style="width:100%; border:0; border-top:1px solid var(--surface-border); margin:0;" />
                     <span style="color:var(--text-secondary); font-size:0.85em;">USD</span>
                 </div>
             `;
             amountColumn = `
                 <div style="display:flex; flex-direction:column; justify-content:center; gap:0.25rem;">
                     <strong>${amount}</strong>
                     <hr style="width:100%; border:0; border-top:1px solid var(--surface-border); margin:0;" />
                     <span style="color:var(--text-secondary); font-size:0.85em; font-weight:500;">${formatAmountValue(usdReceived)}</span>
                 </div>
             `;
        }

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
                <td class="invoice-cell--currency">${currencyColumn}</td>
                <td class="invoice-cell--amount">${amountColumn}</td>
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
                            <button class="dropdown-item" data-action="edit" data-id="${invoice.id}">${state.isReadOnlyUser ? 'View invoice' : 'View/Edit invoice'}</button>
                            <button class="dropdown-item" data-action="download" data-id="${invoice.id}">Download PDF</button>
                            <button class="dropdown-item" data-action="email" data-id="${invoice.id}">Send by email</button>
                            <button class="dropdown-item" data-action="expand-ts" data-id="${invoice.id}" data-inv-number="${escapeHtml(invoice.invoice_number || '')}">Linked timesheets</button>
                            ${renderSecondaryStatusMenuAction(invoice, status)}
                            ${state.isReadOnlyUser ? '' : `
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item dropdown-item--danger" data-action="delete" data-id="${invoice.id}">Delete invoice</button>
                            `}
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

    // ── Mobile card view (accordion) ──
    if (els.invoiceCards) {
        els.invoiceCards.innerHTML = pageInvoices.map((invoice) => {
            const invoiceDate = formatDate(getInvoiceDateRaw(invoice) || invoice.created_at);
            const status = getEffectiveStatus(invoice);
            const currency = getInvoiceCurrency(invoice);
            const amount = formatAmountValue(getInvoiceAmount(invoice));
            
            const usdReceived = invoice.totals?.usd_received_amount;
            let mobileSubtitle = `<span>${currency} ${amount}</span>`;
            if (usdReceived && status === 'paid') {
                 mobileSubtitle = `
                     <div style="display:flex; flex-direction:column; gap:0.2rem;">
                         <span>${currency} ${amount}</span>
                         <span style="color:var(--text-secondary); font-size:0.9em;">USD ${formatAmountValue(usdReceived)} <span style="font-size:0.8em; font-weight:normal">(converted)</span></span>
                     </div>
                 `;
            }

            const clientName = escapeHtml(invoice.client_info?.name || 'N/A');
            const fromName = escapeHtml(getInvoiceFromName(invoice));

            // Setup primary and secondary actions
            const primaryAction = renderPrimaryAction(invoice, status).replace('class="action-btn invoice-primary-action"', 'class="btn btn--primary btn--sm" style="flex:1"');
            const secondaryActionsHTML = [];
            secondaryActionsHTML.push(`<button class="btn btn--outline btn--sm" data-action="edit" data-id="${invoice.id}" style="flex:1">${state.isReadOnlyUser ? 'View' : 'Edit'}</button>`);
            if (!state.isReadOnlyUser) {
                secondaryActionsHTML.push(`<button class="btn btn--outline btn--sm" data-action="edit-payment-info" data-id="${invoice.id}" style="flex:1">Status/Payment</button>`);
                secondaryActionsHTML.push(`<button class="btn btn--ghost btn--sm" data-action="delete" data-id="${invoice.id}" style="color:#ef4444; width:100%">Delete</button>`);
            }

            return `
            <div class="m-card">
                <button class="m-card__header" aria-expanded="false" data-card-toggle="${invoice.id}">
                    <div class="m-card__title-row">
                        <span class="m-card__title">${escapeHtml(invoice.invoice_number || '—')}</span>
                        ${renderStatusChip(status)}
                    </div>
                    <div class="m-card__subtitle">
                        ${mobileSubtitle}
                        <span>•</span>
                        <span>${clientName}</span>
                    </div>
                    <svg class="m-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                <div class="m-card__details" hidden>
                    <div class="m-card__detail-row">
                        <span class="m-card__detail-label">Date</span>
                        <span class="m-card__detail-value">${invoiceDate}</span>
                    </div>
                    <div class="m-card__detail-row">
                        <span class="m-card__detail-label">From</span>
                        <span class="m-card__detail-value">${fromName}</span>
                    </div>
                    <div class="m-card__detail-row">
                        <span class="m-card__detail-label">Payment</span>
                        <span class="m-card__detail-value">${renderPaymentSummary(invoice, status)}</span>
                    </div>
                    
                    <div class="m-card__actions" style="margin-top:0.75rem; display:flex; flex-wrap:wrap; gap:0.5rem;">
                        ${primaryAction.replace('action-btn--primary', 'btn btn--primary btn--sm').replace('invoice-primary-action', '')}
                        ${secondaryActionsHTML.join('')}
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

function renderPrimaryAction(invoice, effectiveStatus) {
    if (state.isReadOnlyUser) {
        if (effectiveStatus === 'paid') {
            return `<button class="action-btn action-btn--primary invoice-primary-action" data-action="download" data-id="${invoice.id}">PDF</button>`;
        }
        return `<button class="action-btn action-btn--primary invoice-primary-action" data-action="edit" data-id="${invoice.id}">View</button>`;
    }

    if (effectiveStatus === 'draft') {
        return `<button class="action-btn action-btn--primary invoice-primary-action" data-action="mark-sent" data-id="${invoice.id}">Mark Sent</button>`;
    }

    if (effectiveStatus === 'sent' || effectiveStatus === 'overdue') {
        return `<button class="action-btn action-btn--primary invoice-primary-action" data-action="mark-paid" data-id="${invoice.id}">Mark Paid</button>`;
    }

    return `<button class="action-btn invoice-primary-action" data-action="download" data-id="${invoice.id}">PDF</button>`;
}

function renderSecondaryStatusMenuAction(invoice, effectiveStatus) {
    if (state.isReadOnlyUser) return '';

    return `
        <div class="dropdown-divider"></div>
        <div class="dropdown-label">Lifecycle</div>
        <button class="dropdown-item" data-action="edit-payment-info" data-id="${invoice.id}">Edit status/payment</button>
    `;
}

function renderPagination() {
    if (!els.pagination) return;

    const totalPages = state.totalInvoicePages || 1;
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

    const loadedCount = state.filteredInvoices.length;
    const totalCount = state.totalInvoiceCount || loadedCount;
    const totalPages = Math.max(1, state.totalInvoicePages || 1);

    els.filtersMeta.textContent = `${appliedFilters} filter${appliedFilters === 1 ? '' : 's'} applied • ${loadedCount}/${totalCount} invoices • Page ${state.currentPage}/${totalPages}`;
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
    if (state.isReadOnlyUser) {
        showToast(getReadOnlyMessage('invoice deletion'), 'info');
        return;
    }
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

function ensureReconciled(invoice) {
    if (!invoice) return null;
    const totals = { ...(invoice.totals || {}) };
    const payments = totals.payments || [];
    
    // Legacy Paid invoices: status is 'paid' but ledger is empty
    if (invoice.status === 'paid' && payments.length === 0) {
        const totalAmount = Number(totals.total) || 0;
        totals.amount_paid = totalAmount;
        totals.balance_due = 0;
        totals.payments = [{
            id: 'legacy-display-' + Date.now(),
            date: invoice.paid_date || new Date().toISOString().split('T')[0],
            amount: totalAmount,
            usdAmount: totals.usd_received_amount || null,
            note: 'Marked as paid (Legacy)'
        }];
    }
    
    // Legacy Partial invoices (if any existed): status is 'partially_paid' but balance_due not set
    if (invoice.status === 'partially_paid' && totals.balance_due === undefined) {
        const totalAmount = Number(totals.total) || 0;
        const paidAmount = Number(totals.amount_paid) || 0;
        totals.balance_due = Math.max(0, totalAmount - paidAmount);
    }

    return { ...invoice, totals };
}

function openPaymentInfoModal(invoiceRaw) {
    if (state.isReadOnlyUser) {
        showToast(getReadOnlyMessage('payment changes'), 'info');
        return;
    }
    const invoice = ensureReconciled(invoiceRaw);
    state.invoiceToPay = invoice;
    const totals = invoice.totals || {};
    const totalAmount = Number(totals.total) || 0;
    const amountPaid = Number(totals.amount_paid) || 0;
    const balanceDue = Number(totals.balance_due) ?? totalAmount;
    const currency = getInvoiceCurrency(invoice);

    // Update Summary
    if (els.summaryTotal) els.summaryTotal.textContent = formatMoney(totalAmount, currency);
    if (els.summaryPaid) els.summaryPaid.textContent = formatMoney(amountPaid, currency);
    if (els.summaryBalance) els.summaryBalance.textContent = formatMoney(balanceDue, currency);
    
    // Update Progress Meter
    const progressPercent = totalAmount > 0 ? Math.min(100, Math.round((amountPaid / totalAmount) * 100)) : 0;
    const progressFill = document.getElementById('modalProgressFill');
    const progressText = document.getElementById('modalProgressPercent');
    if (progressFill) progressFill.style.width = `${progressPercent}%`;
    if (progressText) progressText.textContent = `${progressPercent}%`;

    const modalInvNum = document.getElementById('modalInvoiceNumber');
    if (modalInvNum) modalInvNum.textContent = `Invoice #${invoice.invoice_number}`;

    // Update Header Badge
    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        const rawStatus = (invoice.status || 'draft');
        const formatted = rawStatus.replace('_', ' ');
        statusBadge.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    // Update Status
    if (els.modalStatusInput) {
        els.modalStatusInput.value = invoice.status || 'draft';
    }

    // Render Ledger
    renderPaymentLedger(invoice);

    // Reset Form
    const dateInput = document.getElementById('newPaymentDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const amtInput = document.getElementById('newPaymentAmount');
    if (amtInput) amtInput.value = '';
    const usdInput = document.getElementById('newPaymentUsd');
    if (usdInput) usdInput.value = '';
    const noteInput = document.getElementById('newPaymentNote');
    if (noteInput) noteInput.value = '';

    if (els.paymentModal) {
        els.paymentModal.style.display = 'flex';
    }
}

function startEditingPayment(paymentId) {
    const invoice = state.invoiceToPay;
    if (!invoice || !invoice.totals?.payments) return;
    
    const payment = invoice.totals.payments.find(p => p.id === paymentId);
    if (!payment) return;

    state.editingPaymentId = paymentId;

    // Populate fields
    if (document.getElementById('newPaymentDate')) document.getElementById('newPaymentDate').value = payment.date;
    if (document.getElementById('newPaymentAmount')) document.getElementById('newPaymentAmount').value = payment.amount;
    if (document.getElementById('newPaymentUsd')) document.getElementById('newPaymentUsd').value = payment.usdAmount || '';
    if (document.getElementById('newPaymentNote')) document.getElementById('newPaymentNote').value = payment.note || '';

    // UI Feedback
    const indicator = document.getElementById('editModeIndicator');
    if (indicator) indicator.style.display = 'flex';
    if (els.addPaymentBtn) els.addPaymentBtn.textContent = 'Update Transaction';
}

function resetPaymentForm() {
    state.editingPaymentId = null;
    
    // Clear inputs
    if (document.getElementById('newPaymentDate')) document.getElementById('newPaymentDate').value = new Date().toISOString().split('T')[0];
    if (document.getElementById('newPaymentAmount')) document.getElementById('newPaymentAmount').value = '';
    if (document.getElementById('newPaymentUsd')) document.getElementById('newPaymentUsd').value = '';
    if (document.getElementById('newPaymentNote')) document.getElementById('newPaymentNote').value = '';

    // Reset UI
    const indicator = document.getElementById('editModeIndicator');
    if (indicator) indicator.style.display = 'none';
    if (els.addPaymentBtn) els.addPaymentBtn.textContent = 'Record Transaction';
}

function renderPaymentLedger(invoice) {
    if (!els.paymentLedgerBody) return;
    const payments = invoice.totals?.payments || [];
    const currency = getInvoiceCurrency(invoice);

    if (payments.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.style.textAlign = 'center';
        cell.style.padding = '1.5rem';
        cell.style.color = 'var(--text-secondary)';
        cell.textContent = 'No payments recorded yet';
        row.appendChild(cell);
        els.paymentLedgerBody.replaceChildren(row);
        return;
    }

    const fragment = document.createDocumentFragment();

    payments.forEach((payment) => {
        const row = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = payment.date || '—';

        const amountCell = document.createElement('td');
        const amountValue = document.createElement('div');
        amountValue.textContent = formatMoney(payment.amount, currency);
        amountCell.appendChild(amountValue);

        if (payment.usdAmount) {
            const usdLine = document.createElement('div');
            usdLine.style.fontSize = '0.7rem';
            usdLine.style.color = 'var(--text-secondary)';
            usdLine.textContent = `USD ${payment.usdAmount}`;
            amountCell.appendChild(usdLine);
        }

        const actionCell = document.createElement('td');
        actionCell.style.textAlign = 'right';
        const actionsWrap = document.createElement('div');
        actionsWrap.style.cssText = 'display:flex; gap:0.5rem; justify-content:flex-end;';
        actionsWrap.appendChild(createLedgerActionButton('ledger-edit', 'Edit payment', 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z', payment.id));
        actionsWrap.appendChild(createLedgerActionButton('ledger-delete', 'Delete payment', 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', payment.id));
        actionCell.appendChild(actionsWrap);

        row.append(dateCell, amountCell, actionCell);
        fragment.appendChild(row);
    });

    els.paymentLedgerBody.replaceChildren(fragment);
}

function closePaidModal() {
    state.invoiceToPay = null;
    if (els.paymentModal) {
        els.paymentModal.style.display = 'none';
    }
}

async function updateStatus(invoice, nextStatus) {
    if (state.isReadOnlyUser) {
        showToast(getReadOnlyMessage('invoice status changes'), 'info');
        return;
    }
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
    if (state.isReadOnlyUser) {
        showToast(getReadOnlyMessage('invoice deletion'), 'info');
        return;
    }
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
    if (state.isReadOnlyUser) {
        showToast(getReadOnlyMessage('invoice status changes'), 'info');
        return;
    }
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
    const options = Array.from(state.consultantsById.values())
        .map((consultant) => {
            const id = String(consultant.id || '').trim();
            const name = String(consultant.name || '').trim();
            if (!id || !name) return null;
            return { value: `id:${id}`, label: name };
        })
        .filter(Boolean);

    return options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

function normalizeConsultantFilterSelection() {
    const current = String(state.filters.consultant || 'all');
    if (current === 'all' || current.startsWith('id:')) {
        return;
    }

    if (current.startsWith('name:')) {
        const target = current.slice(5).trim().toLowerCase();
        const match = Array.from(state.consultantsById.values()).find((consultant) => String(consultant.name || '').trim().toLowerCase() === target);
        state.filters.consultant = match ? `id:${match.id}` : 'all';
        persistFilters();
        return;
    }

    const match = Array.from(state.consultantsById.values()).find((consultant) => String(consultant.name || '').trim().toLowerCase() === current.trim().toLowerCase());
    state.filters.consultant = match ? `id:${match.id}` : 'all';
    persistFilters();
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

function createInlineStatusMessage(message, color) {
    const span = document.createElement('span');
    span.style.color = color;
    span.textContent = message;
    return span;
}

function createLedgerIcon(pathD) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
}

function createLedgerActionButton(className, title, pathD, paymentId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.paymentId = paymentId;
    button.title = title;
    button.style.cssText = 'background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:2px;';
    button.appendChild(createLedgerIcon(pathD));
    return button;
}

function createLinkedTimesheetsHeader() {
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:0.5rem;font-weight:600;color:#374151;font-size:0.75rem;letter-spacing:0.05em;text-transform:uppercase;';
    header.textContent = 'Linked Timesheets';
    return header;
}

function createLinkedTimesheetsGridRow(row, isHeader = false) {
    const rowEl = document.createElement('div');
    rowEl.style.cssText = isHeader
        ? 'display:grid;grid-template-columns:1.5fr 1.5fr 1fr 0.75fr 0.75fr 0.75fr;gap:0.5rem;padding:0.35rem 0;font-size:0.7rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;'
        : 'display:grid;grid-template-columns:1.5fr 1.5fr 1fr 0.75fr 0.75fr 0.75fr;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid #f1f5f9;align-items:center;font-size:0.8125rem;';

    if (isHeader) {
        ['Consultant', 'Client', 'Period', 'Hours', 'Rate', 'Amount'].forEach((label, index) => {
            const span = document.createElement('span');
            span.textContent = label;
            if (index >= 3) {
                span.style.textAlign = 'right';
            }
            rowEl.appendChild(span);
        });
        return rowEl;
    }

    const consultant = Array.isArray(row?.consultants) ? row.consultants[0] : (row?.consultants || {});
    const currency = String(consultant.currency || 'USD').toUpperCase();
    const rate = Number(consultant.bill_rate || 0).toFixed(2);
    const hours = Number(row?.hours_worked || 0).toFixed(2);
    const amount = (Number(hours) * Number(consultant.bill_rate || 0)).toFixed(2);

    const consultantCell = document.createElement('span');
    consultantCell.style.fontWeight = '600';
    consultantCell.style.color = '#111827';
    consultantCell.textContent = consultant.name || '—';

    const clientCell = document.createElement('span');
    clientCell.style.color = '#374151';
    clientCell.textContent = consultant.client || '—';

    const periodCell = document.createElement('span');
    periodCell.style.color = '#6b7280';
    periodCell.textContent = `${row?.period_start || '—'} → ${row?.period_end || '—'}`;

    const hoursCell = document.createElement('span');
    hoursCell.style.textAlign = 'right';
    hoursCell.textContent = `${hours} hrs`;

    const rateCell = document.createElement('span');
    rateCell.style.textAlign = 'right';
    rateCell.textContent = `${currency} ${rate}/hr`;

    const amountCell = document.createElement('span');
    amountCell.style.textAlign = 'right';
    amountCell.style.fontWeight = '600';
    amountCell.style.color = '#111827';
    amountCell.textContent = `${currency} ${amount}`;

    rowEl.append(consultantCell, clientCell, periodCell, hoursCell, rateCell, amountCell);
    return rowEl;
}

function renderLinkedTimesheetsPanel(rows) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createLinkedTimesheetsHeader());
    fragment.appendChild(createLinkedTimesheetsGridRow(null, true));

    rows.forEach((row) => {
        fragment.appendChild(createLinkedTimesheetsGridRow(row));
    });

    return fragment;
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
    if (status === 'draft' || status === 'paid' || status === 'partially_paid') {
        return status;
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

    if (normalized === 'partially_paid') {
        return '<span class="status-chip status-chip--partially_paid">Partial</span>';
    }

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
    const userId = state.user?.id || 'anon';
    state.channel = new BroadcastChannel(`app_channel_${userId}`);
    state.channel.onmessage = async (event) => {
        if (event.data?.type !== 'invoice_saved') return;
        await loadInvoices();
        showToast('Invoice list updated', 'success');
    };
}

async function exportFilteredInvoicesToCSV() {
    const invoices = await getInvoices(state.user, {
        filters: state.filters
    });

    const exportRows = Array.isArray(invoices) ? invoices : [];
    if (exportRows.length === 0) {
        showToast('No invoices to export', 'info');
        return;
    }

    const rows = [];
    rows.push(['Invoice Number', 'Invoice Date', 'Payment Date', 'Status', 'Client', 'Currency', 'Description', 'Period', 'Consultant', 'Quantity', 'Rate', 'Amount']);

    const totalsByCurrency = new Map();

    exportRows.forEach(invoice => {
        const invNum = String(invoice.invoice_number || '—').replace(/"/g, '""');
        const status = getEffectiveStatus(invoice);
        const clientName = String(invoice.client_info?.name || '—').replace(/"/g, '""');

        const invDate = formatDate(getInvoiceDateRaw(invoice) || invoice.created_at || '');
        const rawDate = invoice.paid_date || '';
        let paymentReceived = '';
        if (status === 'paid' && rawDate) {
            paymentReceived = formatDate(rawDate);
        }

        const currency = getInvoiceCurrency(invoice);
        const items = Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : [{}]; // fallback if no items

        items.forEach(item => {
            const desc = String(item.desc || '—').replace(/"/g, '""');
            const period = String(item.period || '').replace(/"/g, '""');
            const consultant = String(item.consultant || '').replace(/"/g, '""');
            const qty = Number(item.qty || 1);
            const rate = Number(item.rate || 0);
            const amount = Number(item.amount || 0);

            rows.push([
                `"${invNum}"`,
                `"${invDate}"`,
                `"${paymentReceived}"`,
                `"${status}"`,
                `"${clientName}"`,
                `"${currency}"`,
                `"${desc}"`,
                `"${period}"`,
                `"${consultant}"`,
                qty,
                rate.toFixed(2),
                amount.toFixed(2)
            ]);

            if (!totalsByCurrency.has(currency)) {
                totalsByCurrency.set(currency, 0);
            }
            totalsByCurrency.set(currency, totalsByCurrency.get(currency) + amount);
        });
    });

    rows.push([]);
    rows.push(['TOTALS', '', '', '', '', '', '', '', '', '', '', '']);
    
    Array.from(totalsByCurrency.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([currency, total]) => {
        rows.push([
            `"${currency} Total"`,
            '', '', '', '', 
            `"${currency}"`,
            '', '', '', '', '',
            total.toFixed(2)
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
