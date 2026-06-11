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

function addByCurrency(map, currency, amount) {
    map[currency] = round2((map[currency] || 0) + (Number(amount) || 0));
}

/**
 * Roll up a list of payouts: total passed-through and kept (per currency),
 * plus pending vs paid breakdown. Amounts stay per-currency.
 */
export function summarizePayouts(payouts = []) {
    const passThrough = {};
    const myCut = {};
    const pending = { count: 0, byCurrency: {} };
    const paid = { count: 0, byCurrency: {} };

    (payouts || []).forEach((p) => {
        const currency = (p.currency || 'USD').toUpperCase();
        addByCurrency(passThrough, currency, p.pass_through_amount);
        addByCurrency(myCut, currency, p.my_cut);
        if (String(p.status || 'pending').toLowerCase() === 'paid') {
            paid.count += 1;
            addByCurrency(paid.byCurrency, currency, p.pass_through_amount);
        } else {
            pending.count += 1;
            addByCurrency(pending.byCurrency, currency, p.pass_through_amount);
        }
    });

    return { passThrough, myCut, pending, paid };
}

/** Filter payouts by a free-text query across recipient and invoice number. */
export function filterPayouts(payouts = [], query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [...(payouts || [])];
    return (payouts || []).filter((p) => {
        const haystack = `${p.recipient || ''} ${p.invoice_number || ''}`.toLowerCase();
        return haystack.includes(q);
    });
}
