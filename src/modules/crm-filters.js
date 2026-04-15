let STORAGE_KEY = 'invoice_pro_crm_filters_v1';

/**
 * Scope the localStorage key to a specific user so filter state
 * does not bleed between accounts on a shared device.
 * Call this once after authentication, before any reads/writes.
 */
export function initFiltersForUser(userId) {
    if (userId) {
        STORAGE_KEY = `invoice_pro_crm_filters_v1_${String(userId).slice(-12)}`;
    }
}

function currentMonth() {
    return String(new Date().getMonth() + 1).padStart(2, '0');
}

function currentYear() {
    return new Date().getFullYear();
}

function defaults() {
    return {
        shared: {
            year: currentYear(),
            month: currentMonth(),
            currency: 'all',
            client: 'all',
            w2: 'all',
            status: 'all',
            search: ''
        },
        consultants: {
            status: 'active'
        },
        analytics: {
            pivotMetric: 'hours'
        }
    };
}

function normalizeString(value, fallback = 'all') {
    if (value === null || value === undefined) return fallback;
    const str = String(value).trim();
    return str || fallback;
}

function sanitize(input = {}) {
    const base = defaults();
    const shared = {
        ...base.shared,
        ...(input.shared || {})
    };

    const yearNum = Number(shared.year);
    shared.year = Number.isFinite(yearNum) && yearNum > 1900 ? yearNum : base.shared.year;

    const month = normalizeString(shared.month, base.shared.month);
    shared.month = month === 'all' ? 'all' : String(Number(month) || Number(base.shared.month)).padStart(2, '0');

    shared.currency = normalizeString(shared.currency, 'all').toUpperCase() === 'ALL'
        ? 'all'
        : normalizeString(shared.currency, 'all').toUpperCase();
    shared.client = normalizeString(shared.client, 'all').toLowerCase();
    shared.w2 = normalizeString(shared.w2, 'all').toLowerCase();
    shared.status = normalizeString(shared.status, 'all').toLowerCase();
    shared.search = String(shared.search || '').trim();

    return {
        shared,
        consultants: {
            ...base.consultants,
            ...(input.consultants || {})
        },
        analytics: {
            ...base.analytics,
            ...(input.analytics || {})
        }
    };
}

function readState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults();
        return sanitize(JSON.parse(raw));
    } catch (err) {
        console.warn('Failed to read CRM filter state', err);
        return defaults();
    }
}

function writeState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(state)));
    } catch (err) {
        console.warn('Failed to persist CRM filter state', err);
    }
}

export function getCrmFilterState() {
    return readState();
}

export function getSharedFilters() {
    return readState().shared;
}

export function setSharedFilters(patch = {}) {
    const state = readState();
    state.shared = {
        ...state.shared,
        ...patch
    };
    const clean = sanitize(state);
    writeState(clean);
    return clean.shared;
}

export function clearSharedFilters({ keepPeriod = true } = {}) {
    const state = readState();
    const base = defaults();
    state.shared = {
        ...base.shared,
        year: keepPeriod ? state.shared.year : base.shared.year,
        month: keepPeriod ? state.shared.month : base.shared.month
    };
    const clean = sanitize(state);
    writeState(clean);
    return clean.shared;
}

export function getPagePrefs(page) {
    const state = readState();
    return state[page] || {};
}

export function setPagePrefs(page, patch = {}) {
    const state = readState();
    state[page] = {
        ...(state[page] || {}),
        ...patch
    };
    const clean = sanitize(state);
    writeState(clean);
    return clean[page] || {};
}

export function countAppliedFilters(filters = {}, defaultsRef = {}) {
    return Object.keys(defaultsRef).reduce((count, key) => {
        const current = (filters[key] ?? '').toString().trim().toLowerCase();
        const base = (defaultsRef[key] ?? '').toString().trim().toLowerCase();
        return current === base ? count : count + 1;
    }, 0);
}
