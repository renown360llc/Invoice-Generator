import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/utils.js';

describe('escapeHtml', () => {
    it('escapes dangerous HTML characters', () => {
        expect(escapeHtml(`<script>alert("x")</script>'&`))
            .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#039;&amp;');
    });

    it('returns empty string for nullish values', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});
