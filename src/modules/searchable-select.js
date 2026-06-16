/**
 * Searchable select — progressive enhancement for native <select> elements.
 *
 * Each native select is kept in the DOM as the hidden source of truth (so all
 * existing change listeners, .value reads and form submits keep working) and a
 * custom combobox is layered on top: a scrollable list capped at ~5 rows and a
 * type-to-filter search box for long lists (prefix match first, then substring).
 *
 * Auto-initialises on import. Opt a select out with `data-no-search`.
 */

const SEARCH_THRESHOLD = 7; // show the search box once a list has more options than this
const VISIBLE_ROWS = 5;     // rows shown before the list scrolls
const SKIP_CLASSES = ['inv-period-menu-select', 'crm-toolbar__period-menu-select'];

/**
 * Pure option filter. Prefix matches win (typing "in" surfaces items starting
 * with "in"); when nothing starts with the query we fall back to substring so
 * the user is never stuck. Empty query returns everything.
 */
export function filterOptions(items = [], query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return items;
    const prefix = items.filter((it) => it.label.toLowerCase().startsWith(q));
    if (prefix.length) return prefix;
    return items.filter((it) => it.label.toLowerCase().includes(q));
}

function injectStyles() {
    if (document.getElementById('ss-styles')) return;
    const style = document.createElement('style');
    style.id = 'ss-styles';
    style.textContent = `
.ss { position: relative; display: inline-flex; align-items: center; gap: 0.35rem;
      cursor: pointer; box-sizing: border-box; background-image: none !important;
      -webkit-appearance: none; appearance: none; user-select: none; }
.ss:focus { outline: 2px solid var(--primary, #ff6b4a); outline-offset: 1px; }
.ss__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; text-align: left; }
.ss__value--placeholder { color: var(--text-tertiary, #94a3b8); }
.ss__chevron { flex: 0 0 auto; width: 14px; height: 14px; opacity: 0.6;
      transition: transform 0.18s ease; pointer-events: none; }
.ss[aria-expanded="true"] .ss__chevron { transform: rotate(180deg); }
.ss__panel { position: absolute; left: 0; top: calc(100% + 4px); z-index: 9999;
      min-width: 100%; width: max-content; max-width: min(320px, 80vw);
      background: #fff; border: 1px solid var(--surface-glass-border, #e2e8f0);
      border-radius: 8px; box-shadow: 0 12px 28px -8px rgba(0,0,0,0.18);
      padding: 0.3rem; display: none; flex-direction: column; gap: 0.25rem; }
.ss__panel--up { top: auto; bottom: calc(100% + 4px); }
.ss.is-open .ss__panel { display: flex; }
.ss__search { width: 100%; box-sizing: border-box; padding: 0.4rem 0.55rem;
      border: 1.5px solid var(--surface-glass-border, #e2e8f0); border-radius: 6px;
      font-size: 0.8rem; outline: none; }
.ss__search:focus { border-color: var(--primary, #ff6b4a); }
.ss__list { list-style: none; margin: 0; padding: 0; overflow-y: auto;
      max-height: calc(${VISIBLE_ROWS} * 2.1rem); }
.ss__opt { padding: 0.45rem 0.6rem; font-size: 0.82rem; border-radius: 6px;
      cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: var(--text-primary, #1e293b); }
.ss__opt:hover, .ss__opt.is-active { background: var(--surface-app, #f1f5f9);
      color: var(--primary, #ff6b4a); }
.ss__opt[aria-selected="true"] { font-weight: 600; }
.ss__opt--check { display: flex; align-items: center; gap: 8px; }
.ss__opt--check .ss__opt-label { overflow: hidden; text-overflow: ellipsis; }
.ss__box { width: 14px; height: 14px; flex: 0 0 auto; border: 1.5px solid var(--surface-glass-border, #cbd5e1);
      border-radius: 4px; position: relative; box-sizing: border-box; }
.ss__opt--checked .ss__box { background: var(--primary, #ff6b4a); border-color: var(--primary, #ff6b4a); }
.ss__opt--checked .ss__box::after { content: ''; position: absolute; left: 4px; top: 1px;
      width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.ss__opt--empty { padding: 0.55rem 0.6rem; font-size: 0.8rem; color: var(--text-tertiary, #94a3b8);
      cursor: default; text-align: center; }
`;
    document.head.appendChild(style);
}

function readItems(select) {
    return Array.from(select.options).map((o) => ({
        value: o.value,
        label: o.textContent || '',
        disabled: o.disabled
    }));
}

function enhanceSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.dataset.ssEnhanced) return;
    if (select.hasAttribute('data-no-search')) return;
    if (select.getAttribute('aria-hidden') === 'true') return;
    if (SKIP_CLASSES.some((c) => select.classList.contains(c))) return;
    if (getComputedStyle(select).display === 'none') return;

    injectStyles();
    select.dataset.ssEnhanced = '1';

    const multi = select.multiple;
    // For multi-select, an empty selection means "any"; show this placeholder.
    const placeholder = select.getAttribute('data-placeholder')
        || select.getAttribute('aria-label') || 'Any';

    // Wrapper inherits the select's class + inline sizing so layout is preserved.
    const wrap = document.createElement('div');
    wrap.className = `${select.className} ss`.trim();
    ['width', 'flex', 'flexBasis', 'minWidth', 'maxWidth', 'margin'].forEach((p) => {
        if (select.style[p]) wrap.style[p] = select.style[p];
    });
    wrap.setAttribute('role', 'combobox');
    wrap.setAttribute('aria-haspopup', 'listbox');
    wrap.setAttribute('aria-expanded', 'false');
    wrap.tabIndex = 0;
    if (select.getAttribute('aria-label')) wrap.setAttribute('aria-label', select.getAttribute('aria-label'));

    const valueEl = document.createElement('span');
    valueEl.className = 'ss__value';
    wrap.appendChild(valueEl);
    wrap.insertAdjacentHTML('beforeend',
        '<svg class="ss__chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>');

    const panel = document.createElement('div');
    panel.className = 'ss__panel';
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'ss__search';
    search.placeholder = 'Type to search…';
    const list = document.createElement('ul');
    list.className = 'ss__list';
    list.setAttribute('role', 'listbox');
    panel.append(search, list);
    wrap.appendChild(panel);

    // Mount: wrapper takes the select's place; the select moves inside, hidden.
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.style.display = 'none';

    let items = [];
    let activeIndex = -1;

    function optionByValue(v) {
        return [...select.options].find((o) => o.value === v);
    }

    function syncLabel() {
        if (multi) {
            const sel = [...select.selectedOptions].filter((o) => o.value !== '');
            let label;
            if (sel.length === 0) label = placeholder;
            else if (sel.length <= 2) label = sel.map((o) => o.textContent).join(', ');
            else label = `${sel.length} selected`;
            valueEl.textContent = label;
            valueEl.classList.toggle('ss__value--placeholder', sel.length === 0);
            return;
        }
        const opt = select.options[select.selectedIndex];
        const label = opt ? (opt.textContent || '') : '';
        valueEl.textContent = label || ' ';
        valueEl.classList.toggle('ss__value--placeholder', !opt || opt.value === '');
    }

    function toggleValue(value) {
        const o = optionByValue(value);
        if (!o) return;
        o.selected = !o.selected;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncLabel();
        // Update the row in place (re-rendering would detach the click target
        // and let the outside-click handler close the still-open menu).
        const li = [...list.querySelectorAll('.ss__opt')].find((el) => el.dataset.value === value);
        if (li) {
            li.classList.toggle('ss__opt--checked', o.selected);
            if (o.selected) li.setAttribute('aria-selected', 'true');
            else li.removeAttribute('aria-selected');
        }
    }

    function renderList() {
        const visible = filterOptions(items, search.value);
        list.innerHTML = '';
        activeIndex = -1;
        if (!visible.length) {
            const li = document.createElement('li');
            li.className = 'ss__opt--empty';
            li.textContent = 'No matches';
            list.appendChild(li);
            return;
        }
        visible.forEach((it, i) => {
            const li = document.createElement('li');
            li.className = multi ? 'ss__opt ss__opt--check' : 'ss__opt';
            li.setAttribute('role', 'option');
            li.dataset.value = it.value;
            const selected = multi ? Boolean(optionByValue(it.value)?.selected) : it.value === select.value;
            if (multi) {
                li.appendChild(document.createElement('span')).className = 'ss__box';
                const lbl = document.createElement('span');
                lbl.className = 'ss__opt-label';
                lbl.textContent = it.label;
                li.appendChild(lbl);
            } else {
                li.textContent = it.label;
            }
            if (selected) {
                li.setAttribute('aria-selected', 'true');
                li.classList.add('ss__opt--checked');
                if (activeIndex < 0) activeIndex = i;
            }
            if (it.disabled) li.setAttribute('aria-disabled', 'true');
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (it.disabled) return;
                multi ? toggleValue(it.value) : commit(it.value);
            });
            list.appendChild(li);
        });
        highlight(activeIndex >= 0 ? activeIndex : 0);
    }

    function highlight(index) {
        const opts = list.querySelectorAll('.ss__opt');
        if (!opts.length) return;
        activeIndex = Math.max(0, Math.min(index, opts.length - 1));
        opts.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
        opts[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function commit(value) {
        if (select.value !== value) {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncLabel();
        close();
    }

    function open() {
        if (wrap.classList.contains('is-open')) return;
        items = readItems(select);
        search.style.display = items.length > SEARCH_THRESHOLD ? '' : 'none';
        search.value = '';
        renderList();
        wrap.classList.add('is-open');
        wrap.setAttribute('aria-expanded', 'true');
        panel.classList.toggle('ss__panel--up',
            wrap.getBoundingClientRect().bottom + panel.offsetHeight + 8 > window.innerHeight);
        if (search.style.display !== 'none') search.focus();
    }

    function close() {
        if (!wrap.classList.contains('is-open')) return;
        wrap.classList.remove('is-open');
        wrap.setAttribute('aria-expanded', 'false');
    }

    function toggle() { wrap.classList.contains('is-open') ? close() : open(); }

    wrap.addEventListener('click', (e) => {
        if (e.target === search || list.contains(e.target)) return;
        toggle();
    });

    wrap.addEventListener('keydown', (e) => {
        const isOpen = wrap.classList.contains('is-open');
        if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            open();
            return;
        }
        if (!isOpen) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); highlight(activeIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(activeIndex - 1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const el = list.querySelectorAll('.ss__opt')[activeIndex];
            if (el) (multi ? toggleValue(el.dataset.value) : commit(el.dataset.value));
        } else if (e.key === 'Escape') { e.preventDefault(); close(); wrap.focus(); }
        else if (e.key === 'Tab') { close(); }
    });

    search.addEventListener('input', renderList);

    // Keep the custom label in sync with the underlying select for both
    // user-driven and programmatic changes.
    select.addEventListener('change', syncLabel);
    new MutationObserver(() => { items = readItems(select); syncLabel(); if (wrap.classList.contains('is-open')) renderList(); })
        .observe(select, { childList: true });

    // Intercept `select.value = …` (clear filters, hydrate) to refresh the label.
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (desc && desc.configurable) {
        Object.defineProperty(select, 'value', {
            configurable: true,
            get() { return desc.get.call(this); },
            set(v) { desc.set.call(this, v); syncLabel(); }
        });
    }

    syncLabel();
}

function enhanceAll(root = document) {
    root.querySelectorAll('select').forEach(enhanceSelect);
}

function init() {
    enhanceAll(document);
    // Close any open menu on an outside click.
    document.addEventListener('mousedown', (e) => {
        document.querySelectorAll('.ss.is-open').forEach((wrap) => {
            if (!wrap.contains(e.target)) {
                wrap.classList.remove('is-open');
                wrap.setAttribute('aria-expanded', 'false');
            }
        });
    });
    new MutationObserver((muts) => {
        muts.forEach((m) => m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            if (n.matches?.('select')) enhanceSelect(n);
            n.querySelectorAll?.('select').forEach(enhanceSelect);
        }));
    }).observe(document.body, { childList: true, subtree: true });
}

// Auto-init in the browser; stay import-safe in non-DOM (test) environments.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
