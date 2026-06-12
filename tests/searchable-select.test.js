import { describe, expect, it } from 'vitest';
import { filterOptions } from '../src/modules/searchable-select.js';

const countries = [
    { value: 'us', label: 'United States' },
    { value: 'in', label: 'India' },
    { value: 'id', label: 'Indonesia' },
    { value: 'ie', label: 'Ireland' },
    { value: 'ca', label: 'Canada' }
];

describe('filterOptions', () => {
    it('returns everything for an empty query', () => {
        expect(filterOptions(countries, '')).toHaveLength(5);
        expect(filterOptions(countries, '   ')).toHaveLength(5);
    });

    it('matches by prefix (type "i" -> all starting with I)', () => {
        const r = filterOptions(countries, 'i').map((c) => c.value);
        expect(r).toEqual(['in', 'id', 'ie']);
    });

    it('narrows as more letters are typed ("in" -> starts with IN)', () => {
        const r = filterOptions(countries, 'in').map((c) => c.value);
        expect(r).toEqual(['in', 'id']); // India, Indonesia
    });

    it('is case-insensitive', () => {
        expect(filterOptions(countries, 'CAN').map((c) => c.value)).toEqual(['ca']);
    });

    it('falls back to substring when nothing starts with the query', () => {
        // "states" starts nothing, but "United States" contains it
        expect(filterOptions(countries, 'states').map((c) => c.value)).toEqual(['us']);
    });

    it('returns empty when there is no match at all', () => {
        expect(filterOptions(countries, 'zz')).toEqual([]);
    });
});
