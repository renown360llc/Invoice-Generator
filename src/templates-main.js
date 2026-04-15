/**
 * Templates Page — Main Script
 * Loads all saved templates, renders as cards, manages slide-over edit panel.
 */

import { getCurrentUser, signOut } from './auth.js'
import { getTemplates, updateTemplate, deleteTemplate } from './database.js'

// ── State ───────────────────────────────────────────────────────────────────
let allTemplates = []
let templateToDelete = null
let currentBizLogo = null // Stores base64 of the logo being edited

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

    const fragment = document.createDocumentFragment()

    allTemplates.forEach(t => {
        const biz = t.business_info || {}
        const client = t.client_info || {}
        const settings = t.settings || {}
        const color = safeColor(settings.brandColor, '#6B7280')
        const currency = settings.currency || 'USD'
        const taxRate = Number(settings.taxRate || 0)

        const card = document.createElement('div')
        card.className = 'template-card'
        card.dataset.id = t.id

        const colorBar = document.createElement('div')
        colorBar.className = 'template-card__color-bar'
        colorBar.style.backgroundColor = color
        card.appendChild(colorBar)

        const body = document.createElement('div')
        body.className = 'template-card__body'

        const name = document.createElement('div')
        name.className = 'template-card__name'
        name.textContent = t.name || 'Untitled'
        body.appendChild(name)

        const meta = document.createElement('div')
        meta.className = 'template-card__meta'

        meta.appendChild(buildMetaRow('Business', biz.name || '—'))

        if (client.name) {
            meta.appendChild(buildMetaRow('Client', client.name))
        }

        meta.appendChild(buildMetaRow('Currency', currency))

        if (taxRate > 0) {
            meta.appendChild(buildMetaRow('Tax', `${taxRate}%`))
        }

        if (biz.email) {
            meta.appendChild(buildMetaRow('Email', biz.email, true))
        }

        body.appendChild(meta)
        card.appendChild(body)

        const actions = document.createElement('div')
        actions.className = 'template-card__actions'

        const useLink = document.createElement('a')
        useLink.href = `app.html?template_use=${encodeURIComponent(t.id)}`
        useLink.className = 'btn btn--primary btn--sm'
        useLink.textContent = 'Use Template'
        actions.appendChild(useLink)

        const editBtn = document.createElement('button')
        editBtn.className = 'btn btn--sm template-edit-btn'
        editBtn.dataset.id = t.id
        editBtn.style.background = 'var(--surface-alt)'
        editBtn.style.color = 'var(--text-primary)'
        editBtn.textContent = 'Edit'
        actions.appendChild(editBtn)

        const deleteBtn = document.createElement('button')
        deleteBtn.className = 'btn btn--sm template-delete-btn'
        deleteBtn.dataset.id = t.id
        deleteBtn.style.background = '#FEE2E2'
        deleteBtn.style.color = '#B91C1C'
        deleteBtn.textContent = 'Delete'
        actions.appendChild(deleteBtn)

        card.appendChild(actions)
        fragment.appendChild(card)
    })

    grid.replaceChildren(fragment)

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

function safeColor(value, fallback) {
    const candidate = String(value || '').trim()
    if (!candidate) return fallback
    if (window.CSS?.supports?.('color', candidate)) return candidate
    return fallback
}

function buildMetaRow(label, value, truncate = false) {
    const row = document.createElement('div')
    row.className = 'template-card__meta-row'

    const labelEl = document.createElement('span')
    labelEl.className = 'template-card__meta-label'
    labelEl.textContent = label

    const valueEl = document.createElement('span')
    valueEl.className = 'template-card__meta-value'
    if (truncate) valueEl.classList.add('template-card__meta-value--truncate')
    valueEl.textContent = value

    row.appendChild(labelEl)
    row.appendChild(valueEl)
    return row
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
    const brandColor = settings.brandColor || '#000000'
    document.getElementById('editBrandColor').value = brandColor
    const brandColorValue = document.getElementById('editBrandColorValue')
    if (brandColorValue) brandColorValue.textContent = brandColor.toUpperCase()
    document.getElementById('editPaymentInstructions').value = settings.payment_instructions || ''

    // Populate logo
    currentBizLogo = biz.logo || null
    updateLogoPreview()

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
            logo: currentBizLogo
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
        },
        payment_instructions: document.getElementById('editPaymentInstructions').value
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

        // Color picker live preview
        document.getElementById('editBrandColor')?.addEventListener('input', (e) => {
            const val = e.target.value.toUpperCase()
            const display = document.getElementById('editBrandColorValue')
            if (display) display.textContent = val
        })

        // Logo upload listener
        document.getElementById('editBizLogoUpload')?.addEventListener('change', handleLogoUpload)

    } catch (e) {
        console.error('Init error:', e)
    }
}

function updateLogoPreview() {
    const preview = document.getElementById('editBizLogoPreview')
    const fileNameEl = document.getElementById('editBizLogoFileName')
    
    if (currentBizLogo) {
        const img = document.createElement('img')
        img.alt = 'Logo'
        img.src = currentBizLogo
        preview.replaceChildren(img)
        fileNameEl.textContent = 'Change Logo'
    } else {
        const placeholder = document.createElement('span')
        placeholder.className = 'logo-preview-placeholder'
        placeholder.textContent = 'No Logo'
        preview.replaceChildren(placeholder)
        fileNameEl.textContent = 'Choose Logo'
    }
}

function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
        currentBizLogo = evt.target.result
        updateLogoPreview()
    }
    reader.readAsDataURL(file)
}

init()
