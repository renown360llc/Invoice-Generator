import { getCurrentUser, signOut } from './auth.js';
import { showToast } from './utils.js';
import {
    DEFAULT_APPROVAL_BUFFER_DAYS,
    getProfileState,
    saveProfileState
} from './modules/user-profile.js';
import './security.js';

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map((word) => word[0]).join('').toUpperCase().slice(0, 2);
}

function syncAvatar(name) {
    const avatarImg = document.getElementById('avatarImage');
    if (!avatarImg) return;
    avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=F37021&color=fff&size=128`;
}

function syncSummary(profile) {
    const roleBadge = document.getElementById('profileRoleBadge');
    const displaySummary = document.getElementById('profileDisplaySummary');
    const roleSummary = document.getElementById('profileRoleSummary');
    const bufferSummary = document.getElementById('profileBufferSummary');
    const workspaceSummary = document.getElementById('profileWorkspaceSummary');
    const tableStatus = document.getElementById('profileTableStatus');

    if (roleBadge) roleBadge.textContent = profile.roleLabel || 'Viewer';
    if (displaySummary) displaySummary.textContent = profile.displayName || 'User';
    if (roleSummary) roleSummary.textContent = profile.roleLabel || 'Viewer';
    if (bufferSummary) bufferSummary.textContent = `${profile.approvalBufferDays ?? DEFAULT_APPROVAL_BUFFER_DAYS} Days`;
    if (workspaceSummary) workspaceSummary.textContent = profile.workspaceName || 'Not set';
    if (tableStatus) tableStatus.textContent = profile.hasProfilesTable ? 'Live' : 'Metadata Fallback';
}

function syncHeaderProfile(profile) {
    const nameEl = document.querySelector('.top-header__user-name');
    const roleEl = document.querySelector('.top-header__user-role');
    const avatarEl = document.querySelector('.top-header__avatar');

    if (nameEl) nameEl.textContent = profile.displayName || 'User';
    if (roleEl) roleEl.textContent = profile.roleLabel || 'Viewer';
    if (avatarEl) avatarEl.textContent = getInitials(profile.displayName || 'User');
}

function populateForm(profile) {
    const displayNameInput = document.getElementById('displayName');
    const accessRoleInput = document.getElementById('accessRole');
    const approvalBufferDaysInput = document.getElementById('approvalBufferDays');
    const emailInput = document.getElementById('email');
    const workspaceNameInput = document.getElementById('workspaceName');
    const phoneNumberInput = document.getElementById('phoneNumber');

    if (displayNameInput) displayNameInput.value = profile.displayName || '';
    if (accessRoleInput) accessRoleInput.value = profile.roleLabel || 'Viewer';
    if (approvalBufferDaysInput) approvalBufferDaysInput.value = String(profile.approvalBufferDays ?? DEFAULT_APPROVAL_BUFFER_DAYS);
    if (emailInput) emailInput.value = profile.email || '';
    if (workspaceNameInput) workspaceNameInput.value = profile.workspaceName || '';
    if (phoneNumberInput) phoneNumberInput.value = profile.phoneNumber || '';
}

function readFormProfile() {
    return {
        displayName: String(document.getElementById('displayName')?.value || '').trim(),
        workspaceName: String(document.getElementById('workspaceName')?.value || '').trim(),
        phoneNumber: String(document.getElementById('phoneNumber')?.value || '').trim(),
        approvalBufferDays: document.getElementById('approvalBufferDays')?.value || DEFAULT_APPROVAL_BUFFER_DAYS
    };
}

function wireTabs() {
    const tabs = document.querySelectorAll('.profile-nav__link[data-tab]');
    const sections = document.querySelectorAll('.profile-section');

    const showTab = (targetId) => {
        tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === targetId));
        sections.forEach((section) => {
            const isActive = section.id === targetId;
            section.style.display = isActive ? 'block' : 'none';
            section.classList.toggle('active', isActive);
        });
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            showTab(tab.dataset.tab);
        });
    });

    if (tabs.length > 0) {
        showTab(tabs[0].dataset.tab);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    let currentProfile = await getProfileState(user);
    if (!currentProfile) {
        showToast('Unable to load profile.', 'error');
        return;
    }

    populateForm(currentProfile);
    syncSummary(currentProfile);
    syncHeaderProfile(currentProfile);
    syncAvatar(currentProfile.displayName);
    wireTabs();

    const form = document.getElementById('profileForm');
    const saveBtn = form?.querySelector('button[type="submit"]');
    const resetBtn = document.getElementById('profileResetBtn');
    const signOutBtn = document.getElementById('signOutBtnSide');

    resetBtn?.addEventListener('click', () => {
        populateForm(currentProfile);
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nextProfile = readFormProfile();
        if (!nextProfile.displayName) {
            showToast('Display name is required.', 'error');
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
        }

        try {
            const savedProfile = await saveProfileState(nextProfile, user);
            currentProfile = savedProfile || currentProfile;
            populateForm(currentProfile);
            syncSummary(currentProfile);
            syncHeaderProfile(currentProfile);
            syncAvatar(currentProfile.displayName);
            showToast('Profile updated successfully.', 'success');
        } catch (err) {
            console.error('Profile save error:', err);
            showToast(`Failed to save: ${err.message || 'Unable to update profile.'}`, 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        }
    });

    signOutBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await signOut();
    });
});
