import { getCurrentUser, signOut } from './auth.js';
import { showToast } from './utils.js';
import { supabase } from './config.js';
import './security.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Auth & Load User Data
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    const meta = user.user_metadata || {};

    // Populate user data
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = user.email || '';

    const fullNameInput = document.getElementById('fullName');
    const name = meta.full_name || user.email?.split('@')[0] || 'User';
    if (fullNameInput) fullNameInput.value = name;

    const jobTitleInput = document.getElementById('jobTitle');
    if (jobTitleInput) jobTitleInput.value = meta.job_title || '';

    const companyNameInput = document.getElementById('companyName');
    if (companyNameInput) companyNameInput.value = meta.company_name || '';

    const phoneNumberInput = document.getElementById('phoneNumber');
    if (phoneNumberInput) phoneNumberInput.value = meta.phone_number || '';

    // Update Avatar
    const avatarImg = document.getElementById('avatarImage');
    if (avatarImg) {
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=F37021&color=fff&size=128`;
        avatarImg.src = avatarUrl;
    }

    // 2. Tab Switching Logic
    const tabs = document.querySelectorAll('.profile-nav__link[data-tab]');
    const sections = document.querySelectorAll('.profile-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            sections.forEach(section => {
                section.style.display = 'none';
                section.classList.remove('active');

                if (section.id === targetId) {
                    section.style.display = 'block';
                    setTimeout(() => section.classList.add('active'), 10);
                }
            });
        });
    });

    // Initialize first tab
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

    // 3. Handle Form Save — writes to Supabase user_metadata
    const form = document.getElementById('profileForm');
    const saveBtn = form?.querySelector('button[type="submit"]');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const updatedName = fullNameInput?.value.trim() || '';
            const updatedJobTitle = jobTitleInput?.value.trim() || '';
            const updatedCompany = companyNameInput?.value.trim() || '';
            const updatedPhone = phoneNumberInput?.value.trim() || '';

            if (!updatedName) {
                showToast('Full name is required.', 'error');
                return;
            }

            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving…';
            }

            try {
                const { error } = await supabase.auth.updateUser({
                    data: {
                        full_name: updatedName,
                        job_title: updatedJobTitle,
                        company_name: updatedCompany,
                        phone_number: updatedPhone
                    }
                });

                if (error) {
                    console.error('Profile update error:', error);
                    showToast(`Failed to save: ${error.message}`, 'error');
                } else {
                    showToast('Profile updated successfully!', 'success');

                    // Update avatar to reflect new name
                    if (avatarImg) {
                        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(updatedName)}&background=F37021&color=fff&size=128`;
                    }
                }
            } catch (err) {
                console.error('Profile save error:', err);
                showToast('An unexpected error occurred.', 'error');
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Changes';
                }
            }
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
