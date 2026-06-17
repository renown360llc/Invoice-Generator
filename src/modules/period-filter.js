/**
 * Invoice billing-period match — pure.
 * An invoice belongs to a period if its raised date (invoice_meta.dateRaw,
 * else created_at) falls in the selected year and/or month. 'all' = no bound.
 */
export function invoiceInPeriod(invoice, year = 'all', month = 'all') {
    const y = String(year || 'all');
    const m = String(month || 'all');
    if (y === 'all' && m === 'all') return true;

    const ts = String(invoice?.invoice_meta?.dateRaw || invoice?.created_at || '').trim();
    const match = ts.match(/^(\d{4})-(\d{2})/);
    if (!match) return false;

    if (y !== 'all' && match[1] !== y) return false;
    if (m !== 'all' && match[2] !== m.padStart(2, '0')) return false;
    return true;
}
