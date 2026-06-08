/**
 * Collections — pure helpers
 * Side-effect-free logic for the dashboard collections center: outstanding /
 * overdue / aging math and the reminder-email builder. No DOM or network here.
 */

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Outstanding balance on an invoice (never negative). */
export function invoiceBalance(invoice = {}) {
    const totals = invoice.totals || {};
    const total = Number(totals.total) || 0;
    if (totals.balance_due !== undefined && totals.balance_due !== null) {
        return Math.max(0, Number(totals.balance_due) || 0);
    }
    const paid = Number(totals.amount_paid) || 0;
    return Math.max(0, total - paid);
}

/** An invoice is outstanding when it's been issued (sent/partially_paid) and still owes money. */
export function isOutstanding(invoice = {}) {
    const status = String(invoice.status || '').toLowerCase();
    return (status === 'sent' || status === 'partially_paid') && invoiceBalance(invoice) > 0;
}

/** Days past the due date (negative = not due yet, null = no due date). */
export function daysPastDue(invoice = {}, now = Date.now()) {
    const meta = invoice.invoice_meta || {};
    const due = parseDate(meta.dueDateRaw || meta.dueDate);
    if (!due) return null;
    return Math.floor((now - due.getTime()) / 86400000);
}

export function isOverdue(invoice = {}, now = Date.now()) {
    if (!isOutstanding(invoice)) return false;
    const d = daysPastDue(invoice, now);
    return d !== null && d > 0;
}

const AGING_BUCKETS = [
    { key: 'current', label: 'Not due', min: -Infinity, max: 0 },
    { key: 'd1_30', label: '1–30 days', min: 1, max: 30 },
    { key: 'd31_60', label: '31–60 days', min: 31, max: 60 },
    { key: 'd61_90', label: '61–90 days', min: 61, max: 90 },
    { key: 'd90plus', label: '90+ days', min: 91, max: Infinity }
];

function addByCurrency(map, currency, amount) {
    map[currency] = (map[currency] || 0) + amount;
}

/**
 * Compute the collections snapshot from a list of invoices.
 * Amounts are kept per-currency (no incorrect cross-currency summing).
 */
export function computeCollections(invoices = [], now = Date.now()) {
    const outstanding = { count: 0, byCurrency: {} };
    const overdue = { count: 0, byCurrency: {} };
    const aging = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: 0, byCurrency: {} }));
    const worklist = [];

    (invoices || []).forEach((inv) => {
        if (!isOutstanding(inv)) return;

        const currency = (inv.invoice_meta?.currency || 'USD').toUpperCase();
        const balance = invoiceBalance(inv);
        const days = daysPastDue(inv, now);

        outstanding.count += 1;
        addByCurrency(outstanding.byCurrency, currency, balance);

        const bucket = aging.find((b, i) => {
            const def = AGING_BUCKETS[i];
            const d = days === null ? 0 : days;
            return d >= def.min && d <= def.max;
        });
        if (bucket) {
            bucket.count += 1;
            addByCurrency(bucket.byCurrency, currency, balance);
        }

        if (days !== null && days > 0) {
            overdue.count += 1;
            addByCurrency(overdue.byCurrency, currency, balance);
            worklist.push({
                id: inv.id,
                invoice_number: inv.invoice_number,
                client: inv.client_info?.name || '',
                clientEmail: inv.client_info?.email || '',
                currency,
                balance,
                dueDate: inv.invoice_meta?.dueDateRaw || inv.invoice_meta?.dueDate || '',
                daysOverdue: days
            });
        }
    });

    worklist.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return { outstanding, overdue, aging, worklist, dso: computeDSO(invoices, now) };
}

/** Days Sales Outstanding: average days from invoice date to payment, over paid invoices. */
export function computeDSO(invoices = [], now = Date.now()) {
    let total = 0;
    let n = 0;
    (invoices || []).forEach((inv) => {
        if (String(inv.status || '').toLowerCase() !== 'paid') return;
        const issued = parseDate(inv.invoice_meta?.dateRaw || inv.created_at);
        const paid = parseDate(inv.paid_date);
        if (!issued || !paid) return;
        const days = Math.round((paid.getTime() - issued.getTime()) / 86400000);
        if (days < 0) return;
        total += days;
        n += 1;
    });
    return n === 0 ? null : Math.round(total / n);
}

/**
 * Build a payment-reminder email for an overdue invoice.
 * Returns { to, subject, html }. Pure — no sending, no PDF.
 */
export function buildReminderEmail(invoice = {}, now = Date.now()) {
    const business = invoice.business_info || {};
    const client = invoice.client_info || {};
    const totals = invoice.totals || {};
    const meta = invoice.invoice_meta || {};

    const number = String(invoice.invoice_number || '').trim() || 'your invoice';
    const businessName = String(business.name || '').trim() || 'Our team';
    const clientName = String(client.name || '').trim() || 'there';
    const currency = (meta.currency || 'USD').toUpperCase();
    const balance = invoiceBalance(invoice);
    const balanceStr = `${currency} ${balance.toFixed(2)}`;
    const due = meta.dueDateRaw || meta.dueDate || '';
    const days = daysPastDue(invoice, now);

    const subject = `Reminder: Invoice ${number} is overdue`;

    const lines = [
        `Hi ${escapeHtml(clientName)},`,
        '',
        `This is a friendly reminder that invoice <strong>${escapeHtml(number)}</strong> for <strong>${escapeHtml(balanceStr)}</strong> is now overdue${days ? ` by <strong>${days} day${days === 1 ? '' : 's'}</strong>` : ''}.`,
        due ? `It was due on <strong>${escapeHtml(String(due))}</strong>.` : '',
        '',
        'If payment is already on its way, please disregard this note. Otherwise, we’d appreciate prompt settlement.',
        '',
        'Thank you,',
        escapeHtml(businessName)
    ];

    const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937; line-height: 1.6;">${
        lines.map((line) => (line === '' ? '<br>' : `<p style="margin:0 0 8px;">${line}</p>`)).join('')
    }</div>`;

    return { to: String(client.email || '').trim(), subject, html };
}
