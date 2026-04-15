import { supabase } from './config.js'
import { getCurrentUser } from './auth.js'
import { logAuditEvent } from './modules/audit-trail.js'

// ============================================================================
// TEMPLATES
// ============================================================================

export async function saveTemplate(templateData) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    let beforeRecord = null
    if (templateData.id) {
        const { data: existing } = await supabase
            .from('templates')
            .select('*')
            .eq('id', templateData.id)
            .eq('user_id', user.id)
            .single()
        beforeRecord = existing || null
    }

    const { data, error } = await supabase
        .from('templates')
        .insert({
            user_id: user.id,
            name: templateData.name,
            business_info: templateData.business,
            client_info: templateData.client,
            settings: {
                ...templateData.settings,
                payment_instructions: templateData.payment_instructions
            }
        })
        .select()
        .single()

    if (error) {
        console.error('Save template error:', error)
        throw error
    }

    await logAuditEvent({
        entityType: 'template',
        entityId: data?.id,
        entityKey: data?.name,
        action: 'created',
        summary: `Created template ${data?.name || templateData.name || ''}`.trim(),
        before: beforeRecord,
        after: data
    })

    return data
}

export async function updateTemplate(templateId, templateData) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data: beforeRecord } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .eq('user_id', user.id)
        .single()

    const { data, error } = await supabase
        .from('templates')
        .update({
            name: templateData.name,
            business_info: templateData.business,
            client_info: templateData.client,
            settings: {
                ...templateData.settings,
                payment_instructions: templateData.payment_instructions
            }
        })
        .eq('id', templateId)
        .eq('user_id', user.id)
        .select()
        .single()

    if (error) {
        console.error('Update template error:', error)
        throw error
    }

    await logAuditEvent({
        entityType: 'template',
        entityId: data?.id || templateId,
        entityKey: data?.name || templateData.name,
        action: 'updated',
        summary: `Updated template ${data?.name || templateData.name || ''}`.trim(),
        before: beforeRecord,
        after: data
    })

    return data
}

export async function getTemplates() {
    const user = await getCurrentUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Get templates error:', error)
        return []
    }

    return data || []
}

export async function deleteTemplate(templateId) {
    const user = await getCurrentUser()
    const { data: existing } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .eq('user_id', user?.id || '')
        .single()

    if (!user) throw new Error('Not authenticated')
    if (!existing) throw new Error('Template not found or access denied')

    const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', templateId)
        .eq('user_id', user.id)

    if (error) {
        console.error('Delete template error:', error)
        throw error
    }

    await logAuditEvent({
        entityType: 'template',
        entityId: existing?.id || templateId,
        entityKey: existing?.name || null,
        action: 'deleted',
        summary: `Deleted template ${existing?.name || ''}`.trim(),
        before: existing || { id: templateId }
    })
}

// ============================================================================
// INVOICES
// ============================================================================

export async function saveInvoice(invoiceData) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data: beforeRecord } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .eq('invoice_number', invoiceData.invoice_number)
        .maybeSingle()

    const { data, error } = await supabase
        .from('invoices')
        .upsert({
            user_id: user.id,
            invoice_number: invoiceData.invoice_number,
            business_info: invoiceData.business_info,
            client_info: invoiceData.client_info,
            invoice_meta: invoiceData.invoice_meta,
            settings: invoiceData.settings,
            items: invoiceData.items,
            notes: invoiceData.notes,
            payment_instructions: invoiceData.payment_instructions,
            totals: invoiceData.totals,
            status: invoiceData.status || 'draft',
            paid_date: invoiceData.paid_date || null
        }, {
            onConflict: 'user_id,invoice_number'
        })
        .select()
        .single()

    if (error) {
        console.error('Save invoice error:', error)
        throw error
    }

    await logAuditEvent({
        entityType: 'invoice',
        entityId: data?.id,
        entityKey: data?.invoice_number || invoiceData.invoice_number,
        action: beforeRecord ? 'updated' : 'created',
        summary: `${beforeRecord ? 'Updated' : 'Created'} invoice ${data?.invoice_number || invoiceData.invoice_number}`.trim(),
        before: beforeRecord,
        after: data
    })

    return data
}

/**
 * Update only the status and optionally the paid_date of an invoice.
 * Used for quick actions on the invoices list (Mark as Paid, Mark as Sent).
 */
export async function updateInvoiceStatus(invoiceId, status, paidDate = null, usdAmount = null) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data: beforeRecord } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .single()

    const updatePayload = { status }
    
    // Manage paid_date based on status
    if (paidDate) {
        updatePayload.paid_date = paidDate
    } else if (status !== 'paid') {
        updatePayload.paid_date = null
    }

    // Handle JSONB totals enrichment (payments preservation)
    const totals = { ...(beforeRecord?.totals || {}) }
    
    // Legacy USD amount handling (if marking as paid directly)
    if (usdAmount !== null && usdAmount !== undefined && status === 'paid') {
        totals.usd_received_amount = Number(usdAmount)
    } else if (status !== 'paid' && totals.usd_received_amount) {
        delete totals.usd_received_amount
    }

    // If manually marking as paid, ensure balance is synced
    if (status === 'paid' && (!totals.payments || totals.payments.length === 0)) {
        const totalAmount = Number(totals.total) || 0
        totals.amount_paid = totalAmount
        totals.balance_due = 0
        totals.payments = [{
            id: 'legacy-' + Date.now(),
            date: paidDate || new Date().toISOString().split('T')[0],
            amount: totalAmount,
            usdAmount: usdAmount ? Number(usdAmount) : null,
            note: 'Marked as paid'
        }]
    }

    updatePayload.totals = totals

    const { data, error } = await supabase
        .from('invoices')
        .update(updatePayload)
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .select()
        .single()

    if (error) {
        console.error('Update invoice status error:', error)
        throw error
    }

    await logAuditEvent({
        entityType: 'invoice',
        entityId: data?.id || invoiceId,
        entityKey: data?.invoice_number || beforeRecord?.invoice_number || null,
        action: 'status_changed',
        summary: `Invoice ${data?.invoice_number || beforeRecord?.invoice_number || ''} marked ${status}`.trim(),
        before: beforeRecord,
        after: data,
        context: {
            status,
            paid_date: paidDate || null
        }
    })

    return data
}

/**
 * Records a new payment installment for an invoice
 */
export async function recordInvoicePayment(invoiceId, paymentData) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .single()

    if (!invoice) throw new Error('Invoice not found')

    const totals = { ...(invoice.totals || {}) }
    let payments = [...(totals.payments || [])]
    const existingIndex = paymentData.id ? payments.findIndex(p => p.id === paymentData.id) : -1

    const paymentRecord = {
        id: paymentData.id || Math.random().toString(36).substring(2, 11),
        date: paymentData.date || new Date().toISOString().split('T')[0],
        amount: Number(paymentData.amount) || 0,
        usdAmount: paymentData.usdAmount ? Number(paymentData.usdAmount) : null,
        note: (paymentData.note || '').trim()
    }

    if (existingIndex > -1) {
        payments[existingIndex] = paymentRecord
    } else {
        payments.push(paymentRecord)
    }

    // Recalculate balances
    const totalAmount = Number(totals.total) || 0
    const amountPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const usdReceivedTotal = payments.reduce((sum, p) => sum + (Number(p.usdAmount) || 0), 0)

    totals.payments = payments
    totals.amount_paid = amountPaid
    totals.balance_due = Math.max(0, totalAmount - amountPaid)
    totals.usd_received_amount = usdReceivedTotal > 0 ? usdReceivedTotal : null

    // Status Resolution
    let nextStatus = invoice.status
    if (amountPaid >= totalAmount) {
        nextStatus = 'paid'
    } else if (amountPaid > 0) {
        nextStatus = 'partially_paid'
    }

    const updatePayload = {
        totals,
        status: nextStatus,
        paid_date: nextStatus === 'paid' ? (invoice.paid_date || paymentRecord.date) : null
    }

    const { data, error } = await supabase
        .from('invoices')
        .update(updatePayload)
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .select()
        .single()

    if (error) throw error

    await logAuditEvent({
        entityType: 'invoice',
        entityId: invoiceId,
        entityKey: invoice.invoice_number,
        action: 'payment_recorded',
        summary: `Recorded payment of ${paymentRecord.amount} for invoice ${invoice.invoice_number}`,
        after: data,
        context: { payment: paymentRecord }
    })

    return data
}

/**
 * Deletes a payment installment
 */
export async function deleteInvoicePayment(invoiceId, paymentId) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .single()

    if (!invoice) throw new Error('Invoice not found')

    const totals = { ...(invoice.totals || {}) }
    const payments = (totals.payments || []).filter(p => p.id !== paymentId)

    // Recalculate balances
    const totalAmount = Number(totals.total) || 0
    const amountPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const usdReceivedTotal = payments.reduce((sum, p) => sum + (Number(p.usdAmount) || 0), 0)

    totals.payments = payments
    totals.amount_paid = amountPaid
    totals.balance_due = Math.max(0, totalAmount - amountPaid)
    totals.usd_received_amount = usdReceivedTotal > 0 ? usdReceivedTotal : null

    // Status Resolution
    let nextStatus = invoice.status
    if (amountPaid >= totalAmount) {
        nextStatus = 'paid'
    } else if (amountPaid > 0) {
        nextStatus = 'partially_paid'
    } else if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
        nextStatus = 'sent'
    }

    const updatePayload = {
        totals,
        status: nextStatus,
        paid_date: nextStatus === 'paid' ? invoice.paid_date : null
    }

    const { data, error } = await supabase
        .from('invoices')
        .update(updatePayload)
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .select()
        .single()

    if (error) throw error

    await logAuditEvent({
        entityType: 'invoice',
        entityId: invoiceId,
        entityKey: invoice.invoice_number,
        action: 'payment_deleted',
        summary: `Deleted a payment installment for invoice ${invoice.invoice_number}`,
        after: data,
        context: { paymentId }
    })

    return data
}

function normalizeInvoiceQueryOptions(options = {}) {
    const page = Math.max(1, Number(options.page) || 1)
    const pageSize = Math.max(1, Number(options.pageSize) || 20)
    const paginate = options.paginate === true || Number.isFinite(Number(options.page)) || Number.isFinite(Number(options.pageSize))

    return {
        page,
        pageSize,
        paginate,
        sort: String(options.sort || options.filters?.sort || 'date-desc'),
        filters: options.filters || {},
        select: options.select || '*'
    }
}

function applyInvoiceFilters(query, filters = {}) {
    const search = String(filters.search || '').trim()
    if (search) {
        const pattern = `%${search.replace(/[%_]/g, '\\$&')}%`
        query = query.or([
            `client_info->>name.ilike.${pattern}`,
            `invoice_number.ilike.${pattern}`,
            `business_info->>name.ilike.${pattern}`
        ].join(','))
    }

    const consultant = String(filters.consultant || 'all')
    if (consultant && consultant !== 'all') {
        if (consultant.startsWith('id:')) {
            const consultantId = consultant.slice(3)
            if (consultantId) {
                query = query.contains('items', [{ consultant_id: consultantId }])
            }
        } else if (consultant.startsWith('name:')) {
            const consultantName = consultant.slice(5).trim()
            if (consultantName) {
                const pattern = `%${consultantName.replace(/[%_]/g, '\\$&')}%`
                query = query.ilike('items', pattern)
            }
        }
    }

    const status = String(filters.status || 'all')
    if (status !== 'all') {
        query = query.eq('status', status)
    }

    const currency = String(filters.currency || 'all').toUpperCase()
    if (currency !== 'ALL' && currency !== 'ALL CURRENCIES' && currency !== 'all') {
        query = query.eq('invoice_meta->>currency', currency)
    }

    const due = String(filters.due || 'all')
    if (due !== 'all') {
        const today = new Date()
        const todayIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10)
        const plus7 = new Date(today)
        plus7.setDate(plus7.getDate() + 7)
        const plus30 = new Date(today)
        plus30.setDate(plus30.getDate() + 30)
        const plus7Iso = new Date(plus7.getFullYear(), plus7.getMonth(), plus7.getDate()).toISOString().slice(0, 10)
        const plus30Iso = new Date(plus30.getFullYear(), plus30.getMonth(), plus30.getDate()).toISOString().slice(0, 10)

        if (due === 'overdue') {
            query = query.neq('status', 'paid').lt('invoice_meta->>dueDateRaw', todayIso)
        } else if (due === 'next-7') {
            query = query.neq('status', 'paid').gte('invoice_meta->>dueDateRaw', todayIso).lte('invoice_meta->>dueDateRaw', plus7Iso)
        } else if (due === 'next-30') {
            query = query.neq('status', 'paid').gte('invoice_meta->>dueDateRaw', todayIso).lte('invoice_meta->>dueDateRaw', plus30Iso)
        } else if (due === 'no-due') {
            query = query.is('invoice_meta->>dueDateRaw', null)
        }
    }

    const amount = String(filters.amount || 'all')
    if (amount !== 'all') {
        if (amount === 'under-1000') {
            query = query.lt('totals->total', 1000)
        } else if (amount === '1000-5000') {
            query = query.gte('totals->total', 1000).lte('totals->total', 5000)
        } else if (amount === '5000-10000') {
            query = query.gt('totals->total', 5000).lte('totals->total', 10000)
        } else if (amount === 'over-10000') {
            query = query.gt('totals->total', 10000)
        }
    }

    return query
}

function applyInvoiceSort(query, sortBy = 'date-desc') {
    const sort = String(sortBy || 'date-desc')

    if (sort === 'date-desc' || sort === 'date-asc') {
        return query.order('created_at', { ascending: sort === 'date-asc' })
    }

    if (sort === 'amount-desc' || sort === 'amount-asc') {
        return query.order('totals->total', { ascending: sort === 'amount-asc' })
    }

    if (sort === 'client-asc' || sort === 'client-desc') {
        return query.order('client_info->>name', { ascending: sort === 'client-asc' })
    }

    if (sort === 'invoice-asc' || sort === 'invoice-desc') {
        return query.order('invoice_number', { ascending: sort === 'invoice-asc' })
    }

    if (sort === 'company-asc' || sort === 'company-desc') {
        return query.order('business_info->>name', { ascending: sort === 'company-asc' })
    }

    if (sort === 'status-asc' || sort === 'status-desc') {
        return query.order('status', { ascending: sort === 'status-asc' })
    }

    if (sort === 'currency-asc' || sort === 'currency-desc') {
        return query.order('invoice_meta->>currency', { ascending: sort === 'currency-asc' })
    }

    if (sort === 'payment-asc' || sort === 'payment-desc') {
        return query.order('totals->balance_due', { ascending: sort === 'payment-desc' })
    }

    return query.order('created_at', { ascending: false })
}

export async function getInvoices(currentUser = null, options = {}) {
    const user = currentUser || await getCurrentUser()
    if (!user) {
        console.warn('getInvoices: No user found');
        return options && (options.paginate === true || Number.isFinite(Number(options.page)) || Number.isFinite(Number(options.pageSize)))
            ? { data: [], count: 0, page: 1, pageSize: Math.max(1, Number(options.pageSize) || 20), totalPages: 1 }
            : []
    }

    const normalized = normalizeInvoiceQueryOptions(options)
    let query = supabase
        .from('invoices')
        .select(normalized.select, normalized.paginate ? { count: 'exact' } : undefined)
        .eq('user_id', user.id)

    query = applyInvoiceFilters(query, normalized.filters)
    query = applyInvoiceSort(query, normalized.sort)

    if (normalized.paginate) {
        const start = (normalized.page - 1) * normalized.pageSize
        const end = start + normalized.pageSize - 1
        query = query.range(start, end)
    }

    const { data, error, count } = await query

    if (error) {
        console.error('Get invoices error:', error)
        return normalized.paginate
            ? { data: [], count: 0, page: normalized.page, pageSize: normalized.pageSize, totalPages: 1 }
            : []
    }

    const rows = data || []
    if (!normalized.paginate) {
        return rows
    }

    const total = Number(count) || 0
    return {
        data: rows,
        count: total,
        page: normalized.page,
        pageSize: normalized.pageSize,
        totalPages: Math.max(1, Math.ceil(total / normalized.pageSize))
    }
}

export async function getInvoice(invoiceNumber) {
    const user = await getCurrentUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .eq('invoice_number', invoiceNumber)
        .single()

    if (error) {
        console.error('Get invoice error:', error)
        return null
    }

    return data
}

// ============================================================================
// INVOICE COUNTER
// ============================================================================

export async function getNextInvoiceNumber() {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    // Fetch all invoice numbers and their metadata to isolate true sequential ones
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('invoice_number, invoice_meta')
        .eq('user_id', user.id)

    if (error) {
        console.error('Error fetching invoices for sequence generator:', error)
        return 'INV-0001'
    }

    if (!invoices || invoices.length === 0) {
        return 'INV-0001'
    }

    let maxSequential = 0;

    for (const inv of invoices) {
        // Skip explicitly marked custom/manual invoices to protect the sequence
        if (inv.invoice_meta && inv.invoice_meta.is_custom_number === true) {
            continue;
        }

        // Strict parsing for INV-XXXX
        const match = String(inv.invoice_number || '').match(/^INV-(\d+)$/i);
        if (match && match[1]) {
            const currentNum = parseInt(match[1], 10);
            if (currentNum > maxSequential) {
                maxSequential = currentNum;
            }
        }
    }

    const nextNum = maxSequential + 1;
    return `INV-${String(nextNum).padStart(4, '0')}`;
}
