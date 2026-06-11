/**
 * Activity Log — pure helpers
 * Shared, side-effect-free logic for the Activity Log page so it can be unit tested.
 */

export const ENTITY_LABELS = {
    consultant: 'Consultant',
    timesheet: 'Timesheet',
    invoice: 'Invoice',
    template: 'Template',
    client: 'Client',
    company: 'Company',
    referral: 'Referral'
};

export function getEntityLabel(entityType) {
    return ENTITY_LABELS[String(entityType || '').toLowerCase()] || 'Record';
}

/**
 * Human-friendly action label: "marked_paid" -> "Marked paid".
 */
export function formatActionLabel(action) {
    const text = String(action || '').replace(/_/g, ' ').trim();
    if (!text) return 'Updated';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Title shown for an event. Prefers the stored summary, otherwise
 * falls back to "<action> <entity>".
 */
export function buildEventTitle(event = {}) {
    const summary = String(event.summary || '').trim();
    if (summary) return summary;
    const action = formatActionLabel(event.action);
    const entity = getEntityLabel(event.entity_type).toLowerCase();
    return `${action} ${entity}`;
}

/**
 * Filter loaded events by entity type and a free-text query.
 * entityType 'all' (or empty) matches everything. Query matches against
 * summary, action and entity_key, case-insensitively.
 */
export function filterEvents(events = [], { entityType = 'all', query = '' } = {}) {
    const type = String(entityType || 'all').toLowerCase();
    const q = String(query || '').trim().toLowerCase();

    return (events || []).filter((event) => {
        if (type !== 'all' && String(event?.entity_type || '').toLowerCase() !== type) {
            return false;
        }
        if (!q) return true;
        const haystack = [
            event?.summary,
            event?.action,
            event?.entity_key
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        return haystack.includes(q);
    });
}

/**
 * Self-contained relative time formatter ("Just now", "5m ago", "3d ago",
 * then a short date). `now` is injectable for deterministic tests.
 */
export function formatRelativeTime(timestamp, now = Date.now()) {
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) return 'Just now';

    const diffMinutes = Math.max(0, Math.round((now - value.getTime()) / 60000));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
