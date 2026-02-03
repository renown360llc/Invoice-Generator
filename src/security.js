/**
 * SECURITY MODULE
 * Implements anti-tamper measures for production.
 * - Disables context menu (Right-Click)
 * - Intercepts DevTools shortcuts (F12, Cmd+Opt+I, etc.)
 * - Clears console and warnings
 */

// Disable Right Click
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
}, false);

// Disable Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') {
        e.preventDefault();
        return false;
    }

    // Ctrl+Shift+I (Windows) or Cmd+Opt+I (Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'i') {
        e.preventDefault();
        return false;
    }

    // Ctrl+Shift+J (Windows) or Cmd+Opt+J (Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'j') {
        e.preventDefault();
        return false;
    }

    // Ctrl+U (View Source)
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        return false;
    }
});

// Console Hardening
const warningTitle = 'STOP!';
const warningMsg = 'This is a browser feature intended for developers. If someone told you to copy-paste something here to enable a feature or "hack" someone\'s account, it is a scam and will give them access to your account.';

if (window.console && console.log) {
    // Clear initial output
    console.clear();

    // Print warning
    console.log(`%c${warningTitle}`, 'color: red; font-size: 60px; font-weight: bold; text-shadow: 2px 2px 0px black;');
    console.log(`%c${warningMsg}`, 'font-size: 18px; color: #444;');
}

// Optional: DevTools detection (basic)
// Refreshes page if window size changes drastically (suggesting devtools open), 
// but this can technically annoy users resizing windows, so kept disabled for now.
