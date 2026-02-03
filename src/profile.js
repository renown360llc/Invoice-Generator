import { getCurrentUser, signOut } from './auth.js';
import { showToast } from './utils.js';
import './security.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Auth & Load User Data
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // console.log('User loaded:', user);

    // Populate user data safe check
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = user.email || '';

    const fullNameInput = document.getElementById('fullName');
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    if (fullNameInput) fullNameInput.value = name;

    // Update Avatar
    const avatarImg = document.getElementById('avatarImage');
    if (avatarImg) {
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=F37021&color=fff&size=128`;
        avatarImg.src = avatarUrl;
    }

    // 2. Tab Switching Logic
    const tabs = document.querySelectorAll('.profile-nav__link[data-tab]');
    const sections = document.querySelectorAll('.profile-section');

    if (tabs.length === 0) console.warn('No tabs found!');
    if (sections.length === 0) console.warn('No sections found!');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = tab.dataset.tab;
            console.log('Switching to tab:', targetId);

            // Update Tabs
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update Sections
            sections.forEach(section => {
                // Hide all first
                section.style.display = 'none';
                section.classList.remove('active');

                // Show matching
                if (section.id === targetId) {
                    section.style.display = 'block';
                    // Small timeout to allow display:block to apply before adding active class for animation
                    setTimeout(() => section.classList.add('active'), 10);
                }
            });
        });
    });

    // Initialize first tab explicitly
    if (tabs.length > 0) {
        const firstTab = tabs[0];
        const targetId = firstTab.dataset.tab;

        firstTab.classList.add('active');
        sections.forEach(section => {
            if (section.id === targetId) {
                section.style.display = 'block';
                section.classList.add('active');
            } else {
                section.style.display = 'none';
                section.classList.remove('active');
            }
        });
    }

    // 3. Handle Form Save (Mock implementation)
    const form = document.getElementById('profileForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            // In a real app, update Supabase user metadata here
            showToast('Profile updated successfully!', 'success');
        });
    }

    // 4. Handle Sign Out from Sidebar
    const signOutBtn = document.getElementById('signOutBtnSide');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut();
        });
    }
});
