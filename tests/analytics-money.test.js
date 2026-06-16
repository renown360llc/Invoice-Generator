import { describe, expect, it } from 'vitest';
import { buildFunnel, keptMargin, topOutstanding } from '../src/modules/analytics-money.js';

describe('buildFunnel', () => {
    it('computes uncollected per currency and carries unbilled separately', () => {
        const f = buildFunnel(
            { USD: 860, CAD: 500 },
            { USD: 810 },
            { USD: 140 }
        );
        const usd = f.find((r) => r.currency === 'USD');
        expect(usd).toMatchObject({ invoiced: 860, collected: 810, uncollected: 50, unbilled: 140 });
        const cad = f.find((r) => r.currency === 'CAD');
        expect(cad).toMatchObject({ invoiced: 500, collected: 0, uncollected: 500, unbilled: 0 });
    });

    it('never reports negative uncollected', () => {
        const [row] = buildFunnel({ USD: 100 }, { USD: 130 }, {});
        expect(row.uncollected).toBe(0);
    });

    it('returns sorted currencies and handles empty input', () => {
        expect(buildFunnel()).toEqual([]);
        expect(buildFunnel({ USD: 1 }, {}, { CAD: 1 }).map((r) => r.currency)).toEqual(['CAD', 'USD']);
    });
});

describe('keptMargin', () => {
    it('subtracts referral payouts and commissions', () => {
        expect(keptMargin({ collected: 10000, referralPaid: 2500, commissions: 1200 }))
            .toEqual({ collected: 10000, referralPaid: 2500, commissions: 1200, margin: 6300, marginPct: 63 });
    });
    it('can go negative', () => {
        const m = keptMargin({ collected: 1000, referralPaid: 900, commissions: 300 });
        expect(m.margin).toBe(-200);
        expect(m.marginPct).toBe(-20);
    });
    it('handles zero collected without dividing by zero', () => {
        expect(keptMargin({})).toEqual({ collected: 0, referralPaid: 0, commissions: 0, margin: 0, marginPct: 0 });
    });
});

describe('topOutstanding', () => {
    const invoices = [
        { status: 'sent', client_info: { name: 'Acme' }, invoice_meta: { currency: 'USD' }, totals: { total: 1000, amount_paid: 200, balance_due: 800 } },
        { status: 'partially_paid', client_info: { name: 'Acme' }, invoice_meta: { currency: 'USD' }, totals: { total: 500, amount_paid: 100, balance_due: 400 } },
        { status: 'sent', client_info: { name: 'Globex' }, invoice_meta: { currency: 'CAD' }, totals: { total: 600, amount_paid: 0 } },
        { status: 'paid', client_info: { name: 'Initech' }, invoice_meta: { currency: 'USD' }, totals: { total: 300, amount_paid: 300, balance_due: 0 } },
        { status: 'paid', client_info: { name: 'Stale' }, invoice_meta: { currency: 'USD' }, totals: { total: 700, amount_paid: 0 } },
        { status: 'draft', client_info: { name: 'Draftco' }, invoice_meta: { currency: 'USD' }, totals: { total: 900 } }
    ];

    it('groups by client + currency and sums balances', () => {
        const rows = topOutstanding(invoices);
        expect(rows[0]).toEqual({ name: 'Acme', currency: 'USD', balance: 1200 });
        expect(rows.find((r) => r.name === 'Globex')).toEqual({ name: 'Globex', currency: 'CAD', balance: 600 });
    });

    it('excludes paid (even with a stale balance) and drafts', () => {
        const names = topOutstanding(invoices).map((r) => r.name);
        expect(names).not.toContain('Initech');
        expect(names).not.toContain('Stale');
        expect(names).not.toContain('Draftco');
    });

    it('falls back to total - amount_paid when balance_due is absent', () => {
        const [row] = topOutstanding([{ status: 'sent', client_info: { name: 'X' }, invoice_meta: { currency: 'USD' }, totals: { total: 700, amount_paid: 250 } }]);
        expect(row.balance).toBe(450);
    });

    it('respects the limit', () => {
        expect(topOutstanding(invoices, 1)).toHaveLength(1);
    });
});
