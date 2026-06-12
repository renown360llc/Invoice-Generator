/**
 * Referrals Page — Main Script
 * Pass-through payout ledger: record your cut, what was forwarded to the
 * referral partner, and track pending vs paid.
 */

import { loadLayout } from './components/layout.js';
import { getCurrentUser } from './config.js';
import { getInvoices } from './database.js';
import { dbGetReferralPayouts, dbSaveReferralPayout, dbDeleteReferralPayout } from './modules/db-referrals.js';
import {
    computePayout,
    receivedAmount,
    referralBasis,
    payoutPaidMonths,
    summarizePayouts,
    filterPayouts,
    derivePayoutStatus,
    payoutAmountPaid,
    payoutBalance,
    paymentsTotal
} from './modules/referrals.js';
import { getAccessContext, getReadOnlyMessage } from './modules/access-control.js';
import { formatCurrency } from './modules/utils.js';
import { escapeHtml } from './utils.js';

let payouts = [];
let invoices = [];
let searchQuery = '';
let payoutToDelete = null;
let currentPaymentPayout = null;
let isReadOnly = false;
let editingInvoiceId = ''; // invoice of the payout being edited (kept selectable in the picker)

const ledgerFilters = { status: 'all', company: 'all', client: 'all', recipient: 'all', currency: 'all', month: 'all' };
let invoiceById = new Map();
let invoiceByNumber = new Map();

const els = {};

document.addEventListener('DOMContentLoaded', () => {
    init().catch((err) => {
        console.error('[referrals] Fatal init error:', err);
        showToast(err.message || 'Failed to load referrals', 'error');
    });
});

async function init() {
    await loadLayout('referrals');

    els.summary = document.getElementById('summaryGrid');
    els.body = document.getElementById('payoutsBody');
    els.search = document.getElementById('searchInput');
    els.addBtn = document.getElementById('addPayoutBtn');
    els.modal = document.getElementById('payoutModal');
    els.form = document.getElementById('payoutForm');
    els.closeBtn = document.getElementById('closeModalBtn');
    els.cancelBtn = document.getElementById('cancelBtn');
    els.modalTitle = document.getElementById('modalTitle');
    els.invoiceSelect = document.getElementById('invoiceSelect');
    els.filterCompany = document.getElementById('filterCompany');
    els.filterCurrency = document.getElementById('filterCurrency');
    els.filterMonth = document.getElementById('filterMonth');
    els.deleteModal = document.getElementById('deletePayoutModal');
    els.deleteName = document.getElementById('deletePayoutName');
    els.deleteCancelBtn = document.getElementById('deleteCancelBtn');
    els.deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
    els.ledgerStatus = document.getElementById('ledgerStatus');
    els.ledgerCompany = document.getElementById('ledgerCompany');
    els.ledgerClient = document.getElementById('ledgerClient');
    els.ledgerRecipient = document.getElementById('ledgerRecipient');
    els.ledgerCurrency = document.getElementById('ledgerCurrency');
    els.ledgerMonth = document.getElementById('ledgerMonth');
    els.ledgerClear = document.getElementById('ledgerClear');

    const user = await getCurrentUser();
    if (!user) return;

    const access = await getAccessContext(user);
    isReadOnly = access.isReadOnly;
    if (isReadOnly) els.addBtn?.setAttribute('disabled', 'true');

    bindEvents();

    const [payoutRows, invoiceRows] = await Promise.all([
        dbGetReferralPayouts(),
        getInvoices(user).catch(() => [])
    ]);
    payouts = payoutRows;
    invoices = invoiceRows || [];
    invoiceById = new Map(invoices.map((i) => [String(i.id), i]));
    invoiceByNumber = new Map(invoices.filter((i) => i.invoice_number).map((i) => [String(i.invoice_number), i]));
    populateInvoiceFilters();
    applyInvoiceFilter();
    render();
}

function bindEvents() {
    els.addBtn?.addEventListener('click', () => openModal());
    els.closeBtn?.addEventListener('click', closeModal);
    els.cancelBtn?.addEventListener('click', closeModal);
    els.modal?.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
    els.form?.addEventListener('submit', handleSave);

    els.invoiceSelect?.addEventListener('change', onInvoicePicked);
    els.filterCompany?.addEventListener('change', applyInvoiceFilter);
    els.filterCurrency?.addEventListener('change', applyInvoiceFilter);
    els.filterMonth?.addEventListener('change', applyInvoiceFilter);
    document.getElementById('basisAmount')?.addEventListener('input', updatePreview);
    document.getElementById('cutPercent')?.addEventListener('input', updatePreview);

    els.search?.addEventListener('input', (e) => { searchQuery = e.target.value; render(); });

    els.ledgerStatus?.addEventListener('change', (e) => { ledgerFilters.status = e.target.value || 'all'; render(); });
    els.ledgerCompany?.addEventListener('change', (e) => { ledgerFilters.company = e.target.value || 'all'; render(); });
    els.ledgerClient?.addEventListener('change', (e) => { ledgerFilters.client = e.target.value || 'all'; render(); });
    els.ledgerRecipient?.addEventListener('change', (e) => { ledgerFilters.recipient = e.target.value || 'all'; render(); });
    els.ledgerCurrency?.addEventListener('change', (e) => { ledgerFilters.currency = e.target.value || 'all'; render(); });
    els.ledgerMonth?.addEventListener('change', (e) => { ledgerFilters.month = e.target.value || 'all'; render(); });
    els.ledgerClear?.addEventListener('click', () => {
        Object.keys(ledgerFilters).forEach((k) => { ledgerFilters[k] = 'all'; });
        searchQuery = '';
        if (els.search) els.search.value = '';
        [els.ledgerStatus, els.ledgerCompany, els.ledgerClient, els.ledgerRecipient, els.ledgerCurrency, els.ledgerMonth]
            .forEach((s) => { if (s) s.value = ''; });
        render();
    });

    els.body?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
            const id = btn.dataset.id;
            if (btn.dataset.action === 'edit') openModal(id);
            if (btn.dataset.action === 'delete') openDeleteModal(id);
            if (btn.dataset.action === 'record-payment') openPaymentModal(id);
            return;
        }
        // Click a row to expand its partial-payment breakdown.
        const row = e.target.closest('tr.ref-payout-row.is-expandable');
        if (row) {
            const panel = document.getElementById(`payments-panel-${row.dataset.payoutId}`);
            if (panel) {
                const open = panel.style.display !== 'none';
                panel.style.display = open ? 'none' : 'table-row';
                row.classList.toggle('is-expanded', !open);
            }
        }
    });

    els.deleteCancelBtn?.addEventListener('click', closeDeleteModal);
    els.deleteConfirmBtn?.addEventListener('click', handleDelete);

    // Payment modal
    document.getElementById('closePaymentBtn')?.addEventListener('click', closePaymentModal);
    document.getElementById('closePaymentDoneBtn')?.addEventListener('click', closePaymentModal);
    document.getElementById('addPaymentBtn')?.addEventListener('click', handleAddPayment);
    els.paymentModal = document.getElementById('paymentModal');
    els.paymentModal?.addEventListener('click', (e) => { if (e.target === els.paymentModal) closePaymentModal(); });
    document.getElementById('paymentHistory')?.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-remove-payment]');
        if (rm) handleRemovePayment(rm.dataset.removePayment);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (els.modal?.classList.contains('is-open')) closeModal();
        if (els.paymentModal?.classList.contains('is-open')) closePaymentModal();
        if (els.deleteModal?.style.display === 'flex') closeDeleteModal();
    });
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function money(amount, currency) {
    return formatCurrency(Number(amount) || 0, currency || 'USD');
}
function byCurrencyStr(map = {}) {
    const entries = Object.entries(map);
    if (entries.length === 0) return money(0, 'USD');
    return entries.map(([c, a]) => money(a, c)).join(' · ');
}

// ── Summary + table ───────────────────────────────────────────────────────────
function summaryTile(label, value, sub) {
    return `
        <div class="summary-tile">
            <div class="summary-tile__label">${escapeHtml(label)}</div>
            <div class="summary-tile__value">${escapeHtml(value)}</div>
            <div class="summary-tile__sub">${escapeHtml(sub)}</div>
        </div>`;
}

function renderSummary(list = payouts) {
    const month = ledgerFilters.month !== 'all' ? ledgerFilters.month : '';
    const s = summarizePayouts(list, { month });
    const scope = month ? `in ${monthLabel(month)}` : '';
    els.summary.innerHTML = [
        summaryTile('To forward', byCurrencyStr(s.forwarded), `${list.length} payout${list.length === 1 ? '' : 's'}${scope ? ` ${scope}` : ''}`),
        summaryTile('My cut', byCurrencyStr(s.myCut), month ? scope : 'kept across payouts'),
        summaryTile('Paid to partners', byCurrencyStr(s.paid), month ? `forwarded ${scope}` : 'forwarded so far'),
        summaryTile('Outstanding', byCurrencyStr(s.outstanding.byCurrency), month ? `${s.outstanding.count} owing at month end` : `${s.outstanding.count} owing`)
    ].join('');
}

// ── Resolve a payout's client / month from its linked invoice ─────────────────
function payoutInvoice(p) {
    return (p.invoice_id && invoiceById.get(String(p.invoice_id)))
        || (p.invoice_number && invoiceByNumber.get(String(p.invoice_number)))
        || null;
}
function payoutClient(p) {
    return (payoutInvoice(p)?.client_info?.name || '').trim();
}
function payoutCompany(p) {
    return (payoutInvoice(p)?.business_info?.name || '').trim();
}

function populateLedgerFilters() {
    const companies = [...new Set(payouts.map(payoutCompany).filter(Boolean))].sort();
    const clients = [...new Set(payouts.map(payoutClient).filter(Boolean))].sort();
    const recipients = [...new Set(payouts.map((p) => (p.recipient || '').trim()).filter(Boolean))].sort();
    const currencies = [...new Set(payouts.map((p) => (p.currency || 'USD')))].sort();
    const months = [...new Set(payouts.flatMap(payoutPaidMonths))].sort().reverse();

    const fill = (sel, items, allLabel, labeler = (x) => x) => {
        if (!sel) return;
        const keep = sel.value;
        sel.innerHTML = `<option value="">${allLabel}</option>`
            + items.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(labeler(v))}</option>`).join('');
        if (keep && items.includes(keep)) sel.value = keep;
    };
    fill(els.ledgerCompany, companies, 'All companies');
    fill(els.ledgerClient, clients, 'All clients');
    fill(els.ledgerRecipient, recipients, 'All recipients');
    fill(els.ledgerCurrency, currencies, 'All currencies');
    fill(els.ledgerMonth, months, 'All months', monthLabel);
}

function getVisiblePayouts() {
    let list = filterPayouts(payouts, {
        query: searchQuery,
        status: ledgerFilters.status,
        currency: ledgerFilters.currency
    });
    if (ledgerFilters.company !== 'all') list = list.filter((p) => payoutCompany(p) === ledgerFilters.company);
    if (ledgerFilters.client !== 'all') list = list.filter((p) => payoutClient(p) === ledgerFilters.client);
    if (ledgerFilters.recipient !== 'all') list = list.filter((p) => (p.recipient || '').trim() === ledgerFilters.recipient);
    if (ledgerFilters.month !== 'all') list = list.filter((p) => payoutPaidMonths(p).includes(ledgerFilters.month));
    return list;
}

function render() {
    populateLedgerFilters();
    const visible = getVisiblePayouts();
    renderSummary(visible);

    if (visible.length === 0) {
        const msg = payouts.length === 0
            ? 'No referral payouts yet. Click "New Payout" to record one.'
            : 'No payouts match your filters.';
        els.body.innerHTML = `
            <tr><td colspan="8" class="table__empty">
                <div class="empty-state"><span class="empty-state__icon">🔁</span>
                <p class="empty-state__text">${escapeHtml(msg)}</p></div>
            </td></tr>`;
        return;
    }
    els.body.innerHTML = visible.map(renderRow).join('');
}

const STATUS_META = {
    paid: { label: 'Paid', cls: 'status-active' },
    partially_paid: { label: 'Partial', cls: 'status-partial' },
    pending: { label: 'Pending', cls: 'status-pending' }
};

function renderRow(p) {
    const status = derivePayoutStatus(p);
    const meta = STATUS_META[status] || STATUS_META.pending;
    const balance = payoutBalance(p);
    const dis = isReadOnly ? 'disabled' : '';
    const recordBtn = (balance > 0 && !isReadOnly)
        ? `<button class="btn btn--outline btn--sm" data-action="record-payment" data-id="${escapeHtml(p.id)}">Record payment</button>`
        : '';

    const payments = Array.isArray(p.payments) ? p.payments : [];
    const expandable = payments.length > 0;
    const chevron = expandable
        ? `<svg class="ref-chevron" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="13" height="13" style="color:#94a3b8;flex-shrink:0;transition:transform 0.2s ease;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>`
        : '';

    const mainRow = `
        <tr class="ref-payout-row${expandable ? ' is-expandable' : ''}" data-payout-id="${escapeHtml(p.id)}"${expandable ? ' style="cursor:pointer;"' : ''}>
            <td data-label="Invoice"><span style="display:inline-flex;align-items:center;gap:0.4rem;">${chevron}${escapeHtml(p.invoice_number || '—')}</span></td>
            <td data-label="Recipient"><strong>${escapeHtml(p.recipient || '—')}</strong></td>
            <td data-label="Forwarded"><strong>${escapeHtml(money(p.pass_through_amount, p.currency))}</strong></td>
            <td data-label="My cut">${escapeHtml(money(p.my_cut, p.currency))} <span style="color:var(--text-tertiary);font-size:0.75rem;">(${escapeHtml(String(p.cut_percent ?? 0))}%)</span></td>
            <td data-label="Paid">${escapeHtml(money(payoutAmountPaid(p), p.currency))}${expandable ? ` <span style="color:var(--text-tertiary);font-size:0.72rem;">· ${payments.length} payment${payments.length === 1 ? '' : 's'}</span>` : ''}</td>
            <td data-label="Balance">${escapeHtml(money(balance, p.currency))}</td>
            <td data-label="Status"><span class="status-badge ${meta.cls}">${meta.label}</span></td>
            <td data-label="Actions">
                ${recordBtn}
                <button class="btn btn--outline btn--sm" data-action="edit" data-id="${escapeHtml(p.id)}" ${dis}>Edit</button>
                <button class="btn btn--ghost btn--sm" data-action="delete" data-id="${escapeHtml(p.id)}" ${dis}>Delete</button>
            </td>
        </tr>`;

    if (!expandable) return mainRow;

    const rows = payments.map((pay) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;font-size:0.8125rem;padding:0.3rem 0;border-bottom:1px solid var(--surface-border-subtle);">
            <span style="color:var(--text-secondary);">${escapeHtml(pay.date || '—')}${pay.note ? ` · ${escapeHtml(pay.note)}` : ''}</span>
            <strong>${escapeHtml(money(pay.amount, p.currency))}</strong>
        </div>`).join('');

    const panel = `
        <tr id="payments-panel-${escapeHtml(p.id)}" class="ref-payments-panel" style="display:none;">
            <td colspan="8" style="background:var(--surface-hover);padding:0.75rem 1.25rem;">
                <div style="font-weight:600;font-size:0.72rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.03em;margin-bottom:0.4rem;">Partial payments</div>
                ${rows}
            </td>
        </tr>`;

    return mainRow + panel;
}

// ── Invoice picker ────────────────────────────────────────────────────────────
function invoiceCompany(inv) {
    return (inv.business_info?.name || '').trim();
}
function invoiceMonthKey(inv) {
    return String(inv.invoice_meta?.dateRaw || inv.created_at || '').slice(0, 7); // YYYY-MM
}
function monthLabel(key) {
    const [y, m] = key.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function populateInvoiceFilters() {
    if (!els.filterCompany) return;
    const companies = [...new Set(invoices.map(invoiceCompany).filter(Boolean))].sort();
    const currencies = [...new Set(invoices.map((i) => i.invoice_meta?.currency || 'USD'))].sort();
    const months = [...new Set(invoices.map(invoiceMonthKey).filter((k) => k.length === 7))].sort().reverse();

    els.filterCompany.innerHTML = '<option value="">All companies</option>'
        + companies.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    els.filterCurrency.innerHTML = '<option value="">All currencies</option>'
        + currencies.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    els.filterMonth.innerHTML = '<option value="">All months</option>'
        + months.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(monthLabel(m))}</option>`).join('');
}

function applyInvoiceFilter() {
    const company = els.filterCompany?.value || '';
    const currency = els.filterCurrency?.value || '';
    const month = els.filterMonth?.value || '';
    const filtered = invoices.filter((inv) => {
        if (company && invoiceCompany(inv) !== company) return false;
        if (currency && (inv.invoice_meta?.currency || 'USD') !== currency) return false;
        if (month && invoiceMonthKey(inv) !== month) return false;
        return true;
    });
    populateInvoiceSelect(filtered);
}

// Invoices that already have a referral payout (so we don't double-create).
function usedInvoiceKeys() {
    const set = new Set();
    payouts.forEach((p) => {
        if (p.invoice_id) set.add(`id:${p.invoice_id}`);
        if (p.invoice_number) set.add(`num:${p.invoice_number}`);
    });
    return set;
}

function populateInvoiceSelect(list = invoices) {
    if (!els.invoiceSelect) return;
    const current = els.invoiceSelect.value;
    const used = usedInvoiceKeys();
    const selectable = list.filter((inv) => {
        if (String(inv.id) === String(editingInvoiceId)) return true; // keep the edited payout's invoice
        if (used.has(`id:${inv.id}`)) return false;
        if (inv.invoice_number && used.has(`num:${inv.invoice_number}`)) return false;
        return true;
    });

    els.invoiceSelect.innerHTML = '<option value="">Select an invoice (optional)…</option>';
    selectable.forEach((inv) => {
        const nativeCur = inv.invoice_meta?.currency || 'USD';
        const usd = referralBasis(inv);
        const native = nativeCur !== 'USD' ? ` (${money(receivedAmount(inv), nativeCur)})` : '';
        const opt = document.createElement('option');
        opt.value = inv.id;
        opt.textContent = `${inv.invoice_number || 'Invoice'} · ${money(usd, 'USD')} USD${native} · ${inv.client_info?.name || ''}`.trim();
        els.invoiceSelect.appendChild(opt);
    });
    if (current && [...els.invoiceSelect.options].some((o) => o.value === current)) {
        els.invoiceSelect.value = current;
    }
}

function onInvoicePicked() {
    const inv = invoices.find((i) => String(i.id) === String(els.invoiceSelect.value));
    if (!inv) return;
    document.getElementById('invoiceId').value = inv.id;
    document.getElementById('invoiceNumber').value = inv.invoice_number || '';
    // Referrals are always settled in USD, on the amount actually received.
    document.getElementById('currency').value = 'USD';
    document.getElementById('basisAmount').value = referralBasis(inv);
    updatePreview();
}

function updatePreview() {
    const basis = Number(document.getElementById('basisAmount').value) || 0;
    const pct = Number(document.getElementById('cutPercent').value) || 0;
    const currency = document.getElementById('currency').value;
    const { myCut, passThrough } = computePayout(basis, pct);
    document.getElementById('previewMyCut').textContent = money(myCut, currency);
    document.getElementById('previewPassThrough').textContent = money(passThrough, currency);
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function openModal(id = null) {
    if (isReadOnly) { showToast(getReadOnlyMessage('referrals'), 'info'); return; }

    const p = id ? payouts.find((x) => x.id === id) : null;
    editingInvoiceId = p?.invoice_id || '';

    els.form.reset();
    document.getElementById('payoutId').value = '';
    document.getElementById('invoiceId').value = '';
    applyInvoiceFilter(); // filters were reset by form.reset() — rebuild the (exclusion-aware) list

    if (p) {
        els.modalTitle.textContent = 'Edit Referral Payout';
        document.getElementById('payoutId').value = p.id;
        document.getElementById('invoiceId').value = p.invoice_id || '';
        document.getElementById('invoiceNumber').value = p.invoice_number || '';
        document.getElementById('currency').value = p.currency || 'USD';
        document.getElementById('recipient').value = p.recipient || '';
        document.getElementById('basisAmount').value = p.basis_amount ?? 0;
        document.getElementById('cutPercent').value = p.cut_percent ?? 0;
        document.getElementById('notes').value = p.notes || '';
        if (p.invoice_id) els.invoiceSelect.value = p.invoice_id;
    } else {
        els.modalTitle.textContent = 'New Referral Payout';
        document.getElementById('cutPercent').value = '15';
    }

    updatePreview();
    els.modal.classList.add('is-open');
    document.body.classList.add('modal-open');
    document.getElementById('recipient').focus();
}

function closeModal() {
    els.modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
}

async function handleSave(event) {
    event.preventDefault();
    if (isReadOnly) return;

    const recipient = document.getElementById('recipient').value.trim();
    const basis = Number(document.getElementById('basisAmount').value) || 0;
    const recipientError = document.getElementById('recipientError');
    const basisError = document.getElementById('basisError');
    recipientError.textContent = '';
    basisError.textContent = '';

    if (!recipient) { recipientError.textContent = 'Recipient is required.'; return; }
    if (basis <= 0) { basisError.textContent = 'Amount received must be greater than zero.'; return; }

    const cutPercent = Number(document.getElementById('cutPercent').value) || 0;
    const { myCut, passThrough } = computePayout(basis, cutPercent);

    const id = document.getElementById('payoutId').value;
    const existing = id ? payouts.find((x) => x.id === id) : null;
    // Status is derived from what's already been paid to the partner.
    const amountPaid = existing ? payoutAmountPaid(existing) : 0;
    const status = derivePayoutStatus({ pass_through_amount: passThrough, amount_paid: amountPaid });

    const payload = {
        invoice_id: document.getElementById('invoiceId').value || null,
        invoice_number: document.getElementById('invoiceNumber').value.trim() || null,
        recipient,
        currency: document.getElementById('currency').value || 'USD',
        basis_amount: basis,
        cut_percent: cutPercent,
        my_cut: myCut,
        pass_through_amount: passThrough,
        status,
        paid_date: status === 'paid' ? (existing?.paid_date || new Date().toISOString().slice(0, 10)) : null,
        notes: document.getElementById('notes').value.trim() || null
    };

    if (id) payload.id = id;

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
        const saved = await dbSaveReferralPayout(payload);
        if (id) {
            payouts = payouts.map((x) => (x.id === id ? saved : x));
        } else {
            payouts.unshift(saved);
        }
        render();
        closeModal();
        showToast(id ? 'Payout updated ✓' : 'Payout recorded ✓', 'success');
    } catch (err) {
        console.error('Save payout failed', err);
        showToast(err.message || 'Could not save payout', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Payout';
    }
}

// ── Partial payments ──────────────────────────────────────────────────────────
function openPaymentModal(id) {
    if (isReadOnly) { showToast(getReadOnlyMessage('referrals'), 'info'); return; }
    const p = payouts.find((x) => x.id === id);
    if (!p) return;
    currentPaymentPayout = { ...p, payments: Array.isArray(p.payments) ? [...p.payments] : [] };
    document.getElementById('paymentPayoutId').value = p.id;
    document.getElementById('paymentModalSubtitle').textContent = `Installment forwarded to ${p.recipient || 'the partner'}.`;
    document.getElementById('payDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('payNote').value = '';
    renderPaymentModalState();
    els.paymentModal.classList.add('is-open');
    document.body.classList.add('modal-open');
}

function closePaymentModal() {
    currentPaymentPayout = null;
    els.paymentModal?.classList.remove('is-open');
    document.body.classList.remove('modal-open');
}

function renderPaymentModalState() {
    const p = currentPaymentPayout;
    if (!p) return;
    const balance = payoutBalance(p);
    document.getElementById('payForwarded').textContent = money(p.pass_through_amount, p.currency);
    document.getElementById('payPaid').textContent = money(payoutAmountPaid(p), p.currency);
    document.getElementById('payBalance').textContent = money(balance, p.currency);
    document.getElementById('payAmount').value = balance > 0 ? balance : 0;

    const history = document.getElementById('paymentHistory');
    const payments = p.payments || [];
    if (payments.length === 0) {
        history.innerHTML = `<div style="color:var(--text-tertiary);font-size:0.8125rem;">No payments yet.</div>`;
        return;
    }
    history.innerHTML = payments.map((pay) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.5rem 0.75rem;border:1px solid var(--surface-glass-border);border-radius:var(--radius-sm);">
            <div>
                <strong>${escapeHtml(money(pay.amount, p.currency))}</strong>
                <span style="color:var(--text-tertiary);font-size:0.78rem;"> · ${escapeHtml(pay.date || '')}${pay.note ? ` · ${escapeHtml(pay.note)}` : ''}</span>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" data-remove-payment="${escapeHtml(pay.id)}" ${isReadOnly ? 'disabled' : ''}>Remove</button>
        </div>`).join('');
}

async function persistPaymentChange(payments) {
    const p = currentPaymentPayout;
    const amount_paid = paymentsTotal(payments);
    const status = derivePayoutStatus({ ...p, amount_paid });
    const lastDate = payments.length ? payments[payments.length - 1].date : null;
    const paid_date = status === 'paid' ? (lastDate || new Date().toISOString().slice(0, 10)) : null;

    const saved = await dbSaveReferralPayout({ ...p, payments, amount_paid, status, paid_date });
    payouts = payouts.map((x) => (x.id === saved.id ? saved : x));
    currentPaymentPayout = { ...saved, payments: Array.isArray(saved.payments) ? [...saved.payments] : [] };
    renderPaymentModalState();
    render();
    return saved;
}

async function handleAddPayment() {
    if (!currentPaymentPayout) return;
    const amountEl = document.getElementById('payAmount');
    const errEl = document.getElementById('payAmountError');
    errEl.textContent = '';
    const amount = Number(amountEl.value) || 0;
    if (amount <= 0) { errEl.textContent = 'Enter an amount greater than zero.'; return; }

    const payment = {
        id: Math.random().toString(36).substring(2, 11),
        date: document.getElementById('payDate').value || new Date().toISOString().slice(0, 10),
        amount,
        note: document.getElementById('payNote').value.trim()
    };
    const payments = [...(currentPaymentPayout.payments || []), payment];

    const btn = document.getElementById('addPaymentBtn');
    btn.disabled = true;
    try {
        await persistPaymentChange(payments);
        document.getElementById('payNote').value = '';
        showToast('Payment recorded ✓', 'success');
    } catch (err) {
        console.error('Add payment failed', err);
        showToast(err.message || 'Could not record payment', 'error');
    } finally {
        btn.disabled = false;
    }
}

async function handleRemovePayment(paymentId) {
    if (!currentPaymentPayout || isReadOnly) return;
    const payments = (currentPaymentPayout.payments || []).filter((p) => String(p.id) !== String(paymentId));
    try {
        await persistPaymentChange(payments);
        showToast('Payment removed', 'success');
    } catch (err) {
        console.error('Remove payment failed', err);
        showToast(err.message || 'Could not remove payment', 'error');
    }
}

// ── Delete ──────────────────────────────────────────────────────────────────
function openDeleteModal(id) {
    if (isReadOnly) { showToast(getReadOnlyMessage('referrals'), 'info'); return; }
    const p = payouts.find((x) => x.id === id);
    if (!p) return;
    payoutToDelete = p;
    els.deleteName.textContent = p.recipient || 'this recipient';
    els.deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    payoutToDelete = null;
    els.deleteModal.style.display = 'none';
}

async function handleDelete() {
    if (!payoutToDelete) return;
    const id = payoutToDelete.id;
    els.deleteConfirmBtn.disabled = true;
    els.deleteConfirmBtn.textContent = 'Deleting…';
    try {
        await dbDeleteReferralPayout(id);
        payouts = payouts.filter((x) => x.id !== id);
        render();
        closeDeleteModal();
        showToast('Payout deleted', 'success');
    } catch (err) {
        console.error('Delete payout failed', err);
        showToast(err.message || 'Could not delete payout', 'error');
    } finally {
        els.deleteConfirmBtn.disabled = false;
        els.deleteConfirmBtn.textContent = 'Delete';
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
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
