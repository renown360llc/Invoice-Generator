import { getCurrentUser, signOut } from './auth.js'
import { getInvoices, getInvoice, updateInvoiceStatus } from './database.js'
import { dbGetConsultants } from './modules/db-consultants.js'
import { generatePDF } from './modules/pdf.js'
import { formatCurrency } from './modules/utils.js'
import './security.js'

let allInvoicesCache = []
let dashboardSearchQuery = ''

// Check authentication
async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) {
        window.location.href = '/login.html'
        return null
    }
    return user
}

// Helper to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast')
    toast.textContent = message
    toast.className = `toast toast--${type} toast--show`
    setTimeout(() => {
        toast.classList.remove('toast--show')
    }, 3000)
}

// Format currency
// Imported from ./modules/utils.js

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

// Calculate statistics
function calculateStats(invoices) {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Helper: Sum totals by currency
    const sumByCurrency = (list) => {
        const totals = {}
        list.forEach(inv => {
            const curr = inv.invoice_meta?.currency || 'USD'
            totals[curr] = (totals[curr] || 0) + (inv.totals?.total || 0)
        })
        return totals
    }

    // Filter lists
    const thisMonth = invoices.filter(inv => {
        const d = new Date(inv.created_at)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    const thisYear = invoices.filter(inv => {
        const d = new Date(inv.created_at)
        return d.getFullYear() === currentYear
    })

    // Calculate aggregate buckets
    const monthlyRevenue = sumByCurrency(thisMonth)
    const yearlyRevenue = sumByCurrency(thisYear)

    // Calculate Average Invoice Size per Currency
    // (Total Revenue in Currency X) / (Count of Invoices in Currency X)
    const totalRevenueAllTime = sumByCurrency(invoices)
    const avgInvoice = {}

    Object.keys(totalRevenueAllTime).forEach(curr => {
        const count = invoices.filter(inv => (inv.invoice_meta?.currency || 'USD') === curr).length
        if (count > 0) {
            avgInvoice[curr] = totalRevenueAllTime[curr] / count
        }
    })

    // Outstanding receivables = totals of sent/overdue (not yet paid) invoices
    const outstanding = invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue');
    const outstandingReceivables = sumByCurrency(outstanding);

    return {
        monthlyRevenue,
        yearlyRevenue,
        avgInvoice,
        outstandingReceivables,
        outstandingCount: outstanding.length,
        totalInvoices: invoices.length,
        thisMonthCount: thisMonth.length,
        conversionRate: (() => {
            const paid = invoices.filter(inv => inv.status === 'paid').length
            const sent = invoices.filter(inv => inv.status === 'sent').length
            return (paid + sent) > 0 ? Math.round((paid / (paid + sent)) * 100) : 0
        })(),
        pendingCount: invoices.filter(inv => inv.status === 'sent').length
    }
}

// Update stats cards
function updateStatsCards(stats) {
    // Helper to render stacked currency values
    const renderStacked = (totalsObj) => {
        const entries = Object.entries(totalsObj)
        if (entries.length === 0) return formatCurrency(0, 'USD') // Default

        // Sort alphabetically to keep UI stable (CAD, USD...)
        entries.sort((a, b) => a[0].localeCompare(b[0]))

        // If single currency, render standard large font
        if (entries.length === 1) {
            return formatCurrency(entries[0][1], entries[0][0])
        }

        // If multiple, render stacked with smaller font to fit card
        return entries.map(([curr, amount]) => {
            return `<div style="font-size: 0.65em; line-height: 1.2; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${formatCurrency(amount, curr)}
            </div>`
        }).join('')
    }

    document.getElementById('monthlyRevenue').innerHTML = renderStacked(stats.monthlyRevenue)
    document.getElementById('yearlyRevenue').innerHTML = renderStacked(stats.yearlyRevenue)
    const avgEl = document.getElementById('avgInvoice')
    if (avgEl) avgEl.innerHTML = renderStacked(stats.avgInvoice)

    document.getElementById('totalInvoices').textContent = stats.totalInvoices

    // Conversion Rate
    const conversionEl = document.getElementById('conversionRate')
    if (conversionEl) conversionEl.textContent = `${stats.conversionRate}%`

    // Pending (Sent but not paid)
    const pendingEl = document.getElementById('activeTasks')
    if (pendingEl) pendingEl.textContent = stats.pendingCount

    // Outstanding Receivables
    const arEl = document.getElementById('outstandingReceivables')
    const arChangeEl = document.getElementById('outstandingChange')
    if (arEl) arEl.innerHTML = renderStacked(stats.outstandingReceivables)
    if (arChangeEl) {
        arChangeEl.textContent = stats.outstandingCount === 0
            ? '✓ All invoices paid'
            : `${stats.outstandingCount} invoice${stats.outstandingCount === 1 ? '' : 's'} awaiting payment`;
        arChangeEl.style.color = stats.outstandingCount === 0 ? '#059669' : '#dc2626';
    }

    // Update change indicators
    document.getElementById('monthlyChange').textContent = `${stats.thisMonthCount} this month`
    document.getElementById('invoiceChange').textContent = 'All time'
    document.getElementById('yearlyChange').textContent = 'Year to date'
}

// Render recent invoices table
function renderRecentInvoices(invoices) {
    const tbody = document.getElementById('recentInvoicesBody')

    if (invoices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">💭</span>
                        <p class="empty-state__text">No invoices yet</p>
                        <a href="app.html" class="btn btn--primary btn--sm">Create your first invoice</a>
                    </div>
                </td>
            </tr>
        `
        return
    }

    const q = dashboardSearchQuery.trim().toLowerCase()
    const filtered = q
        ? invoices.filter((invoice) => {
            const invoiceNo = String(invoice.invoice_number || '').toLowerCase()
            const client = String(invoice.client_info?.name || '').toLowerCase()
            return invoiceNo.includes(q) || client.includes(q)
        })
        : invoices

    // Show last 5 invoices for current search result
    const recent = filtered.slice(0, 5)

    if (recent.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">🔎</span>
                        <p class="empty-state__text">No invoices match "${escapeHtml(dashboardSearchQuery)}"</p>
                    </div>
                </td>
            </tr>
        `
        return
    }

    tbody.innerHTML = recent.map(invoice => {
        const invoiceDate = invoice.invoice_meta?.dateRaw || invoice.invoice_meta?.date || invoice.created_at
        const status = invoice.status || 'draft'

        let effectiveStatus = status
        if (status === 'sent' && invoice.invoice_meta?.dueDateRaw) {
            const due = new Date(invoice.invoice_meta.dueDateRaw)
            if (due < new Date()) effectiveStatus = 'overdue'
        }

        // Define status-based actions with clearer labels
        let statusTransitionItems = ''
        if (effectiveStatus === 'draft') {
            statusTransitionItems = `
                <button class="dropdown-item" onclick="window.markAsSentDash('${invoice.id}')">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    Mark as Sent
                </button>`
        } else if (effectiveStatus === 'sent' || effectiveStatus === 'overdue') {
            statusTransitionItems = `
                <button class="dropdown-item" onclick="window.markAsPaidDash('${invoice.id}')">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    Mark as Paid
                </button>`
        } else if (effectiveStatus === 'paid') {
            statusTransitionItems = `
                <button class="dropdown-item" onclick="window.unmarkPaidDash('${invoice.id}')">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    Revert to Sent
                </button>`
        }

        return `
        <tr>
            <td><strong>${escapeHtml(invoice.invoice_number)}</strong></td>
            <td>${escapeHtml(invoice.client_info?.name || 'N/A')}</td>
            <td>${formatDate(invoiceDate)}</td>
            <td>${renderDashboardStatusChip(effectiveStatus)}</td>
            <td style="text-align: right;"><strong>${formatCurrency(invoice.totals?.total || 0, invoice.invoice_meta?.currency)}</strong></td>
            <td style="text-align: right;">
                <div class="row-actions">
                    <button class="action-btn" onclick="window.toggleRowActions(event, '${invoice.id}')">
                        Manage
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div id="dropdown-${invoice.id}" class="dropdown-menu">
                        <div class="dropdown-label">Primary Actions</div>
                        <button class="dropdown-item" onclick="viewInvoice('${escapeHtml(invoice.invoice_number)}')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            View & Edit
                        </button>
                        <button class="dropdown-item" onclick="downloadPDF('${escapeHtml(invoice.invoice_number)}')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            Download PDF
                        </button>
                        
                        ${statusTransitionItems ? `
                            <div class="dropdown-divider"></div>
                            <div class="dropdown-label">Quick Status</div>
                            ${statusTransitionItems}
                        ` : ''}
                    </div>
                </div>
            </td>
        </tr>
        `
    }).join('')
}

/**
 * Toggle the dropdown menu for a specific row
 */
window.toggleRowActions = function (event, id) {
    event.stopPropagation();
    const menu = document.getElementById(`dropdown-${id}`);

    // Close any other open menus
    document.querySelectorAll('.dropdown-menu.show').forEach(m => {
        if (m.id !== `dropdown-${id}`) m.classList.remove('show');
    });

    menu.classList.toggle('show');
};

// Global click listener to close dropdowns
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
});

function renderDashboardStatusChip(status) {
    const cfg = {
        draft: { label: 'Draft', bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
        sent: { label: 'Sent', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
        overdue: { label: 'Overdue', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
        paid: { label: 'Paid', bg: '#f0fdf4', color: '#059669', border: '#a7f3d0' }
    }[status] || { label: status, bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
    return `<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};text-transform:uppercase">${cfg.label}</span>`;
}

// Create revenue chart — smooth area curve with hover tooltip + range filters
let _chartInvoices = [] // store for re-render on filter change

/**
 * Extracts a reliable YYYY-MM-DD string from an invoice.
 * - Prefers invoice_meta.dateRaw (bare YYYY-MM-DD, stored from <input type="date">)
 * - Falls back to created_at (ISO timestamp), extracting LOCAL date components to avoid UTC shift
 */
function getInvoiceDateStr(inv) {
    const raw = inv.invoice_meta?.dateRaw
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    // Fallback: timestamp → extract local components (avoids UTC midnight → previous day in EST)
    const ts = inv.created_at
    if (ts) {
        const d = new Date(ts)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return ''
}

function createRevenueChart(invoices, range = 'ytd') {
    _chartInvoices = invoices
    const canvas = document.getElementById('revenueChart')
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // ── Build data based on range ───────────────────────────────────────────
    const now = new Date()
    const labels = [], data = []

    if (range === '30d') {
        // Last 30 days grouped by day (show every 5th label)
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i)
            const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            // Build key using LOCAL date components (not UTC) to avoid timezone shift
            const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            labels.push(i % 5 === 0 ? key : '')  // Only show every 5th label
            data.push(invoices.filter(inv => getInvoiceDateStr(inv) === dayKey)
                .reduce((s, inv) => s + (inv.totals?.total || 0), 0))
        }
    } else if (range === '90d') {
        // Last 13 weeks
        for (let i = 12; i >= 0; i--) {
            const from = new Date(now); from.setDate(from.getDate() - i * 7 - 6)
            const to = new Date(now); to.setDate(to.getDate() - i * 7)
            labels.push(from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
            data.push(invoices.filter(inv => {
                const ds = getInvoiceDateStr(inv)
                if (!ds) return false
                const [y, m, dd] = ds.split('-').map(Number)
                const invDate = new Date(y, m - 1, dd, 12) // noon local — avoids DST edge
                return invDate >= from && invDate <= to
            }).reduce((s, inv) => s + (inv.totals?.total || 0), 0))
        }
    } else {
        // YTD — last 12 months
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const mo = String(d.getMonth() + 1).padStart(2, '0')
            const key = `${d.getFullYear()}-${mo}`
            labels.push(d.toLocaleDateString('en-US', { month: 'short' }))
            data.push(invoices.filter(inv => {
                const ds = getInvoiceDateStr(inv)
                return ds.slice(0, 7) === key
            }).reduce((s, inv) => s + (inv.totals?.total || 0), 0))
        }
    }

    // ── Update header total ────────────────────────────────────────────────
    const totalYTD = data.reduce((a, b) => a + b, 0)
    const headerEl = document.getElementById('chartTotal')
    if (headerEl) headerEl.textContent = formatCurrency(totalYTD)

    // ── Canvas setup ───────────────────────────────────────────────────────
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.parentElement.getBoundingClientRect()
    const W = Math.floor(rect.width) || 800
    const H = 300

    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 30, right: 30, bottom: 40, left: 64 }
    const cw = W - pad.left - pad.right
    const ch = H - pad.top - pad.bottom
    const maxVal = Math.max(...data, 1)
    const gridCount = 5

    const ptX = i => pad.left + (data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2)
    const ptY = v => pad.top + ch - (v / maxVal) * ch

    // ── Draw helper: base chart ────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch)
    grad.addColorStop(0, 'rgba(255, 107, 74, 0.22)')
    grad.addColorStop(1, 'rgba(255, 107, 74, 0.01)')

    function drawBase() {
        ctx.clearRect(0, 0, W, H)

        // Grid lines + Y labels
        ctx.strokeStyle = '#F3F4F6'; ctx.lineWidth = 1
        ctx.fillStyle = '#9CA3AF'; ctx.textAlign = 'right'; ctx.font = '11px Inter, sans-serif'
        for (let g = 0; g <= gridCount; g++) {
            const v = (maxVal / gridCount) * g
            const y = ptY(v)
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke()
            const l = v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(v)}`
            ctx.fillText(l, pad.left - 8, y + 4)
        }

        // Area fill
        ctx.beginPath()
        for (let i = 0; i < data.length; i++) {
            const x = ptX(i), y = ptY(data[i])
            if (i === 0) ctx.moveTo(x, y)
            else { const p = ptX(i - 1); ctx.bezierCurveTo((p + x) / 2, ptY(data[i - 1]), (p + x) / 2, y, x, y) }
        }
        ctx.lineTo(ptX(data.length - 1), pad.top + ch)
        ctx.lineTo(ptX(0), pad.top + ch)
        ctx.closePath(); ctx.fillStyle = grad; ctx.fill()

        // Line stroke
        ctx.beginPath()
        for (let i = 0; i < data.length; i++) {
            const x = ptX(i), y = ptY(data[i])
            if (i === 0) ctx.moveTo(x, y)
            else { const p = ptX(i - 1); ctx.bezierCurveTo((p + x) / 2, ptY(data[i - 1]), (p + x) / 2, y, x, y) }
        }
        ctx.strokeStyle = '#FF6B4A'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke()

        // X labels
        ctx.fillStyle = '#9CA3AF'; ctx.textAlign = 'center'; ctx.font = '11px Inter, sans-serif'
        labels.forEach((label, i) => { if (label) ctx.fillText(label, ptX(i), H - 8) })
    }

    drawBase()

    // ── Hover ──────────────────────────────────────────────────────────────
    canvas.onmousemove = (e) => {
        const b = canvas.getBoundingClientRect()
        const mouseX = e.clientX - b.left
        let closest = 0, minD = Infinity
        data.forEach((_, i) => { const d = Math.abs(ptX(i) - mouseX); if (d < minD) { minD = d; closest = i } })

        drawBase()

        const hx = ptX(closest), hy = ptY(data[closest])

        // Crosshair
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(hx, pad.top); ctx.lineTo(hx, pad.top + ch); ctx.stroke(); ctx.restore()

        // Dot
        ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#FF6B4A'; ctx.fill()
        ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke()

        // Tooltip
        const tooltipText = `${labels[closest] || ''} · ${formatCurrency(data[closest])}`
        ctx.font = 'bold 12px Inter, sans-serif'
        const tw = ctx.measureText(tooltipText).width
        const tp = 10, th = 28
        // Smart position: prefer above the dot, keep inside canvas
        let tx = hx - tw / 2 - tp
        let ty = hy - th - 10
        if (tx < pad.left) tx = pad.left
        if (tx + tw + tp * 2 > W - pad.right) tx = W - pad.right - tw - tp * 2
        if (ty < 4) ty = hy + 14

        ctx.fillStyle = '#1F2937'
        ctx.beginPath(); ctx.roundRect(tx, ty, tw + tp * 2, th, 6); ctx.fill()
        ctx.fillStyle = 'white'; ctx.textAlign = 'left'
        ctx.fillText(tooltipText, tx + tp, ty + th - 8)
    }

    canvas.onmouseleave = () => drawBase()
}

// Wire up 30D / 90D / YTD segmented buttons
document.querySelectorAll('.segmented__btn[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.segmented__btn[data-range]').forEach(b => {
            b.classList.remove('is-active')
            b.setAttribute('aria-pressed', 'false')
        })
        btn.classList.add('is-active')
        btn.setAttribute('aria-pressed', 'true')
        createRevenueChart(_chartInvoices, btn.dataset.range)
    })
})

// Global functions for inline onclick handlers
window.viewInvoice = function (invoiceNumber) {
    window.location.href = `app.html?invoice_number=${invoiceNumber}`
}

window.emailInvoice = async function (invoiceNumber) {
    try {
        const data = await getInvoice(invoiceNumber);
        if (!data) throw new Error('Invoice not found');

        const subject = `Invoice ${data.invoice_number} from ${data.business_info.name}`;
        const total = data.totals.totalDisplay || `$${data.totals.total}`;
        const body = `Hi ${data.client_info.name},\n\nPlease find attached invoice ${data.invoice_number} for ${total}.\n\nThank you,\n${data.business_info.name}`;
        const mailto = `mailto:${data.client_info.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
        showToast('Opening email client...', 'success');
    } catch (e) {
        console.error(e);
        showToast('Error: ' + e.message, 'error');
    }
}

window.downloadPDF = async function (invoiceNumber) {
    try {
        showToast('Generating PDF...', 'info');
        const data = await getInvoice(invoiceNumber);
        if (!data) throw new Error('Invoice not found');

        generatePDF(data);
        showToast('Download started', 'success');
    } catch (e) {
        console.error(e);
        showToast('Error: ' + e.message, 'error');
    }
}
// Initialize dashboard
async function initDashboard() {
    try {
        // Check authentication
        const user = await checkAuth()
        if (!user) return

        // Update user name (if these elements still exist)
        const userName = user.user_metadata?.full_name || user.email.split('@')[0]
        const userNameEl = document.getElementById('userName')
        const userNameDisplayEl = document.getElementById('userNameDisplay')
        if (userNameEl) userNameEl.textContent = userName
        if (userNameDisplayEl) userNameDisplayEl.textContent = userName

        // Load invoices
        const invoices = await getInvoices(user)
        allInvoicesCache = invoices

        // Calculate and update stats
        const stats = calculateStats(invoices)
        updateStatsCards(stats)

        // Render recent invoices
        renderRecentInvoices(allInvoicesCache)

        // Create revenue chart
        createRevenueChart(invoices)

        // Wire up Modal Events once
        if (!window.modalWired) {
            window.modalWired = true
            document.getElementById('cancelPaidDateBtn')?.addEventListener('click', closePaidModalDash)
            document.getElementById('confirmPaidDateBtn')?.addEventListener('click', async () => {
                if (!window.invoiceToPayDash) return
                const dateVal = document.getElementById('modalPaidDateInput').value
                if (!dateVal) {
                    showToast('Please select a payment date', 'error')
                    return
                }

                const btn = document.getElementById('confirmPaidDateBtn')
                btn.disabled = true
                btn.textContent = 'Saving...'

                try {
                    await updateInvoiceStatus(window.invoiceToPayDash, 'paid', dateVal)
                    showToast('Invoice marked as paid', 'success')
                    closePaidModalDash()
                    initDashboard() // Refresh dashboard data
                } catch (e) {
                    showToast('Error: ' + e.message, 'error')
                } finally {
                    btn.disabled = false
                    btn.textContent = 'Mark as Paid'
                }
            })
        }

        // ── Active Consultants KPI ────────────────────────────────────────
        try {
            const consultants = await dbGetConsultants();
            const today = new Date().toISOString().slice(0, 10);
            const active = consultants.filter(c => {
                if (!c.end_date) return true; // No end date = active
                return c.end_date >= today;   // End date is today or future = still active
            });
            const kpiEl = document.getElementById('activeConsultantsKpi');
            const changeEl = document.getElementById('activeConsultantsChange');
            if (kpiEl) kpiEl.textContent = String(active.length);
            if (changeEl) {
                const total = consultants.length;
                const inactive = total - active.length;
                changeEl.textContent = inactive > 0
                    ? `${inactive} inactive of ${total} total`
                    : `All ${total} active`;
                changeEl.style.color = inactive > 0 ? '#d97706' : '#059669';
            }
        } catch (consultantErr) {
            console.warn('Could not fetch consultant headcount:', consultantErr);
        }
        // ── End Active Consultants KPI ────────────────────────────────────

    } catch (error) {
        console.error('Dashboard initialization error:', error)
        showToast('Error loading dashboard data', 'error')
    }
}

// ── Quick Actions ──────────────────────────────────────────

window.markAsSentDash = async function (id) {
    try {
        await updateInvoiceStatus(id, 'sent', null)
        showToast('Invoice marked as sent', 'success')
        initDashboard()
    } catch (e) {
        showToast('Error: ' + e.message, 'error')
    }
}

window.unmarkPaidDash = async function (id) {
    try {
        await updateInvoiceStatus(id, 'sent', null)
        showToast('Invoice reverted to sent status', 'info')
        initDashboard()
    } catch (e) {
        showToast('Error: ' + e.message, 'error')
    }
}

window.invoiceToPayDash = null

window.markAsPaidDash = function (id) {
    window.invoiceToPayDash = id
    // default to today
    document.getElementById('modalPaidDateInput').value = new Date().toISOString().split('T')[0]
    document.getElementById('paidDateModal').style.display = 'flex'
}

function closePaidModalDash() {
    window.invoiceToPayDash = null
    document.getElementById('paidDateModal').style.display = 'none'
}


// Global Event Delegation for dynamic elements (Nav, etc.)
document.addEventListener('click', (e) => {
    // User Menu Toggle
    const userMenuBtn = e.target.closest('#userMenuBtn');
    if (userMenuBtn) {
        document.getElementById('userMenu').classList.toggle('show');
        return;
    }

    // Close Menu (Click outside)
    if (!e.target.closest('#userMenu') && !e.target.closest('#userMenuBtn')) {
        const userMenu = document.getElementById('userMenu');
        if (userMenu) userMenu.classList.remove('show');
    }

    // Logout
    const logoutBtn = e.target.closest('#logoutBtn');
    if (logoutBtn) {
        e.preventDefault();
        signOut();
    }
});

// Initialize on page load
initDashboard()

document.addEventListener('dashboard:global-search', (event) => {
    const query = String(event?.detail?.query || '')
    dashboardSearchQuery = query
    renderRecentInvoices(allInvoicesCache)
})

// Real-time Sync
const channel = new BroadcastChannel('app_channel');
channel.onmessage = (event) => {
    if (event.data.type === 'invoice_saved') {
        initDashboard();
        showToast('Dashboard updated', 'success');
    }
};

// Refresh Button
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('spinning'); // Assume css class for spin
        initDashboard().then(() => {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
            showToast('Refreshed');
        });
    });
}
