import { createClient } from '@supabase/supabase-js'

// Read from environment variables (Vite automatically loads from .env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate that keys are present and not placeholders
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-id')) {
    console.error('Missing or invalid Supabase credentials')
    // Alert in production for debugging
    if (import.meta.env.PROD) {
        alert('CRITICAL PROD CONFIG ERROR:\n\nIt looks like VITE_SUPABASE_URL is set to a placeholder ("your-project-id").\n\nPlease go to your Vercel Settings > Environment Variables used for the build, and start with the correct URL from Supabase.')
    }
    throw new Error('Supabase configuration error: Invalid URL or Key.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper to get current user
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}
