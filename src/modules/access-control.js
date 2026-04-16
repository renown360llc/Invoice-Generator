import { getProfileState } from './user-profile.js';

export function isReadOnlyRole(role) {
    return String(role || '').toLowerCase() === 'viewer';
}

export function getReadOnlyMessage(feature = 'this section') {
    return `Your role is read-only. You can view ${feature}, but you cannot make changes from this account.`;
}

export async function getAccessContext(user = null) {
    const profile = await getProfileState(user).catch(() => null);
    const role = String(profile?.accessRole || 'viewer').toLowerCase();
    return {
        role,
        isReadOnly: isReadOnlyRole(role),
        profile
    };
}
