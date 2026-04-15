/**
 * SECURITY MODULE
 * Kept intentionally harmless.
 *
 * This module is still imported by the app entrypoints, but it no longer
 * blocks browser features, clears the console, or interferes with DevTools.
 * Actual protection should come from auth, RLS, escaping, and CSP.
 */

if (typeof window !== 'undefined' && window.console && typeof window.console.info === 'function') {
    console.info('Security helpers loaded.');
}
