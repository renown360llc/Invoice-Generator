import { supabase, getCurrentUser } from '../config.js';

export async function dbGetConsultants() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('consultants')
        .select('*')
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
    return data?.[0];
}

export async function dbDeleteConsultant(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('consultants')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;
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
