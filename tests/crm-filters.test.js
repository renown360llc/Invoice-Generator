import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearSharedFilters,
    countAppliedFilters,
    getSharedFilters,
    setPagePrefs,
    setSharedFilters
} from '../src/modules/crm-filters.js';

function createStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

describe('crm filters state', () => {
    beforeEach(() => {
        globalThis.localStorage = createStorage();
    });

    it('normalizes shared filters before persisting', () => {
        const shared = setSharedFilters({
            year: '2026',
            month: '4',
            currency: 'usd',
            client: '  Acme Corp ',
            w2: ' Team A ',
            status: 'Pending',
            search: '  jane  '
        });

        expect(shared).toEqual({
            year: 2026,
            month: '04',
            currency: 'USD',
            client: 'acme corp',
            w2: 'team a',
            status: 'pending',
            search: 'jane'
        });
    });

    it('clears non-period filters while preserving year and month by default', () => {
        setSharedFilters({
            year: 2025,
            month: '11',
            currency: 'CAD',
            client: 'client one',
            search: 'alpha'
        });

        const cleared = clearSharedFilters();

        expect(cleared.year).toBe(2025);
        expect(cleared.month).toBe('11');
        expect(cleared.currency).toBe('all');
        expect(cleared.client).toBe('all');
        expect(cleared.search).toBe('');
    });

    it('stores page preferences separately from shared filters', () => {
        setPagePrefs('analytics', { pivotMetric: 'revenue' });
        const shared = getSharedFilters();

        expect(shared.year).toBeTypeOf('number');
        expect(shared.month).toMatch(/^\d{2}$/);
        expect(countAppliedFilters(
            { currency: 'usd', status: 'all', search: '' },
            { currency: 'all', status: 'all', search: '' }
        )).toBe(1);
    });
});
