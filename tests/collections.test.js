import { describe, expect, it } from 'vitest';
import {
    buildReminderEmail,
    computeCollections,
    computeDSO,
    daysPastDue,
    invoiceBalance,
    isOutstanding,
    isOverdue
} from '../src/modules/collections.js';

const NOW = new Date('2026-06-07T00:00:00Z').getTime();

function inv(overrides = {}) {
    return {
        id: 'i1',
        invoice_number: 'INV-1',
        status: 'sent',
        client_info: { name: 'Acme', email: 'ap@acme.com' },
        business_info: { name: 'ZScale LLC' },
        invoice_meta: { currency: 'USD', dueDateRaw: '2026-05-01', dateRaw: '2026-04-01' },
        totals: { total: 1000 },
        ...overrides
    };
}

describe('invoiceBalance', () => {
    it('uses balance_due when present (including 0)', () => {
        expect(invoiceBalance(inv({ totals: { total: 1000, balance_due: 400 } }))).toBe(400);
        expect(invoiceBalance(inv({ totals: { total: 1000, balance_due: 0 } }))).toBe(0);
    });
    it('falls back to total minus amount_paid', () => {
        expect(invoiceBalance(inv({ totals: { total: 1000, amount_paid: 250 } }))).toBe(750);
    });
    it('never goes negative', () => {
        expect(invoiceBalance(inv({ totals: { total: 100, amount_paid: 200 } }))).toBe(0);
    });
});

describe('isOutstanding', () => {
    it('true for sent/partially_paid with a balance', () => {
        expect(isOutstanding(inv({ status: 'sent' }))).toBe(true);
        expect(isOutstanding(inv({ status: 'partially_paid', totals: { total: 1000, balance_due: 500 } }))).toBe(true);
    });
    it('false for draft and paid', () => {
        expect(isOutstanding(inv({ status: 'draft' }))).toBe(false);
        expect(isOutstanding(inv({ status: 'paid', totals: { total: 1000, balance_due: 0 } }))).toBe(false);
    });
});

describe('daysPastDue / isOverdue', () => {
    it('computes days past the due date', () => {
        expect(daysPastDue(inv({ invoice_meta: { dueDateRaw: '2026-06-01' } }), NOW)).toBe(6);
        expect(daysPastDue(inv({ invoice_meta: { dueDateRaw: '2026-06-10' } }), NOW)).toBe(-3);
    });
    it('returns null when there is no due date', () => {
        expect(daysPastDue(inv({ invoice_meta: {} }), NOW)).toBeNull();
    });
    it('isOverdue requires outstanding + past due', () => {
        expect(isOverdue(inv({ invoice_meta: { dueDateRaw: '2026-05-01' } }), NOW)).toBe(true);
        expect(isOverdue(inv({ status: 'paid', totals: { total: 1000, balance_due: 0 } }), NOW)).toBe(false);
        expect(isOverdue(inv({ invoice_meta: { dueDateRaw: '2026-07-01' } }), NOW)).toBe(false);
    });
});

describe('computeCollections', () => {
    const invoices = [
        inv({ id: 'a', status: 'sent', invoice_meta: { currency: 'USD', dueDateRaw: '2026-05-01' }, totals: { total: 1000 } }), // 37 days overdue
        inv({ id: 'b', status: 'partially_paid', invoice_meta: { currency: 'USD', dueDateRaw: '2026-06-20' }, totals: { total: 800, balance_due: 300 } }), // not due
        inv({ id: 'c', status: 'sent', invoice_meta: { currency: 'CAD', dueDateRaw: '2026-03-01' }, totals: { total: 500 } }), // 98 days overdue
        inv({ id: 'd', status: 'paid', invoice_meta: { currency: 'USD', dateRaw: '2026-04-01' }, paid_date: '2026-04-21', totals: { total: 1000, balance_due: 0 } }),
        inv({ id: 'e', status: 'draft', totals: { total: 999 } })
    ];

    it('sums outstanding per currency and excludes draft/paid', () => {
        const c = computeCollections(invoices, NOW);
        expect(c.outstanding.count).toBe(3); // a, b, c
        expect(c.outstanding.byCurrency.USD).toBe(1300); // 1000 + 300
        expect(c.outstanding.byCurrency.CAD).toBe(500);
    });
    it('flags overdue and builds a worklist sorted by days overdue', () => {
        const c = computeCollections(invoices, NOW);
        expect(c.overdue.count).toBe(2); // a, c
        expect(c.worklist.map((w) => w.id)).toEqual(['c', 'a']); // c is more overdue
        expect(c.worklist[0].balance).toBe(500);
    });
    it('buckets aging correctly', () => {
        const c = computeCollections(invoices, NOW);
        const byKey = Object.fromEntries(c.aging.map((b) => [b.key, b.count]));
        expect(byKey.current).toBe(1);   // b (not due)
        expect(byKey.d31_60).toBe(1);    // a (37)
        expect(byKey.d90plus).toBe(1);   // c (98)
    });
    it('computes DSO from paid invoices', () => {
        const c = computeCollections(invoices, NOW);
        expect(c.dso).toBe(20); // d: Apr 1 -> Apr 21
    });
});

describe('computeDSO', () => {
    it('returns null with no paid invoices', () => {
        expect(computeDSO([inv({ status: 'sent' })], NOW)).toBeNull();
    });
});

describe('buildReminderEmail', () => {
    it('builds recipient, subject and overdue body', () => {
        const email = buildReminderEmail(inv({ invoice_meta: { currency: 'USD', dueDateRaw: '2026-05-01' }, totals: { total: 1000 } }), NOW);
        expect(email.to).toBe('ap@acme.com');
        expect(email.subject).toBe('Reminder: Invoice INV-1 is overdue');
        expect(email.html).toContain('USD 1000.00');
        expect(email.html).toContain('37 days');
        expect(email.html).toContain('2026-05-01');
    });
    it('escapes HTML in client name', () => {
        const email = buildReminderEmail(inv({ client_info: { name: '<b>x</b>', email: 'a@b.com' } }), NOW);
        expect(email.html).not.toContain('<b>x</b>');
        expect(email.html).toContain('&lt;b&gt;');
    });
});
