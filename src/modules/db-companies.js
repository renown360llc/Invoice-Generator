import { supabase, getCurrentUser } from '../config.js';
import { logAuditEvent } from './audit-trail.js';

export async function dbGetCompanies() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

    if (error) {
        if (error.code === '42P01') {
            console.warn('Companies table does not exist yet.');
            return [];
        }
        throw error;
    }
    return data || [];
}

export async function dbSaveCompany(companyData) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const isUpdate = !!companyData.id;
    let beforeRecord = null;
    if (isUpdate) {
        const { data: existing } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyData.id)
            .eq('user_id', user.id)
            .single();
        beforeRecord = existing || null;
    }

    const payload = {
        ...companyData,
        user_id: user.id
    };

    let query = supabase.from('companies');

    if (isUpdate) {
        query = query.update(payload).eq('id', companyData.id).eq('user_id', user.id);
    } else {
        query = query.insert(payload);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    const saved = data?.[0];

    await logAuditEvent({
        entityType: 'company',
        entityId: saved?.id,
        entityKey: saved?.name,
        action: isUpdate ? 'updated' : 'created',
        summary: isUpdate
            ? `Updated company ${saved?.name || companyData.name || ''}`.trim()
            : `Created company ${saved?.name || companyData.name || ''}`.trim(),
        before: beforeRecord,
        after: saved
    });

    return saved;
}

export async function dbDeleteCompany(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;

    await logAuditEvent({
        entityType: 'company',
        entityId: existing?.id || id,
        entityKey: existing?.name || null,
        action: 'deleted',
        summary: `Deleted company ${existing?.name || ''}`.trim(),
        before: existing || { id }
    });

    return true;
}
