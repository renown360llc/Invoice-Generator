import { supabase, getCurrentUser } from '../config.js';

export async function dbUpsertTimesheets(entries = []) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    if (!Array.isArray(entries) || entries.length === 0) return [];

    const payload = entries.map(entry => ({
        user_id: user.id,
        consultant_id: entry.consultant_id,
        invoice_id: entry.invoice_id || null,
        invoice_number: entry.invoice_number || null,
        period_start: entry.period_start,
        period_end: entry.period_end,
        hours_worked: entry.hours_worked,
        status: entry.status || 'pending'
    }));

    const { data, error } = await supabase
        .from('timesheets')
        .upsert(payload, { onConflict: 'user_id,consultant_id,period_start,period_end' })
        .select();

    if (error) throw error;
    return data || [];
}

export async function dbUpdateTimesheet(id, updates = {}) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    if (!id) throw new Error('Missing timesheet id');

    const allowed = {};
    if ('hours_worked' in updates && typeof updates.hours_worked === 'number') {
        allowed.hours_worked = updates.hours_worked;
    }
    if ('status' in updates) {
        allowed.status = updates.status || 'pending';
    }
    if ('period_start' in updates) {
        allowed.period_start = updates.period_start;
    }
    if ('period_end' in updates) {
        allowed.period_end = updates.period_end;
    }
    if ('invoice_number' in updates) {
        allowed.invoice_number = updates.invoice_number || null;
    }
    if ('invoice_id' in updates) {
        allowed.invoice_id = updates.invoice_id || null;
    }

    const { data, error } = await supabase
        .from('timesheets')
        .update(allowed)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function dbDeleteTimesheet(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    if (!id) throw new Error('Missing timesheet id');

    const { error } = await supabase
        .from('timesheets')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;
    return true;
}

export async function dbGetTimesheetsForYear(year) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const baseQuery = () => supabase
        .from('timesheets')
        .select(`
            id,
            consultant_id,
            invoice_id,
            invoice_number,
            period_start,
            period_end,
            hours_worked,
            status,
            consultants (
                id,
                name,
                client,
                w2_company,
                bill_rate,
                currency
            )
        `)
        .eq('user_id', user.id)
        .gte('period_start', start)
        .lte('period_start', end)
        .order('period_start', { ascending: true });

    const { data, error } = await baseQuery();

    if (error) {
        if (error.code === '42P01') {
            console.warn('Timesheets table does not exist yet.');
            return [];
        }
        if (error.code === '42703') {
            // Backward compatibility: older schema may not have status column yet.
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('timesheets')
                .select(`
                    id,
                    consultant_id,
                    invoice_id,
                    invoice_number,
                    period_start,
                    period_end,
                    hours_worked,
                    consultants (
                        id,
                        name,
                        client,
                        w2_company,
                        bill_rate,
                        currency
                    )
                `)
                .eq('user_id', user.id)
                .gte('period_start', start)
                .lte('period_start', end)
                .order('period_start', { ascending: true });

            if (fallbackError) throw fallbackError;
            return (fallbackData || []).map(row => ({
                ...row,
                status: row.invoice_number ? 'invoiced' : 'pending'
            }));
        }
        throw error;
    }

    return data || [];
}

export async function dbGetPendingTimesheetsForRange(periodStart, periodEnd) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    if (!periodStart || !periodEnd) throw new Error('Missing period range');

    const { data, error } = await supabase
        .from('timesheets')
        .select(`
            id,
            consultant_id,
            period_start,
            period_end,
            hours_worked,
            status,
            invoice_id,
            invoice_number,
            consultants (
                id,
                name,
                client,
                w2_company,
                bill_rate,
                currency
            )
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .is('invoice_id', null)
        .lte('period_start', periodEnd)
        .gte('period_end', periodStart)
        .gt('hours_worked', 0)
        .order('period_start', { ascending: true });

    if (error) {
        if (error.code === '42P01') {
            console.warn('Timesheets table does not exist yet.');
            return [];
        }
        if (error.code === '42703') {
            // Fallback for older schema without status column.
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('timesheets')
                .select(`
                    id,
                    consultant_id,
                    period_start,
                    period_end,
                    hours_worked,
                    invoice_id,
                    invoice_number,
                    consultants (
                        id,
                        name,
                        client,
                        w2_company,
                        bill_rate,
                        currency
                    )
                `)
                .eq('user_id', user.id)
                .is('invoice_id', null)
                .lte('period_start', periodEnd)
                .gte('period_end', periodStart)
                .gt('hours_worked', 0)
                .order('period_start', { ascending: true });

            if (fallbackError) throw fallbackError;
            return (fallbackData || []).map(row => ({
                ...row,
                status: 'pending'
            }));
        }
        throw error;
    }

    return data || [];
}

export async function dbLinkTimesheetsToInvoice(timesheetIds = [], { invoice_id, invoice_number } = {}) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    if (!Array.isArray(timesheetIds) || timesheetIds.length === 0) return [];

    const { data, error } = await supabase
        .from('timesheets')
        .update({
            invoice_id: invoice_id || null,
            invoice_number: invoice_number || null,
            status: invoice_id || invoice_number ? 'invoiced' : 'pending'
        })
        .eq('user_id', user.id)
        .in('id', timesheetIds)
        .select();

    if (error) throw error;
    return data || [];
}

export async function dbGetLinkedTimesheetIds(invoice_id, invoice_number) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const ids = new Set();

    if (invoice_id) {
        const { data, error } = await supabase
            .from('timesheets')
            .select('id')
            .eq('user_id', user.id)
            .eq('invoice_id', invoice_id);
        if (error) throw error;
        (data || []).forEach(row => ids.add(row.id));
    }

    if (invoice_number) {
        const { data, error } = await supabase
            .from('timesheets')
            .select('id')
            .eq('user_id', user.id)
            .eq('invoice_number', invoice_number);
        if (error) throw error;
        (data || []).forEach(row => ids.add(row.id));
    }

    return Array.from(ids);
}
