import { supabase } from './config.js'
import { getCurrentUser } from './auth.js'

// ============================================================================
// TEMPLATES
// ============================================================================

export async function saveTemplate(templateData) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
        .from('templates')
        .insert({
            user_id: user.id,
            name: templateData.name,
            business_info: templateData.business,
            client_info: templateData.client,
            settings: templateData.settings
        })
        .select()
        .single()

    if (error) {
        console.error('Save template error:', error)
        throw error
    }

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
    const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', templateId)

    if (error) {
        console.error('Delete template error:', error)
        throw error
    }
}

// ============================================================================
// INVOICES
// ============================================================================

export async function saveInvoice(invoiceData) {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
        .from('invoices')
        .upsert({
            user_id: user.id,
            invoice_number: invoiceData.invoice_number, // Matches gatherFormData
            business_info: invoiceData.business_info,   // Matches gatherFormData
            client_info: invoiceData.client_info,       // Matches gatherFormData
            invoice_meta: invoiceData.invoice_meta,     // Matches gatherFormData
            settings: invoiceData.settings,
            items: invoiceData.items,
            notes: invoiceData.notes,
            payment_instructions: invoiceData.payment_instructions, // Matches gatherFormData
            totals: invoiceData.totals // gatherFormData puts structure in 'totals' prop, can save directly or map
        }, {
            onConflict: 'user_id,invoice_number'
        })
        .select()
        .single()

    if (error) {
        console.error('Save invoice error:', error)
        throw error
    }

    return data
}

export async function getInvoices(currentUser = null) {
    const user = currentUser || await getCurrentUser()
    if (!user) {
        console.warn('getInvoices: No user found');
        return []
    }

    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Get invoices error:', error)
        return []
    }

    return data || []
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

    // Get the last created invoice for this user
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) {
        console.error('Error fetching last invoice:', error)
        return 'INV-0001' // Fallback
    }

    if (!invoices || invoices.length === 0) {
        return 'INV-0001'
    }

    const lastNumber = invoices[0].invoice_number
    // Extract number part (assuming INV-XXXX format)
    const match = lastNumber.match(/INV-(\d+)/)

    if (match && match[1]) {
        const currentNum = parseInt(match[1], 10)
        const nextNum = currentNum + 1
        return `INV-${String(nextNum).padStart(4, '0')}`
    }

    // Fallback if format is weird
    return 'INV-0001'
}
