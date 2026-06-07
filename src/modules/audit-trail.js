import { supabase, getCurrentUser } from '../config.js';

function isMissingAuditTableError(error = {}) {
    const code = error.code || '';
    const message = String(error.message || '').toLowerCase();
    return code === '42P01' || code === 'PGRST205' || message.includes('does not exist');
}

function reportAuditError(operation, error, details = {}) {
    console.error(`[audit-trail] ${operation} failed`, {
        message: error?.message || String(error),
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
        ...details
    });
}

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

function compactClient(record = {}) {
    return {
        id: record.id || null,
        name: record.name || null,
        company: record.company || null,
        email: record.email || null,
        phone: record.phone || null,
        status: record.status || 'active'
    };
}

function compactCompany(record = {}) {
    return {
        id: record.id || null,
        name: record.name || null,
        email: record.email || null,
        phone: record.phone || null,
        currency: record.currency || null,
        status: record.status || 'active'
    };
}

function compactRecord(entityType, record) {
    if (!record) return null;
    if (entityType === 'invoice') return compactInvoice(record);
    if (entityType === 'consultant') return compactConsultant(record);
    if (entityType === 'timesheet') return compactTimesheet(record);
    if (entityType === 'template') return compactTemplate(record);
    if (entityType === 'client') return compactClient(record);
    if (entityType === 'company') return compactCompany(record);
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
        if (isMissingAuditTableError(error)) {
            console.warn('Audit trail table does not exist yet.');
            return null;
        }
        reportAuditError('write audit event', error, {
            entityType,
            entityId,
            entityKey,
            action
        });
        return null;
    }

    return data;
}

export async function getAuditEvents({ limit = 50, offset = 0, entityType = null } = {}) {
    const user = await getCurrentUser();
    if (!user) return [];

    let query = supabase
        .from('audit_events')
        .select('*')
        .eq('user_id', user.id);

    if (entityType && entityType !== 'all') {
        query = query.eq('entity_type', entityType);
    }

    const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        if (isMissingAuditTableError(error)) {
            console.warn('Audit trail table does not exist yet.');
            return [];
        }
        reportAuditError('load audit events', error, { limit, offset, entityType });
        return [];
    }

    return data || [];
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
        if (isMissingAuditTableError(error)) {
            console.warn('Audit trail table does not exist yet.');
            return [];
        }
        reportAuditError('load recent audit events', error, { limit });
        return [];
    }

    return data || [];
}
