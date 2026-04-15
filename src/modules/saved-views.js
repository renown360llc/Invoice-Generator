let STORAGE_KEY = 'invoice_pro_saved_views_v1';

/**
 * Scope the localStorage key to a specific user so saved views
 * do not bleed between accounts on a shared device.
 * Call this once after authentication, before any reads/writes.
 */
export function initSavedViewsForUser(userId) {
    if (userId) {
        STORAGE_KEY = `invoice_pro_saved_views_v1_${String(userId).slice(-12)}`;
    }
}

function readStore() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (error) {
        console.warn('Failed to read saved views', error);
        return {};
    }
}

function writeStore(store) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
        console.warn('Failed to write saved views', error);
    }
}

function normalizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listSavedViews(page) {
    const store = readStore();
    const pageViews = Array.isArray(store[page]) ? store[page] : [];
    return pageViews
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function saveSavedView(page, { id, name, state } = {}) {
    const normalizedName = normalizeName(name);
    if (!normalizedName) throw new Error('View name is required');

    const store = readStore();
    const pageViews = Array.isArray(store[page]) ? store[page] : [];
    const timestamp = new Date().toISOString();
    const record = {
        id: id || createId(),
        name: normalizedName,
        state: state || {},
        updatedAt: timestamp
    };

    const existingIndex = pageViews.findIndex((view) => view.id === record.id);
    if (existingIndex >= 0) {
        pageViews[existingIndex] = {
            ...pageViews[existingIndex],
            ...record
        };
    } else {
        pageViews.push(record);
    }

    store[page] = pageViews;
    writeStore(store);
    return record;
}

export function deleteSavedView(page, id) {
    if (!id) return;
    const store = readStore();
    const pageViews = Array.isArray(store[page]) ? store[page] : [];
    store[page] = pageViews.filter((view) => view.id !== id);
    writeStore(store);
}
