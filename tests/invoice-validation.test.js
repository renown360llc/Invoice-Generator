import { describe, expect, it } from 'vitest';
import { validateInvoiceData } from '../src/modules/invoice-validation.js';

function validInvoice(overrides = {}) {
    return {
        invoice_number: 'INV-0001',
        client_info: { name: 'Acme Corp' },
        invoice_meta: { dateRaw: '2026-06-01', dueDateRaw: '2026-07-01' },
        items: [{ desc: 'Consulting', qty: 10, rate: 100, amount: 1000 }],
        totals: { total: 1000 },
        ...overrides
    };
}

function fieldsOf(result) {
    return result.errors.map((e) => e.field);
}

describe('validateInvoiceData', () => {
    it('passes a well-formed invoice', () => {
        const r = validateInvoiceData(validInvoice());
        expect(r.isValid).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('requires a client name', () => {
        const r = validateInvoiceData(validInvoice({ client_info: { name: '   ' } }));
        expect(r.isValid).toBe(false);
        expect(fieldsOf(r)).toContain('clientName');
    });

    it('requires an invoice number', () => {
        const r = validateInvoiceData(validInvoice({ invoice_number: '' }));
        expect(fieldsOf(r)).toContain('invoiceNumber');
    });

    it('requires at least one valid line item', () => {
        const r = validateInvoiceData(validInvoice({ items: [{ desc: '', qty: 0, rate: 0, amount: 0 }], totals: { total: 0 } }));
        expect(fieldsOf(r)).toContain('items');
    });

    it('rejects a line item with a description but zero amount', () => {
        const r = validateInvoiceData(validInvoice({ items: [{ desc: 'x', qty: 0, rate: 0, amount: 0 }], totals: { total: 0 } }));
        expect(fieldsOf(r)).toContain('items');
    });

    it('rejects negative quantity or rate', () => {
        const r = validateInvoiceData(validInvoice({ items: [{ desc: 'x', qty: -1, rate: 100, amount: 0 }], totals: { total: 0 } }));
        expect(fieldsOf(r)).toContain('items');
    });

    it('flags a zero/negative total when items look valid but discount wipes it out', () => {
        const r = validateInvoiceData(validInvoice({ totals: { total: 0 } }));
        expect(fieldsOf(r)).toContain('total');
    });

    it('rejects a due date earlier than the invoice date', () => {
        const r = validateInvoiceData(validInvoice({ invoice_meta: { dateRaw: '2026-06-10', dueDateRaw: '2026-06-01' } }));
        expect(fieldsOf(r)).toContain('dueDate');
    });

    it('allows due date equal to invoice date', () => {
        const r = validateInvoiceData(validInvoice({ invoice_meta: { dateRaw: '2026-06-01', dueDateRaw: '2026-06-01' } }));
        expect(r.isValid).toBe(true);
    });

    it('does not double-report total when there are no valid items', () => {
        const r = validateInvoiceData(validInvoice({ items: [], totals: { total: 0 } }));
        expect(fieldsOf(r)).toContain('items');
        expect(fieldsOf(r)).not.toContain('total');
    });

    it('accumulates multiple independent errors', () => {
        const r = validateInvoiceData({ invoice_number: '', client_info: {}, invoice_meta: {}, items: [], totals: {} });
        expect(fieldsOf(r)).toEqual(expect.arrayContaining(['clientName', 'invoiceNumber', 'items']));
    });
});
