/**
 * Clients — pure helpers
 * Side-effect-free list logic for the Client CRM page, kept separate so it
 * can be unit tested without a DOM or network.
 */

/**
 * Filter clients by a free-text query across name, company, email and phone.
 * Empty query returns all clients.
 */
export function filterClients(clients = [], query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [...(clients || [])];

    return (clients || []).filter((client) => {
        const haystack = [
            client?.name,
            client?.company,
            client?.email,
            client?.phone
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        return haystack.includes(q);
    });
}

/**
 * Label for a client in a picker: "Name — Company", or just the name when
 * there is no company.
 */
export function formatClientOption(client = {}) {
    const name = String(client?.name || '').trim() || 'Unnamed client';
    const company = String(client?.company || '').trim();
    return company ? `${name} — ${company}` : name;
}

/**
 * Sort clients alphabetically by name (case-insensitive). Returns a new array.
 */
export function sortClientsByName(clients = []) {
    return [...(clients || [])].sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
    );
}
