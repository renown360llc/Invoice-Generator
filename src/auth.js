import { supabase } from './config.js'

// Sign up new user
export async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName
            }
        }
    })

    if (error) {
        console.error('Signup error:', error.message)
        return { data: null, error }
    }

    return { data, error: null }
}

// Sign in existing user
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    })

    if (error) {
        console.error('Login error:', error.message)
        return { data: null, error }
    }

    return { data, error: null }
}

// Sign in with Google
export async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/dashboard.html'
        }
    })

    return { data, error }
}

// Sign out
export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) {
        console.error('Signout error:', error.message)
    }
    window.location.href = '/index.html'
}

// Get current user
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

// Listen to auth state changes
export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session)
    })
}

// Check if user is logged in
export async function isLoggedIn() {
    const user = await getCurrentUser()
    return user !== null
}

// Auth Guard: Redirects to login if not authenticated
export async function requireAuth() {
    const user = await getCurrentUser();
    if (!user) {
        // specific check to avoid redirect loop if already on login page (though this function shouldn't be called there)
        if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('index.html')) {
            window.location.href = 'login.html';
        }
        return null;
    }
    return user;
}
