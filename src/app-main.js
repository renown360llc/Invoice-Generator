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
import {
    gatherFormData,
    updatePreview,
    addItem,
    fillFormWithData,
    handleLogoUpload,
    calculateTotals
} from './modules/ui.js';
import { generatePDF } from './modules/pdf.js';
import { showToast, debounce } from './modules/utils.js';

// Global State
const state = {
    user: null,
    logo: null,
    subtotal: 0,
    total: 0,
    currentTemplateName: null // Track loaded template
};

// Initialization
document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (window.appInitialized) return;
    window.appInitialized = true;

    state.user = await checkAuth();
    if (!state.user) return;

    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const invoiceNumber = urlParams.get('invoice_number') || urlParams.get('invoice'); // Support both for now
    const action = urlParams.get('action');

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
        setDefaultDates();
        await initializeInvoiceNumber();
        document.getElementById('notes').value = 'Thank you for your business!'; // Set default note
        addItem(); // UI module
        updatePreview(state);
    }

    bindEventListeners();
    await updateTemplateDropdown();
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
    // Form Inputs
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('input', debounce(() => {
            updatePreview(state);
        }, 100));
    });

    // Using delegation for items container and individual inputs?
    // UI module handles individual item inputs via addItem binding, 
    // but the main form inputs (business info) need binding here or in UI?
    // Let's bind global change to updatePreview
    document.body.addEventListener('change', (e) => {
        if (e.target.matches('input, select, textarea')) {
            updatePreview(state);
        }
    });

    // Buttons
    document.getElementById('addItemBtn').addEventListener('click', () => {
        addItem();
        updatePreview(state);
    });

    document.getElementById('logoUpload').addEventListener('change', (e) => {
        handleLogoUpload(e, (logoBase64) => {
            state.logo = logoBase64;
            updatePreview(state);
        });
    });

    document.getElementById('newBtn').addEventListener('click', () => {
        // Wrap in timeout to prevent Chrome focus/event issues
        setTimeout(() => {
            if (confirm('Start new invoice?')) window.location.href = 'app.html';
        }, 10);
    });

    document.getElementById('saveBtn').addEventListener('click', handleSave);

    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
        const data = gatherFormData();
        if (state.logo) data.business_info.logo = state.logo; // Ensure state logo is used
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
}

async function handleUpdateTemplate() {
    if (!state.currentTemplateName) return;

    setTimeout(async () => {
        if (!confirm(`Overwrite template "${state.currentTemplateName}" with current data?`)) return;

        const formData = gatherFormData();
        const templateData = {
            name: state.currentTemplateName, // Use existing name
            business: formData.business_info,
            client: formData.client_info,
            settings: formData.settings
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
    try {
        const next = await getNextInvoiceNumber();
        document.getElementById('invoiceNumber').value = next;
    } catch (e) {
        console.error(e);
        document.getElementById('invoiceNumber').value = 'INV-0001';
    }
}

// Handler functions
async function handleSave() {
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const data = gatherFormData();
        if (state.logo) data.business_info.logo = state.logo;

        await dbSaveInvoice(data);
        showToast('Saved successfully', 'success');

        // Notify other tabs
        const channel = new BroadcastChannel('app_channel');
        channel.postMessage({ type: 'invoice_saved' });

        // Update URL
        if (!state.currentInvoiceNumber) {
            state.currentInvoiceNumber = data.invoice_number;
            const url = new URL(window.location);
            url.searchParams.set('invoice_number', data.invoice_number);
            window.history.pushState({}, '', url);
        }
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
        updatePreview(state);
        showToast('Loaded invoice ' + invoiceNumber);
    } catch (e) {
        console.error('Load error:', e);
        showToast('Error loading invoice', 'error');
    }
}

async function handleSaveTemplate() {
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
            settings: formData.settings
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
            payment_instructions: ''
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
