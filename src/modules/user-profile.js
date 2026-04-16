import { supabase } from '../config.js';
import { getCurrentUser } from '../auth.js';
import {
    DEFAULT_APPROVAL_BUFFER_DAYS,
    buildProfileState,
    normalizeApprovalBuffer
} from './profile-state.js';

function isMissingProfilesTableError(error = {}) {
    const code = error.code || '';
    const message = String(error.message || '').toLowerCase();
    return code === '42P01' || code === 'PGRST205' || message.includes('does not exist');
}

function toText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

export { DEFAULT_APPROVAL_BUFFER_DAYS, buildProfileState } from './profile-state.js';

export async function fetchProfileRow(user = null) {
    const currentUser = user || await getCurrentUser();
    if (!currentUser) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

    if (error) {
        if (isMissingProfilesTableError(error)) return null;
        throw error;
    }

    return data || null;
}

export async function ensureProfileRow(user = null) {
    const currentUser = user || await getCurrentUser();
    if (!currentUser) return null;

    const existing = await fetchProfileRow(currentUser);
    if (existing) return existing;

    const { data, error } = await supabase
        .from('profiles')
        .insert({
            user_id: currentUser.id,
            approval_buffer_days: DEFAULT_APPROVAL_BUFFER_DAYS
        })
        .select()
        .single();

    if (error) {
        if (isMissingProfilesTableError(error)) return null;
        throw error;
    }

    return data || null;
}

export async function getProfileState(user = null) {
    const currentUser = user || await getCurrentUser();
    if (!currentUser) return null;
    const profileRow = await fetchProfileRow(currentUser).catch(() => null);
    return buildProfileState(currentUser, profileRow);
}

export async function saveProfileState(state, user = null) {
    const currentUser = user || await getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const payload = {
        display_name: toText(state.displayName),
        full_name: toText(state.displayName),
        workspace_name: toText(state.workspaceName),
        company_name: toText(state.workspaceName),
        phone_number: toText(state.phoneNumber)
    };

    const { error: authError } = await supabase.auth.updateUser({ data: payload });
    if (authError) throw authError;

    try {
        await supabase
            .from('profiles')
            .upsert({
                user_id: currentUser.id,
                approval_buffer_days: normalizeApprovalBuffer(state.approvalBufferDays)
            }, {
                onConflict: 'user_id'
            });
    } catch (error) {
        if (!isMissingProfilesTableError(error)) {
            throw error;
        }
    }

    return getProfileState(currentUser);
}
