import { supabase, getCurrentUser } from '../config.js';

function compactInvoice(record = {}) {
    return {
        id: record.id || null,
        invoice_number: record.invoice_number || null,
        status: record.status || 'draft',
        client_name: record.client_info?.name || null,
        currency: record.invoice_meta?.currency || null,
        total: Number(record.totals?.total || 0),
        paid_date: record.paid_date || null
    };
}

function compactConsultant(record = {}) {
    return {
        id: record.id || null,
        name: record.name || null,
        status: record.status || 'active',
        client: record.client || null,
        w2_company: record.w2_company || null,
        currency: record.currency || null,
        bill_rate: Number(record.bill_rate || 0),
        commission_rate: Number(record.commission_rate || 0),
        start_date: record.start_date || null,
        end_date: record.end_date || null
    };
}

function compactTimesheet(record = {}) {
    return {
        id: record.id || null,
        consultant_id: record.consultant_id || null,
        consultant_name: record.consultants?.name || record.consultant_name || null,
        period_start: record.period_start || null,
        period_end: record.period_end || null,
        hours_worked: Number(record.hours_worked || record.hours || 0),
        status: record.status || 'pending',
        invoice_number: record.invoice_number || null
    };
}

function compactTemplate(record = {}) {
    return {
        id: record.id || null,
        name: record.name || null
    };
}

function compactRecord(entityType, record) {
    if (!record) return null;
    if (entityType === 'invoice') return compactInvoice(record);
    if (entityType === 'consultant') return compactConsultant(record);
    if (entityType === 'timesheet') return compactTimesheet(record);
    if (entityType === 'template') return compactTemplate(record);
    return record;
}

export async function logAuditEvent({
    entityType,
    entityId,
    entityKey,
    action,
    summary,
    before,
    after,
    context
} = {}) {
    const user = await getCurrentUser();
    if (!user || !entityType || !action) return null;

    const payload = {
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId || null,
        entity_key: entityKey || null,
        action,
        summary: summary || `${action} ${entityType}`,
        before_data: compactRecord(entityType, before),
        after_data: compactRecord(entityType, after),
        context: context || {}
    };

    const { data, error } = await supabase
        .from('audit_events')
        .insert(payload)
        .select()
        .single();

    if (error) {
        if (error.code === '42P01') {
            console.warn('Audit trail table does not exist yet.');
            return null;
        }
        console.warn('Failed to write audit event:', error.message || error);
        return null;
    }

    return data;
}

export async function getRecentAuditEvents(limit = 8) {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (error.code === '42P01') {
            console.warn('Audit trail table does not exist yet.');
            return [];
        }
        console.warn('Failed to load audit trail:', error.message || error);
        return [];
    }

    return data || [];
}
