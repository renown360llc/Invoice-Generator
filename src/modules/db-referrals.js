import { supabase, getCurrentUser } from '../config.js';
import { logAuditEvent } from './audit-trail.js';

export async function dbGetReferralPayouts() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('referral_payouts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        if (error.code === '42P01') {
            console.warn('Referral payouts table does not exist yet.');
            return [];
        }
        throw error;
    }
    return data || [];
}

export async function dbSaveReferralPayout(payoutData) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const isUpdate = !!payoutData.id;
    let beforeRecord = null;
    if (isUpdate) {
        const { data: existing } = await supabase
            .from('referral_payouts')
            .select('*')
            .eq('id', payoutData.id)
            .eq('user_id', user.id)
            .single();
        beforeRecord = existing || null;
    }

    const payload = { ...payoutData, user_id: user.id };

    let query = supabase.from('referral_payouts');
    if (isUpdate) {
        query = query.update(payload).eq('id', payoutData.id).eq('user_id', user.id);
    } else {
        query = query.insert(payload);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    const saved = data?.[0];

    await logAuditEvent({
        entityType: 'referral',
        entityId: saved?.id,
        entityKey: saved?.invoice_number || saved?.recipient,
        action: isUpdate ? 'updated' : 'created',
        summary: isUpdate
            ? `Updated referral payout to ${saved?.recipient || ''}`.trim()
            : `Created referral payout to ${saved?.recipient || ''}`.trim(),
        before: beforeRecord,
        after: saved
    });

    return saved;
}

export async function dbDeleteReferralPayout(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing } = await supabase
        .from('referral_payouts')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    const { error } = await supabase
        .from('referral_payouts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;

    await logAuditEvent({
        entityType: 'referral',
        entityId: existing?.id || id,
        entityKey: existing?.invoice_number || existing?.recipient || null,
        action: 'deleted',
        summary: `Deleted referral payout to ${existing?.recipient || ''}`.trim(),
        before: existing || { id }
    });

    return true;
}
