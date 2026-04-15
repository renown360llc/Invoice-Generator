import { supabase, getCurrentUser } from '../config.js';
import { logAuditEvent } from './audit-trail.js';

export async function dbGetConsultants() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('consultants')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

    if (error) {
        if (error.code === '42P01') {
            // Table doesn't exist yet, return empty array gracefully
            console.warn('Consultants table does not exist yet.');
            return [];
        }
        throw error;
    }
    return data || [];
}

export async function dbSaveConsultant(consultantData) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const isUpdate = !!consultantData.id;
    let beforeRecord = null;
    if (isUpdate) {
        const { data: existing } = await supabase
            .from('consultants')
            .select('*')
            .eq('id', consultantData.id)
            .eq('user_id', user.id)
            .single();
        beforeRecord = existing || null;
    }

    const payload = {
        ...consultantData,
        user_id: user.id
    };

    let query = supabase.from('consultants');

    if (isUpdate) {
        query = query.update(payload).eq('id', consultantData.id).eq('user_id', user.id);
    } else {
        query = query.insert(payload);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    const saved = data?.[0];

    await logAuditEvent({
        entityType: 'consultant',
        entityId: saved?.id,
        entityKey: saved?.name,
        action: isUpdate ? 'updated' : 'created',
        summary: isUpdate
            ? `Updated consultant ${saved?.name || consultantData.name || ''}`.trim()
            : `Created consultant ${saved?.name || consultantData.name || ''}`.trim(),
        before: beforeRecord,
        after: saved
    });

    return saved;
}

export async function dbDeleteConsultant(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing } = await supabase
        .from('consultants')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    const { error } = await supabase
        .from('consultants')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;

    await logAuditEvent({
        entityType: 'consultant',
        entityId: existing?.id || id,
        entityKey: existing?.name || null,
        action: 'deleted',
        summary: `Deleted consultant ${existing?.name || ''}`.trim(),
        before: existing || { id }
    });

    return true;
}

export async function dbGetActiveConsultants() {
    const consultants = await dbGetConsultants();
    const today = new Date().toISOString().split('T')[0];

    return consultants.filter(c => {
        if (c.status === 'inactive') return false;
        if (c.end_date && c.end_date < today) return false;
        return true;
    });
}

/**
 * Returns the total number of timesheet records linked to a consultant.
 * Used to show a cascade warning before deleting.
 */
export async function dbGetTimesheetsCountForConsultant(consultantId) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { count, error } = await supabase
        .from('timesheets')
        .select('id', { count: 'exact', head: true })
        .eq('consultant_id', consultantId)
        .eq('user_id', user.id);

    if (error) {
        // If table doesn't exist yet, return 0 gracefully
        if (error.code === '42P01') return 0;
        throw error;
    }
    return count || 0;
}
