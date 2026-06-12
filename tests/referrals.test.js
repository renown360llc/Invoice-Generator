import { describe, expect, it } from 'vitest';
import {
    computePayout,
    derivePayoutStatus,
    filterPayouts,
    invoiceFeesTotal,
    paymentsTotal,
    payoutPaidDate,
    referralBasis,
    payoutAmountPaid,
    payoutBalance,
    receivedAmount,
    summarizePayouts,
    usdReceivedAmount
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

describe('usdReceivedAmount', () => {
    it('uses the canonical usd_received_amount when present (even for CAD invoices)', () => {
        const cad = { invoice_meta: { currency: 'CAD' }, totals: { total: 1000, amount_paid: 1000, usd_received_amount: 730 } };
        expect(usdReceivedAmount(cad)).toBe(730);
    });
    it('falls back to received amount for native USD invoices', () => {
        const usd = { status: 'paid', invoice_meta: { currency: 'USD' }, totals: { total: 500 } };
        expect(usdReceivedAmount(usd)).toBe(500);
    });
    it('returns 0 for a non-USD invoice with no recorded USD', () => {
        const cad = { invoice_meta: { currency: 'CAD' }, totals: { total: 1000 } };
        expect(usdReceivedAmount(cad)).toBe(0);
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

describe('payoutPaidDate', () => {
    it('uses the latest installment date', () => {
        const p = { payments: [{ date: '2026-03-10' }, { date: '2026-05-02' }, { date: '2026-04-01' }] };
        expect(payoutPaidDate(p)).toBe('2026-05-02');
    });
    it('falls back to stored paid_date when no installments', () => {
        expect(payoutPaidDate({ paid_date: '2026-02-15' })).toBe('2026-02-15');
    });
    it('is empty when nothing has been paid', () => {
        expect(payoutPaidDate({})).toBe('');
        expect(payoutPaidDate({ payments: [] })).toBe('');
    });
});

describe('referral basis (net of wire fees)', () => {
    it('sums per-payment fees when total_fees is absent', () => {
        const inv = { totals: { payments: [{ fee: 15 }, { fee: 15 }] } };
        expect(invoiceFeesTotal(inv)).toBe(30);
    });
    it('prefers stored total_fees', () => {
        expect(invoiceFeesTotal({ totals: { total_fees: 15, payments: [{ fee: 99 }] } })).toBe(15);
    });
    it('treats no fees as zero', () => {
        expect(invoiceFeesTotal({ totals: { usd_received_amount: 1000 } })).toBe(0);
    });
    it('subtracts fees from USD received', () => {
        expect(referralBasis({ totals: { usd_received_amount: 1000, total_fees: 15 } })).toBe(985);
    });
    it('never goes below zero', () => {
        expect(referralBasis({ totals: { usd_received_amount: 10, total_fees: 50 } })).toBe(0);
    });
    it('equals USD received when there are no fees', () => {
        expect(referralBasis({ totals: { usd_received_amount: 730 } })).toBe(730);
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
    it('matches recipient or invoice number (string back-compat)', () => {
        expect(filterPayouts(payouts, 'globex')).toHaveLength(1);
        expect(filterPayouts(payouts, 'inv-0002')).toHaveLength(1);
        expect(filterPayouts(payouts, '')).toHaveLength(2);
    });

    it('filters by derived status and currency', () => {
        const rows = [
            { recipient: 'A', invoice_number: '1', currency: 'USD', pass_through_amount: 100, amount_paid: 0 },   // pending
            { recipient: 'B', invoice_number: '2', currency: 'USD', pass_through_amount: 100, amount_paid: 50 },  // partial
            { recipient: 'C', invoice_number: '3', currency: 'CAD', pass_through_amount: 100, amount_paid: 100 } // paid
        ];
        expect(filterPayouts(rows, { status: 'pending' })).toHaveLength(1);
        expect(filterPayouts(rows, { status: 'partially_paid' })).toHaveLength(1);
        expect(filterPayouts(rows, { currency: 'USD' })).toHaveLength(2);
        expect(filterPayouts(rows, { status: 'paid', currency: 'CAD' })).toHaveLength(1);
        expect(filterPayouts(rows, {})).toHaveLength(3);
    });
});
