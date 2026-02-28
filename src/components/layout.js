/**
 * Layout Component Loader — InsightFlow Sidebar + Header
 * Injects the persistent sidebar navigation and top header bar.
 */

import { getCurrentUser, signOut } from '../auth.js';

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export async function loadLayout(activeLink = '') {
    const user = await getCurrentUser();
    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
    const initials = getInitials(displayName);

    const sidebarHTML = `
    <div class="app-shell">
        <!-- Mobile Toggle -->
        <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar">☰</button>
        <div class="sidebar-overlay" id="sidebarOverlay"></div>

        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
            <div class="sidebar__brand">
                <div class="sidebar__logo">⚡</div>
                <span class="sidebar__name">Invoice Pro</span>
            </div>

            <nav class="sidebar__nav">
                <div class="sidebar__section-label">Main</div>

                <a href="dashboard.html" class="sidebar__link ${activeLink === 'dashboard' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>
                    </svg>
                    Dashboard
                </a>

                <div class="sidebar__section-label">CRM</div>

                <a href="consultants.html" class="sidebar__link ${activeLink === 'consultants' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                    Consultants
                </a>

                <a href="timesheets.html" class="sidebar__link ${activeLink === 'timesheets' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 7h16M4 12h10M4 17h7"/>
                    </svg>
                    Timesheets
                </a>

                <div class="sidebar__section-label">Invoicing</div>

                <a href="app.html" class="sidebar__link ${activeLink === 'app' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 4v16m8-8H4"/>
                    </svg>
                    Create Invoice
                </a>

                <a href="invoices.html" class="sidebar__link ${activeLink === 'invoices' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    Invoices
                </a>

                <a href="templates.html" class="sidebar__link ${activeLink === 'templates' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414A1 1 0 0120 8.414V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/>
                    </svg>
                    Templates
                </a>

                <div class="sidebar__section-label">Insights</div>

                <a href="analytics.html" class="sidebar__link ${activeLink === 'analytics' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 3v18h18M8 14l3-3 3 2 4-5"/>
                    </svg>
                    Analytics
                </a>

                <div class="sidebar__section-label">Account</div>

                <a href="profile.html" class="sidebar__link ${activeLink === 'profile' ? 'sidebar__link--active' : ''}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    Profile
                </a>
            </nav>

            <div class="sidebar__footer">
                ${user ? `
                <a href="#" class="sidebar__link" id="sidebarLogout">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    Logout
                </a>
                ` : `
                <a href="login.html" class="sidebar__link">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    Login
                </a>
                `}
            </div>
        </aside>

        <!-- Main Content Area -->
        <div class="app-shell__content">
            <!-- Top Header -->
            <header class="top-header">
                <span class="top-header__page-title">${getPageTitle(activeLink)}</span>

                <div class="top-header__search">
                    <svg class="top-header__search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input type="text" class="top-header__search-input" placeholder="Search invoices, clients, or reports...">
                </div>

                <div class="top-header__actions">
                    <button class="top-header__icon-btn" title="Notifications" aria-label="Notifications">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                        </svg>
                        <span class="notification-dot"></span>
                    </button>

                    ${user ? `
                    <div class="top-header__user" id="userMenuBtn">
                        <div class="top-header__avatar">${initials}</div>
                        <div class="top-header__user-info">
                            <span class="top-header__user-name">${displayName}</span>
                            <span class="top-header__user-role">Admin</span>
                        </div>
                        <div class="user-menu" id="userMenu">
                            <a href="profile.html" class="user-menu__item">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                My Profile
                            </a>
                            <a href="#" class="user-menu__item" id="logoutBtn">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                Logout
                            </a>
                        </div>
                    </div>
                    ` : `
                    <a href="login.html" class="btn btn--primary btn--sm" style="border-radius: var(--radius-sm); font-size: 0.8125rem;">Login</a>
                    `}
                </div>
            </header>
    `;

    // We inject the sidebar/header at the beginning and leave the closing tags for the page
    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);

    const appContent = document.querySelector('.app-shell__content');
    const shellEl = document.querySelector('.app-shell');
    const floatingChildren = Array.from(document.body.children).filter(child => child !== shellEl);
    if (appContent && floatingChildren.length) {
        const fragment = document.createDocumentFragment();
        floatingChildren.forEach((child) => fragment.appendChild(child));
        appContent.appendChild(fragment);
    }

    bindGlobalHeaderSearch(activeLink);

    // ── Event Bindings ──

    // Sidebar toggle (mobile)
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (toggleBtn && sidebar && overlay) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('is-open');
            overlay.classList.toggle('is-open');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('is-open');
            overlay.classList.remove('is-open');
        });
    }

    // User menu toggle
    if (user) {
        const btn = document.getElementById('userMenuBtn');
        const menu = document.getElementById('userMenu');

        if (btn && menu) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                menu.classList.remove('show');
            });
        }

        // Logout buttons
        const logoutBtn = document.getElementById('logoutBtn');
        const sidebarLogout = document.getElementById('sidebarLogout');

        const handleLogout = async (e) => {
            e.preventDefault();
            await signOut();
        };

        logoutBtn?.addEventListener('click', handleLogout);
        sidebarLogout?.addEventListener('click', handleLogout);
    }

    // Navigation event for layout toggle
    document.addEventListener('layout:toggle-nav', () => {
        sidebar?.classList.toggle('is-open');
        overlay?.classList.toggle('is-open');
    });

    // Prefetch likely next navigation targets on user intent.
    document.querySelectorAll('.sidebar__nav a[href$=".html"]').forEach((link) => {
        const href = link.getAttribute('href');
        if (!href) return;

        const onIntent = () => prefetchPage(href);
        link.addEventListener('mouseenter', onIntent, { once: true, passive: true });
        link.addEventListener('focus', onIntent, { once: true, passive: true });
    });
}

function prefetchPage(href) {
    try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (!url.pathname.endsWith('.html')) return;

        const selector = `link[rel="prefetch"][href="${url.pathname}"]`;
        if (document.head.querySelector(selector)) return;

        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'document';
        link.href = url.pathname;
        document.head.appendChild(link);
    } catch (err) {
        // Ignore malformed href values.
    }
}

function bindGlobalHeaderSearch(activeLink) {
    const headerInput = document.querySelector('.top-header__search-input');
    if (!(headerInput instanceof HTMLInputElement)) return;

    const localInputSelectorMap = {
        consultants: '#searchInput',
        timesheets: '#searchInput',
        analytics: '#consultantSearch',
        invoices: '#searchInput'
    };

    const localSelector = localInputSelectorMap[activeLink];
    const localInput = localSelector ? document.querySelector(localSelector) : null;

    if (localInput instanceof HTMLInputElement) {
        const syncFromLocal = () => {
            if (headerInput.value !== localInput.value) {
                headerInput.value = localInput.value;
            }
        };

        headerInput.placeholder = localInput.getAttribute('placeholder') || 'Search...';
        syncFromLocal();

        localInput.addEventListener('input', syncFromLocal, { passive: true });
        headerInput.addEventListener('input', () => {
            if (localInput.value === headerInput.value) return;
            localInput.value = headerInput.value;
            localInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return;
    }

    if (activeLink === 'dashboard') {
        headerInput.placeholder = 'Search recent invoices...';
        headerInput.addEventListener('input', () => {
            document.dispatchEvent(new CustomEvent('dashboard:global-search', {
                detail: { query: headerInput.value || '' }
            }));
        });
        return;
    }

    headerInput.value = '';
    headerInput.placeholder = 'Search is not available on this page';
    headerInput.disabled = true;
}

function getPageTitle(activeLink) {
    const titles = {
        'dashboard': 'Dashboard',
        'app': 'Create Invoice',
        'invoices': 'Invoices',
        'templates': 'Templates',
        'consultants': 'Consultants',
        'analytics': 'Analytics',
        'timesheets': 'Timesheets',
        'profile': 'Profile',
        '': 'Welcome'
    };
    return titles[activeLink] || 'Invoice Pro';
}
