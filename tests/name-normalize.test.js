import { describe, expect, it } from 'vitest';
import { canonicalizeName } from '../src/modules/name-normalize.js';

describe('canonicalizeName', () => {
    const known = ['ZScale LLC', 'Lorvish Technologies Inc', 'RazorPe'];

    it('snaps a case variant to the known spelling', () => {
        expect(canonicalizeName('zscale llc', known)).toBe('ZScale LLC');
        expect(canonicalizeName('RAZORPE', known)).toBe('RazorPe');
    });

    it('ignores surrounding whitespace on both sides', () => {
        expect(canonicalizeName('  razorpe  ', known)).toBe('RazorPe');
        expect(canonicalizeName('zscale llc', ['  ZScale LLC  '])).toBe('ZScale LLC');
    });

    it('returns the trimmed input when there is no match', () => {
        expect(canonicalizeName('  New Client ', known)).toBe('New Client');
    });

    it('leaves names that differ by more than case alone', () => {
        expect(canonicalizeName('ZScale', known)).toBe('ZScale'); // not "ZScale LLC"
    });

    it('handles empty / missing input', () => {
        expect(canonicalizeName('', known)).toBe('');
        expect(canonicalizeName(null, known)).toBe('');
        expect(canonicalizeName('Acme')).toBe('Acme');
    });
});
