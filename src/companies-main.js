/**
 * Companies Page — Main Script
 * "Bill From" sender registry: list, search, add/edit/delete, with branding
 * and invoice defaults (logo, brand color, currency, tax rate, payment terms).
 */

import { loadLayout } from './components/layout.js';
import { getCurrentUser } from './config.js';
import { dbGetCompanies, dbSaveCompany, dbDeleteCompany } from './modules/db-companies.js';
import { filterCompanies, sortCompaniesByName } from './modules/companies.js';
import { isValidEmail } from './modules/invoice-email.js';
import { getAccessContext, getReadOnlyMessage } from './modules/access-control.js';
import { escapeHtml } from './utils.js';

let companies = [];
let searchQuery = '';
let companyToDelete = null;
let isReadOnly = false;
let currentLogo = null; // base64 of the logo being edited

const els = {};

document.addEventListener('DOMContentLoaded', () => {
    init().catch((err) => {
        console.error('[companies] Fatal init error:', err);
        showToast(err.message || 'Failed to load companies', 'error');
    });
});

async function init() {
    await loadLayout('companies');

    els.body = document.getElementById('companiesBody');
    els.search = document.getElementById('searchInput');
    els.addBtn = document.getElementById('addCompanyBtn');
    els.modal = document.getElementById('companyModal');
    els.form = document.getElementById('companyForm');
    els.closeBtn = document.getElementById('closeModalBtn');
    els.cancelBtn = document.getElementById('cancelBtn');
    els.modalTitle = document.getElementById('modalTitle');
    els.logoUpload = document.getElementById('logoUpload');
    els.logoPreview = document.getElementById('logoPreview');
    els.deleteModal = document.getElementById('deleteCompanyModal');
    els.deleteName = document.getElementById('deleteCompanyName');
    els.deleteCancelBtn = document.getElementById('deleteCancelBtn');
    els.deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

    const user = await getCurrentUser();
    if (!user) return;

    const access = await getAccessContext(user);
    isReadOnly = access.isReadOnly;
    if (isReadOnly) els.addBtn?.setAttribute('disabled', 'true');

    bindEvents();

    companies = await dbGetCompanies();
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
    els.logoUpload?.addEventListener('change', handleLogoUpload);

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
    const visible = sortCompaniesByName(filterCompanies(companies, searchQuery));

    if (visible.length === 0) {
        const message = companies.length === 0
            ? 'No companies yet. Click "New Company" to add your first.'
            : 'No companies match your search.';
        els.body.innerHTML = `
            <tr>
                <td colspan="6" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">🏛️</span>
                        <p class="empty-state__text">${escapeHtml(message)}</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    els.body.innerHTML = visible.map(renderRow).join('');
}

function renderRow(company) {
    const status = company.status === 'inactive' ? 'inactive' : 'active';
    const statusLabel = status === 'inactive' ? 'Inactive' : 'Active';
    const actionsDisabled = isReadOnly ? 'disabled' : '';
    const logoCell = company.logo
        ? `<img class="company-logo-thumb" src="${escapeHtml(company.logo)}" alt="">`
        : '—';

    return `
        <tr>
            <td data-label="Logo">${logoCell}</td>
            <td data-label="Name"><strong>${escapeHtml(company.name || '—')}</strong></td>
            <td data-label="Email">${escapeHtml(company.email || '—')}</td>
            <td data-label="Currency">${escapeHtml(company.currency || 'USD')}</td>
            <td data-label="Status"><span class="status-badge status-${status}">${statusLabel}</span></td>
            <td data-label="Actions">
                <button class="btn btn--outline btn--sm" data-action="edit" data-id="${escapeHtml(company.id)}" ${actionsDisabled}>Edit</button>
                <button class="btn btn--ghost btn--sm" data-action="delete" data-id="${escapeHtml(company.id)}" ${actionsDisabled}>Delete</button>
            </td>
        </tr>`;
}

// ── Logo upload ────────────────────────────────────────────────────────────────
function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        currentLogo = e.target.result;
        renderLogoPreview();
    };
    reader.readAsDataURL(file);
}

function renderLogoPreview() {
    if (currentLogo) {
        els.logoPreview.innerHTML = `<img src="${escapeHtml(currentLogo)}" alt="">`;
    } else {
        els.logoPreview.innerHTML = '<span>No logo</span>';
    }
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function openModal(id = null) {
    if (isReadOnly) {
        showToast(getReadOnlyMessage('companies'), 'info');
        return;
    }

    els.form.reset();
    document.getElementById('companyId').value = '';
    currentLogo = null;

    const company = id ? companies.find((c) => c.id === id) : null;
    if (company) {
        els.modalTitle.textContent = 'Edit Company';
        document.getElementById('companyId').value = company.id;
        document.getElementById('name').value = company.name || '';
        document.getElementById('email').value = company.email || '';
        document.getElementById('phone').value = company.phone || '';
        document.getElementById('address').value = company.address || '';
        document.getElementById('brandColor').value = company.brand_color || '#000000';
        document.getElementById('status').value = company.status || 'active';
        document.getElementById('currency').value = company.currency || 'USD';
        document.getElementById('taxRate').value = company.tax_rate ?? 0;
        document.getElementById('paymentInstructions').value = company.payment_instructions || '';
        currentLogo = company.logo || null;
    } else {
        els.modalTitle.textContent = 'Add New Company';
    }

    renderLogoPreview();
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
        nameError.textContent = 'Company name is required.';
        return;
    }
    if (email && !isValidEmail(email)) {
        emailError.textContent = 'Enter a valid email address.';
        return;
    }

    const payload = {
        name,
        email: email || null,
        phone: document.getElementById('phone').value.trim() || null,
        address: document.getElementById('address').value.trim() || null,
        logo: currentLogo || null,
        brand_color: document.getElementById('brandColor').value || '#000000',
        currency: document.getElementById('currency').value || 'USD',
        tax_rate: Number(document.getElementById('taxRate').value) || 0,
        payment_instructions: document.getElementById('paymentInstructions').value.trim() || null,
        status: document.getElementById('status').value || 'active'
    };

    const id = document.getElementById('companyId').value;
    if (id) payload.id = id;

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        const saved = await dbSaveCompany(payload);
        if (id) {
            companies = companies.map((c) => (c.id === id ? saved : c));
        } else {
            companies.push(saved);
        }
        render();
        closeModal();
        showToast(id ? 'Company updated ✓' : 'Company added ✓', 'success');
    } catch (err) {
        console.error('Save company failed', err);
        showToast(err.message || 'Could not save company', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Company';
    }
}

// ── Delete ──────────────────────────────────────────────────────────────────
function openDeleteModal(id) {
    if (isReadOnly) {
        showToast(getReadOnlyMessage('companies'), 'info');
        return;
    }
    const company = companies.find((c) => c.id === id);
    if (!company) return;
    companyToDelete = company;
    els.deleteName.textContent = company.name || 'this company';
    els.deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    companyToDelete = null;
    els.deleteModal.style.display = 'none';
}

async function handleDelete() {
    if (!companyToDelete) return;
    const id = companyToDelete.id;

    els.deleteConfirmBtn.disabled = true;
    els.deleteConfirmBtn.textContent = 'Deleting…';

    try {
        await dbDeleteCompany(id);
        companies = companies.filter((c) => c.id !== id);
        render();
        closeDeleteModal();
        showToast('Company deleted', 'success');
    } catch (err) {
        console.error('Delete company failed', err);
        showToast(err.message || 'Could not delete company', 'error');
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
