/**
 * Invoice Generator Pro - Application Orchestrator
 * Coordinates modules: Auth, Database, UI, PDF.
 */

import { getCurrentUser, signOut } from './auth.js';
import {
    saveInvoice as dbSaveInvoice,
    getInvoice as dbGetInvoice,
    getNextInvoiceNumber,
    saveTemplate as dbSaveTemplate,
    getTemplates as dbGetTemplates
} from './database.js';
import { dbGetConsultants } from './modules/db-consultants.js';
import {
    dbUpsertTimesheets,
    dbGetPendingTimesheetsForRange,
    dbLinkTimesheetsToInvoice,
    dbGetLinkedTimesheetIds
} from './modules/db-timesheets.js';
import {
    gatherFormData,
    updatePreview,
    addItem,
    fillFormWithData,
    handleLogoUpload,
    calculateTotals
} from './modules/ui.js';
import { generatePDF } from './modules/pdf.js';
import { getAccessContext, getReadOnlyMessage } from './modules/access-control.js';
import { showToast, debounce } from './modules/utils.js';

const state = {
    user: null,
    logo: null,
    subtotal: 0,
    total: 0,
    currentTemplateName: null,
    isReadOnlyUser: false,
    isLocked: false,       // true when invoice is paid/sent — form is read-only
    isDirty: false,        // true when there are unsaved changes
    currentStatus: null,   // track the live invoice status
    suggestedInvoiceNumber: '',
    isCustomInvoiceNumber: false
};

// ── Invoice Lock & Dirty Helpers ────────────────────────────────────────────
function setLocked(locked, status = 'paid') {
    const viewerLocked = state.isReadOnlyUser;
    state.isLocked = locked || viewerLocked;
    state.currentStatus = status;

    const statusBar = document.getElementById('editorStatusBar');
    const statusText = document.getElementById('editorStatusText');
    const modePill = document.getElementById('editorModePill');
    const unlockBtn = document.getElementById('invoiceUnlockBtn');
    const unsavedBadge = document.getElementById('unsavedBadge');
    const saveBtn = document.getElementById('saveBtn');
    const form = document.getElementById('invoiceForm');
    const title = document.getElementById('editorTitle');
    const subtitle = document.getElementById('editorSubtitle');
    const previewTitle = document.querySelector('.preview__title');
    const previewSubtitle = document.getElementById('previewSubtitle');

    if (state.isLocked) {
        const label = viewerLocked ? 'viewer' : (status === 'sent' ? 'sent' : 'paid');
        if (statusBar) statusBar.style.display = 'flex';
        if (modePill) {
            modePill.textContent = viewerLocked ? 'Viewer' : (label === 'sent' ? 'Read Only' : 'Paid');
            modePill.className = `editor-statusbar__pill ${viewerLocked ? 'editor-statusbar__pill--neutral' : (label === 'sent' ? 'editor-statusbar__pill--neutral' : 'editor-statusbar__pill--warning')}`;
        }
        if (statusText) {
            statusText.textContent = viewerLocked
                ? getReadOnlyMessage('invoice editing')
                : `This invoice is ${label}. Editing is locked to protect the billing record.`;
        }
        if (unlockBtn) unlockBtn.style.display = viewerLocked ? 'none' : '';
        if (unsavedBadge) unsavedBadge.style.display = 'none';
        if (saveBtn) { saveBtn.disabled = true; saveBtn.title = viewerLocked ? getReadOnlyMessage('saving invoices') : 'Unlock the invoice to save changes'; }
        if (title) title.textContent = viewerLocked ? 'Read-Only Invoice' : 'View Invoice';
        if (subtitle) subtitle.textContent = viewerLocked
            ? 'You can review this invoice, download it, and email it, but editing is disabled for your account.'
            : 'Review invoice details and unlock only if you need to make a correction.';
        if (previewTitle) previewTitle.textContent = 'Invoice Preview';
        if (previewSubtitle) previewSubtitle.textContent = viewerLocked
            ? 'Read-only access is active for this account.'
            : 'Read-only mode is on to protect the current billing record.';
        // Disable all form inputs
        if (form) {
            form.querySelectorAll('input, select, textarea, button').forEach(el => {
                if (el.id === 'saveBtn' || el.id === 'invoiceUnlockBtn') return;
                el.disabled = true;
                el.style.opacity = '0.6';
                el.style.cursor = 'not-allowed';
            });
        }
    } else {
        if (modePill) {
            modePill.textContent = state.currentInvoiceNumber ? 'Editable' : 'Draft';
            modePill.className = 'editor-statusbar__pill editor-statusbar__pill--success';
        }
        if (statusText) {
            statusText.textContent = state.currentInvoiceNumber
                ? 'You can edit invoice details and save changes.'
                : 'Build, review, and save invoices before sending them out.';
        }
        if (statusBar) statusBar.style.display = state.isDirty || state.currentInvoiceNumber ? 'flex' : 'none';
        if (unlockBtn) unlockBtn.style.display = 'none';
        if (unsavedBadge) unsavedBadge.style.display = state.isDirty ? 'inline-flex' : 'none';
        if (saveBtn) { saveBtn.disabled = false; saveBtn.title = ''; }
        if (title) title.textContent = state.currentInvoiceNumber ? 'View/Edit Invoice' : 'Create Invoice';
        if (subtitle) {
            subtitle.textContent = state.currentInvoiceNumber
                ? 'Update line items, client details, and payment settings in one place.'
                : 'Build, review, and save invoices before sending them out.';
        }
        if (previewTitle) previewTitle.textContent = 'Live Preview';
        if (previewSubtitle) {
            previewSubtitle.textContent = state.currentInvoiceNumber
                ? 'Preview updates instantly while you edit the invoice.'
                : 'Add invoice details on the left and review the final output here.';
        }
        // Re-enable all form inputs
        if (form) {
            form.querySelectorAll('input, select, textarea, button').forEach(el => {
                el.disabled = false;
                el.style.opacity = '';
                el.style.cursor = '';
            });
        }
        // Keep invoice number locked
        const invNumEl = document.getElementById('invoiceNumber');
        if (invNumEl && state.currentInvoiceNumber) {
            invNumEl.readOnly = true;
            invNumEl.style.opacity = '0.6';
            invNumEl.style.cursor = 'not-allowed';
        }
    }
}

function applyReadOnlyAccess() {
    if (!state.isReadOnlyUser) return;

    const banner = document.getElementById('viewerReadOnlyBanner') || document.createElement('div');
    if (!banner.id) {
        banner.id = 'viewerReadOnlyBanner';
        banner.style.cssText = 'display:flex;align-items:flex-start;gap:0.75rem;padding:0.9rem 1rem;margin:0 0 1rem;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:12px;';

        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:1.1rem;line-height:1;';
        icon.textContent = '🔒';

        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'display:flex;flex-direction:column;gap:0.2rem;min-width:0;';

        const heading = document.createElement('strong');
        heading.textContent = 'Read-only access';

        const message = document.createElement('span');
        message.textContent = getReadOnlyMessage('invoice editing');

        textWrap.append(heading, message);
        banner.append(icon, textWrap);
    }

    const anchor = document.querySelector('.editor__header');
    if (anchor && !banner.isConnected) {
        anchor.insertAdjacentElement('afterend', banner);
    }

    const disableIds = [
        'newBtn',
        'saveBtn',
        'invoiceUnlockBtn',
        'saveTemplateBtn',
        'updateTemplateBtn',
        'pullTimesheetsBtn',
        'loadTimesheetsBtn',
        'generateTimesheetBtn',
        'addItemBtn'
    ];

    disableIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = true;
        el.title = getReadOnlyMessage('editing invoices');
        el.setAttribute('aria-disabled', 'true');
    });

    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.disabled = true;
        templateSelect.title = getReadOnlyMessage('loading templates');
    }

    const form = document.getElementById('invoiceForm');
    if (form) {
        form.querySelectorAll('input, select, textarea').forEach((el) => {
            el.disabled = true;
        });
    }
}

function blockReadOnlyAction(feature = 'this action') {
    if (!state.isReadOnlyUser) return false;
    showToast(getReadOnlyMessage(feature), 'info');
    return true;
}

function setDirty(dirty) {
    state.isDirty = dirty;
    const statusBar = document.getElementById('editorStatusBar');
    const unsavedBadge = document.getElementById('unsavedBadge');
    const statusText = document.getElementById('editorStatusText');

    if (unsavedBadge) {
        unsavedBadge.style.display = dirty && !state.isLocked ? 'inline-flex' : 'none';
    }

    if (statusBar) {
        statusBar.style.display = (state.isLocked || dirty || state.currentInvoiceNumber) ? 'flex' : 'none';
    }

    if (!state.isLocked && statusText) {
        statusText.textContent = dirty
            ? 'You have unsaved changes. Save when you are ready.'
            : (state.currentInvoiceNumber
                ? 'You can edit invoice details and save changes.'
                : 'Build, review, and save invoices before sending them out.');
    }
}

function showModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; }
}

function hideModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; }
}

function bindModalDismiss(id) {
    const modal = document.getElementById(id);
    if (!modal || modal.dataset.dismissBound === 'true') return;

    modal.dataset.dismissBound = 'true';
    modal.addEventListener('click', (event) => {
        if (event.target === modal) hideModal(id);
    });
}

function showFatalInitError(title, message, reloadLabel = 'Reload page') {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff8f8;z-index:9999;flex-direction:column;gap:0.75rem;font-family:system-ui;padding:1.5rem;text-align:center;';

    const icon = document.createElement('span');
    icon.style.fontSize = '2.5rem';
    icon.textContent = '⚠️';

    const heading = document.createElement('h2');
    heading.style.cssText = 'margin:0;color:#dc2626;font-size:1.25rem;';
    heading.textContent = title;

    const paragraph = document.createElement('p');
    paragraph.style.cssText = 'margin:0;color:#6b7280;font-size:0.875rem;max-width:32rem;';
    paragraph.textContent = message || 'Unknown error';

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = 'padding:0.5rem 1.25rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;';
    button.textContent = reloadLabel;
    button.addEventListener('click', () => location.reload());

    overlay.append(icon, heading, paragraph, button);
    document.body.appendChild(overlay);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
        console.error('Fatal init error:', err);
        showFatalInitError('Something went wrong loading the invoice editor', err.message || 'Unknown error');
    });
});

async function init() {
    if (window.appInitialized) return;
    window.appInitialized = true;

    state.user = await checkAuth();
    if (!state.user) return;
    const access = await getAccessContext(state.user).catch(() => ({
        role: 'viewer',
        isReadOnly: true,
        profile: null
    }));
    state.isReadOnlyUser = Boolean(access?.isReadOnly);

    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const invoiceNumber = urlParams.get('invoice_number') || urlParams.get('invoice'); // Support both for now
    const action = urlParams.get('action');
    // consultant_id: when arriving from timesheets page "Invoice Xh Pending" button,
    // this pre-filters the timesheet picker to only that consultant's pending hours.
    const prefillConsultantId = urlParams.get('consultant_id') || '';

    if (invoiceNumber) {
        // Set mode to update (store ID if possible, but number is key)
        state.currentInvoiceNumber = invoiceNumber;

        await handleLoadInvoice(invoiceNumber);

        if (action === 'download') {
            showToast('Preparing download...', 'info');
            setTimeout(() => {
                const data = gatherFormData();
                if (state.logo) data.business_info.logo = state.logo;
                generatePDF(data);
            }, 1000);
        } else if (action === 'email') {
            showToast('Opening email client...', 'info');
            setTimeout(() => {
                const data = gatherFormData();
                const subject = `Invoice ${data.invoice_number} from ${data.business_info.name}`;
                const body = `Hi ${data.client_info.name},\n\nPlease find attached invoice ${data.invoice_number} for ${data.totals.totalDisplay}.\n\nThank you,\n${data.business_info.name}`;
                const mailto = `mailto:${data.client_info.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.location.href = mailto;
            }, 1000);
        }
    } else {
        const templateUseId = urlParams.get('template_use')
        if (templateUseId) {
            await handleLoadTemplate(templateUseId)
            showToast('Template applied ✓', 'success')
        }
        setDefaultDates();
        await initializeInvoiceNumber();
        document.getElementById('notes').value = 'Thank you for your business!'; // Set default note
        addItem(); // UI module

        // ── Auto-restore logo from most recent invoice ──────────────────
        try {
            const { getInvoices } = await import('./database.js');
            const recentInvoices = await getInvoices(state.user);
            const lastWithLogo = recentInvoices.find(inv => inv.business_info?.logo);
            if (lastWithLogo?.business_info?.logo) {
                state.logo = lastWithLogo.business_info.logo;
                showToast('Logo auto-loaded from your last invoice ✓', 'info');
            }
        } catch (_) { /* non-fatal — logo is optional */ }
        // ── End auto-restore ─────────────────────────────────────────────

        // ── Supplemental billing: auto-open timesheet picker for a specific consultant ──
        // Arriving via timesheets page "Invoice Xh Pending" button sets consultant_id param.
        if (prefillConsultantId) {
            state.prefillConsultantId = prefillConsultantId;
            await openTimesheetModal();
        }

        updatePreview(state);
    }

    bindEventListeners();
    await updateTemplateDropdown();
    applyReadOnlyAccess();
    if (state.isReadOnlyUser && !state.currentInvoiceNumber) {
        setLocked(false, 'draft');
    }

    // Show/hide paid date field based on status
    const statusSelect = document.getElementById('invoiceStatus')
    const paidDateField = document.getElementById('paidDateField')
    if (statusSelect && paidDateField) {
        const togglePaidDate = () => {
            paidDateField.style.display = statusSelect.value === 'paid' ? '' : 'none'
        }
        statusSelect.addEventListener('change', togglePaidDate)
        togglePaidDate() // run on load too
    }
}

async function checkAuth() {
    const user = await getCurrentUser();
    if (!user) {
        const path = window.location.pathname;
        // Don't redirect if already on login (though this script is for app)
        if (!path.includes('login.html')) {
            window.location.href = '/login.html';
        }
        return null;
    }
    return user;
}

function bindEventListeners() {
    // ── Dirty tracking: mark form dirty on any user input ──────────────
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('input', debounce(() => {
            if (!state.isLocked) setDirty(true);
            updatePreview(state);
        }, 100));
    });

    document.body.addEventListener('change', (e) => {
        if (e.target.matches('input, select, textarea')) {
            if (!state.isLocked) setDirty(true);
            updatePreview(state);
        }
    });

    // ── Warn before leaving with unsaved changes ────────────────────────
    window.addEventListener('beforeunload', (e) => {
        if (state.isDirty && !state.isLocked) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Buttons
    document.getElementById('addItemBtn').addEventListener('click', () => {
        if (blockReadOnlyAction('adding line items')) return;
        addItem();
        updatePreview(state);
    });

    // Timesheet Logic
    document.getElementById('pullTimesheetsBtn')?.addEventListener('click', openTimesheetModal);
    document.getElementById('closeTimesheetBtn')?.addEventListener('click', closeTimesheetModal);
    document.getElementById('cancelTimesheetBtn')?.addEventListener('click', closeTimesheetModal);
    document.getElementById('loadTimesheetsBtn')?.addEventListener('click', loadPendingTimesheetsIntoModal);
    document.getElementById('generateTimesheetBtn')?.addEventListener('click', generateTimesheetItems);
    
    // Date bounds logic
    const invDate = document.getElementById('invoiceDate');
    const dueDate = document.getElementById('dueDate');
    invDate?.addEventListener('change', (e) => {
        if (invDate.value && dueDate) dueDate.min = invDate.value;
        else if (dueDate) dueDate.removeAttribute('min');
    });
    dueDate?.addEventListener('change', (e) => {
        if (dueDate.value && invDate) invDate.max = dueDate.value;
        else if (invDate) invDate.removeAttribute('max');
    });

    const tsStart = document.getElementById('tsPeriodStart');
    const tsEnd = document.getElementById('tsPeriodEnd');
    tsStart?.addEventListener('change', (e) => {
        markTimesheetRangeDirty();
        if (tsStart.value && tsEnd) tsEnd.min = tsStart.value;
        else if (tsEnd) tsEnd.removeAttribute('min');
    });
    tsEnd?.addEventListener('change', (e) => {
        markTimesheetRangeDirty();
        if (tsEnd.value && tsStart) tsStart.max = tsEnd.value;
        else if (tsStart) tsStart.removeAttribute('max');
    });

    document.getElementById('logoUpload').addEventListener('change', (e) => {
        if (blockReadOnlyAction('changing invoice branding')) return;
        handleLogoUpload(e, (logoBase64) => {
            state.logo = logoBase64;
            if (!state.isLocked) setDirty(true);
            updatePreview(state);
        });
    });

    // ── New Invoice — show custom modal instead of confirm() ────────────
    document.getElementById('newBtn').addEventListener('click', () => {
        if (blockReadOnlyAction('starting a new invoice')) return;
        const bodyEl = document.getElementById('newInvoiceModalBody');
        if (bodyEl) {
            bodyEl.textContent = state.isDirty
                ? 'You have unsaved changes that will be permanently lost.'
                : 'This will clear the current invoice and start fresh.';
        }
        showModal('newInvoiceModal');
    });
    document.getElementById('newInvoiceCancelBtn')?.addEventListener('click', () => hideModal('newInvoiceModal'));
    document.getElementById('newInvoiceConfirmBtn')?.addEventListener('click', () => {
        if (blockReadOnlyAction('starting a new invoice')) return;
        setDirty(false); // Clear flag so beforeunload doesn't fire
        window.location.href = 'app.html';
    });

    // ── Unlock Invoice ──────────────────────────────────────────────────
    document.getElementById('invoiceUnlockBtn')?.addEventListener('click', () => {
        if (blockReadOnlyAction('unlocking invoices')) return;
        showModal('unlockInvoiceModal');
    });
    document.getElementById('unlockCancelBtn')?.addEventListener('click', () => hideModal('unlockInvoiceModal'));
    document.getElementById('unlockConfirmBtn')?.addEventListener('click', async () => {
        if (blockReadOnlyAction('unlocking invoices')) return;
        hideModal('unlockInvoiceModal');
        // Revert invoice to draft in DB
        try {
            const { updateInvoiceStatus } = await import('./database.js');
            const invId = state.currentInvoiceId;
            if (invId) await updateInvoiceStatus(invId, 'draft');
        } catch (e) { /* non-fatal — unlock UI anyway */ }
        const statusSelect = document.getElementById('invoiceStatus');
        const paidDateField = document.getElementById('paidDateField');
        if (statusSelect) statusSelect.value = 'draft';
        if (paidDateField) paidDateField.style.display = 'none';
        state.currentStatus = 'draft';
        setLocked(false);
        setDirty(false);
        updatePreview(state);
        showToast('Invoice unlocked — now in Draft status', 'info');
    });

    document.getElementById('saveBtn').addEventListener('click', handleSave);

    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
        const data = gatherFormData();
        if (state.logo) data.business_info.logo = state.logo;
        generatePDF(data);
    });

    // Email Button Handler (Mailto Fallback)
    const emailBtn = document.getElementById('emailBtn');
    if (emailBtn) {
        emailBtn.addEventListener('click', () => {
            const data = gatherFormData();
            const subject = `Invoice ${data.invoice_number} from ${data.business_info.name}`;
            const body = `Hi ${data.client_info.name},\n\nPlease find attached invoice ${data.invoice_number} for ${data.totals.totalDisplay}.\n\nDue Date: ${data.invoice_meta.dueDate}\n\nThank you,\n${data.business_info.name}`;

            const mailtoLink = `mailto:${data.client_info.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.location.href = mailtoLink;
            showToast('Opening email client...');
        });
    }

    // Templates
    document.getElementById('saveTemplateBtn').addEventListener('click', handleSaveTemplate);
    const updateBtn = document.getElementById('updateTemplateBtn');
    if (updateBtn) {
        updateBtn.addEventListener('click', handleUpdateTemplate);
    }
    document.getElementById('templateSelect').addEventListener('change', (e) => {
        if (e.target.value) handleLoadTemplate(e.target.value);
    });

    const printBtn = document.getElementById('printBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    ['timesheetModal', 'newInvoiceModal', 'unlockInvoiceModal'].forEach(bindModalDismiss);

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        ['timesheetModal', 'newInvoiceModal', 'unlockInvoiceModal'].forEach((id) => {
            const modal = document.getElementById(id);
            if (modal?.style.display === 'flex') hideModal(id);
        });
    });
}

async function handleUpdateTemplate() {
    if (blockReadOnlyAction('updating templates')) return;
    if (!state.currentTemplateName) return;

    setTimeout(async () => {
        if (!confirm(`Overwrite template "${state.currentTemplateName}" with current data?`)) return;

        const formData = gatherFormData();
        const templateData = {
            name: state.currentTemplateName, // Use existing name
            business: formData.business_info,
            client: formData.client_info,
            settings: formData.settings,
            payment_instructions: formData.payment_instructions
        };

        try {
            await dbSaveTemplate(templateData);
            showToast(`Template "${state.currentTemplateName}" updated`, 'success');
        } catch (e) {
            showToast('Error updating template', 'error');
        }
    }, 10);
}

// Helpers
function setDefaultDates() {
    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + 30);
    document.getElementById('invoiceDate').valueAsDate = today;
    document.getElementById('dueDate').valueAsDate = due;
}

async function initializeInvoiceNumber() {
    state.isCustomInvoiceNumber = false;
    try {
        const next = await getNextInvoiceNumber();
        document.getElementById('invoiceNumber').value = next;
        state.suggestedInvoiceNumber = next;
    } catch (e) {
        console.error(e);
        document.getElementById('invoiceNumber').value = 'INV-0001';
        state.suggestedInvoiceNumber = 'INV-0001';
    }
}

// Handler functions
async function handleSave() {
    if (blockReadOnlyAction('saving invoices')) return;
    if (state.isLocked) {
        showToast('Invoice is locked. Unlock it first to save changes.', 'error');
        return;
    }

    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const data = gatherFormData();
        if (state.logo) data.business_info.logo = state.logo;

        // ── Race condition fix & Custom Invoice Logic ────────────────────────
        const invNumEl = document.getElementById('invoiceNumber');
        const currentNum = String(invNumEl?.value || '').trim();
        const isNewInvoice = !state.currentInvoiceId;

        if (isNewInvoice) {
            if (currentNum !== state.suggestedInvoiceNumber) {
                // User manual override detected! Disable race condition safeguard
                state.isCustomInvoiceNumber = true;
                data.invoice_number = currentNum;
                console.log('Custom invoice identifier detected:', currentNum);
            } else {
                // Standard sequential invoice - fetch fresh to prevent collisions
                try {
                    const freshNum = await getNextInvoiceNumber();
                    data.invoice_number = freshNum;
                    if (invNumEl) invNumEl.value = freshNum;
                } catch (numErr) {
                    console.warn('Could not refresh invoice number, using displayed value:', numErr);
                    data.invoice_number = currentNum;
                }
            }
        } else {
            // Updating existing, invoice number remains unchanged
            data.invoice_number = currentNum;
        }

        // Attach the immutable tracking flag
        data.invoice_meta = data.invoice_meta || {};
        data.invoice_meta.is_custom_number = state.isCustomInvoiceNumber;
        // ── End Logic ────────────────────────────────────────────────────────

        const saved = await dbSaveInvoice(data);

        // Always sync the authoritative DB invoice_number back into the UI
        if (saved.invoice_number && invNumEl) {
            invNumEl.value = saved.invoice_number;
            // Make the number immutable now that it's persisted
            invNumEl.readOnly = true;
            invNumEl.style.opacity = '0.6';
            invNumEl.style.cursor = 'not-allowed';
            invNumEl.title = 'Invoice number cannot be changed after saving';
        }

        state.currentInvoiceNumber = saved.invoice_number;
        state.currentInvoiceId = saved.id;

        await syncInvoiceTimesheets(saved);
        setDirty(false); // Clear unsaved-changes flag
        showToast('Saved successfully', 'success');

        // Notify other tabs — scoped to this user so other accounts aren't affected
        const userId = state.user?.id || 'anon';
        const channel = new BroadcastChannel(`app_channel_${userId}`);
        channel.postMessage({ type: 'invoice_saved' });
        channel.close();

        // Update URL with invoice number
        const url = new URL(window.location);
        url.searchParams.set('invoice_number', saved.invoice_number);
        window.history.replaceState({}, '', url);
    } catch (e) {
        console.error(e);
        showToast('Error saving: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
    }
}

async function handleLoadInvoice(invoiceNumber) {
    try {
        const data = await dbGetInvoice(invoiceNumber);
        if (!data) throw new Error('Not found');

        fillFormWithData(data);
        if (data.business_info?.logo) {
            state.logo = data.business_info.logo;
        }

        // Store invoice ID and status for lock/unlock logic
        state.currentInvoiceId = data.id;
        state.currentStatus = data.status || 'draft';
        state.isCustomInvoiceNumber = data.invoice_meta?.is_custom_number === true;

        // Lock the invoice number field — immutable after first save
        const invNumEl = document.getElementById('invoiceNumber');
        if (invNumEl) {
            invNumEl.readOnly = true;
            invNumEl.style.opacity = '0.6';
            invNumEl.style.cursor = 'not-allowed';
            invNumEl.title = 'Invoice number cannot be changed after saving';
        }

        setDirty(false); // Just loaded — no pending changes
        updatePreview(state);

        // ── Lock paid/sent invoices ─────────────────────────────────────
        if (data.status === 'paid' || data.status === 'sent') {
            setLocked(true, data.status);
        } else {
            setLocked(false);
        }

        showToast('Loaded invoice ' + invoiceNumber);
    } catch (e) {
        console.error('Load error:', e);
        showToast('Error loading invoice', 'error');
    }
}

async function syncInvoiceTimesheets(invoice) {
    try {
        const items = Array.isArray(invoice.items) ? invoice.items : [];
        const linkedTimesheetIds = Array.from(new Set(
            items.flatMap(item => {
                if (Array.isArray(item.timesheet_ids)) return item.timesheet_ids;
                if (typeof item.timesheet_ids === 'string' && item.timesheet_ids.trim()) {
                    try {
                        const parsed = JSON.parse(item.timesheet_ids);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        return [];
                    }
                }
                return [];
            }).map(id => String(id || '').trim()).filter(Boolean)
        ));

        const existingLinkedIds = await dbGetLinkedTimesheetIds(invoice.id, invoice.invoice_number);
        const selectedIdSet = new Set(linkedTimesheetIds);
        const idsToUnlink = existingLinkedIds.filter(id => !selectedIdSet.has(String(id)));

        if (idsToUnlink.length > 0) {
            await dbLinkTimesheetsToInvoice(idsToUnlink, {
                invoice_id: null,
                invoice_number: null
            });
        }

        if (linkedTimesheetIds.length > 0) {
            await dbLinkTimesheetsToInvoice(linkedTimesheetIds, {
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number
            });
        }

        const fallbackItems = items.filter(item => {
            const ids = Array.isArray(item.timesheet_ids) ? item.timesheet_ids : [];
            return ids.length === 0;
        });
        if (fallbackItems.length === 0) return;

        const consultants = await dbGetConsultants();
        const byId = new Map(
            consultants.map(c => [String(c.id), c])
        );
        const byName = new Map(
            consultants.map(c => [String(c.name || '').trim().toLowerCase(), c])
        );

        const dateRaw = invoice.invoice_meta?.dateRaw || invoice.created_at || new Date().toISOString();

        const payload = [];
        fallbackItems.forEach(item => {
            const consultantId = String(item.consultant_id || '').trim();
            const consultantName = String(item.consultant || '').trim();
            const hours = Number(item.qty) || 0;
            if (hours <= 0) return;

            const consultant = (
                (consultantId && byId.get(consultantId)) ||
                (consultantName ? byName.get(consultantName.toLowerCase()) : null)
            );
            if (!consultant) return;

            // Try to parse period string if present
            const parsed = parsePeriodRange(item.period, dateRaw);

            payload.push({
                consultant_id: consultant.id,
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number,
                period_start: parsed.start,
                period_end: parsed.end,
                hours_worked: hours,
                status: 'invoiced'
            });
        });

        if (payload.length === 0) return;
        await dbUpsertTimesheets(payload);
    } catch (e) {
        console.error('timesheet sync error', e);
        showToast('Saved invoice, but timesheets not linked', 'error');
    }
}

function parsePeriodRange(periodStr, fallbackDateStr) {
    const fallback = () => {
        const d = (fallbackDateStr || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        return { start: d, end: d };
    };
    if (!periodStr || typeof periodStr !== 'string') return fallback();

    // Normalize separators
    const cleaned = periodStr.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(/-\s*/);
    if (parts.length !== 2) return fallback();

    const startStr = parts[0].replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
    const endStr = parts[1].replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();

    const invoiceYear = (fallbackDateStr || '').slice(0, 4) || String(new Date().getFullYear());

    const parseToken = (token) => {
        const withYear = /\d{4}/.test(token) ? token : `${token} ${invoiceYear}`;
        const dt = Date.parse(withYear);
        if (!Number.isNaN(dt)) return new Date(dt);
        return null;
    };

    const sDate = parseToken(startStr);
    const eDate = parseToken(endStr);
    if (!sDate || !eDate) return fallback();

    const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: toIso(sDate), end: toIso(eDate) };
}

async function handleSaveTemplate() {
    if (blockReadOnlyAction('saving templates')) return;
    // Delay to fix Chrome dialog issue
    setTimeout(async () => {
        const name = prompt('Template Name:', 'New Template');
        if (!name) return;

        // Check for duplicate
        const existing = await dbGetTemplates();
        const isDuplicate = existing.some(t => t.name.toLowerCase() === name.trim().toLowerCase());

        if (isDuplicate) {
            if (!confirm(`Template "${name}" already exists. Overwrite it?`)) {
                return;
            }
        }

        const formData = gatherFormData();
        const templateData = {
            name: name.trim(),
            business: formData.business_info,
            client: formData.client_info,
            settings: formData.settings,
            payment_instructions: formData.payment_instructions
        };

        try {
            await dbSaveTemplate(templateData);
            showToast('Template saved', 'success');
            await updateTemplateDropdown();
        } catch (e) {
            showToast('Error saving template', 'error');
        }
    }, 10);
}

async function handleLoadTemplate(id) {
    if (blockReadOnlyAction('loading templates')) return;
    try {
        const templates = await dbGetTemplates();
        console.log('DEBUG: All templates:', templates);

        // Ensure type match for ID comparison
        const template = templates.find(t => String(t.id) === String(id));
        console.log('DEBUG: Found template:', template);

        if (!template) {
            console.error('Template not found for id:', id);
            return;
        }

        // Map template structure to form data structure for fillFormWithData
        const data = {
            business_info: template.business_info,
            client_info: template.client_info,
            settings: template.settings,
            items: [],
            notes: '',
            payment_instructions: template.settings?.payment_instructions || ''
        };
        console.log('DEBUG: Mapped data for fillForm:', data);

        fillFormWithData(data);
        if (template.business_info?.logo) state.logo = template.business_info.logo;

        setDefaultDates(); // Reset dates for new invoice
        updatePreview(state);
        showToast('Applied template');
    } catch (e) {
        showToast('Error loading template', 'error');
    }
    document.getElementById('templateSelect').value = '';
}

async function updateTemplateDropdown() {
    try {
        const templates = await dbGetTemplates();
        const select = document.getElementById('templateSelect');
        select.innerHTML = '<option value="">Load template...</option>';
        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name; // DB field is 'name' in saveTemplate?
            // Wait, existing code used 'template_name'. Let's check database.js or previous app.js
            // Previous app.js line 482: option.textContent = t.template_name;
            // database.js line 16: name: templateData.name.
            // So DB column is name? Or template_name?
            // database.js line 16 inserts into 'name'. 
            // So t.name is likely correct if the DB schema matches the insert.
            // Let's use t.name || t.template_name to be safe.
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Templates error', e);
    }
}

// ── Timesheet Modal Logic ────────────────────────────────────────────────────
let pendingTimesheetGroups = [];
let pendingTimesheetRange = { start: '', end: '' };

async function openTimesheetModal() {
    if (blockReadOnlyAction('pulling consultant timesheets')) return;
    const modal = document.getElementById('timesheetModal');
    if (!modal) return;
    modal.style.display = 'flex';

    // Default to current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const startInput = document.getElementById('tsPeriodStart');
    const endInput = document.getElementById('tsPeriodEnd');
    if (startInput && !startInput.value) startInput.value = fmt(firstDay);
    if (endInput && !endInput.value) endInput.value = fmt(lastDay);

    await loadPendingTimesheetsIntoModal();
}

function closeTimesheetModal() {
    document.getElementById('timesheetModal').style.display = 'none';
}

function markTimesheetRangeDirty() {
    pendingTimesheetRange = { start: '', end: '' };
    const meta = document.getElementById('timesheetSelectionMeta');
    if (meta) {
        meta.textContent = 'Date range changed. Click Load to refresh pending timesheets.';
    }
}

async function loadPendingTimesheetsIntoModal() {
    if (blockReadOnlyAction('loading consultant timesheets')) return;
    const listContainer = document.getElementById('timesheetConsultantsList');
    const meta = document.getElementById('timesheetSelectionMeta');
    const startStr = document.getElementById('tsPeriodStart').value;
    const endStr = document.getElementById('tsPeriodEnd').value;

    if (!startStr || !endStr) {
        if (listContainer) listContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;">Select both start and end dates.</div>';
        if (meta) meta.textContent = 'No timesheets loaded.';
        pendingTimesheetRange = { start: '', end: '' };
        return;
    }
    if (startStr > endStr) {
        showToast('Period start cannot be after period end', 'error');
        return;
    }

    if (listContainer) {
        listContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;">Loading pending timesheets...</div>';
    }

    try {
        const rows = await dbGetPendingTimesheetsForRange(startStr, endStr);
        const grouped = new Map();

        (rows || []).forEach((row) => {
            const consultant = Array.isArray(row.consultants) ? row.consultants[0] : (row.consultants || {});
            if (row.invoice_number) return;
            if (!row.consultant_id) return;

            const key = String(row.consultant_id);
            const existing = grouped.get(key) || {
                consultant_id: key,
                consultant_name: consultant.name || 'Unknown',
                client: consultant.client || '',
                bill_rate: Number(consultant.bill_rate) || 0,
                currency: (consultant.currency || 'USD').toUpperCase(),
                period_start: row.period_start,
                period_end: row.period_end,
                hours: 0,
                timesheet_ids: []
            };

            existing.hours += Number(row.hours_worked) || 0;
            existing.timesheet_ids.push(row.id);
            if (row.period_start && (!existing.period_start || row.period_start < existing.period_start)) {
                existing.period_start = row.period_start;
            }
            if (row.period_end && (!existing.period_end || row.period_end > existing.period_end)) {
                existing.period_end = row.period_end;
            }

            grouped.set(key, existing);
        });

        pendingTimesheetGroups = Array.from(grouped.values())
            .filter(x => x.hours > 0)
            .sort((a, b) => a.consultant_name.localeCompare(b.consultant_name));
        pendingTimesheetRange = { start: startStr, end: endStr };

        if (pendingTimesheetGroups.length === 0) {
            if (listContainer) {
                listContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;">No pending timesheets found for this date range.</div>';
            }
            if (meta) meta.textContent = '0 consultants selected • 0.00 hours';
            return;
        }

        if (listContainer) {
            listContainer.innerHTML = `
                <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                    <div style="display:grid;grid-template-columns:36px 1.2fr 1fr 1fr 100px;background:#f8fafc;padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;">
                        <label style="display:flex;align-items:center;"><input type="checkbox" id="tsSelectAllCandidates" checked></label>
                        <div>Consultant</div>
                        <div>Client</div>
                        <div>Timesheet Period</div>
                        <div style="text-align:right;">Hours</div>
                    </div>
                    ${pendingTimesheetGroups.map((entry, index) => `
                        <div style="display:grid;grid-template-columns:36px 1.2fr 1fr 1fr 100px;padding:10px 12px;border-top:1px solid #f1f5f9;align-items:center;">
                            <label style="display:flex;align-items:center;"><input type="checkbox" class="ts-include-candidate" data-index="${index}" checked></label>
                            <div>
                                <div style="font-weight:600;color:#111827;">${escapeHtmlText(entry.consultant_name)}</div>
                                <div style="font-size:11px;color:#6b7280;">${escapeHtmlText(entry.currency)} ${Number(entry.bill_rate || 0).toFixed(2)}/hr • ${Number(entry.timesheet_ids.length) || 0} row(s)</div>
                            </div>
                            <div style="font-size:12px;color:#374151;">${escapeHtmlText(entry.client || '—')}</div>
                            <div style="font-size:12px;color:#374151;">${escapeHtmlText(entry.period_start || '—')} to ${escapeHtmlText(entry.period_end || '—')}</div>
                            <div style="text-align:right;font-weight:600;">${entry.hours.toFixed(2)}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        document.getElementById('tsSelectAllCandidates')?.addEventListener('change', (e) => {
            const checked = !!e.target.checked;
            document.querySelectorAll('.ts-include-candidate').forEach((box) => {
                box.checked = checked;
            });
            updateTimesheetSelectionMeta();
        });

        document.querySelectorAll('.ts-include-candidate').forEach((box) => {
            box.addEventListener('change', () => {
                updateTimesheetSelectionMeta();
            });
        });

        // ── Supplemental billing pre-filter ──────────────────────────────
        // When arriving via "Invoice Xh Pending" from the timesheets page,
        // pre-select only that consultant and show an explanatory banner.
        if (state.prefillConsultantId) {
            const matchIndex = pendingTimesheetGroups.findIndex(
                g => String(g.consultant_id) === String(state.prefillConsultantId)
            );
            if (matchIndex !== -1) {
                // Uncheck all, then check only the target consultant
                document.querySelectorAll('.ts-include-candidate').forEach(box => {
                    box.checked = String(pendingTimesheetGroups[Number(box.dataset.index)]?.consultant_id) === String(state.prefillConsultantId);
                });
                const matched = pendingTimesheetGroups[matchIndex];
                const notice = buildPrefillNotice(matched);
                listContainer?.insertAdjacentElement('beforebegin', notice);
            } else {
                showToast('No pending hours found for that consultant in this period. Try adjusting the date range.', 'info');
            }
        }

        updateTimesheetSelectionMeta();
    } catch (e) {
        console.error(e);
        if (listContainer) {
            listContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:#ef4444;">Failed to load pending timesheets.</div>';
        }
        if (meta) meta.textContent = 'No timesheets loaded.';
        pendingTimesheetRange = { start: '', end: '' };
    }
}

function updateTimesheetSelectionMeta() {
    const meta = document.getElementById('timesheetSelectionMeta');
    if (!meta) return;

    const boxes = Array.from(document.querySelectorAll('.ts-include-candidate'));
    if (boxes.length === 0) {
        meta.textContent = '0 consultants selected • 0.00 hours';
        return;
    }

    const selected = boxes
        .filter(box => box.checked)
        .map(box => pendingTimesheetGroups[Number(box.dataset.index)])
        .filter(Boolean);

    const hours = selected.reduce((sum, entry) => sum + (entry.hours || 0), 0);
    meta.textContent = `${selected.length} consultants selected • ${hours.toFixed(2)} hours`;
}

async function generateTimesheetItems() {
    if (blockReadOnlyAction('pulling consultant timesheets')) return;
    const startStr = document.getElementById('tsPeriodStart').value;
    const endStr = document.getElementById('tsPeriodEnd').value;
    if (startStr !== pendingTimesheetRange.start || endStr !== pendingTimesheetRange.end) {
        showToast('Date range changed. Click Load to refresh timesheets before generating.', 'error');
        return;
    }

    const selectedEntries = Array.from(document.querySelectorAll('.ts-include-candidate'))
        .filter(box => box.checked)
        .map(box => pendingTimesheetGroups[Number(box.dataset.index)])
        .filter(Boolean);

    if (selectedEntries.length === 0) {
        showToast('Select at least one consultant timesheet to pull', 'error');
        return;
    }

    const itemsToAdd = [];
    selectedEntries.forEach(entry => {
        itemsToAdd.push({
            desc: 'Services - IT Consulting',
            qty: entry.hours,
            rate: entry.bill_rate,
            consultant: entry.consultant_name,
            consultant_id: entry.consultant_id,
            client: '',
            period: `${entry.period_start || ''} to ${entry.period_end || ''}`.trim(),
            timesheet_ids: entry.timesheet_ids || []
        });
    });

    // Clear existing items but safely
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';

    // Add new items
    itemsToAdd.forEach(data => {
        addItem();
        const lastCard = container.lastElementChild;
        if (lastCard) {
            lastCard.querySelector('.item-desc').value = data.desc;
            lastCard.querySelector('.item-qty').value = data.qty;
            lastCard.querySelector('.item-rate').value = data.rate;
            lastCard.querySelector('.item-consultant').value = data.consultant;
            const consultantIdInput = lastCard.querySelector('.item-consultant-id');
            if (consultantIdInput) consultantIdInput.value = data.consultant_id || '';
            const timesheetIdsInput = lastCard.querySelector('.item-timesheet-ids');
            if (timesheetIdsInput) timesheetIdsInput.value = JSON.stringify(data.timesheet_ids || []);
            lastCard.querySelector('.item-client').value = data.client;
            lastCard.querySelector('.item-period').value = data.period;
        }
    });

    updatePreview(state);
    closeTimesheetModal();
    showToast(`Pulled ${itemsToAdd.length} consultants from pending timesheets`, 'success');
}

function escapeHtmlText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildPrefillNotice(matched) {
    const notice = document.createElement('div');
    notice.style.cssText = 'background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:0.625rem 0.875rem;margin-bottom:0.75rem;font-size:0.8125rem;color:#9a3412;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;';

    const message = document.createElement('span');
    const consultantName = document.createElement('strong');
    consultantName.textContent = matched?.consultant_name || 'Unknown';
    message.appendChild(consultantName);
    message.appendChild(document.createTextNode(` — ${Number(matched?.hours || 0).toFixed(2)}h pending pre-selected for supplemental invoice. Uncheck to deselect or add other consultants above.`));

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.style.cssText = 'background:none;border:none;cursor:pointer;font-size:1rem;color:#9a3412;flex-shrink:0;';
    dismiss.title = 'Dismiss';
    dismiss.innerHTML = '&#x2715;';
    dismiss.addEventListener('click', () => notice.remove());

    notice.appendChild(message);
    notice.appendChild(dismiss);
    return notice;
}
