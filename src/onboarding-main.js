import { getCurrentUser } from './auth.js'
import { loadLayout } from './components/layout.js'

// ── Stage definitions ──────────────────────────────────────────────────────

const STAGES = {
    company: [
        {
            id: 'company-setup',
            name: 'Company Setup',
            desc: 'Add company to CRM and collect basic details',
            items: [
                { id: 'add-crm',      label: 'Add company to Consultants / CRM', tag: 'task' },
                { id: 'collect-ein',  label: 'Collect EIN (Tax Identification Number)', tag: 'info' },
                { id: 'biz-address',  label: 'Collect company address & billing contact', tag: 'info' },
                { id: 'entity-type',  label: 'Verify business entity type (LLC, Corp, S-Corp, etc.)', tag: 'info' },
            ]
        },
        {
            id: 'legal-agreements',
            name: 'Legal Agreements',
            desc: 'Execute all required legal documents',
            items: [
                { id: 'w9-receive',       label: 'Receive W-9 from company', tag: 'doc' },
                { id: 'mpta-send',        label: 'Draft & send Mutual Pass Through Agreement (MPTA)', tag: 'sign' },
                { id: 'mpta-signed',      label: 'Receive fully executed MPTA (both signatures)', tag: 'sign' },
                { id: 'docs-filed',       label: 'File all executed agreements securely', tag: 'task' },
            ]
        },
        {
            id: 'payment-setup',
            name: 'Payment & Banking Setup',
            desc: 'Set up payment method and direct deposit',
            items: [
                { id: 'dda-send',         label: 'Send Direct Deposit Agreement Form to company', tag: 'sign' },
                { id: 'dda-receive',      label: 'Receive completed & signed Direct Deposit Agreement', tag: 'doc' },
                { id: 'banking-setup',    label: 'Set up payment processing / ACH banking details', tag: 'task' },
                { id: 'payment-test',     label: 'Confirm first payment or invoice successfully processed', tag: 'task' },
            ]
        },
        {
            id: 'company-active',
            name: 'Onboarding Complete',
            desc: 'Final activation and first engagement',
            items: [
                { id: 'profile-active',   label: 'Company profile marked active in system', tag: 'task' },
                { id: 'first-invoice',    label: 'Create first invoice or timesheet entry', tag: 'task' },
                { id: 'poc-confirmed',    label: 'Primary point of contact confirmed & saved', tag: 'info' },
            ]
        }
    ],

    candidate: [
        {
            id: 'sourcing',
            name: 'Sourcing & Shortlisting',
            desc: 'Initial contact through shortlist decision',
            items: [
                { id: 'contact-received',   label: 'Initial contact / referral received', tag: 'task' },
                { id: 'resume-reviewed',    label: 'Resume reviewed & evaluated', tag: 'task' },
                { id: 'screening-call',     label: 'Conduct screening call', tag: 'task' },
                { id: 'availability',       label: "Confirm candidate availability & interest", tag: 'info' },
                { id: 'shortlist-done',     label: 'Shortlist decision made', tag: 'task' },
            ]
        },
        {
            id: 'client-interview',
            name: 'Client Submission & Interview',
            desc: 'Submit to client and manage interview cycle',
            items: [
                { id: 'profile-submit',     label: 'Submit candidate profile to client', tag: 'task' },
                { id: 'interview-sched',    label: 'Schedule client interview', tag: 'task' },
                { id: 'interview-done',     label: 'Interview conducted', tag: 'task' },
                { id: 'feedback-collect',   label: 'Collect client interview feedback', tag: 'info' },
                { id: 'selection-decision', label: 'Selection decision received (proceed / reject)', tag: 'task' },
            ]
        },
        {
            id: 'offer-rate',
            name: 'Offer & Rate Confirmation',
            desc: 'Finalize rates and get written confirmations',
            items: [
                { id: 'rate-negotiate',     label: 'Negotiate bill rate and pay rate', tag: 'task' },
                { id: 'rate-email-cand',    label: 'Send rate confirmation email to candidate', tag: 'sign' },
                { id: 'rate-ack-cand',      label: 'Receive rate confirmation acknowledgment from candidate', tag: 'doc' },
                { id: 'rate-email-client',  label: 'Send rate confirmation to client', tag: 'sign' },
                { id: 'rate-ack-client',    label: 'Client approves rates (written confirmation)', tag: 'doc' },
            ]
        },
        {
            id: 'documentation',
            name: 'Legal Documentation',
            desc: 'Collect all required agreements and personal forms',
            items: [
                { id: 'msa-sign',           label: 'Execute MSA (Master Service Agreement) with client', tag: 'sign' },
                { id: 'sow-sign',           label: 'Execute SOW (Statement of Work)', tag: 'sign' },
                { id: 'w4-collect',         label: 'Collect candidate W-4 form', tag: 'doc' },
                { id: 'bank-details',       label: 'Collect bank & direct deposit details', tag: 'doc' },
                { id: 'personal-details',   label: 'Collect personal details (address, SSN last 4, emergency contact)', tag: 'info' },
                { id: 'docs-filed',         label: 'File all signed documents securely', tag: 'task' },
            ]
        },
        {
            id: 'project-setup',
            name: 'Project Setup',
            desc: 'Confirm all project and engagement details',
            items: [
                { id: 'client-details',     label: 'Confirm client name & end-client project details', tag: 'info' },
                { id: 'work-location',      label: 'Confirm work location (onsite / remote / hybrid)', tag: 'info' },
                { id: 'start-date',         label: 'Confirm official start date', tag: 'info' },
                { id: 'reporting-mgr',      label: 'Collect reporting manager name & contact at client', tag: 'info' },
                { id: 'share-rm-cand',      label: 'Share reporting manager details with candidate', tag: 'task' },
                { id: 'bgcheck-req',        label: 'Confirm background check & drug test requirements', tag: 'task' },
                { id: 'bgcheck-done',       label: 'Background check / drug test completed & cleared', tag: 'doc' },
            ]
        },
        {
            id: 'candidate-active',
            name: 'Onboarding Complete',
            desc: 'Activate in systems and begin first week',
            items: [
                { id: 'add-timesheets',     label: 'Add consultant to Timesheets system', tag: 'task' },
                { id: 'payroll-setup',      label: 'Set up payroll', tag: 'task' },
                { id: 'first-day-share',    label: 'Share first day / project instructions with candidate', tag: 'task' },
                { id: 'first-timesheet',    label: 'First timesheet submitted and approved', tag: 'task' },
                { id: 'ob-complete',        label: 'Onboarding marked complete', tag: 'task' },
            ]
        }
    ]
}

// ── Storage ────────────────────────────────────────────────────────────────

let STORAGE_KEY = 'invoice_pro_onboardings_v1'

function loadRecords() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
        return []
    }
}

function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── State ─────────────────────────────────────────────────────────────────

let records = []
let activeTrack = 'company'
let openRecordId = null
let pendingDeleteId = null

// ── UI helpers ────────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
    const el = document.getElementById('toast')
    if (!el) return
    el.textContent = msg
    el.className = 'toast show'
    el.style.background = type === 'error' ? '#C53030' : type === 'success' ? '#2F855A' : '#111'
    clearTimeout(el._t)
    el._t = setTimeout(() => { el.className = 'toast' }, 3000)
}

function tagHtml(tag, cls) {
    const labels = { doc: 'Document', sign: 'Sign', task: 'Action', info: 'Info' }
    return `<span class="${cls}--${tag}">${labels[tag] || tag}</span>`
}

// ── Render cards ──────────────────────────────────────────────────────────

function calcProgress(record) {
    const stages = STAGES[record.type] || []
    let total = 0, done = 0
    stages.forEach(s => {
        s.items.forEach(item => {
            total++
            if (record.checks?.[item.id]) done++
        })
    })
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}

function currentStageName(record) {
    const stages = STAGES[record.type] || []
    for (const stage of stages) {
        const allDone = stage.items.every(item => record.checks?.[item.id])
        if (!allDone) return stage.name
    }
    return 'Complete'
}

function renderCards() {
    const container = document.getElementById('obCards')
    const filtered = records.filter(r => r.type === activeTrack)

    if (!filtered.length) {
        container.innerHTML = `
            <div class="ob-empty" style="grid-column:1/-1;">
                <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                <div>No active onboardings for this track. Click <strong>New Onboarding</strong> to start one.</div>
            </div>`
        return
    }

    container.innerHTML = filtered.map(r => {
        const { pct, done, total } = calcProgress(r)
        const stageName = currentStageName(r)
        const isComplete = pct === 100
        const badgeCls = r.type === 'company' ? 'ob-card__badge--company' : 'ob-card__badge--candidate'
        const badgeLabel = r.type === 'company' ? 'Company' : 'W2 Candidate'
        const created = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        return `
            <div class="ob-card" data-id="${r.id}">
                <button class="ob-card__delete" data-del="${r.id}" title="Delete">✕</button>
                <div class="ob-card__top">
                    <div class="ob-card__name">${escHtml(r.name)}</div>
                    <span class="ob-card__badge ${badgeCls}">${badgeLabel}</span>
                </div>
                <div class="ob-card__stage">${isComplete ? '✅ Complete' : `Stage: ${stageName}`}</div>
                <div class="ob-card__progress-bar">
                    <div class="ob-card__progress-fill ${isComplete ? 'ob-card__progress-fill--complete' : ''}"
                        style="width:${pct}%"></div>
                </div>
                <div class="ob-card__meta">
                    <span>${done} / ${total} items</span>
                    <span>Started ${created}</span>
                </div>
            </div>`
    }).join('')

    container.querySelectorAll('.ob-card').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('[data-del]')) return
            openPanel(card.dataset.id)
        })
    })
    container.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation()
            openDeleteConfirm(btn.dataset.del)
        })
    })
}

// ── Render reference guide ─────────────────────────────────────────────────

function renderGuide() {
    const container = document.getElementById('obGuide')
    const stages = STAGES[activeTrack] || []
    container.innerHTML = stages.map((stage, i) => `
        <div class="ob-guide__stage">
            <div class="ob-guide__stage-header" data-stage="${stage.id}">
                <div class="ob-guide__num">${i + 1}</div>
                <div class="ob-guide__stage-name">${stage.name}</div>
                <div class="ob-guide__stage-desc">${stage.desc}</div>
                <svg class="ob-guide__chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>
            <div class="ob-guide__items">
                ${stage.items.map(item => `
                    <div class="ob-guide__item">
                        <div class="ob-guide__dot"></div>
                        <span style="flex:1">${item.label}</span>
                        ${tagHtml(item.tag, 'ob-guide__tag')}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('')

    container.querySelectorAll('.ob-guide__stage-header').forEach(header => {
        header.addEventListener('click', () => {
            header.closest('.ob-guide__stage').classList.toggle('is-open')
        })
    })
}

// ── Slide-over panel ──────────────────────────────────────────────────────

function openPanel(recordId) {
    const record = records.find(r => r.id === recordId)
    if (!record) return
    openRecordId = recordId

    document.getElementById('panelTitle').textContent = record.name
    document.getElementById('panelSubtitle').textContent =
        record.type === 'company' ? 'Company Onboarding' : 'W2 Candidate Onboarding'

    renderPanelChecklist(record)
    updatePanelProgress(record)

    document.getElementById('obPanel').classList.add('is-open')
    document.getElementById('obPanelOverlay').classList.add('is-open')
}

function closePanel() {
    openRecordId = null
    document.getElementById('obPanel').classList.remove('is-open')
    document.getElementById('obPanelOverlay').classList.remove('is-open')
}

function renderPanelChecklist(record) {
    const stages = STAGES[record.type] || []
    const body = document.getElementById('panelBody')

    body.innerHTML = stages.map(stage => {
        const allDone = stage.items.every(item => record.checks?.[item.id])
        return `
            <div class="ob-panel__stage">
                <div class="ob-panel__stage-label">
                    ${stage.name}
                    ${allDone ? '<span class="ob-panel__stage-check">Done</span>' : ''}
                </div>
                <div class="ob-panel__checklist">
                    ${stage.items.map(item => {
                        const checked = !!record.checks?.[item.id]
                        return `
                            <label class="ob-check-item ${checked ? 'checked' : ''}" data-item="${item.id}">
                                <input type="checkbox" ${checked ? 'checked' : ''} data-item="${item.id}">
                                <span class="ob-check-item__label">${item.label}</span>
                                ${tagHtml(item.tag, 'ob-check-item__tag')}
                            </label>`
                    }).join('')}
                </div>
            </div>`
    }).join('')

    // Notes section
    body.innerHTML += `
        <div class="ob-panel__notes">
            <div class="ob-panel__notes-label">Notes</div>
            <textarea id="panelNotes" rows="4" placeholder="Add notes, links, or reminders…">${escHtml(record.notes || '')}</textarea>
        </div>`

    body.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => toggleItem(record, cb.dataset.item, cb.checked))
    })

    const notesEl = body.querySelector('#panelNotes')
    if (notesEl) {
        notesEl.addEventListener('input', () => {
            record.notes = notesEl.value
            saveRecords(records)
        })
    }
}

function toggleItem(record, itemId, checked) {
    if (!record.checks) record.checks = {}
    record.checks[itemId] = checked
    saveRecords(records)
    updatePanelProgress(record)
    renderCards()

    // Refresh the item row style without full re-render
    const label = document.querySelector(`.ob-check-item[data-item="${itemId}"]`)
    if (label) label.classList.toggle('checked', checked)

    // Refresh stage "Done" badges
    const stages = STAGES[record.type] || []
    stages.forEach(stage => {
        const allDone = stage.items.every(item => record.checks?.[item.id])
        const stageEl = [...document.querySelectorAll('.ob-panel__stage')].find(el =>
            el.querySelector('.ob-panel__stage-label')?.textContent.trim().startsWith(stage.name)
        )
        if (!stageEl) return
        const labelEl = stageEl.querySelector('.ob-panel__stage-label')
        const existingBadge = labelEl?.querySelector('.ob-panel__stage-check')
        if (allDone && !existingBadge) {
            labelEl.insertAdjacentHTML('beforeend', '<span class="ob-panel__stage-check">Done</span>')
        } else if (!allDone && existingBadge) {
            existingBadge.remove()
        }
    })
}

function updatePanelProgress(record) {
    const { pct, done, total } = calcProgress(record)
    document.getElementById('panelProgressLabel').textContent = `${done} of ${total} items complete`
    document.getElementById('panelProgressPct').textContent = `${pct}%`
    document.getElementById('panelProgressFill').style.width = `${pct}%`
}

// ── Create / Delete ────────────────────────────────────────────────────────

function createRecord(name, type) {
    const rec = { id: makeId(), name, type, createdAt: new Date().toISOString(), checks: {}, notes: '' }
    records.push(rec)
    saveRecords(records)
    if (type !== activeTrack) switchTrack(type)
    renderCards()
    renderGuide()
    showToast('Onboarding created', 'success')
    return rec
}

function openDeleteConfirm(id) {
    pendingDeleteId = id
    const rec = records.find(r => r.id === id)
    document.getElementById('obConfirmMsg').textContent =
        `Delete onboarding for "${rec?.name || 'this record'}"? This cannot be undone.`
    document.getElementById('obConfirmOverlay').classList.add('is-open')
}

function confirmDelete() {
    if (!pendingDeleteId) return
    records = records.filter(r => r.id !== pendingDeleteId)
    saveRecords(records)
    pendingDeleteId = null
    document.getElementById('obConfirmOverlay').classList.remove('is-open')
    if (openRecordId && !records.find(r => r.id === openRecordId)) closePanel()
    renderCards()
    showToast('Onboarding deleted')
}

// ── Track switching ────────────────────────────────────────────────────────

function switchTrack(track) {
    activeTrack = track
    document.querySelectorAll('.ob-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.track === track)
    })
    renderCards()
    renderGuide()
}

// ── Utilities ──────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
    await loadLayout('onboarding')
    const user = await getCurrentUser()
    if (!user) { window.location.href = 'login.html'; return }

    STORAGE_KEY = `invoice_pro_onboardings_v1_${String(user.id).slice(-12)}`
    records = loadRecords()

    renderCards()
    renderGuide()

    // Tab switching
    document.querySelectorAll('.ob-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTrack(tab.dataset.track))
    })

    // New Onboarding modal
    const modal = document.getElementById('newOnboardingModal')
    document.getElementById('newOnboardingBtn').addEventListener('click', () => {
        document.getElementById('newObName').value = ''
        document.getElementById('newObType').value = activeTrack
        modal.classList.add('is-open')
        setTimeout(() => document.getElementById('newObName').focus(), 50)
    })
    document.getElementById('cancelNewObBtn').addEventListener('click', () => {
        modal.classList.remove('is-open')
    })
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('is-open') })

    document.getElementById('createObBtn').addEventListener('click', () => {
        const name = document.getElementById('newObName').value.trim()
        const type = document.getElementById('newObType').value
        if (!name) { showToast('Please enter a name', 'error'); return }
        modal.classList.remove('is-open')
        const rec = createRecord(name, type)
        openPanel(rec.id)
    })

    // Panel close
    document.getElementById('obPanelClose').addEventListener('click', closePanel)
    document.getElementById('obPanelOverlay').addEventListener('click', closePanel)

    // Delete confirm
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        pendingDeleteId = null
        document.getElementById('obConfirmOverlay').classList.remove('is-open')
    })
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete)
}

init()
