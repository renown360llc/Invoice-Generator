import { describe, expect, it } from 'vitest';
import { computePayout, filterPayouts, receivedAmount, summarizePayouts } from '../src/modules/referrals.js';

describe('computePayout', () => {
    it('keeps the cut % and passes the rest', () => {
        expect(computePayout(1000, 15)).toEqual({ myCut: 150, passThrough: 850 });
        expect(computePayout(1000, 12)).toEqual({ myCut: 120, passThrough: 880 });
    });
    it('rounds to cents', () => {
        expect(computePayout(1000, 12.5)).toEqual({ myCut: 125, passThrough: 875 });
        expect(computePayout(999.99, 15)).toEqual({ myCut: 150, passThrough: 849.99 });
    });
    it('clamps bad input', () => {
        expect(computePayout(-50, 15)).toEqual({ myCut: 0, passThrough: 0 });
        expect(computePayout(1000, 150)).toEqual({ myCut: 1000, passThrough: 0 });
        expect(computePayout(1000, -5)).toEqual({ myCut: 0, passThrough: 1000 });
    });
});

describe('receivedAmount', () => {
    it('uses amount_paid when present', () => {
        expect(receivedAmount({ totals: { total: 1000, amount_paid: 400 } })).toBe(400);
    });
    it('falls back to total only when paid', () => {
        expect(receivedAmount({ status: 'paid', totals: { total: 1000 } })).toBe(1000);
        expect(receivedAmount({ status: 'sent', totals: { total: 1000 } })).toBe(0);
    });
});

describe('summarizePayouts', () => {
    const payouts = [
        { currency: 'USD', my_cut: 150, pass_through_amount: 850, status: 'paid' },
        { currency: 'USD', my_cut: 120, pass_through_amount: 880, status: 'pending' },
        { currency: 'CAD', my_cut: 50, pass_through_amount: 450, status: 'pending' }
    ];
    it('totals pass-through and my-cut per currency', () => {
        const s = summarizePayouts(payouts);
        expect(s.passThrough.USD).toBe(1730);
        expect(s.myCut.USD).toBe(270);
        expect(s.passThrough.CAD).toBe(450);
    });
    it('splits pending vs paid', () => {
        const s = summarizePayouts(payouts);
        expect(s.paid.count).toBe(1);
        expect(s.paid.byCurrency.USD).toBe(850);
        expect(s.pending.count).toBe(2);
        expect(s.pending.byCurrency.USD).toBe(880);
        expect(s.pending.byCurrency.CAD).toBe(450);
    });
    it('handles empty input', () => {
        expect(summarizePayouts([])).toEqual({ passThrough: {}, myCut: {}, pending: { count: 0, byCurrency: {} }, paid: { count: 0, byCurrency: {} } });
    });
});

describe('filterPayouts', () => {
    const payouts = [
        { recipient: 'Globex Partners', invoice_number: 'INV-0001' },
        { recipient: 'Initech', invoice_number: 'INV-0002' }
    ];
    it('matches recipient or invoice number', () => {
        expect(filterPayouts(payouts, 'globex')).toHaveLength(1);
        expect(filterPayouts(payouts, 'inv-0002')).toHaveLength(1);
        expect(filterPayouts(payouts, '')).toHaveLength(2);
    });
});
