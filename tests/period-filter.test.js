import { describe, expect, it } from 'vitest';
import { invoiceInPeriod } from '../src/modules/period-filter.js';

const inv = (dateRaw) => ({ invoice_meta: { dateRaw } });

describe('invoiceInPeriod', () => {
    it('matches everything when year and month are "all"', () => {
        expect(invoiceInPeriod(inv('2026-02-03'), 'all', 'all')).toBe(true);
    });

    it('filters by month + year (the reported bug)', () => {
        const feb = inv('2026-02-03');
        expect(invoiceInPeriod(feb, '2026', '05')).toBe(false); // May selected -> Feb excluded
        expect(invoiceInPeriod(feb, '2026', '02')).toBe(true);  // Feb selected -> Feb included
    });

    it('accepts an unpadded month value', () => {
        expect(invoiceInPeriod(inv('2026-03-10'), '2026', '3')).toBe(true);
        expect(invoiceInPeriod(inv('2026-03-10'), '2026', '5')).toBe(false);
    });

    it('filters by year only', () => {
        expect(invoiceInPeriod(inv('2025-12-31'), '2026', 'all')).toBe(false);
        expect(invoiceInPeriod(inv('2026-12-31'), '2026', 'all')).toBe(true);
    });

    it('filters by month across any year', () => {
        expect(invoiceInPeriod(inv('2026-02-03'), 'all', '02')).toBe(true);
        expect(invoiceInPeriod(inv('2025-02-03'), 'all', '02')).toBe(true);
        expect(invoiceInPeriod(inv('2026-03-03'), 'all', '02')).toBe(false);
    });

    it('falls back to created_at when dateRaw is missing', () => {
        expect(invoiceInPeriod({ created_at: '2026-02-09T10:00:00Z' }, '2026', '02')).toBe(true);
    });

    it('excludes invoices with no usable date when a period is set', () => {
        expect(invoiceInPeriod({}, '2026', '02')).toBe(false);
    });
});
