/**
 * Analytics money helpers — pure, currency-safe.
 * Earned -> Invoiced -> Collected funnel and outstanding-receivables ranking.
 * Never sums across currencies; callers pass per-currency maps.
 */

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Per-currency billing funnel from invoices: invoiced -> collected. Collected
 * is the paid share of what was invoiced, so the funnel always nests
 * (collected <= invoiced) and uncollected = invoiced - collected.
 *
 * `unbilled` is the value of logged-but-not-yet-invoiced work. It comes from a
 * different ledger (timesheets), so it is carried for a separate callout and is
 * deliberately NOT part of the invoiced/collected bars.
 */
export function buildFunnel(invoiced = {}, collected = {}, unbilled = {}) {
    const currencies = [...new Set([
        ...Object.keys(invoiced), ...Object.keys(collected), ...Object.keys(unbilled)
    ])].sort();

    return currencies.map((currency) => {
        const i = round2(invoiced[currency] || 0);
        const c = round2(collected[currency] || 0);
        const u = round2(unbilled[currency] || 0);
        return {
            currency,
            invoiced: i,
            collected: c,
            uncollected: Math.max(0, round2(i - c)),
            unbilled: u
        };
    });
}

/**
 * Kept margin (USD): cash collected minus what you pay out — referral
 * pass-through and consultant commissions. Margin can go negative; only the
 * percentage is floored at a sane value. All inputs must be USD.
 */
export function keptMargin({ collected = 0, referralPaid = 0, commissions = 0 } = {}) {
    const c = round2(collected);
    const r = round2(referralPaid);
    const m = round2(commissions);
    const margin = round2(c - r - m);
    const marginPct = c > 0 ? Math.round((margin / c) * 100) : 0;
    return { collected: c, referralPaid: r, commissions: m, margin, marginPct };
}

/**
 * Rank who owes you by outstanding balance, grouped by client name + currency.
 * Skips drafts and anything with a zero/negative balance. Balance prefers the
 * stored balance_due, else total - amount_paid.
 */
export function topOutstanding(invoices = [], limit = 5) {
    const map = new Map();

    (invoices || []).forEach((inv) => {
        if (String(inv.status || '').toLowerCase() === 'draft') return;
        const totals = inv.totals || {};
        const total = Number(totals.total) || 0;
        const paid = Number(totals.amount_paid) || 0;
        const balance = totals.balance_due !== undefined && totals.balance_due !== null
            ? Number(totals.balance_due) || 0
            : Math.max(0, total - paid);
        if (balance <= 0) return;

        const name = (inv.client_info?.name || 'Unknown').trim() || 'Unknown';
        const currency = String(inv.invoice_meta?.currency || 'USD').toUpperCase();
        const key = `${name}|||${currency}`;
        map.set(key, round2((map.get(key) || 0) + balance));
    });

    return [...map.entries()]
        .map(([key, balance]) => {
            const [name, currency] = key.split('|||');
            return { name, currency, balance };
        })
        .sort((a, b) => b.balance - a.balance)
        .slice(0, limit);
}
