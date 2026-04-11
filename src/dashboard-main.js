import { getCurrentUser, signOut } from './auth.js'
import { getInvoices, getInvoice, updateInvoiceStatus, recordInvoicePayment, deleteInvoicePayment } from './database.js'
import { dbGetConsultants } from './modules/db-consultants.js'
import { dbGetTimesheetsForYear } from './modules/db-timesheets.js'
import { getRecentAuditEvents } from './modules/audit-trail.js'
import { setSharedFilters } from './modules/crm-filters.js'
import { generatePDF } from './modules/pdf.js'
import { formatCurrency } from './modules/utils.js'
import './security.js'

let allInvoicesCache = []
let dashboardSearchQuery = ''
let _chartInvoices = []
let _chartSelectedCurrency = ''
let dashboardOperationsCache = null

function getInvoiceCurrency(inv) {
    return String(inv.invoice_meta?.currency || 'USD').toUpperCase()
}

function isPaidInvoice(inv) {
    const s = String(inv.status || '').toLowerCase();
    return s === 'paid' || s === 'partially_paid';
}

function parseDateOnly(dateString) {
    if (!dateString) return null
    const raw = String(dateString).trim()
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
    }

    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12)
}

function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(Number(value) || 0)
}

function formatHours(value) {
    const amount = Number(value) || 0
    return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} hrs`
}

function formatCurrencyBreakdown(totals = {}) {
    const entries = Object.entries(totals).filter(([, amount]) => Number(amount) > 0)
    if (!entries.length) return 'No revenue calculated yet'
    return entries
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([currency, amount]) => formatCurrency(amount, currency))
        .join(' • ')
}

function getCurrentMonthRange(baseDate = new Date()) {
    const year = baseDate.getFullYear()
    const monthIndex = baseDate.getMonth()
    const month = String(monthIndex + 1).padStart(2, '0')
    const start = `${year}-${month}-01`
    const endDate = new Date(year, monthIndex + 1, 0)
    const end = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`
    const label = baseDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const shortLabel = baseDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return { year, month, start, end, label, shortLabel }
}

function getMonthRangeForDate(date) {
    const year = date.getFullYear()
    const monthIndex = date.getMonth()
    const month = String(monthIndex + 1).padStart(2, '0')
    const start = `${year}-${month}-01`
    const endDate = new Date(year, monthIndex + 1, 0)
    const end = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const shortLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return { year, month, start, end, label, shortLabel }
}

function overlapsPeriod(periodStart, periodEnd, rangeStart, rangeEnd) {
    if (!periodStart || !periodEnd) return false
    return periodStart <= rangeEnd && periodEnd >= rangeStart
}

function isConsultantActiveForRange(consultant, range) {
    if (!consultant) return false
    const status = String(consultant.status || '').toLowerCase()
    if (status === 'inactive' || status === 'pending') return false
    const startDate = String(consultant.start_date || '').trim()
    const endDate = String(consultant.end_date || '').trim()
    if (startDate && startDate > range.end) return false
    if (endDate && endDate < range.start) return false
    return true
}

function getBillingCloseContext(baseDate = new Date(), approvalBufferDays = 3) {
    const today = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
    const closeDate = new Date(today.getFullYear(), today.getMonth(), 0)
    const range = getMonthRangeForDate(closeDate)
    const bufferEndsOn = new Date(today.getFullYear(), today.getMonth(), approvalBufferDays)
    const msPerDay = 86400000
    const daysUntilBufferEnds = Math.max(0, Math.ceil((bufferEndsOn.getTime() - today.getTime()) / msPerDay))
    const closeActive = today.getTime() > bufferEndsOn.getTime()
    return {
        range,
        approvalBufferDays,
        closeActive,
        daysUntilBufferEnds,
        bufferEndsOnLabel: bufferEndsOn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
}

function getEffectiveRate(consultant) {
    const billRate = Number(consultant?.bill_rate || 0)
    if (billRate > 0) return { amount: billRate, label: 'Bill Rate' }
    const commissionRate = Number(consultant?.commission_rate || 0)
    if (commissionRate > 0) return { amount: commissionRate, label: 'Commission' }
    return { amount: 0, label: 'Rate' }
}

function getInvoiceDisplayStatus(invoice) {
    const status = String(invoice?.status || 'draft').toLowerCase()
    if (status === 'sent' && invoice?.invoice_meta?.dueDateRaw) {
        const dueDate = parseDateOnly(invoice.invoice_meta.dueDateRaw)
        if (dueDate && dueDate < new Date()) return 'overdue'
    }
    return status
}

function dueDateLabel(invoice) {
    const raw = String(invoice?.invoice_meta?.dueDateRaw || '').trim()
    if (!raw) return 'No due date'
    const parsed = parseDateOnly(raw)
    return parsed ? formatDate(raw) : raw
}

function invoiceAgeInDays(invoice) {
    const dateStr = getInvoiceDateStr(invoice)
    const created = parseDateOnly(dateStr)
    const today = parseDateOnly(new Date().toISOString().slice(0, 10))
    if (!created || !today) return 0
    return Math.max(0, Math.floor((today.getTime() - created.getTime()) / 86400000))
}

function daysUntilDate(dateString) {
    const target = parseDateOnly(dateString)
    const today = parseDateOnly(new Date().toISOString().slice(0, 10))
    if (!target || !today) return null
    return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function renderCloseStepState(tone, label, meta) {
    return { tone, label, meta }
}

function formatRelativeTime(timestamp) {
    const value = parseDateOnly(String(timestamp || '').slice(0, 10)) || new Date(timestamp)
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'Just now'
    const diffMs = Date.now() - value.getTime()
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000))
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    const diffHours = Math.round(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.round(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function prettyEntityLabel(entityType) {
    const normalized = String(entityType || '').toLowerCase()
    if (normalized === 'invoice') return 'Invoice'
    if (normalized === 'timesheet') return 'Timesheet'
    if (normalized === 'consultant') return 'Consultant'
    if (normalized === 'template') return 'Template'
    return 'Activity'
}

function summarizeSample(values = [], max = 3) {
    if (!values.length) return 'None'
    const visible = values.slice(0, max)
    const remaining = values.length - visible.length
    return remaining > 0
        ? `${visible.join(', ')} +${remaining} more`
        : visible.join(', ')
}

function setText(id, value) {
    const element = document.getElementById(id)
    if (element) element.textContent = value
}

function setHtml(id, value) {
    const element = document.getElementById(id)
    if (element) element.innerHTML = value
}

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
    if (!dateString) return '—';
    const cleanStr = String(dateString).length === 10 ? `${dateString}T12:00:00` : String(dateString);
    const parsed = Date.parse(cleanStr);
    if (Number.isNaN(parsed)) return '—';
    return new Date(parsed).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

function formatCompactCurrency(amount, currency = 'USD') {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            notation: 'compact',
            maximumFractionDigits: 1
        }).format(Number(amount) || 0)
    } catch (error) {
        return formatCurrency(amount, currency)
    }
}

// Calculate statistics
function calculateStats(invoices) {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Helper: Sum collected amounts by currency
    const sumCollected = (list) => {
        const totals = {}
        list.forEach(inv => {
            const curr = getInvoiceCurrency(inv)
            // Sum actual collected amounts for accurate revenue tracking
            const amount = Number(inv.totals?.amount_paid || 0)
            totals[curr] = (totals[curr] || 0) + amount
        })
        return totals
    }

    const paidInvoices = invoices.filter(isPaidInvoice)

    // Revenue recognition uses payment received date for paid invoices.
    // For older paid invoices without paid_date, fall back to invoice date so legacy records still surface.
    const thisMonthRevenue = paidInvoices.filter(inv => {
        const d = parseDateOnly(getRevenueDateStr(inv))
        return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    const thisYearRevenue = paidInvoices.filter(inv => {
        const d = parseDateOnly(getRevenueDateStr(inv))
        return d && d.getFullYear() === currentYear
    })

    // Calculate aggregate buckets
    const monthlyRevenue = sumCollected(thisMonthRevenue)
    const yearlyRevenue = sumCollected(thisYearRevenue)

    // Calculate Average Invoice Size per Currency
    // (Total Revenue in Currency X) / (Count of Invoices in Currency X)
    const totalRevenueAllTime = sumCollected(paidInvoices)
    const avgInvoice = {}

    Object.keys(totalRevenueAllTime).forEach(curr => {
        const count = paidInvoices.filter(inv => getInvoiceCurrency(inv) === curr).length
        if (count > 0) {
            avgInvoice[curr] = totalRevenueAllTime[curr] / count
        }
    })

    // Outstanding receivables = totals of sent/overdue (not yet paid) invoices
    // Note: Enterprise logic sums the balance_due for all active invoices
    const sumBalance = (list) => {
        const totals = {}
        list.forEach(inv => {
            const curr = getInvoiceCurrency(inv)
            const due = Number(inv.totals?.balance_due ?? inv.totals?.total ?? 0)
            totals[curr] = (totals[curr] || 0) + due
        })
        return totals
    }
    const outstanding = invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'partially_paid');
    const outstandingReceivables = sumBalance(outstanding);

    return {
        monthlyRevenue,
        yearlyRevenue,
        avgInvoice,
        outstandingReceivables,
        outstandingCount: outstanding.length,
        totalInvoices: invoices.length,
        thisMonthCount: thisMonthRevenue.length,
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
    document.getElementById('monthlyChange').textContent = `${stats.thisMonthCount} payment${stats.thisMonthCount === 1 ? '' : 's'} this month`
    document.getElementById('invoiceChange').textContent = 'All time'
    document.getElementById('yearlyChange').textContent = 'Paid year to date'
}

function calculateOperationsData({ consultants = [], timesheets = [], invoices = [] }) {
    const closeContext = getBillingCloseContext()
    const range = closeContext.range
    const activeConsultants = consultants.filter((consultant) => isConsultantActiveForRange(consultant, range))
    const activeConsultantIds = new Set(activeConsultants.map((consultant) => consultant.id))
    const liveInvoiceIds = new Set(invoices.map((invoice) => invoice.id).filter(Boolean))
    const liveInvoiceNumbers = new Set(invoices.map((invoice) => invoice.invoice_number).filter(Boolean))

    const monthTimesheets = timesheets.filter((row) => (
        activeConsultantIds.has(row.consultant_id) &&
        overlapsPeriod(row.period_start, row.period_end, range.start, range.end)
    ))

    const consultantRowsMap = monthTimesheets.reduce((map, row) => {
        const bucket = map.get(row.consultant_id) || []
        bucket.push(row)
        map.set(row.consultant_id, bucket)
        return map
    }, new Map())

    const hoursLogged = monthTimesheets.reduce((sum, row) => sum + (Number(row.hours_worked) || 0), 0)

    const staleLinkedTimesheets = monthTimesheets.filter((row) => {
        const hasInvoiceRef = Boolean(row.invoice_id || row.invoice_number)
        if (!hasInvoiceRef) return false
        const hasLiveLink = (row.invoice_id && liveInvoiceIds.has(row.invoice_id))
            || (row.invoice_number && liveInvoiceNumbers.has(row.invoice_number))
        return !hasLiveLink
    })

    const zeroHourPendingRows = monthTimesheets.filter((row) => {
        const hasLiveLink = (row.invoice_id && liveInvoiceIds.has(row.invoice_id))
            || (row.invoice_number && liveInvoiceNumbers.has(row.invoice_number))
        return !hasLiveLink && (Number(row.hours_worked) || 0) <= 0
    })

    const readyTimesheets = monthTimesheets.filter((row) => {
        const hasHours = Number(row.hours_worked) > 0
        if (!hasHours) return false
        const hasLiveLink = (row.invoice_id && liveInvoiceIds.has(row.invoice_id))
            || (row.invoice_number && liveInvoiceNumbers.has(row.invoice_number))
        return !hasLiveLink
    })

    const readyRevenue = readyTimesheets.reduce((totals, row) => {
        const consultant = row.consultants || {}
        const { amount } = getEffectiveRate(consultant)
        const currency = String(consultant.currency || 'USD').toUpperCase()
        if (amount > 0) {
            totals[currency] = (totals[currency] || 0) + (Number(row.hours_worked) || 0) * amount
        }
        return totals
    }, {})

    const readyConsultants = new Set(readyTimesheets.map((row) => row.consultant_id))
    const readyConsultantNames = Array.from(new Set(
        readyTimesheets
            .map((row) => row.consultants?.name)
            .filter(Boolean)
    ))
    const zeroHourPendingConsultants = Array.from(new Set(
        zeroHourPendingRows
            .map((row) => row.consultants?.name)
            .filter(Boolean)
    ))
    const missingTimesheetConsultants = activeConsultants.filter((consultant) => !consultantRowsMap.has(consultant.id))

    const overdueInvoices = invoices.filter((invoice) => getInvoiceDisplayStatus(invoice) === 'overdue')
    const dueSoonInvoices = invoices.filter((invoice) => {
        if (getInvoiceDisplayStatus(invoice) !== 'sent') return false
        const due = parseDateOnly(invoice.invoice_meta?.dueDateRaw)
        const today = parseDateOnly(new Date().toISOString().slice(0, 10))
        if (!due || !today) return false
        const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000)
        return diff >= 0 && diff <= 7
    })
    const dueSoonIds = new Set(dueSoonInvoices.map((inv) => inv.id))
    const sentAwaitingInvoices = invoices.filter((invoice) => {
        if (getInvoiceDisplayStatus(invoice) !== 'sent') return false
        return !dueSoonIds.has(invoice.id)
    })
    const draftInvoices = invoices.filter((invoice) => String(invoice.status || '').toLowerCase() === 'draft')
    const staleDraftInvoices = draftInvoices.filter((invoice) => invoiceAgeInDays(invoice) >= 7)
    const recentlyPaidInvoices = invoices.filter((invoice) => {
        if (!isPaidInvoice(invoice)) return false
        const dateStr = getRevenueDateStr(invoice)
        const age = daysUntilDate(dateStr)
        return age !== null && age >= -14
    })

    const consultantsMissingRate = activeConsultants.filter((consultant) => getEffectiveRate(consultant).amount <= 0)
    const consultantsMissingRateWithHours = consultantsMissingRate.filter((consultant) => {
        const rows = consultantRowsMap.get(consultant.id) || []
        return rows.some((row) => Number(row.hours_worked) > 0)
    })

    const exceptionItems = []
    if (overdueInvoices.length) {
        exceptionItems.push({
            severity: 'critical',
            title: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`,
            meta: `${summarizeSample(overdueInvoices.map((invoice) => `${invoice.invoice_number} (${invoice.client_info?.name || 'Unknown client'})`))} • review collections immediately`,
            actionLabel: 'Review overdue',
            page: 'invoices.html',
            filters: { status: 'overdue' }
        })
    }
    if (consultantsMissingRate.length) {
        exceptionItems.push({
            severity: 'warning',
            title: `${consultantsMissingRate.length} consultant${consultantsMissingRate.length === 1 ? '' : 's'} missing billing setup`,
            meta: consultantsMissingRateWithHours.length
                ? `${consultantsMissingRateWithHours.length} already have ${range.shortLabel} hours logged. ${summarizeSample(consultantsMissingRateWithHours.map((consultant) => consultant.name))}`
                : `${summarizeSample(consultantsMissingRate.map((consultant) => consultant.name))} • add either bill rate or commission`,
            actionLabel: 'Fix consultants',
            page: 'consultants.html',
            filters: {}
        })
    }
    if (staleLinkedTimesheets.length) {
        exceptionItems.push({
            severity: 'warning',
            title: `${new Set(staleLinkedTimesheets.map((row) => row.consultant_id)).size} consultant${new Set(staleLinkedTimesheets.map((row) => row.consultant_id)).size === 1 ? '' : 's'} have stale invoice links`,
            meta: `${summarizeSample(Array.from(new Set(staleLinkedTimesheets.map((row) => row.consultants?.name).filter(Boolean))))} • their timesheets point to invoices that no longer exist`,
            actionLabel: 'Review timesheets',
            page: 'timesheets.html',
            filters: { month: range.month, year: range.year }
        })
    }
    if (closeContext.closeActive && zeroHourPendingConsultants.length) {
        exceptionItems.push({
            severity: 'info',
            title: `${zeroHourPendingConsultants.length} consultant${zeroHourPendingConsultants.length === 1 ? '' : 's'} still awaiting approved hours for ${range.shortLabel}`,
            meta: `${summarizeSample(zeroHourPendingConsultants)} • timesheet placeholders exist, but approved hours are still zero`,
            actionLabel: 'Review close period',
            page: 'timesheets.html',
            filters: { month: range.month, year: range.year, status: 'pending' }
        })
    }
    if (closeContext.closeActive && readyConsultants.size) {
        exceptionItems.push({
            severity: 'warning',
            title: `${readyConsultants.size} consultant${readyConsultants.size === 1 ? '' : 's'} still unbilled for ${range.shortLabel}`,
            meta: `${summarizeSample(readyConsultantNames)} • ${formatHours(readyTimesheets.reduce((sum, row) => sum + (Number(row.hours_worked) || 0), 0))} waiting to be invoiced`,
            actionLabel: 'Invoice now',
            page: 'timesheets.html',
            filters: { month: range.month, year: range.year, status: 'pending' }
        })
    }
    if (closeContext.closeActive && missingTimesheetConsultants.length) {
        exceptionItems.push({
            severity: 'info',
            title: `${missingTimesheetConsultants.length} consultant${missingTimesheetConsultants.length === 1 ? '' : 's'} missing ${range.shortLabel} timesheets`,
            meta: `${summarizeSample(missingTimesheetConsultants.map((consultant) => consultant.name))} • close-period hours are now overdue`,
            actionLabel: 'Open timesheets',
            page: 'timesheets.html',
            filters: { month: range.month, year: range.year }
        })
    }
    if (dueSoonInvoices.length) {
        exceptionItems.push({
            severity: 'info',
            title: `${dueSoonInvoices.length} invoice${dueSoonInvoices.length === 1 ? '' : 's'} due in the next 7 days`,
            meta: `${summarizeSample(dueSoonInvoices.map((invoice) => `${invoice.invoice_number} due ${dueDateLabel(invoice)}`))} • stay ahead of collections`,
            actionLabel: 'Review sent',
            page: 'invoices.html',
            filters: { status: 'sent' }
        })
    }
    if (staleDraftInvoices.length) {
        exceptionItems.push({
            severity: 'warning',
            title: `${staleDraftInvoices.length} stale draft invoice${staleDraftInvoices.length === 1 ? '' : 's'}`,
            meta: `${summarizeSample(staleDraftInvoices.map((invoice) => `${invoice.invoice_number} (${invoiceAgeInDays(invoice)}d)`))} • either send them or clean them up`,
            actionLabel: 'Review drafts',
            page: 'invoices.html',
            filters: { status: 'draft' }
        })
    }

    const closeSteps = [
        closeContext.closeActive
            ? ((missingTimesheetConsultants.length + zeroHourPendingConsultants.length) === 0
                ? renderCloseStepState('done', 'Timesheets finalized', `All ${range.shortLabel} consultant rows are present and approved.`)
                : renderCloseStepState('warning', 'Timesheets still need follow-up', `${missingTimesheetConsultants.length} missing rows and ${zeroHourPendingConsultants.length} awaiting approved hours.`))
            : renderCloseStepState('active', 'Approval buffer active', `${range.shortLabel} hours are still being collected through ${closeContext.bufferEndsOnLabel}.`),
        readyTimesheets.length === 0
            ? renderCloseStepState('done', 'Invoices created', `No uninvoiced approved hours remain for ${range.shortLabel}.`)
            : renderCloseStepState('warning', 'Invoices still to create', `${readyConsultants.size} consultant${readyConsultants.size === 1 ? '' : 's'} still need invoices.`),
        draftInvoices.length === 0
            ? renderCloseStepState('done', 'Draft review complete', 'No invoice drafts are waiting to be finalized.')
            : renderCloseStepState('warning', 'Drafts waiting for review', `${draftInvoices.length} draft invoice${draftInvoices.length === 1 ? '' : 's'} still need review or sending.`),
        overdueInvoices.length === 0
            ? renderCloseStepState('done', 'Collections healthy', 'No overdue invoices are blocking collections right now.')
            : renderCloseStepState('warning', 'Collections need attention', `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'} need follow-up.`)
    ]

    const completedCloseSteps = closeSteps.filter((step) => step.tone === 'done').length
    const closeProgress = Math.round((completedCloseSteps / closeSteps.length) * 100)

    const collectionsActivity = [
        ...overdueInvoices.map((invoice) => ({
            type: 'overdue',
            title: `${invoice.invoice_number || 'Invoice'} is overdue`,
            meta: `${invoice.client_info?.name || 'Unknown client'} • due ${dueDateLabel(invoice)}`,
            amount: formatCurrency(invoice.totals?.total || 0, getInvoiceCurrency(invoice)),
            actionLabel: 'Open invoice',
            page: 'invoices.html',
            filters: { status: 'overdue' },
            rank: 4
        })),
        ...dueSoonInvoices.map((invoice) => ({
            type: 'due-soon',
            title: `${invoice.invoice_number || 'Invoice'} is due soon`,
            meta: `${invoice.client_info?.name || 'Unknown client'} • due ${dueDateLabel(invoice)}`,
            amount: formatCurrency(invoice.totals?.total || 0, getInvoiceCurrency(invoice)),
            actionLabel: 'Review sent',
            page: 'invoices.html',
            filters: { status: 'sent' },
            rank: 3
        })),
        ...recentlyPaidInvoices.map((invoice) => ({
            type: 'paid',
            title: `${invoice.invoice_number || 'Invoice'} was paid`,
            meta: `${invoice.client_info?.name || 'Unknown client'} • received ${formatDate(getRevenueDateStr(invoice))}`,
            amount: formatCurrency(invoice.totals?.total || 0, getInvoiceCurrency(invoice)),
            actionLabel: 'Open invoice',
            page: 'invoices.html',
            filters: {},
            rank: 2
        })),
        ...draftInvoices.map((invoice) => ({
            type: 'draft',
            title: `${invoice.invoice_number || 'Invoice'} is still a draft`,
            meta: `${invoice.client_info?.name || 'Unknown client'} • created ${invoiceAgeInDays(invoice)} day${invoiceAgeInDays(invoice) === 1 ? '' : 's'} ago`,
            amount: formatCurrency(invoice.totals?.total || 0, getInvoiceCurrency(invoice)),
            actionLabel: 'Open draft',
            page: 'invoices.html',
            filters: { status: 'draft' },
            rank: 1
        })),
        ...sentAwaitingInvoices.map((invoice) => {
            const dueStr = invoice.invoice_meta?.dueDateRaw
            const dueInfo = dueStr ? `due ${dueDateLabel(invoice)}` : `sent ${invoiceAgeInDays(invoice)}d ago`
            return {
                type: 'awaiting',
                title: `${invoice.invoice_number || 'Invoice'} awaiting payment`,
                meta: `${invoice.client_info?.name || 'Unknown client'} • ${dueInfo}`,
                amount: formatCurrency(invoice.totals?.total || 0, getInvoiceCurrency(invoice)),
                actionLabel: 'View invoice',
                page: 'invoices.html',
                filters: { status: 'sent' },
                rank: 1.5
            }
        })
    ]
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 8)

    const workflowCards = [
        {
            eyebrow: 'Billing',
            title: 'Ready to invoice',
            value: formatNumber(readyTimesheets.length),
            status: readyTimesheets.length ? 'Action needed' : 'All clear',
            statusTone: readyTimesheets.length ? 'warn' : 'good',
            meta: `${formatHours(readyTimesheets.reduce((sum, row) => sum + (Number(row.hours_worked) || 0), 0))} across ${readyConsultants.size} consultant${readyConsultants.size === 1 ? '' : 's'} • ${formatCurrencyBreakdown(readyRevenue)}`,
            trend: readyTimesheets.length ? 'Use Create Invoice to pull these hours in' : 'No uninvoiced hours this month',
            actionLabel: 'Review timesheets',
            page: 'timesheets.html',
            filters: { month: range.month, year: range.year, status: 'pending' }
        },
        {
            eyebrow: 'Coverage',
            title: closeContext.closeActive ? 'Close-period follow-up' : 'Awaiting approvals',
            value: closeContext.closeActive
                ? formatNumber(missingTimesheetConsultants.length + zeroHourPendingConsultants.length)
                : formatNumber(closeContext.daysUntilBufferEnds),
            status: closeContext.closeActive
                ? ((missingTimesheetConsultants.length + zeroHourPendingConsultants.length) ? 'Needs follow-up' : 'Covered')
                : 'Buffer active',
            statusTone: closeContext.closeActive
                ? ((missingTimesheetConsultants.length + zeroHourPendingConsultants.length) ? 'warn' : 'good')
                : 'good',
            meta: closeContext.closeActive
                ? `${missingTimesheetConsultants.length} missing rows • ${zeroHourPendingConsultants.length} awaiting approved hours for ${range.shortLabel}`
                : `${range.shortLabel} timesheets are still in the approval buffer until ${closeContext.bufferEndsOnLabel}`,
            trend: closeContext.closeActive
                ? ((missingTimesheetConsultants.length + zeroHourPendingConsultants.length) ? 'Follow up on missing or unapproved close-period entries' : 'Close period is fully covered')
                : 'Candidates still have time to submit and approve hours',
            actionLabel: 'Open close period',
            page: 'timesheets.html',
            filters: { month: range.month, year: range.year }
        },
        {
            eyebrow: 'Collections',
            title: 'Overdue invoices',
            value: formatNumber(overdueInvoices.length),
            status: overdueInvoices.length ? 'Critical' : 'Healthy',
            statusTone: overdueInvoices.length ? 'bad' : 'good',
            meta: overdueInvoices.length
                ? overdueInvoices.slice(0, 2).map((invoice) => `${invoice.invoice_number} due ${dueDateLabel(invoice)}`).join(' • ')
                : 'No overdue invoices right now',
            trend: overdueInvoices.length ? 'Prioritize payment follow-up' : 'Collections are up to date',
            actionLabel: 'Review overdue',
            page: 'invoices.html',
            filters: { status: 'overdue' }
        },
        {
            eyebrow: 'Review',
            title: 'Draft invoices',
            value: formatNumber(draftInvoices.length),
            status: draftInvoices.length ? 'Review needed' : 'Clear',
            statusTone: draftInvoices.length ? 'warn' : 'good',
            meta: draftInvoices.length
                ? `${draftInvoices.slice(0, 2).map((invoice) => invoice.invoice_number).join(' • ')} waiting to be sent`
                : 'No draft invoices waiting for approval',
            trend: draftInvoices.length ? 'Send or finalize drafts once reviewed' : 'Nothing sitting in draft',
            actionLabel: 'Open drafts',
            page: 'invoices.html',
            filters: { status: 'draft' }
        }
    ]

    return {
        range,
        activeConsultants,
        monthTimesheets,
        hoursLogged,
        readyTimesheets,
        readyRevenue,
        missingTimesheetConsultants,
        overdueInvoices,
        dueSoonInvoices,
        draftInvoices,
        staleDraftInvoices,
        staleLinkedTimesheets,
        zeroHourPendingRows,
        zeroHourPendingConsultants,
        closeSteps,
        closeProgress,
        collectionsActivity,
        recentlyPaidInvoices,
        closeContext,
        exceptionItems: exceptionItems.slice(0, 8),
        workflowCards
    }
}

function renderOperationsSummary(data) {
    const activeCount = data.activeConsultants.length
    const loggedConsultants = new Set(data.monthTimesheets.map((row) => row.consultant_id)).size
    setText('opsPeriodTitle', `${data.range.label} billing-close snapshot`)
    setText(
        'opsPeriodMeta',
        data.closeContext.closeActive
            ? `${loggedConsultants} consultants have ${data.range.shortLabel} timesheets. ${data.readyTimesheets.length} entries are ready to invoice, ${data.zeroHourPendingConsultants.length} are still awaiting approved hours, and ${data.overdueInvoices.length} invoice${data.overdueInvoices.length === 1 ? '' : 's'} need payment follow-up.`
            : `${data.range.shortLabel} close is still inside the approval buffer until ${data.closeContext.bufferEndsOnLabel}. Missing timesheets are intentionally suppressed until that buffer ends.`
    )
    setText('opsActiveConsultants', formatNumber(activeCount))
    setText('opsLoggedHours', formatHours(data.hoursLogged))
    setText('opsReadyRevenue', formatCurrencyBreakdown(data.readyRevenue))

    const chips = [
        `Close period: ${data.range.label}`,
        `${activeCount} active consultants`,
        `${formatHours(data.hoursLogged)} logged`,
        `${data.readyTimesheets.length} ready entries`,
        `${data.zeroHourPendingConsultants.length} awaiting hours`,
        `${data.overdueInvoices.length} overdue invoice${data.overdueInvoices.length === 1 ? '' : 's'}`,
        data.closeContext.closeActive
            ? 'Close workflow active'
            : `Approval buffer through ${data.closeContext.bufferEndsOnLabel}`
    ]

    setHtml('opsActiveChips', chips.map((chip, index) => `<span class="period-chip ${index === 0 ? '' : 'period-chip--muted'}">${escapeHtml(chip)}</span>`).join(''))
}

function renderMonthCloseBanner(data) {
    const container = document.getElementById('monthCloseBanner')
    if (!container) return

    const toneLabel = data.closeContext.closeActive
        ? (data.closeProgress === 100 ? 'Close ready' : 'Close in progress')
        : 'Approval buffer'

    const summaryMeta = data.closeContext.closeActive
        ? `${data.range.shortLabel} close period is active now. ${data.readyTimesheets.length} approved entries are ready to invoice, and ${data.zeroHourPendingConsultants.length} consultants are still waiting on final hours.`
        : `${data.range.shortLabel} close stays in approval buffer through ${data.closeContext.bufferEndsOnLabel}. Use this time to collect and approve remaining consultant hours.`

    container.innerHTML = `
        <div class="close-banner__summary">
            <div>
                <div class="close-banner__eyebrow">${escapeHtml(toneLabel)}</div>
                <h3 class="close-banner__title">${escapeHtml(data.range.label)} close is ${data.closeProgress}% complete</h3>
                <p class="close-banner__meta">${escapeHtml(summaryMeta)}</p>
            </div>
            <div class="close-banner__progress">
                <div class="close-banner__meter" aria-hidden="true">
                    <div class="close-banner__meter-fill" style="width:${Math.max(6, data.closeProgress)}%"></div>
                </div>
                <span class="close-banner__progress-label">${data.closeProgress}% complete</span>
            </div>
            <div class="close-banner__actions">
                <button type="button" class="btn btn--primary btn--sm" data-dashboard-link="true" data-page="timesheets.html" data-month="${escapeHtml(data.range.month)}" data-year="${escapeHtml(data.range.year)}">Review close period</button>
                <button type="button" class="btn btn--outline btn--sm" data-dashboard-link="true" data-page="app.html" data-month="${escapeHtml(data.range.month)}" data-year="${escapeHtml(data.range.year)}" data-status="pending">Create invoices</button>
            </div>
        </div>
        <div class="close-banner__checklist">
            ${data.closeSteps.map((step, index) => `
                <div class="close-banner__step close-banner__step--${escapeHtml(step.tone)}">
                    <span class="close-banner__step-badge">${step.tone === 'done' ? '✓' : index + 1}</span>
                    <div>
                        <div class="close-banner__step-title">${escapeHtml(step.label)}</div>
                        <div class="close-banner__step-meta">${escapeHtml(step.meta)}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `
}

function renderWorkflowQueue(data) {
    const container = document.getElementById('workflowQueue')
    if (!container) return

    container.innerHTML = data.workflowCards.map((card) => `
        <article class="workflow-card">
            <div class="workflow-card__head">
                <div>
                    <div class="workflow-card__eyebrow">${escapeHtml(card.eyebrow)}</div>
                    <div class="workflow-card__value">${escapeHtml(card.value)}</div>
                </div>
                <span class="workflow-card__status workflow-card__status--${escapeHtml(card.statusTone)}">${escapeHtml(card.status)}</span>
            </div>
            <div>
                <h3 class="workflow-card__title">${escapeHtml(card.title)}</h3>
                <p class="workflow-card__meta">${escapeHtml(card.meta)}</p>
            </div>
            <div class="workflow-card__footer">
                <span class="workflow-card__trend">${escapeHtml(card.trend)}</span>
                <button
                    type="button"
                    class="btn btn--outline btn--sm"
                    data-dashboard-link="true"
                    data-page="${escapeHtml(card.page)}"
                    data-month="${escapeHtml(card.filters.month || '')}"
                    data-year="${escapeHtml(card.filters.year || '')}"
                    data-status="${escapeHtml(card.filters.status || '')}"
                    data-search="${escapeHtml(card.filters.search || '')}"
                >${escapeHtml(card.actionLabel)}</button>
            </div>
        </article>
    `).join('')
}

function renderCollectionsFeed(data) {
    const container = document.getElementById('collectionsFeed')
    if (!container) return

    const q = dashboardSearchQuery.trim().toLowerCase()
    const filtered = q
        ? data.collectionsActivity.filter((item) => {
            const haystack = `${item.title} ${item.meta}`.toLowerCase()
            return haystack.includes(q)
        })
        : data.collectionsActivity

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem 1rem;">
                <span class="empty-state__icon">💳</span>
                <p class="empty-state__text">${q ? `No collections activity matches "${escapeHtml(dashboardSearchQuery)}"` : 'No recent collections activity yet.'}</p>
            </div>
        `
        return
    }

    container.innerHTML = filtered.map((item) => `
        <article class="collection-item">
            <span class="collection-item__badge collection-item__badge--${escapeHtml(item.type)}">${escapeHtml(item.type.replace('-', ' '))}</span>
            <div>
                <h3 class="collection-item__title">${escapeHtml(item.title)}</h3>
                <p class="collection-item__meta">${escapeHtml(item.meta)}</p>
                <div class="collection-item__amount">${escapeHtml(item.amount)}</div>
            </div>
            <div class="collection-item__actions">
                <button
                    type="button"
                    class="btn btn--outline btn--sm"
                    data-dashboard-link="true"
                    data-page="${escapeHtml(item.page)}"
                    data-month="${escapeHtml(item.filters.month || '')}"
                    data-year="${escapeHtml(item.filters.year || '')}"
                    data-status="${escapeHtml(item.filters.status || '')}"
                    data-search="${escapeHtml(item.filters.search || '')}"
                >${escapeHtml(item.actionLabel)}</button>
            </div>
        </article>
    `).join('')
}

function renderRecentActivity(events = []) {
    const container = document.getElementById('recentActivityFeed')
    if (!container) return

    if (!events.length) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem 1rem;">
                <span class="empty-state__icon">🧾</span>
                <p class="empty-state__text">No audit activity yet. Once you edit consultants, timesheets, invoices, or templates, it will show here.</p>
            </div>
        `
        return
    }

    container.innerHTML = events.slice(0, 8).map((event) => {
        const entityType = String(event.entity_type || '').toLowerCase()
        return `
            <div class="activity-timeline__item">
                <span class="activity-timeline__dot activity-timeline__dot--${escapeHtml(entityType)}"></span>
                <div class="activity-timeline__content">
                    <div class="activity-timeline__title">${escapeHtml(event.summary || `${event.action || 'updated'} ${event.entity_type || 'record'}`)}</div>
                    <div class="activity-timeline__meta">${escapeHtml(String(event.action || '').replace(/_/g, ' '))}${event.entity_key ? ` · ${escapeHtml(event.entity_key)}` : ''}</div>
                </div>
                <span class="activity-timeline__time">${escapeHtml(formatRelativeTime(event.created_at))}</span>
            </div>
        `
    }).join('')
}

function renderExceptionCenter(data) {
    const container = document.getElementById('exceptionCenter')
    if (!container) return

    if (!data.exceptionItems.length) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem 1rem;">
                <span class="empty-state__icon">✅</span>
                <p class="empty-state__text">No major workflow exceptions right now. Current month operations look healthy.</p>
            </div>
        `
        return
    }

    container.innerHTML = data.exceptionItems.map((item) => `
        <article class="exception-item">
            <span class="exception-item__badge exception-item__badge--${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span>
            <div>
                <h3 class="exception-item__title">${escapeHtml(item.title)}</h3>
                <p class="exception-item__meta">${escapeHtml(item.meta)}</p>
            </div>
            <div class="exception-item__actions">
                <button
                    type="button"
                    class="btn btn--outline btn--sm"
                    data-dashboard-link="true"
                    data-page="${escapeHtml(item.page)}"
                    data-month="${escapeHtml(item.filters.month || '')}"
                    data-year="${escapeHtml(item.filters.year || '')}"
                    data-status="${escapeHtml(item.filters.status || '')}"
                    data-search="${escapeHtml(item.filters.search || '')}"
                >${escapeHtml(item.actionLabel)}</button>
            </div>
        </article>
    `).join('')
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

    // Keep invoice activity lightweight on the dashboard.
    const recent = filtered.slice(0, 4)

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

        // Unified action trigger for status/payment info
        const actionHtml = `
            <button class="dropdown-item" onclick="window.openPaymentInfoModalDash('${invoice.id}')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                Edit Payment Info
            </button>`;
        
        const statusTransitionItems = actionHtml;
        const currency = invoice.invoice_meta?.currency || 'USD';
        const amountDisplay = formatCurrency(invoice.totals?.total || 0, currency);
        const amountPaid = Number(invoice.totals?.amount_paid) || 0;
        const balanceDue = Number(invoice.totals?.balance_due) ?? (Number(invoice.totals?.total) - amountPaid);
        const usdReceived = invoice.totals?.usd_received_amount;
        
        let amountColumnHtml = `<strong>${amountDisplay}</strong>`;
        
        if (effectiveStatus === 'partially_paid') {
            amountColumnHtml = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:0.2rem;">
                    <div style="font-size:0.9rem; font-weight:700;">${amountDisplay}</div>
                    <div style="font-size:0.7rem; color:#059669; font-weight:600;">Paid: ${formatCurrency(amountPaid, currency)}</div>
                    <div style="font-size:0.7rem; color:#d97706; font-weight:600;">Due: ${formatCurrency(Math.max(0, balanceDue), currency)}</div>
                </div>
            `;
        } else if (usdReceived && effectiveStatus === 'paid') {
            amountColumnHtml = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:0.25rem;">
                     <strong>${amountDisplay}</strong>
                     <hr style="width:100%; max-width: 100px; border:0; border-top:1px solid var(--surface-border); margin:0;" />
                     <span style="color:var(--text-secondary); font-size:0.85em; font-weight:500;">USD ${Number(usdReceived).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>
                </div>
            `;
        }

        return `
        <tr>
            <td><strong>${escapeHtml(invoice.invoice_number)}</strong></td>
            <td>${escapeHtml(invoice.client_info?.name || 'N/A')}</td>
            <td>${formatDate(invoiceDate)}</td>
            <td>${renderDashboardStatusChip(effectiveStatus)}</td>
            <td style="text-align: right;">${amountColumnHtml}</td>
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
        partially_paid: { label: 'Partial', bg: '#fffbe3', color: '#92400e', border: '#fef3c7' },
        paid: { label: 'Paid', bg: '#f0fdf4', color: '#059669', border: '#a7f3d0' }
    }[status] || { label: status, bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
    return `<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};text-transform:uppercase">${cfg.label}</span>`;
}

/**
 * Revenue overview uses paid_date for paid invoices.
 * If older paid invoices have no paid_date, fall back to the invoice date so legacy data does not disappear.
 */
function getInvoiceDateStr(inv) {
    const raw = inv.invoice_meta?.dateRaw
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    const ts = inv.created_at
    if (ts) {
        const d = new Date(ts)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return ''
}

function getRevenueDateStr(inv) {
    if (!isPaidInvoice(inv)) return ''

    const paidRaw = String(inv.paid_date || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(paidRaw)) {
        return paidRaw
    }

    return getInvoiceDateStr(inv)
}

function getPaidRevenueInvoices(invoices) {
    return invoices.filter(inv => isPaidInvoice(inv) && getRevenueDateStr(inv))
}

function getRevenueCurrencies(invoices) {
    return Array.from(new Set(getPaidRevenueInvoices(invoices).map(getInvoiceCurrency))).sort((a, b) => a.localeCompare(b))
}

function renderRevenueCurrencyFilter(invoices) {
    const container = document.getElementById('revenueCurrencyFilter')
    if (!container) return

    const currencies = getRevenueCurrencies(invoices)
    if (currencies.length === 0) {
        _chartSelectedCurrency = ''
        container.innerHTML = ''
        container.style.display = 'none'
        return
    }

    if (!currencies.includes(_chartSelectedCurrency)) {
        _chartSelectedCurrency = currencies[0]
    }

    container.style.display = currencies.length > 1 ? 'flex' : 'none'
    container.innerHTML = currencies.map((currency) => `
        <button
            type="button"
            class="segmented__btn ${currency === _chartSelectedCurrency ? 'is-active' : ''}"
            data-chart-currency="${currency}"
            aria-pressed="${currency === _chartSelectedCurrency ? 'true' : 'false'}"
        >
            ${currency}
        </button>
    `).join('')

    container.querySelectorAll('[data-chart-currency]').forEach((button) => {
        button.addEventListener('click', () => {
            _chartSelectedCurrency = button.dataset.chartCurrency || ''
            renderRevenueCurrencyFilter(_chartInvoices)
            createRevenueChart(_chartInvoices, getActiveRevenueRange())
        })
    })
}

function getActiveRevenueRange() {
    return document.querySelector('.segmented__btn[data-range].is-active')?.dataset.range || '30d'
}

function createRevenueChart(invoices, range = '30d') {
    _chartInvoices = invoices
    const canvas = document.getElementById('revenueChart')
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const paidRevenueInvoices = getPaidRevenueInvoices(invoices)
    renderRevenueCurrencyFilter(invoices)

    const currency = _chartSelectedCurrency || getRevenueCurrencies(invoices)[0] || 'USD'
    const chartInvoices = paidRevenueInvoices.filter(inv => getInvoiceCurrency(inv) === currency)
    const chartMeta = document.getElementById('chartMeta')
    if (chartMeta) {
        chartMeta.textContent = chartInvoices.length
            ? `Paid revenue by received date • ${currency}`
            : 'No paid revenue yet'
    }

    // ── Build data based on range ───────────────────────────────────────────
    const now = new Date()
    const labels = [], data = []

    if (range === '30d') {
        // Last 30 days grouped by day (show every 5th label)
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i)
            const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            labels.push(i % 5 === 0 ? key : '')  // Only show every 5th label
            data.push(chartInvoices.filter(inv => getRevenueDateStr(inv) === dayKey)
                .reduce((s, inv) => s + (inv.totals?.total || 0), 0))
        }
    } else if (range === '90d') {
        // Last 13 weeks
        for (let i = 12; i >= 0; i--) {
            const from = new Date(now); from.setDate(from.getDate() - i * 7 - 6)
            const to = new Date(now); to.setDate(to.getDate() - i * 7)
            labels.push(from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
            data.push(chartInvoices.filter(inv => {
                const ds = getRevenueDateStr(inv)
                if (!ds) return false
                const invDate = parseDateOnly(ds)
                if (!invDate) return false
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
            data.push(chartInvoices.filter(inv => {
                const ds = getRevenueDateStr(inv)
                return ds.slice(0, 7) === key
            }).reduce((s, inv) => s + (inv.totals?.total || 0), 0))
        }
    }

    // ── Update header total ────────────────────────────────────────────────
    const totalYTD = data.reduce((a, b) => a + b, 0)
    const headerEl = document.getElementById('chartTotal')
    if (headerEl) headerEl.textContent = chartInvoices.length ? formatCurrency(totalYTD, currency) : '—'

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
            const l = formatCompactCurrency(v, currency)
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
        const tooltipText = `${labels[closest] || ''} · ${formatCurrency(data[closest], currency)}`
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
    document.dispatchEvent(new CustomEvent('dashboard:chart-ready'))
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

        const currentYear = new Date().getFullYear()
        const [invoices, consultants, timesheets, auditEvents] = await Promise.all([
            getInvoices(user),
            dbGetConsultants().catch((error) => {
                console.warn('Could not fetch consultants:', error)
                return []
            }),
            dbGetTimesheetsForYear(currentYear).catch((error) => {
                console.warn('Could not fetch timesheets:', error)
                return []
            }),
            getRecentAuditEvents(8).catch((error) => {
                console.warn('Could not fetch audit trail:', error)
                return []
            })
        ])

        allInvoicesCache = invoices

        // Calculate and update stats
        const stats = calculateStats(invoices)
        updateStatsCards(stats)

        const operationsData = calculateOperationsData({ consultants, timesheets, invoices })
        dashboardOperationsCache = operationsData
        renderMonthCloseBanner(operationsData)
        renderWorkflowQueue(operationsData)
        renderExceptionCenter(operationsData)
        renderRecentActivity(auditEvents)
        renderCollectionsFeed(operationsData)

        // Create revenue chart
        createRevenueChart(invoices, getActiveRevenueRange())

        // Wire up Modal Events once
        if (!window.modalWired) {
            window.modalWired = true
            
            document.getElementById('closePaymentModal')?.addEventListener('click', closePaidModalDash);
            document.getElementById('cancelPaymentBtn')?.addEventListener('click', closePaidModalDash);

            // Save Status Only
            document.getElementById('saveStatusBtn')?.addEventListener('click', async () => {
                if (!window.invoiceToPayDash) return;
                const nextStatus = document.getElementById('modalStatusInput').value;
                const btn = document.getElementById('saveStatusBtn');
                btn.disabled = true;
                try {
                    await updateInvoiceStatus(window.invoiceToPayDash, nextStatus);
                    showToast(`Status updated to ${nextStatus}`, 'success');
                    closePaidModalDash();
                    initDashboard(); 
                } catch (e) {
                    showToast('Error: ' + e.message, 'error');
                } finally {
                    btn.disabled = false;
                }
            });

        // Ledger Actions (Delete/Edit)
        const ledgerBody = document.getElementById('paymentLedgerBody');
        if (ledgerBody && !ledgerBody.hasAttribute('data-listener')) {
            ledgerBody.setAttribute('data-listener', 'true');
            ledgerBody.addEventListener('click', async (e) => {
                const deleteBtn = e.target.closest('.ledger-delete');
                const editBtn = e.target.closest('.ledger-edit');
                if (!window.invoiceToPayDash) return;

                if (deleteBtn) {
                    const paymentId = deleteBtn.dataset.paymentId;
                    if (!confirm('Are you sure you want to delete this installment?')) return;

                    try {
                        const updated = await deleteInvoicePayment(window.invoiceToPayDash, paymentId);
                        showToast('Payment deleted', 'info');
                        openPaymentInfoModalDash(window.invoiceToPayDash, updated);
                        document.dispatchEvent(new CustomEvent('dashboard:data-loaded'));
                    } catch (err) {
                        console.error('Delete payment error:', err);
                        showToast('Error deleting payment', 'error');
                    }
                }

                if (editBtn) {
                    const paymentId = editBtn.dataset.paymentId;
                    startEditingPaymentDash(paymentId);
                }
            });
        }

        document.getElementById('cancelEditBtn')?.addEventListener('click', resetPaymentFormDash);

        // Add/Update Payment
        document.getElementById('addPaymentBtn')?.addEventListener('click', async () => {
            const id = window.invoiceToPayDash;
            if (!id) return;

            const date = document.getElementById('newPaymentDate')?.value;
            const amount = document.getElementById('newPaymentAmount')?.value;
            const usdAmount = document.getElementById('newPaymentUsd')?.value;
            const note = document.getElementById('newPaymentNote')?.value;

            if (!amount || Number(amount) <= 0) {
                showToast('Please enter a valid amount', 'error');
                return;
            }

            const btn = document.getElementById('addPaymentBtn');
            btn.disabled = true;
            btn.textContent = window.editingPaymentIdDash ? 'Updating...' : 'Recording...';

            try {
                const updated = await recordInvoicePayment(id, {
                    id: window.editingPaymentIdDash,
                    date,
                    amount,
                    usdAmount,
                    note
                });
                
                showToast(window.editingPaymentIdDash ? 'Payment updated' : 'Payment recorded', 'success');
                openPaymentInfoModalDash(id, updated);
                resetPaymentFormDash();
                document.dispatchEvent(new CustomEvent('dashboard:data-loaded'));
            } catch (e) {
                console.error('Record payment error:', e);
                showToast('Error recording payment: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Record Transaction';
            }
        });
        }
        // End of listeners block


        const active = consultants.filter((consultant) => isConsultantActiveForRange(consultant, getCurrentMonthRange()))
        const kpiEl = document.getElementById('activeConsultantsKpi')
        const changeEl = document.getElementById('activeConsultantsChange')
        if (kpiEl) kpiEl.textContent = String(active.length)
        if (changeEl) {
            const total = consultants.length
            const inactive = total - active.length
            changeEl.textContent = inactive > 0
                ? `${inactive} inactive of ${total} total`
                : `All ${total} active`
            changeEl.style.color = inactive > 0 ? '#d97706' : '#059669'
        }

        document.dispatchEvent(new CustomEvent('dashboard:data-loaded'))

    } catch (error) {
        console.error('Dashboard initialization error:', error)
        showToast('Error loading dashboard data', 'error')
    }
}

// ── Quick Actions ──────────────────────────────────────────

window.invoiceToPayDash = null

function ensureReconciledDash(invoice) {
    if (!invoice) return null;
    const totals = { ...(invoice.totals || {}) };
    const payments = totals.payments || [];
    
    // Normalize legacy Paid invoices
    if (invoice.status === 'paid' && payments.length === 0) {
        const totalAmount = Number(totals.total) || 0;
        totals.amount_paid = totalAmount;
        totals.balance_due = 0;
        totals.payments = [{
            id: 'legacy-dash-' + Date.now(),
            date: invoice.paid_date || new Date().toISOString().split('T')[0],
            amount: totalAmount,
            usdAmount: totals.usd_received_amount || null,
            note: 'Marked as paid (Legacy)'
        }];
    }
    
    // Normalize legacy Partial invoices
    if (invoice.status === 'partially_paid' && totals.balance_due === undefined) {
        const totalAmount = Number(totals.total) || 0;
        const paidAmount = Number(totals.amount_paid) || 0;
        totals.balance_due = Math.max(0, totalAmount - paidAmount);
    }

    return { ...invoice, totals };
}

window.openPaymentInfoModalDash = function (id, invoiceData = null) {
    let invoice = invoiceData || allInvoicesCache.find(inv => inv.id === id);
    if (!invoice) return;
    
    invoice = ensureReconciledDash(invoice);

    window.invoiceToPayDash = id;
    const totals = invoice.totals || {};
    const currency = invoice.invoice_meta?.currency || 'USD';
    const totalAmount = Number(totals.total || 0);
    const amountPaid = Number(totals.amount_paid || 0);
    const balanceDue = Number(totals.balance_due ?? (totalAmount - amountPaid));

    // Update Summary
    const sTotal = document.getElementById('summaryTotal');
    const sPaid = document.getElementById('summaryPaid');
    const sBalance = document.getElementById('summaryBalance');
    if (sTotal) sTotal.textContent = formatCurrency(totalAmount, currency);
    if (sPaid) sPaid.textContent = formatCurrency(amountPaid, currency);
    if (sBalance) sBalance.textContent = formatCurrency(balanceDue, currency);

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

    // Set Status
    const statusInput = document.getElementById('modalStatusInput');
    if (statusInput) statusInput.value = invoice.status || 'draft';

    // Render Ledger
    renderPaymentLedgerDash(invoice);

    // Reset Form
    const dateInput = document.getElementById('newPaymentDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const amtInput = document.getElementById('newPaymentAmount');
    if (amtInput) amtInput.value = '';
    const usdInput = document.getElementById('newPaymentUsd');
    if (usdInput) usdInput.value = '';
    const noteInput = document.getElementById('newPaymentNote');
    if (noteInput) noteInput.value = '';

    const container = document.getElementById('paymentInfoModal');
    if (container) {
        container.style.display = 'flex';
        resetPaymentFormDash(); // Always start in 'Add' mode
    }
}

window.editingPaymentIdDash = null;

function startEditingPaymentDash(paymentId) {
    const id = window.invoiceToPayDash;
    const invoice = allInvoicesCache.find(inv => inv.id === id);
    if (!invoice || !invoice.totals?.payments) return;
    
    const payment = invoice.totals.payments.find(p => p.id === paymentId);
    if (!payment) return;

    window.editingPaymentIdDash = paymentId;

    // Populate fields
    if (document.getElementById('newPaymentDate')) document.getElementById('newPaymentDate').value = payment.date;
    if (document.getElementById('newPaymentAmount')) document.getElementById('newPaymentAmount').value = payment.amount;
    if (document.getElementById('newPaymentUsd')) document.getElementById('newPaymentUsd').value = payment.usdAmount || '';
    if (document.getElementById('newPaymentNote')) document.getElementById('newPaymentNote').value = payment.note || '';

    // UI Feedback
    const indicator = document.getElementById('editModeIndicator');
    if (indicator) indicator.style.display = 'flex';
    const btn = document.getElementById('addPaymentBtn');
    if (btn) btn.textContent = 'Update Transaction';
}

function resetPaymentFormDash() {
    window.editingPaymentIdDash = null;
    
    // Reset fields
    if (document.getElementById('newPaymentDate')) document.getElementById('newPaymentDate').value = new Date().toISOString().split('T')[0];
    if (document.getElementById('newPaymentAmount')) document.getElementById('newPaymentAmount').value = '';
    if (document.getElementById('newPaymentUsd')) document.getElementById('newPaymentUsd').value = '';
    if (document.getElementById('newPaymentNote')) document.getElementById('newPaymentNote').value = '';

    // Reset UI
    const indicator = document.getElementById('editModeIndicator');
    if (indicator) indicator.style.display = 'none';
    const btn = document.getElementById('addPaymentBtn');
    if (btn) btn.textContent = 'Record Transaction';
}

function renderPaymentLedgerDash(invoice) {
    const body = document.getElementById('paymentLedgerBody');
    if (!body) return;
    const payments = invoice.totals?.payments || [];
    const currency = invoice.invoice_meta?.currency || 'USD';

    if (payments.length === 0) {
        body.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">No payments recorded yet</td></tr>`;
        return;
    }

    body.innerHTML = payments.map(p => `
        <tr>
            <td>${p.date}</td>
            <td>
                <div>${formatCurrency(p.amount, currency)}</div>
                ${p.usdAmount ? `<div style="font-size:0.7rem; color:var(--text-secondary)">USD ${p.usdAmount}</div>` : ''}
            </td>
            <td style="text-align:right">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button class="ledger-edit" data-payment-id="${p.id}" title="Edit payment" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:2px;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button class="ledger-delete" data-payment-id="${p.id}" title="Delete payment" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:2px;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function closePaidModalDash() {
    window.invoiceToPayDash = null
    const container = document.getElementById('paymentInfoModal')
    if (container) container.style.display = 'none'
}


// Global Event Delegation for dynamic elements (Nav, etc.)
document.addEventListener('click', (e) => {
    const dashboardLink = e.target.closest('[data-dashboard-link="true"]')
    if (dashboardLink) {
        e.preventDefault()
        const page = dashboardLink.dataset.page || 'timesheets.html'
        const range = getCurrentMonthRange()
        const patch = {
            year: range.year,
            month: range.month,
            currency: 'all',
            client: 'all',
            w2: 'all',
            status: 'all',
            search: ''
        }
        if (dashboardLink.dataset.month) patch.month = dashboardLink.dataset.month
        if (dashboardLink.dataset.year) patch.year = Number(dashboardLink.dataset.year)
        if (dashboardLink.dataset.status) patch.status = dashboardLink.dataset.status
        if (dashboardLink.dataset.search) patch.search = dashboardLink.dataset.search
        setSharedFilters(patch)
        window.location.href = page
        return
    }

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
document.addEventListener('dashboard:refresh', () => {
    initDashboard()
})

document.addEventListener('dashboard:global-search', (event) => {
    const query = String(event?.detail?.query || '')
    dashboardSearchQuery = query
    renderCollectionsFeed(dashboardOperationsCache || calculateOperationsData({
        consultants: [],
        timesheets: [],
        invoices: allInvoicesCache
    }))
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
