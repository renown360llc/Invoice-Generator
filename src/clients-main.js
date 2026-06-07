/**
 * Clients Page — Main Script
 * Standalone client registry: list, search, add/edit/delete.
 */

import { loadLayout } from './components/layout.js';
import { getCurrentUser } from './config.js';
import { dbGetClients, dbSaveClient, dbDeleteClient } from './modules/db-clients.js';
import { filterClients, sortClientsByName } from './modules/clients.js';
import { isValidEmail } from './modules/invoice-email.js';
import { getAccessContext, getReadOnlyMessage } from './modules/access-control.js';
import { escapeHtml } from './utils.js';

let clients = [];
let searchQuery = '';
let clientToDelete = null;
let isReadOnly = false;

const els = {};

document.addEventListener('DOMContentLoaded', () => {
    init().catch((err) => {
        console.error('[clients] Fatal init error:', err);
        showToast(err.message || 'Failed to load clients', 'error');
    });
});

async function init() {
    await loadLayout('clients');

    els.body = document.getElementById('clientsBody');
    els.search = document.getElementById('searchInput');
    els.addBtn = document.getElementById('addClientBtn');
    els.modal = document.getElementById('clientModal');
    els.form = document.getElementById('clientForm');
    els.closeBtn = document.getElementById('closeModalBtn');
    els.cancelBtn = document.getElementById('cancelBtn');
    els.modalTitle = document.getElementById('modalTitle');
    els.deleteModal = document.getElementById('deleteClientModal');
    els.deleteName = document.getElementById('deleteClientName');
    els.deleteCancelBtn = document.getElementById('deleteCancelBtn');
    els.deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

    const user = await getCurrentUser();
    if (!user) return;

    const access = await getAccessContext(user);
    isReadOnly = access.isReadOnly;
    if (isReadOnly) els.addBtn?.setAttribute('disabled', 'true');

    bindEvents();

    clients = await dbGetClients();
    render();
}

function bindEvents() {
    els.addBtn?.addEventListener('click', () => openModal());
    els.closeBtn?.addEventListener('click', closeModal);
    els.cancelBtn?.addEventListener('click', closeModal);
    els.modal?.addEventListener('click', (e) => {
        if (e.target === els.modal) closeModal();
    });
    els.form?.addEventListener('submit', handleSave);

    els.search?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
    });

    els.body?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === 'edit') openModal(id);
        if (btn.dataset.action === 'delete') openDeleteModal(id);
    });

    els.deleteCancelBtn?.addEventListener('click', closeDeleteModal);
    els.deleteConfirmBtn?.addEventListener('click', handleDelete);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (els.modal?.classList.contains('is-open')) closeModal();
        if (els.deleteModal?.style.display === 'flex') closeDeleteModal();
    });
}

// ── Rendering ───────────────────────────────────────────────────────────────
function render() {
    const visible = sortClientsByName(filterClients(clients, searchQuery));

    if (visible.length === 0) {
        const message = clients.length === 0
            ? 'No clients yet. Click "New Client" to add your first.'
            : 'No clients match your search.';
        els.body.innerHTML = `
            <tr>
                <td colspan="6" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">🏢</span>
                        <p class="empty-state__text">${escapeHtml(message)}</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    els.body.innerHTML = visible.map(renderRow).join('');
}

function renderRow(client) {
    const status = client.status === 'inactive' ? 'inactive' : 'active';
    const statusLabel = status === 'inactive' ? 'Inactive' : 'Active';
    const actionsDisabled = isReadOnly ? 'disabled' : '';

    return `
        <tr>
            <td data-label="Name"><strong>${escapeHtml(client.name || '—')}</strong></td>
            <td data-label="Company">${escapeHtml(client.company || '—')}</td>
            <td data-label="Email">${escapeHtml(client.email || '—')}</td>
            <td data-label="Phone">${escapeHtml(client.phone || '—')}</td>
            <td data-label="Status"><span class="status-badge status-${status}">${statusLabel}</span></td>
            <td data-label="Actions">
                <button class="btn btn--outline btn--sm" data-action="edit" data-id="${escapeHtml(client.id)}" ${actionsDisabled}>Edit</button>
                <button class="btn btn--ghost btn--sm" data-action="delete" data-id="${escapeHtml(client.id)}" ${actionsDisabled}>Delete</button>
            </td>
        </tr>`;
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function openModal(id = null) {
    if (isReadOnly) {
        showToast(getReadOnlyMessage('clients'), 'info');
        return;
    }

    els.form.reset();
    document.getElementById('clientId').value = '';

    const client = id ? clients.find((c) => c.id === id) : null;
    if (client) {
        els.modalTitle.textContent = 'Edit Client';
        document.getElementById('clientId').value = client.id;
        document.getElementById('name').value = client.name || '';
        document.getElementById('company').value = client.company || '';
        document.getElementById('email').value = client.email || '';
        document.getElementById('phone').value = client.phone || '';
        document.getElementById('address').value = client.address || '';
        document.getElementById('notes').value = client.notes || '';
        document.getElementById('status').value = client.status || 'active';
    } else {
        els.modalTitle.textContent = 'Add New Client';
    }

    els.modal.classList.add('is-open');
    document.body.classList.add('modal-open');
    document.getElementById('name').focus();
}

function closeModal() {
    els.modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
}

async function handleSave(event) {
    event.preventDefault();
    if (isReadOnly) return;

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const nameError = document.getElementById('nameError');
    const emailError = document.getElementById('emailError');
    nameError.textContent = '';
    emailError.textContent = '';

    if (!name) {
        nameError.textContent = 'Client name is required.';
        return;
    }
    if (email && !isValidEmail(email)) {
        emailError.textContent = 'Enter a valid email address.';
        return;
    }

    const payload = {
        name,
        company: document.getElementById('company').value.trim() || null,
        email: email || null,
        phone: document.getElementById('phone').value.trim() || null,
        address: document.getElementById('address').value.trim() || null,
        notes: document.getElementById('notes').value.trim() || null,
        status: document.getElementById('status').value || 'active'
    };

    const id = document.getElementById('clientId').value;
    if (id) payload.id = id;

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        const saved = await dbSaveClient(payload);
        if (id) {
            clients = clients.map((c) => (c.id === id ? saved : c));
        } else {
            clients.push(saved);
        }
        render();
        closeModal();
        showToast(id ? 'Client updated ✓' : 'Client added ✓', 'success');
    } catch (err) {
        console.error('Save client failed', err);
        showToast(err.message || 'Could not save client', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Client';
    }
}

// ── Delete ──────────────────────────────────────────────────────────────────
function openDeleteModal(id) {
    if (isReadOnly) {
        showToast(getReadOnlyMessage('clients'), 'info');
        return;
    }
    const client = clients.find((c) => c.id === id);
    if (!client) return;
    clientToDelete = client;
    els.deleteName.textContent = client.name || 'this client';
    els.deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    clientToDelete = null;
    els.deleteModal.style.display = 'none';
}

async function handleDelete() {
    if (!clientToDelete) return;
    const id = clientToDelete.id;

    els.deleteConfirmBtn.disabled = true;
    els.deleteConfirmBtn.textContent = 'Deleting…';

    try {
        await dbDeleteClient(id);
        clients = clients.filter((c) => c.id !== id);
        render();
        closeDeleteModal();
        showToast('Client deleted', 'success');
    } catch (err) {
        console.error('Delete client failed', err);
        showToast(err.message || 'Could not delete client', 'error');
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
