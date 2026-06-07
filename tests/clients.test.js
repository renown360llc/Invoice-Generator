import { describe, expect, it } from 'vitest';
import { filterClients, formatClientOption, sortClientsByName } from '../src/modules/clients.js';

const clients = [
    { name: 'Acme Corp', company: 'Acme Holdings', email: 'ap@acme.com', phone: '111' },
    { name: 'Globex', company: 'Globex Inc', email: 'billing@globex.io', phone: '222' },
    { name: 'beta llc', company: '', email: 'hi@beta.dev', phone: '333' }
];

describe('filterClients', () => {
    it('returns all clients for an empty query', () => {
        expect(filterClients(clients, '')).toHaveLength(3);
        expect(filterClients(clients)).toHaveLength(3);
    });
    it('matches name, company, email and phone case-insensitively', () => {
        expect(filterClients(clients, 'acme')).toHaveLength(1);
        expect(filterClients(clients, 'globex inc')).toHaveLength(1);
        expect(filterClients(clients, 'beta.dev')).toHaveLength(1);
        expect(filterClients(clients, '222')).toHaveLength(1);
    });
    it('returns empty when nothing matches', () => {
        expect(filterClients(clients, 'zzz')).toHaveLength(0);
    });
    it('does not mutate the input', () => {
        const copy = [...clients];
        filterClients(clients, 'acme');
        expect(clients).toEqual(copy);
    });
    it('handles empty input safely', () => {
        expect(filterClients(undefined, 'x')).toEqual([]);
    });
});

describe('formatClientOption', () => {
    it('combines name and company', () => {
        expect(formatClientOption({ name: 'Acme Corp', company: 'Acme Holdings' })).toBe('Acme Corp — Acme Holdings');
    });
    it('uses just the name when there is no company', () => {
        expect(formatClientOption({ name: 'Globex' })).toBe('Globex');
    });
    it('falls back for an unnamed client', () => {
        expect(formatClientOption({})).toBe('Unnamed client');
    });
});

describe('sortClientsByName', () => {
    it('sorts alphabetically, case-insensitively', () => {
        const sorted = sortClientsByName(clients);
        expect(sorted.map((c) => c.name)).toEqual(['Acme Corp', 'beta llc', 'Globex']);
    });
    it('returns a new array without mutating input', () => {
        const copy = [...clients];
        sortClientsByName(clients);
        expect(clients).toEqual(copy);
    });
});
