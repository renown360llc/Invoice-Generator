import { createClient } from '@supabase/supabase-js'

// Read from environment variables (Vite automatically loads from .env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate that keys are present
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env file')
    throw new Error('Supabase configuration error. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper to get current user
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}
