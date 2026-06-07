/**
 * Activity Log Page — Main Script
 * Lists the audit trail newest-first with entity-type filtering, free-text
 * search over loaded events, and "Load more" pagination.
 */

import { getAuditEvents } from './modules/audit-trail.js'
import {
    buildEventTitle,
    filterEvents,
    formatActionLabel,
    formatRelativeTime,
    getEntityLabel
} from './modules/activity-log.js'
import { escapeHtml } from './utils.js'

const PAGE_SIZE = 50

// ── State ─────────────────────────────────────────────────────────────────────
let loadedEvents = []
let offset = 0
let entityType = 'all'
let searchQuery = ''
let hasMore = true
let isLoading = false

// ── DOM ───────────────────────────────────────────────────────────────────────
const els = {
    feed: document.getElementById('activityFeed'),
    empty: document.getElementById('emptyState'),
    loadMore: document.getElementById('loadMoreBtn'),
    entityFilter: document.getElementById('entityFilter'),
    search: document.getElementById('activitySearch')
}

// ── Rendering ───────────────────────────────────────────────────────────────
function renderEventRow(event) {
    const type = String(event.entity_type || 'record').toLowerCase()
    const title = buildEventTitle(event)
    const meta = formatActionLabel(event.action)
    const entityLabel = getEntityLabel(type)
    const key = event.entity_key ? ` · ${escapeHtml(event.entity_key)}` : ''

    return `
        <div class="activity-timeline__item">
            <span class="activity-timeline__dot activity-timeline__dot--${escapeHtml(type)}"></span>
            <div class="activity-timeline__content">
                <div class="activity-timeline__title">${escapeHtml(title)}</div>
                <div class="activity-timeline__meta">${escapeHtml(entityLabel)} · ${escapeHtml(meta)}${key}</div>
            </div>
            <span class="activity-timeline__time">${escapeHtml(formatRelativeTime(event.created_at))}</span>
        </div>
    `
}

function render() {
    const visible = filterEvents(loadedEvents, { entityType, query: searchQuery })

    if (visible.length === 0) {
        els.feed.innerHTML = ''
        // Distinguish "no data at all" from "no matches for this search".
        if (loadedEvents.length === 0) {
            els.empty.style.display = 'block'
        } else {
            els.empty.style.display = 'none'
            els.feed.innerHTML = `<p class="empty-state__text" style="padding: 2rem 1rem; text-align: center;">No activity matches your search.</p>`
        }
    } else {
        els.empty.style.display = 'none'
        els.feed.innerHTML = visible.map(renderEventRow).join('')
    }

    // Search filters only loaded events, so hide "Load more" while searching.
    els.loadMore.style.display = (hasMore && !searchQuery) ? 'inline-flex' : 'none'
    els.loadMore.disabled = isLoading
    els.loadMore.textContent = isLoading ? 'Loading…' : 'Load more'
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function loadPage({ reset = false } = {}) {
    if (isLoading) return
    isLoading = true
    render()

    if (reset) {
        offset = 0
        loadedEvents = []
        hasMore = true
    }

    const batch = await getAuditEvents({ limit: PAGE_SIZE, offset, entityType })
    loadedEvents = loadedEvents.concat(batch)
    offset += batch.length
    hasMore = batch.length === PAGE_SIZE

    isLoading = false
    render()
}

// ── Events ────────────────────────────────────────────────────────────────────
els.entityFilter.addEventListener('change', (e) => {
    entityType = e.target.value
    loadPage({ reset: true })
})

els.search.addEventListener('input', (e) => {
    searchQuery = e.target.value
    render()
})

els.loadMore.addEventListener('click', () => loadPage())

// ── Init ──────────────────────────────────────────────────────────────────────
loadPage({ reset: true })
