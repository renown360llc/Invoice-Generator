import { describe, it, expect } from 'vitest';
import {
    DEFAULT_APPROVAL_BUFFER_DAYS,
    buildProfileState,
    getRoleLabel,
    normalizeApprovalBuffer,
    normalizeRole
} from '../src/modules/profile-state.js';

describe('profile state helpers', () => {
    it('normalizes supported roles and falls back to viewer', () => {
        expect(normalizeRole('ADMIN')).toBe('admin');
        expect(normalizeRole('ops')).toBe('ops');
        expect(normalizeRole('unknown')).toBe('viewer');
    });

    it('maps canonical roles to user-facing labels', () => {
        expect(getRoleLabel('finance')).toBe('Finance');
        expect(getRoleLabel('viewer')).toBe('Viewer');
    });

    it('normalizes approval buffer values', () => {
        expect(normalizeApprovalBuffer('5')).toBe(5);
        expect(normalizeApprovalBuffer('-1')).toBe(DEFAULT_APPROVAL_BUFFER_DAYS);
        expect(normalizeApprovalBuffer(undefined)).toBe(DEFAULT_APPROVAL_BUFFER_DAYS);
    });

    it('builds profile state from metadata and profile rows', () => {
        const user = {
            email: 'ops@example.com',
            user_metadata: {
                display_name: 'Ops Lead',
                workspace_name: 'Northwind Ops',
                phone_number: '+1 222 333 4444'
            }
        };

        const state = buildProfileState(user, {
            role: 'finance',
            approval_buffer_days: 4
        });

        expect(state.displayName).toBe('Ops Lead');
        expect(state.roleLabel).toBe('Finance');
        expect(state.workspaceName).toBe('Northwind Ops');
        expect(state.approvalBufferDays).toBe(4);
        expect(state.hasProfilesTable).toBe(true);
    });

    it('preserves metadata role labels when no profile row exists yet', () => {
        const user = {
            email: 'ops@example.com',
            user_metadata: {
                full_name: 'Ops Lead',
                role_display: 'Finance Lead'
            }
        };

        const state = buildProfileState(user, null);
        expect(state.roleLabel).toBe('Finance Lead');
        expect(state.accessRole).toBe('viewer');
        expect(state.hasProfilesTable).toBe(false);
    });
});
