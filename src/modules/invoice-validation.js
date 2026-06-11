/**
 * Invoice validation — pure
 * Validates gathered invoice form data before save. Returns field-keyed errors
 * so the UI can highlight the offending inputs. No DOM, no side effects.
 *
 * Field keys map to form anchors: clientName, invoiceNumber, dueDate, items, total.
 */

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function validateInvoiceData(data = {}) {
    const errors = [];

    const clientName = String(data?.client_info?.name || '').trim();
    if (!clientName) {
        errors.push({ field: 'clientName', message: 'Client name is required.' });
    }

    const invoiceNumber = String(data?.invoice_number || '').trim();
    if (!invoiceNumber) {
        errors.push({ field: 'invoiceNumber', message: 'Invoice number is required.' });
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    const validItems = items.filter(
        (it) => String(it?.desc || '').trim() && (Number(it?.amount) || 0) > 0
    );
    const hasNegative = items.some(
        (it) => (Number(it?.qty) || 0) < 0 || (Number(it?.rate) || 0) < 0
    );

    if (hasNegative) {
        errors.push({ field: 'items', message: 'Quantity and rate cannot be negative.' });
    }

    const total = Number(data?.totals?.total) || 0;
    if (validItems.length === 0) {
        errors.push({
            field: 'items',
            message: 'Add at least one line item with a description and an amount greater than zero.'
        });
    } else if (total <= 0) {
        errors.push({ field: 'total', message: 'Invoice total must be greater than zero.' });
    }

    const issued = parseDate(data?.invoice_meta?.dateRaw);
    const due = parseDate(data?.invoice_meta?.dueDateRaw);
    if (issued && due && due.getTime() < issued.getTime()) {
        errors.push({ field: 'dueDate', message: 'Due date cannot be earlier than the invoice date.' });
    }

    return { isValid: errors.length === 0, errors };
}
