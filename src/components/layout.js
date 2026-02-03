/**
 * Layout Component Loader
 * Injects shared Navigation and Footer to eliminate HTML redundancy.
 */

import { getCurrentUser, signOut } from '../auth.js';

export async function loadLayout(activeLink = '') {
    const user = await getCurrentUser();

    // Inject Navigation
    const navHTML = `
    <nav class="navbar glass-panel">
        <div class="navbar__container">
            <div class="navbar__brand">
                <span class="navbar__logo">⚡</span>
                <span class="navbar__name">Invoice Pro</span>
            </div>
            <div class="navbar__menu">
                <a href="dashboard.html" class="navbar__link ${activeLink === 'dashboard' ? 'navbar__link--active' : ''}">Dashboard</a>
                <a href="app.html" class="navbar__link ${activeLink === 'app' ? 'navbar__link--active' : ''}">New Invoice</a>
                <a href="invoices.html" class="navbar__link ${activeLink === 'invoices' ? 'navbar__link--active' : ''}">Invoices</a>
            </div>
            <div class="navbar__user">
                ${user ? `
                <button class="user-menu-btn" id="userMenuBtn">
                    <span id="userName">${user.user_metadata?.full_name || user.email.split('@')[0]}</span>
                    <svg class="chevron-icon" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                </button>
                <div class="user-menu" id="userMenu">
                    <a href="profile.html" class="user-menu__item">
                        <svg class="menu-icon" style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        My Profile
                    </a>
                    <a href="#" class="user-menu__item" id="logoutBtn">
                        <svg class="menu-icon" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" /></svg>
                        Logout
                    </a>
                </div>
                ` : `
                <a href="login.html" class="btn btn--primary btn--sm">Login</a>
                `}
            </div>
        </div>
    </nav>
    <div style="height: 80px;"></div> <!-- Spacer for fixed nav -->
    `;

    document.body.insertAdjacentHTML('afterbegin', navHTML);

    // Bind User Menu Events if user is logged in
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

            document.getElementById('logoutBtn').addEventListener('click', async (e) => {
                e.preventDefault();
                await signOut();
            });
        }
    }
}
