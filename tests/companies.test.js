import { describe, expect, it } from 'vitest';
import { filterCompanies, formatCompanyOption, sortCompaniesByName } from '../src/modules/companies.js';

const companies = [
    { name: 'Lorvish Technologies Inc', email: '', phone: '+1 (919) 999-0626' },
    { name: 'ZScale LLC', email: 'accounts@zscalellc.com', phone: '' }
];

describe('filterCompanies', () => {
    it('returns all for an empty query', () => {
        expect(filterCompanies(companies, '')).toHaveLength(2);
        expect(filterCompanies(companies)).toHaveLength(2);
    });
    it('matches name, email and phone case-insensitively', () => {
        expect(filterCompanies(companies, 'zscale')).toHaveLength(1);
        expect(filterCompanies(companies, 'zscalellc.com')).toHaveLength(1);
        expect(filterCompanies(companies, '919')).toHaveLength(1);
    });
    it('returns empty when nothing matches', () => {
        expect(filterCompanies(companies, 'zzz')).toHaveLength(0);
    });
    it('does not mutate input', () => {
        const copy = [...companies];
        filterCompanies(companies, 'zscale');
        expect(companies).toEqual(copy);
    });
    it('handles empty input safely', () => {
        expect(filterCompanies(undefined, 'x')).toEqual([]);
    });
});

describe('sortCompaniesByName', () => {
    it('sorts alphabetically, case-insensitively', () => {
        expect(sortCompaniesByName(companies).map((c) => c.name))
            .toEqual(['Lorvish Technologies Inc', 'ZScale LLC']);
    });
    it('returns a new array without mutating input', () => {
        const copy = [...companies];
        sortCompaniesByName(companies);
        expect(companies).toEqual(copy);
    });
});

describe('formatCompanyOption', () => {
    it('combines name and email', () => {
        expect(formatCompanyOption({ name: 'ZScale LLC', email: 'accounts@zscalellc.com' }))
            .toBe('ZScale LLC — accounts@zscalellc.com');
    });
    it('uses just the name when there is no email', () => {
        expect(formatCompanyOption({ name: 'Lorvish Technologies Inc' })).toBe('Lorvish Technologies Inc');
    });
    it('falls back for an unnamed company', () => {
        expect(formatCompanyOption({})).toBe('Unnamed company');
    });
});
