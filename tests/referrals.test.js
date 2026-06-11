import { describe, expect, it } from 'vitest';
import {
    computePayout,
    derivePayoutStatus,
    filterPayouts,
    paymentsTotal,
    payoutAmountPaid,
    payoutBalance,
    receivedAmount,
    summarizePayouts
} from '../src/modules/referrals.js';

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

describe('partial payments', () => {
    it('sums installment payments', () => {
        expect(paymentsTotal([{ amount: 400 }, { amount: 250.5 }])).toBe(650.5);
        expect(paymentsTotal([])).toBe(0);
    });
    it('prefers stored amount_paid, falls back to payments sum', () => {
        expect(payoutAmountPaid({ amount_paid: 300 })).toBe(300);
        expect(payoutAmountPaid({ payments: [{ amount: 100 }, { amount: 50 }] })).toBe(150);
    });
    it('computes the remaining balance', () => {
        expect(payoutBalance({ pass_through_amount: 850, amount_paid: 400 })).toBe(450);
        expect(payoutBalance({ pass_through_amount: 850, amount_paid: 900 })).toBe(0);
    });
    it('derives status from amounts', () => {
        expect(derivePayoutStatus({ pass_through_amount: 850, amount_paid: 0 })).toBe('pending');
        expect(derivePayoutStatus({ pass_through_amount: 850, amount_paid: 400 })).toBe('partially_paid');
        expect(derivePayoutStatus({ pass_through_amount: 850, amount_paid: 850 })).toBe('paid');
    });
});

describe('summarizePayouts', () => {
    const payouts = [
        { currency: 'USD', my_cut: 150, pass_through_amount: 850, amount_paid: 850 },   // fully paid
        { currency: 'USD', my_cut: 120, pass_through_amount: 880, amount_paid: 300 },   // partial -> 580 outstanding
        { currency: 'CAD', my_cut: 50, pass_through_amount: 450, amount_paid: 0 }       // pending -> 450 outstanding
    ];
    it('totals forwarded and my-cut per currency', () => {
        const s = summarizePayouts(payouts);
        expect(s.forwarded.USD).toBe(1730);
        expect(s.myCut.USD).toBe(270);
        expect(s.forwarded.CAD).toBe(450);
    });
    it('tracks paid-to-partners and outstanding', () => {
        const s = summarizePayouts(payouts);
        expect(s.paid.USD).toBe(1150);          // 850 + 300
        expect(s.outstanding.byCurrency.USD).toBe(580);
        expect(s.outstanding.byCurrency.CAD).toBe(450);
        expect(s.outstanding.count).toBe(2);
    });
    it('handles empty input', () => {
        expect(summarizePayouts([])).toEqual({ forwarded: {}, myCut: {}, paid: {}, outstanding: { count: 0, byCurrency: {} } });
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
