export const DEFAULT_APPROVAL_BUFFER_DAYS = 3;
export const ROLE_LABELS = {
    viewer: 'Viewer',
    ops: 'Operations',
    finance: 'Finance',
    admin: 'Admin'
};

function toText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

export function normalizeApprovalBuffer(value) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    return DEFAULT_APPROVAL_BUFFER_DAYS;
}

export function normalizeRole(value) {
    const raw = String(value || '').trim().toLowerCase();
    return ROLE_LABELS[raw] ? raw : 'viewer';
}

export function getRoleLabel(role) {
    return ROLE_LABELS[normalizeRole(role)];
}

export function buildProfileState(user, profileRow = null) {
    const meta = user?.user_metadata || {};
    const role = normalizeRole(profileRow?.role || meta.role || 'viewer');
    const fallbackRoleLabel = toText(meta.role_display, toText(meta.job_title, ''));
    const displayName = toText(meta.display_name, toText(meta.full_name, toText(user?.email?.split('@')[0], 'User')));
    const workspaceName = toText(meta.workspace_name, toText(meta.company_name, ''));
    const phoneNumber = toText(meta.phone_number, '');

    return {
        displayName,
        accessRole: role,
        roleLabel: profileRow ? getRoleLabel(role) : (fallbackRoleLabel || getRoleLabel(role)),
        workspaceName,
        phoneNumber,
        approvalBufferDays: normalizeApprovalBuffer(profileRow?.approval_buffer_days ?? meta.approval_buffer_days),
        email: user?.email || '',
        hasProfilesTable: Boolean(profileRow)
    };
}
