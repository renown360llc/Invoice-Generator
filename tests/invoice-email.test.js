import { describe, expect, it } from 'vitest';
import { buildInvoiceEmail, isValidEmail } from '../src/modules/invoice-email.js';

describe('isValidEmail', () => {
    it('accepts well-formed addresses', () => {
        expect(isValidEmail('a@b.com')).toBe(true);
        expect(isValidEmail('  client@example.co.uk ')).toBe(true);
    });
    it('rejects malformed addresses', () => {
        expect(isValidEmail('')).toBe(false);
        expect(isValidEmail('no-at-sign')).toBe(false);
        expect(isValidEmail('a@b')).toBe(false);
        expect(isValidEmail(null)).toBe(false);
    });
});

describe('buildInvoiceEmail', () => {
    const data = {
        invoice_number: 'INV-0007',
        business_info: { name: 'Renown360 LLC' },
        client_info: { name: 'Acme Corp', email: 'ap@acme.com' },
        invoice_meta: { dueDate: '2026-07-01' },
        totals: { totalDisplay: '$1,200.00' }
    };

    it('derives recipient, subject and filename', () => {
        const email = buildInvoiceEmail(data);
        expect(email.to).toBe('ap@acme.com');
        expect(email.subject).toBe('Invoice INV-0007 from Renown360 LLC');
        expect(email.filename).toBe('Invoice-INV-0007.pdf');
    });

    it('includes amount and due date in the body', () => {
        const { html } = buildInvoiceEmail(data);
        expect(html).toContain('INV-0007');
        expect(html).toContain('$1,200.00');
        expect(html).toContain('2026-07-01');
        expect(html).toContain('Acme Corp');
    });

    it('escapes HTML in user-supplied fields', () => {
        const { html, subject } = buildInvoiceEmail({
            ...data,
            client_info: { name: '<script>alert(1)</script>', email: 'x@y.com' }
        });
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        // subject is plain text (not injected as HTML), left as-is
        expect(subject).toContain('Renown360');
    });

    it('falls back gracefully on sparse data', () => {
        const email = buildInvoiceEmail({});
        expect(email.subject).toBe('Invoice Invoice from Your business');
        expect(email.filename).toBe('Invoice-Invoice.pdf');
        expect(email.to).toBe('');
    });
});
