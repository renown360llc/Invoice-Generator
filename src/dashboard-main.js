import { getCurrentUser, signOut } from './auth.js'
import { getInvoices, getInvoice } from './database.js'
import { generatePDF } from './modules/pdf.js'
import { formatCurrency } from './modules/utils.js'
import './security.js'

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

    return {
        monthlyRevenue,
        yearlyRevenue,
        avgInvoice,
        totalInvoices: invoices.length,
        thisMonthCount: thisMonth.length
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
            return `<div style="font-size: 0.75em; line-height: 1.4; margin-bottom: 2px;">
                ${formatCurrency(amount, curr)}
            </div>`
        }).join('')
    }

    document.getElementById('monthlyRevenue').innerHTML = renderStacked(stats.monthlyRevenue)
    document.getElementById('yearlyRevenue').innerHTML = renderStacked(stats.yearlyRevenue)
    document.getElementById('avgInvoice').innerHTML = renderStacked(stats.avgInvoice)

    document.getElementById('totalInvoices').textContent = stats.totalInvoices

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
                <td colspan="5" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">📭</span>
                        <p class="empty-state__text">No invoices yet</p>
                        <a href="app.html" class="btn btn--primary btn--sm">Create your first invoice</a>
                    </div>
                </td>
            </tr>
        `
        return
    }

    // Show last 5 invoices
    const recent = invoices.slice(0, 5)

    tbody.innerHTML = recent.map(invoice => `
        <tr>
            <td><strong>${escapeHtml(invoice.invoice_number)}</strong></td>
            <td>${escapeHtml(invoice.client_info?.name || 'N/A')}</td>
            <td>${formatDate(invoice.created_at)}</td>
            <td><strong>${formatCurrency(invoice.totals?.total || 0, invoice.invoice_meta?.currency)}</strong></td>
            <td>
                <div class="action-pills">
                    <button class="action-pill action-pill--edit" onclick="viewInvoice('${escapeHtml(invoice.invoice_number)}')" title="Edit Invoice">
                        Edit
                    </button>
                     <button class="action-pill action-pill--download" onclick="downloadPDF('${escapeHtml(invoice.invoice_number)}')" title="Download PDF">
                        PDF
                    </button>
                    <button class="action-pill action-pill--email" onclick="emailInvoice('${escapeHtml(invoice.invoice_number)}')" title="Email Invoice">
                        Email
                    </button>
                </div>
            </td>
        </tr>
    `).join('')
}

// Create revenue chart
function createRevenueChart(invoices) {
    const canvas = document.getElementById('revenueChart')
    const ctx = canvas.getContext('2d')

    // Get last 6 months of data
    const monthlyData = {}
    const now = new Date()

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        monthlyData[key] = 0
    }

    // Aggregate invoice totals by month
    invoices.forEach(inv => {
        const date = new Date(inv.created_at)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        if (monthlyData.hasOwnProperty(key)) {
            monthlyData[key] += inv.totals?.total || 0
        }
    })

    // Prepare chart data
    const labels = Object.keys(monthlyData).map(key => {
        const [year, month] = key.split('-')
        const date = new Date(year, parseInt(month) - 1)
        return date.toLocaleDateString('en-US', { month: 'short' })
    })

    const data = Object.values(monthlyData)
    const maxValue = Math.max(...data, 1)

    // Simple bar chart implementation
    const padding = 40
    const chartWidth = canvas.width - padding * 2
    const chartHeight = canvas.height - padding * 2
    const barWidth = chartWidth / labels.length - 10

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw bars
    data.forEach((value, index) => {
        const barHeight = (value / maxValue) * chartHeight
        const x = padding + index * (barWidth + 10)
        const y = canvas.height - padding - barHeight

        // Draw bar
        ctx.fillStyle = '#2563eb'
        ctx.fillRect(x, y, barWidth, barHeight)

        // Draw label
        ctx.fillStyle = '#6b7280'
        ctx.font = '12px Inter'
        ctx.textAlign = 'center'
        ctx.fillText(labels[index], x + barWidth / 2, canvas.height - padding + 20)

        // Draw value
        if (value > 0) {
            ctx.fillStyle = '#111827'
            ctx.font = 'bold 12px Inter'
            ctx.fillText(formatCurrency(value), x + barWidth / 2, y - 5)
        }
    })

    // Draw y-axis
    ctx.strokeStyle = '#e5e7eb'
    ctx.beginPath()
    ctx.moveTo(padding, padding)
    ctx.lineTo(padding, canvas.height - padding)
    ctx.stroke()

    // Draw x-axis
    ctx.beginPath()
    ctx.moveTo(padding, canvas.height - padding)
    ctx.lineTo(canvas.width - padding, canvas.height - padding)
    ctx.stroke()
}

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

        // Update user name
        const userName = user.user_metadata?.full_name || user.email.split('@')[0]
        document.getElementById('userName').textContent = userName
        document.getElementById('userNameDisplay').textContent = userName

        // Load invoices
        const invoices = await getInvoices(user)

        // Calculate and update stats
        const stats = calculateStats(invoices)
        updateStatsCards(stats)

        // Render recent invoices
        renderRecentInvoices(invoices)

        // Create revenue chart
        createRevenueChart(invoices)

    } catch (error) {
        console.error('Dashboard initialization error:', error)
        showToast('Error loading dashboard data', 'error')
    }
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
