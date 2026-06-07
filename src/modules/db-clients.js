import { supabase, getCurrentUser } from '../config.js';
import { logAuditEvent } from './audit-trail.js';

export async function dbGetClients() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

    if (error) {
        if (error.code === '42P01') {
            // Table doesn't exist yet, return empty array gracefully
            console.warn('Clients table does not exist yet.');
            return [];
        }
        throw error;
    }
    return data || [];
}

export async function dbSaveClient(clientData) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const isUpdate = !!clientData.id;
    let beforeRecord = null;
    if (isUpdate) {
        const { data: existing } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientData.id)
            .eq('user_id', user.id)
            .single();
        beforeRecord = existing || null;
    }

    const payload = {
        ...clientData,
        user_id: user.id
    };

    let query = supabase.from('clients');

    if (isUpdate) {
        query = query.update(payload).eq('id', clientData.id).eq('user_id', user.id);
    } else {
        query = query.insert(payload);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    const saved = data?.[0];

    await logAuditEvent({
        entityType: 'client',
        entityId: saved?.id,
        entityKey: saved?.name,
        action: isUpdate ? 'updated' : 'created',
        summary: isUpdate
            ? `Updated client ${saved?.name || clientData.name || ''}`.trim()
            : `Created client ${saved?.name || clientData.name || ''}`.trim(),
        before: beforeRecord,
        after: saved
    });

    return saved;
}

export async function dbDeleteClient(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;

    await logAuditEvent({
        entityType: 'client',
        entityId: existing?.id || id,
        entityKey: existing?.name || null,
        action: 'deleted',
        summary: `Deleted client ${existing?.name || ''}`.trim(),
        before: existing || { id }
    });

    return true;
}
