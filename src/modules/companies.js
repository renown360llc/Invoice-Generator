/**
 * Companies — pure helpers
 * Side-effect-free list logic for the Companies (Bill-From) registry, kept
 * separate so it can be unit tested without a DOM or network.
 */

/**
 * Filter companies by a free-text query across name, email and phone.
 * Empty query returns all companies.
 */
export function filterCompanies(companies = [], query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [...(companies || [])];

    return (companies || []).filter((company) => {
        const haystack = [
            company?.name,
            company?.email,
            company?.phone
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        return haystack.includes(q);
    });
}

/**
 * Sort companies alphabetically by name (case-insensitive). Returns a new array.
 */
export function sortCompaniesByName(companies = []) {
    return [...(companies || [])].sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
    );
}

/**
 * Label for a company in a picker: "Name — email", or just the name when there
 * is no email.
 */
export function formatCompanyOption(company = {}) {
    const name = String(company?.name || '').trim() || 'Unnamed company';
    const email = String(company?.email || '').trim();
    return email ? `${name} — ${email}` : name;
}
