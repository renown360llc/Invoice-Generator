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

const USER_CACHE_TTL_MS = 60 * 1000
let cachedUser
let cacheTimestamp = 0
let inflightUserPromise = null

function setCachedUser(user) {
    cachedUser = user || null
    cacheTimestamp = Date.now()
}

export function invalidateCurrentUserCache() {
    cachedUser = undefined
    cacheTimestamp = 0
    inflightUserPromise = null
}

supabase.auth.onAuthStateChange((_event, session) => {
    setCachedUser(session?.user || null)
})

// Helper to get current user
export async function getCurrentUser(options = {}) {
    const force = Boolean(options.force)
    const isCacheValid = !force
        && cachedUser !== undefined
        && (Date.now() - cacheTimestamp) < USER_CACHE_TTL_MS

    if (isCacheValid) {
        return cachedUser
    }

    if (inflightUserPromise && !force) {
        return inflightUserPromise
    }

    inflightUserPromise = (async () => {
        // Prefer session lookup first for fast local reads.
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            setCachedUser(session.user)
            return cachedUser
        }

        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) {
            console.warn('getCurrentUser fallback failed:', error.message)
            setCachedUser(null)
            return null
        }

        setCachedUser(user || null)
        return cachedUser
    })().finally(() => {
        inflightUserPromise = null
    })

    return inflightUserPromise
}
