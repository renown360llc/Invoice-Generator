/**
 * Templates Page — Main Script
 * Loads all saved templates, renders as cards, manages slide-over edit panel.
 */

import { getCurrentUser, signOut } from './auth.js'
import { getTemplates, updateTemplate, deleteTemplate } from './database.js'

// ── State ───────────────────────────────────────────────────────────────────
let allTemplates = []
let templateToDelete = null

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast')
    toast.textContent = message
    toast.className = `toast toast--${type} toast--show`
    setTimeout(() => toast.classList.remove('toast--show'), 3000)
}

// ── Template Card Rendering ──────────────────────────────────────────────────
function renderTemplates() {
    const grid = document.getElementById('templatesGrid')
    const empty = document.getElementById('emptyState')

    if (allTemplates.length === 0) {
        grid.style.display = 'none'
        empty.style.display = 'block'
        return
    }

    empty.style.display = 'none'
    grid.style.display = 'grid'

    grid.innerHTML = allTemplates.map(t => {
        const biz = t.business_info || {}
        const client = t.client_info || {}
        const settings = t.settings || {}
        const color = settings.brandColor || '#6B7280'
        const currency = settings.currency || 'USD'
        const taxRate = settings.taxRate || 0

        return `
        <div class="template-card" data-id="${t.id}">
            <div class="template-card__color-bar" style="background: ${color};"></div>
            <div class="template-card__body">
                <div class="template-card__name">${escapeHtml(t.name || 'Untitled')}</div>

                <div class="template-card__meta">
                    <div class="template-card__meta-row">
                        <span class="template-card__meta-label">Business</span>
                        <span class="template-card__meta-value">${escapeHtml(biz.name || '—')}</span>
                    </div>
                    ${client.name ? `
                    <div class="template-card__meta-row">
                        <span class="template-card__meta-label">Client</span>
                        <span class="template-card__meta-value">${escapeHtml(client.name)}</span>
                    </div>` : ''}
                    <div class="template-card__meta-row">
                        <span class="template-card__meta-label">Currency</span>
                        <span class="template-card__meta-value">${currency}</span>
                    </div>
                    ${taxRate > 0 ? `
                    <div class="template-card__meta-row">
                        <span class="template-card__meta-label">Tax</span>
                        <span class="template-card__meta-value">${taxRate}%</span>
                    </div>` : ''}
                    ${biz.email ? `
                    <div class="template-card__meta-row">
                        <span class="template-card__meta-label">Email</span>
                        <span class="template-card__meta-value template-card__meta-value--truncate">${escapeHtml(biz.email)}</span>
                    </div>` : ''}
                </div>
            </div>

            <div class="template-card__actions">
                <a href="app.html?template_use=${t.id}" class="btn btn--primary btn--sm">
                    Use Template
                </a>
                <button class="btn btn--sm template-edit-btn" data-id="${t.id}" style="background: var(--surface-alt); color: var(--text-primary);">
                    Edit
                </button>
                <button class="btn btn--sm template-delete-btn" data-id="${t.id}" style="background: #FEE2E2; color: #B91C1C;">
                    Delete
                </button>
            </div>
        </div>`
    }).join('')

    // Bind action buttons after render
    grid.querySelectorAll('.template-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditPanel(btn.dataset.id))
    })
    grid.querySelectorAll('.template-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => openDeleteModal(btn.dataset.id))
    })
}

function escapeHtml(str) {
    if (!str) return ''
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

// ── Edit Slide-Over Panel ───────────────────────────────────────────────────
function openEditPanel(templateId) {
    const template = allTemplates.find(t => String(t.id) === String(templateId))
    if (!template) return

    const biz = template.business_info || {}
    const client = template.client_info || {}
    const settings = template.settings || {}

    // Populate fields
    document.getElementById('editTemplateId').value = template.id
    document.getElementById('editName').value = template.name || ''
    document.getElementById('editBizName').value = biz.name || ''
    document.getElementById('editBizEmail').value = biz.email || ''
    document.getElementById('editBizPhone').value = biz.phone || ''
    document.getElementById('editBizAddress').value = biz.address || ''
    document.getElementById('editClientName').value = client.name || ''
    document.getElementById('editClientEmail').value = client.email || ''
    document.getElementById('editClientPhone').value = client.phone || ''
    document.getElementById('editClientAddress').value = client.address || ''
    document.getElementById('editCurrency').value = settings.currency || 'USD'
    document.getElementById('editTaxRate').value = settings.taxRate || 0
    document.getElementById('editBrandColor').value = settings.brandColor || '#000000'

    // Show panel
    document.getElementById('editPanel').classList.add('is-open')
    document.getElementById('panelOverlay').classList.add('is-open')
}

function closeEditPanel() {
    document.getElementById('editPanel').classList.remove('is-open')
    document.getElementById('panelOverlay').classList.remove('is-open')
}

async function saveEdit() {
    const id = document.getElementById('editTemplateId').value
    const templateData = {
        name: document.getElementById('editName').value.trim(),
        business: {
            name: document.getElementById('editBizName').value,
            email: document.getElementById('editBizEmail').value,
            phone: document.getElementById('editBizPhone').value,
            address: document.getElementById('editBizAddress').value,
        },
        client: {
            name: document.getElementById('editClientName').value,
            email: document.getElementById('editClientEmail').value,
            phone: document.getElementById('editClientPhone').value,
            address: document.getElementById('editClientAddress').value,
        },
        settings: {
            currency: document.getElementById('editCurrency').value,
            taxRate: document.getElementById('editTaxRate').value,
            brandColor: document.getElementById('editBrandColor').value,
        }
    }

    if (!templateData.name) {
        showToast('Template name is required', 'error')
        return
    }

    const saveBtn = document.getElementById('saveEditBtn')
    saveBtn.disabled = true
    saveBtn.textContent = 'Saving…'

    try {
        await updateTemplate(id, templateData)
        showToast('Template saved', 'success')
        closeEditPanel()
        await loadTemplates()
    } catch (e) {
        showToast('Error: ' + e.message, 'error')
    } finally {
        saveBtn.disabled = false
        saveBtn.textContent = 'Save Changes'
    }
}

// ── Delete Modal ─────────────────────────────────────────────────────────────
function openDeleteModal(templateId) {
    templateToDelete = templateId
    document.getElementById('deleteModal').style.display = 'flex'
}

function closeDeleteModal() {
    templateToDelete = null
    document.getElementById('deleteModal').style.display = 'none'
}

// ── Data Loading ─────────────────────────────────────────────────────────────
async function loadTemplates() {
    try {
        allTemplates = await getTemplates()
        renderTemplates()
    } catch (e) {
        showToast('Error loading templates', 'error')
        console.error(e)
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    try {
        await loadTemplates()

        // Panel buttons
        document.getElementById('closePanelBtn').addEventListener('click', closeEditPanel)
        document.getElementById('cancelEditBtn').addEventListener('click', closeEditPanel)
        document.getElementById('panelOverlay').addEventListener('click', closeEditPanel)
        document.getElementById('saveEditBtn').addEventListener('click', saveEdit)

        // Delete modal
        document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal)
        document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
            if (!templateToDelete) return
            try {
                await deleteTemplate(templateToDelete)
                showToast('Template deleted', 'success')
                closeDeleteModal()
                await loadTemplates()
            } catch (e) {
                showToast('Error: ' + e.message, 'error')
            }
        })

        // Handle ?template_use=ID from "Use Template" button — sets template in app.html
        // (app-main.js handleLoadTemplate already reads from DB by ID, so we just pass the param)

    } catch (e) {
        console.error('Init error:', e)
    }
}

init()
