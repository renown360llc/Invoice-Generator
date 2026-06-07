/**
 * Invoice Email — pure helpers
 * Side-effect-free builders/validators for emailing an invoice, so they can
 * be unit tested without a network or DOM.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
    return EMAIL_RE.test(String(value || '').trim());
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Build the email envelope for an invoice from gathered form data.
 * Returns { to, subject, html, filename }. Pure — no sending.
 */
export function buildInvoiceEmail(data = {}) {
    const business = data.business_info || {};
    const client = data.client_info || {};
    const meta = data.invoice_meta || {};
    const totals = data.totals || {};

    const invoiceNumber = String(data.invoice_number || '').trim() || 'Invoice';
    const businessName = String(business.name || '').trim() || 'Your business';
    const clientName = String(client.name || '').trim() || 'there';
    const amount = totals.totalDisplay || totals.total || '';
    const dueDate = meta.dueDate || '';

    const subject = `Invoice ${invoiceNumber} from ${businessName}`;

    const lines = [
        `Hi ${escapeHtml(clientName)},`,
        '',
        `Please find attached invoice <strong>${escapeHtml(invoiceNumber)}</strong>${amount ? ` for <strong>${escapeHtml(amount)}</strong>` : ''}.`,
        dueDate ? `Due date: <strong>${escapeHtml(dueDate)}</strong>.` : '',
        '',
        'Thank you,',
        escapeHtml(businessName)
    ].filter((line) => line !== null && line !== undefined);

    const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937; line-height: 1.6;">${
        lines.map((line) => line === '' ? '<br>' : `<p style="margin:0 0 8px;">${line}</p>`).join('')
    }</div>`;

    return {
        to: String(client.email || '').trim(),
        subject,
        html,
        filename: `Invoice-${invoiceNumber}.pdf`
    };
}
