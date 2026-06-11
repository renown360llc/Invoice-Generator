/**
 * Referrals Page — Main Script
 * Pass-through payout ledger: record your cut, what was forwarded to the
 * referral partner, and track pending vs paid.
 */

import { loadLayout } from './components/layout.js';
import { getCurrentUser } from './config.js';
import { getInvoices } from './database.js';
import { dbGetReferralPayouts, dbSaveReferralPayout, dbDeleteReferralPayout } from './modules/db-referrals.js';
import { computePayout, receivedAmount, summarizePayouts, filterPayouts } from './modules/referrals.js';
import { getAccessContext, getReadOnlyMessage } from './modules/access-control.js';
import { formatCurrency } from './modules/utils.js';
import { escapeHtml } from './utils.js';

let payouts = [];
let invoices = [];
let searchQuery = '';
let payoutToDelete = null;
let isReadOnly = false;

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
    els.statusSel = document.getElementById('status');
    els.paidDateField = document.getElementById('paidDateField');
    els.deleteModal = document.getElementById('deletePayoutModal');
    els.deleteName = document.getElementById('deletePayoutName');
    els.deleteCancelBtn = document.getElementById('deleteCancelBtn');
    els.deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

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
    populateInvoiceSelect();
    render();
}

function bindEvents() {
    els.addBtn?.addEventListener('click', () => openModal());
    els.closeBtn?.addEventListener('click', closeModal);
    els.cancelBtn?.addEventListener('click', closeModal);
    els.modal?.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
    els.form?.addEventListener('submit', handleSave);

    els.invoiceSelect?.addEventListener('change', onInvoicePicked);
    document.getElementById('basisAmount')?.addEventListener('input', updatePreview);
    document.getElementById('cutPercent')?.addEventListener('input', updatePreview);
    els.statusSel?.addEventListener('change', () => {
        els.paidDateField.style.display = els.statusSel.value === 'paid' ? 'flex' : 'none';
    });

    els.search?.addEventListener('input', (e) => { searchQuery = e.target.value; render(); });

    els.body?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === 'edit') openModal(id);
        if (btn.dataset.action === 'delete') openDeleteModal(id);
        if (btn.dataset.action === 'mark-paid') markPaid(id);
    });

    els.deleteCancelBtn?.addEventListener('click', closeDeleteModal);
    els.deleteConfirmBtn?.addEventListener('click', handleDelete);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (els.modal?.classList.contains('is-open')) closeModal();
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

function renderSummary() {
    const s = summarizePayouts(payouts);
    els.summary.innerHTML = [
        summaryTile('Passed through', byCurrencyStr(s.passThrough), `${payouts.length} payout${payouts.length === 1 ? '' : 's'}`),
        summaryTile('My cut (total)', byCurrencyStr(s.myCut), 'kept across payouts'),
        summaryTile('Pending', byCurrencyStr(s.pending.byCurrency), `${s.pending.count} to pay`),
        summaryTile('Paid so far', byCurrencyStr(s.paid.byCurrency), `${s.paid.count} paid`)
    ].join('');
}

function render() {
    renderSummary();

    const visible = filterPayouts(payouts, searchQuery);
    if (visible.length === 0) {
        const msg = payouts.length === 0
            ? 'No referral payouts yet. Click "New Payout" to record one.'
            : 'No payouts match your search.';
        els.body.innerHTML = `
            <tr><td colspan="8" class="table__empty">
                <div class="empty-state"><span class="empty-state__icon">🔁</span>
                <p class="empty-state__text">${escapeHtml(msg)}</p></div>
            </td></tr>`;
        return;
    }
    els.body.innerHTML = visible.map(renderRow).join('');
}

function renderRow(p) {
    const status = String(p.status || 'pending').toLowerCase();
    const statusLabel = status === 'paid' ? 'Paid' : 'Pending';
    const statusCls = status === 'paid' ? 'status-active' : 'status-pending';
    const dis = isReadOnly ? 'disabled' : '';
    const markPaidBtn = (status !== 'paid' && !isReadOnly)
        ? `<button class="btn btn--outline btn--sm" data-action="mark-paid" data-id="${escapeHtml(p.id)}">Mark paid</button>`
        : '';

    return `
        <tr>
            <td data-label="Invoice">${escapeHtml(p.invoice_number || '—')}</td>
            <td data-label="Recipient"><strong>${escapeHtml(p.recipient || '—')}</strong></td>
            <td data-label="Amount received">${escapeHtml(money(p.basis_amount, p.currency))}</td>
            <td data-label="My cut">${escapeHtml(money(p.my_cut, p.currency))} <span style="color:var(--text-tertiary);font-size:0.75rem;">(${escapeHtml(String(p.cut_percent ?? 0))}%)</span></td>
            <td data-label="Passed through"><strong>${escapeHtml(money(p.pass_through_amount, p.currency))}</strong></td>
            <td data-label="Status"><span class="status-badge ${statusCls}">${statusLabel}</span></td>
            <td data-label="Paid date">${escapeHtml(p.paid_date || '—')}</td>
            <td data-label="Actions">
                ${markPaidBtn}
                <button class="btn btn--outline btn--sm" data-action="edit" data-id="${escapeHtml(p.id)}" ${dis}>Edit</button>
                <button class="btn btn--ghost btn--sm" data-action="delete" data-id="${escapeHtml(p.id)}" ${dis}>Delete</button>
            </td>
        </tr>`;
}

// ── Invoice picker ────────────────────────────────────────────────────────────
function populateInvoiceSelect() {
    if (!els.invoiceSelect) return;
    els.invoiceSelect.innerHTML = '<option value="">Select an invoice (optional)…</option>';
    invoices.forEach((inv) => {
        const currency = inv.invoice_meta?.currency || 'USD';
        const recv = receivedAmount(inv);
        const opt = document.createElement('option');
        opt.value = inv.id;
        opt.textContent = `${inv.invoice_number || 'Invoice'} · ${money(recv, currency)} · ${inv.client_info?.name || ''}`.trim();
        els.invoiceSelect.appendChild(opt);
    });
}

function onInvoicePicked() {
    const inv = invoices.find((i) => String(i.id) === String(els.invoiceSelect.value));
    if (!inv) return;
    document.getElementById('invoiceId').value = inv.id;
    document.getElementById('invoiceNumber').value = inv.invoice_number || '';
    document.getElementById('currency').value = inv.invoice_meta?.currency || 'USD';
    document.getElementById('basisAmount').value = receivedAmount(inv);
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

    els.form.reset();
    document.getElementById('payoutId').value = '';
    document.getElementById('invoiceId').value = '';
    els.paidDateField.style.display = 'none';

    const p = id ? payouts.find((x) => x.id === id) : null;
    if (p) {
        els.modalTitle.textContent = 'Edit Referral Payout';
        document.getElementById('payoutId').value = p.id;
        document.getElementById('invoiceId').value = p.invoice_id || '';
        document.getElementById('invoiceNumber').value = p.invoice_number || '';
        document.getElementById('currency').value = p.currency || 'USD';
        document.getElementById('recipient').value = p.recipient || '';
        document.getElementById('basisAmount').value = p.basis_amount ?? 0;
        document.getElementById('cutPercent').value = p.cut_percent ?? 0;
        els.statusSel.value = p.status || 'pending';
        document.getElementById('paidDate').value = p.paid_date || '';
        document.getElementById('notes').value = p.notes || '';
        if (p.invoice_id) els.invoiceSelect.value = p.invoice_id;
        els.paidDateField.style.display = els.statusSel.value === 'paid' ? 'flex' : 'none';
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
    const status = els.statusSel.value || 'pending';

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
        paid_date: status === 'paid' ? (document.getElementById('paidDate').value || new Date().toISOString().slice(0, 10)) : null,
        notes: document.getElementById('notes').value.trim() || null
    };

    const id = document.getElementById('payoutId').value;
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

async function markPaid(id) {
    const p = payouts.find((x) => x.id === id);
    if (!p) return;
    try {
        const saved = await dbSaveReferralPayout({
            ...p,
            status: 'paid',
            paid_date: p.paid_date || new Date().toISOString().slice(0, 10)
        });
        payouts = payouts.map((x) => (x.id === id ? saved : x));
        render();
        showToast('Marked as paid ✓', 'success');
    } catch (err) {
        console.error('Mark paid failed', err);
        showToast(err.message || 'Could not update payout', 'error');
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
