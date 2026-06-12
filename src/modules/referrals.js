/**
 * Referral pass-through — pure helpers
 * A pass-through invoice: you receive money, KEEP your cut %, and forward the
 * remainder to a referral partner. Side-effect-free math + summaries.
 */

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Split a basis amount into your kept cut and the pass-through.
 * cutPercent is the percentage YOU keep (e.g. 15 -> you keep 15%, partner 85%).
 */
export function computePayout(basisAmount, cutPercent) {
    const basis = Math.max(0, Number(basisAmount) || 0);
    const pct = Math.min(100, Math.max(0, Number(cutPercent) || 0));
    const myCut = round2(basis * (pct / 100));
    const passThrough = round2(basis - myCut);
    return { myCut, passThrough };
}

/**
 * Amount actually received on an invoice (what a pass-through should be based on).
 * Uses amount_paid when present; falls back to the full total only when paid.
 */
export function receivedAmount(invoice = {}) {
    const totals = invoice.totals || {};
    const total = Number(totals.total) || 0;
    if (totals.amount_paid !== undefined && totals.amount_paid !== null) {
        return Math.max(0, Number(totals.amount_paid) || 0);
    }
    return String(invoice.status || '').toLowerCase() === 'paid' ? total : 0;
}

/**
 * USD actually received for an invoice — the basis for a referral cut.
 * Receivables are booked in USD even when the invoice is in CAD/EUR/etc, via
 * totals.usd_received_amount (summed from each payment's usdAmount). For native
 * USD invoices that field may be absent, so fall back to the received amount.
 */
export function usdReceivedAmount(invoice = {}) {
    const totals = invoice.totals || {};
    if (totals.usd_received_amount !== undefined && totals.usd_received_amount !== null) {
        return Math.max(0, round2(Number(totals.usd_received_amount) || 0));
    }
    const currency = (invoice.invoice_meta?.currency || 'USD').toUpperCase();
    return currency === 'USD' ? receivedAmount(invoice) : 0;
}

/** Total wire/transfer fees deducted across an invoice's payments (USD). */
export function invoiceFeesTotal(invoice = {}) {
    const totals = invoice.totals || {};
    if (totals.total_fees !== undefined && totals.total_fees !== null) {
        return Math.max(0, round2(Number(totals.total_fees) || 0));
    }
    return round2((totals.payments || []).reduce((sum, p) => sum + (Number(p?.fee) || 0), 0));
}

/**
 * Referral basis: USD actually received minus wire-transfer fees. The referral
 * cut is taken on what you net after the bank's fee, never below zero.
 */
export function referralBasis(invoice = {}) {
    return Math.max(0, round2(usdReceivedAmount(invoice) - invoiceFeesTotal(invoice)));
}

function addByCurrency(map, currency, amount) {
    map[currency] = round2((map[currency] || 0) + (Number(amount) || 0));
}

/** Sum of installment payments made to the referral partner. */
export function paymentsTotal(payments = []) {
    return round2((payments || []).reduce((sum, p) => sum + (Number(p?.amount) || 0), 0));
}

/** How much of a payout has been paid to the partner (prefers stored amount_paid). */
export function payoutAmountPaid(payout = {}) {
    if (payout.amount_paid !== undefined && payout.amount_paid !== null) {
        return Math.max(0, Number(payout.amount_paid) || 0);
    }
    return paymentsTotal(payout.payments);
}

/** Remaining balance still owed to the partner (never negative). */
export function payoutBalance(payout = {}) {
    const owed = Number(payout.pass_through_amount) || 0;
    return Math.max(0, round2(owed - payoutAmountPaid(payout)));
}

/**
 * The date a payout was actually paid to the partner — its latest installment
 * date, falling back to a stored paid_date. Empty string when nothing is paid.
 */
export function payoutPaidDate(payout = {}) {
    const dates = (payout.payments || []).map((p) => p?.date).filter(Boolean);
    if (dates.length) return dates.reduce((a, b) => (b > a ? b : a));
    return payout.paid_date || '';
}

/** Derived status from amounts: pending -> partially_paid -> paid. */
export function derivePayoutStatus(payout = {}) {
    const owed = Number(payout.pass_through_amount) || 0;
    const paid = payoutAmountPaid(payout);
    if (owed <= 0 || paid >= owed) return 'paid';
    if (paid <= 0) return 'pending';
    return 'partially_paid';
}

/**
 * Roll up payouts (per currency): total owed to partners, your kept cut,
 * how much has actually been paid to partners, and what's still outstanding.
 */
export function summarizePayouts(payouts = []) {
    const forwarded = {};
    const myCut = {};
    const paid = {};
    const outstanding = { count: 0, byCurrency: {} };

    (payouts || []).forEach((p) => {
        const currency = (p.currency || 'USD').toUpperCase();
        addByCurrency(forwarded, currency, p.pass_through_amount);
        addByCurrency(myCut, currency, p.my_cut);
        addByCurrency(paid, currency, payoutAmountPaid(p));
        const balance = payoutBalance(p);
        if (balance > 0) {
            outstanding.count += 1;
            addByCurrency(outstanding.byCurrency, currency, balance);
        }
    });

    return { forwarded, myCut, paid, outstanding };
}

/**
 * Filter payouts. `criteria` may be a query string (back-compat) or an object
 * { query, status, currency }. Status is the derived status; 'all' matches any.
 */
export function filterPayouts(payouts = [], criteria = {}) {
    const c = typeof criteria === 'string' ? { query: criteria } : (criteria || {});
    const q = String(c.query || '').trim().toLowerCase();
    const status = String(c.status || 'all').toLowerCase();
    const currency = String(c.currency || 'all').toLowerCase();

    return (payouts || []).filter((p) => {
        if (status !== 'all' && derivePayoutStatus(p) !== status) return false;
        if (currency !== 'all' && String(p.currency || 'USD').toLowerCase() !== currency) return false;
        if (q) {
            const haystack = `${p.recipient || ''} ${p.invoice_number || ''}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
}
