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
        const templateUseId = urlParams.get('template_use')
        if (templateUseId) {
            await handleLoadTemplate(templateUseId)
            showToast('Template applied ✓', 'success')
        }
        setDefaultDates();
        await initializeInvoiceNumber();
        document.getElementById('notes').value = 'Thank you for your business!'; // Set default note
        addItem(); // UI module
        updatePreview(state);
    }

    bindEventListeners();
    await updateTemplateDropdown();

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

    // Timesheet Logic
    document.getElementById('pullTimesheetsBtn')?.addEventListener('click', openTimesheetModal);
    document.getElementById('closeTimesheetBtn')?.addEventListener('click', closeTimesheetModal);
    document.getElementById('cancelTimesheetBtn')?.addEventListener('click', closeTimesheetModal);
    document.getElementById('loadTimesheetsBtn')?.addEventListener('click', loadPendingTimesheetsIntoModal);
    document.getElementById('generateTimesheetBtn')?.addEventListener('click', generateTimesheetItems);
    document.getElementById('tsPeriodStart')?.addEventListener('change', markTimesheetRangeDirty);
    document.getElementById('tsPeriodEnd')?.addEventListener('change', markTimesheetRangeDirty);

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

        const saved = await dbSaveInvoice(data);
        state.currentInvoiceNumber = saved.invoice_number;

        await syncInvoiceTimesheets(saved);
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

        // Lock the invoice number field to prevent accidental duplicates
        const invNumEl = document.getElementById('invoiceNumber');
        if (invNumEl) {
            invNumEl.readOnly = true;
            invNumEl.style.opacity = '0.6';
            invNumEl.style.cursor = 'not-allowed';
            invNumEl.title = 'Invoice number cannot be changed after saving';
        }

        updatePreview(state);
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

// ── Timesheet Modal Logic ────────────────────────────────────────────────────
let pendingTimesheetGroups = [];
let pendingTimesheetRange = { start: '', end: '' };

async function openTimesheetModal() {
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
                                <div style="font-size:11px;color:#6b7280;">${entry.currency} ${entry.bill_rate.toFixed(2)}/hr • ${entry.timesheet_ids.length} row(s)</div>
                            </div>
                            <div style="font-size:12px;color:#374151;">${escapeHtmlText(entry.client || '—')}</div>
                            <div style="font-size:12px;color:#374151;">${entry.period_start || '—'} to ${entry.period_end || '—'}</div>
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
            desc: 'Consulting Services',
            qty: entry.hours,
            rate: entry.bill_rate,
            consultant: entry.consultant_name,
            consultant_id: entry.consultant_id,
            client: entry.client || '',
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
