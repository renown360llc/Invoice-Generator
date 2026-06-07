import { describe, expect, it } from 'vitest';
import {
    buildEventTitle,
    filterEvents,
    formatActionLabel,
    formatRelativeTime,
    getEntityLabel
} from '../src/modules/activity-log.js';

const sample = [
    { entity_type: 'invoice', action: 'marked_paid', summary: 'Invoice INV-0004 marked paid', entity_key: 'INV-0004' },
    { entity_type: 'consultant', action: 'created', summary: 'Added consultant Anil', entity_key: 'Anil' },
    { entity_type: 'timesheet', action: 'updated', summary: '', entity_key: 'TS-12' }
];

describe('getEntityLabel', () => {
    it('maps known entity types', () => {
        expect(getEntityLabel('invoice')).toBe('Invoice');
        expect(getEntityLabel('CONSULTANT')).toBe('Consultant');
    });
    it('falls back for unknown types', () => {
        expect(getEntityLabel('widget')).toBe('Record');
        expect(getEntityLabel()).toBe('Record');
    });
});

describe('formatActionLabel', () => {
    it('humanizes snake_case actions', () => {
        expect(formatActionLabel('marked_paid')).toBe('Marked paid');
    });
    it('defaults when empty', () => {
        expect(formatActionLabel('')).toBe('Updated');
        expect(formatActionLabel(null)).toBe('Updated');
    });
});

describe('buildEventTitle', () => {
    it('prefers the stored summary', () => {
        expect(buildEventTitle(sample[0])).toBe('Invoice INV-0004 marked paid');
    });
    it('falls back to "<action> <entity>" when no summary', () => {
        expect(buildEventTitle(sample[2])).toBe('Updated timesheet');
    });
});

describe('filterEvents', () => {
    it('returns all events for the "all" type and empty query', () => {
        expect(filterEvents(sample, { entityType: 'all', query: '' })).toHaveLength(3);
    });
    it('filters by entity type', () => {
        const result = filterEvents(sample, { entityType: 'invoice' });
        expect(result).toHaveLength(1);
        expect(result[0].entity_key).toBe('INV-0004');
    });
    it('matches the query against summary, action and entity_key', () => {
        expect(filterEvents(sample, { query: 'inv-0004' })).toHaveLength(1);
        expect(filterEvents(sample, { query: 'created' })).toHaveLength(1);
        expect(filterEvents(sample, { query: 'TS-12' })).toHaveLength(1);
    });
    it('combines type and query', () => {
        expect(filterEvents(sample, { entityType: 'invoice', query: 'anil' })).toHaveLength(0);
    });
    it('handles empty input safely', () => {
        expect(filterEvents(undefined, {})).toEqual([]);
    });
});

describe('formatRelativeTime', () => {
    const now = new Date('2026-06-07T12:00:00Z').getTime();
    it('returns "Just now" for very recent times', () => {
        expect(formatRelativeTime('2026-06-07T11:59:40Z', now)).toBe('Just now');
    });
    it('returns minutes, hours and days buckets', () => {
        expect(formatRelativeTime('2026-06-07T11:30:00Z', now)).toBe('30m ago');
        expect(formatRelativeTime('2026-06-07T09:00:00Z', now)).toBe('3h ago');
        expect(formatRelativeTime('2026-06-04T12:00:00Z', now)).toBe('3d ago');
    });
    it('returns a short date beyond a week', () => {
        expect(formatRelativeTime('2026-05-01T12:00:00Z', now)).toMatch(/May/);
    });
    it('is safe for invalid input', () => {
        expect(formatRelativeTime('not-a-date', now)).toBe('Just now');
    });
});
