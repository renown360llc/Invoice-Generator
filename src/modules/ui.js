/**
 * UI Module
 * Handles DOM manipulation, event listeners, and preview rendering.
 */

import { formatCurrency, formatDate, parseDateToInput, showToast } from './utils.js';

// ... (rest of imports/code)



// Re-using the logic from app-main.js but cleanly componentized

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTextLines(text) {
    return String(text || '')
        .split('\n')
        .filter(Boolean)
        .map(line => `<div>${escapeHtml(line)}</div>`)
        .join('');
}

export function gatherFormData() {
    const items = [];
    document.querySelectorAll('.item-card').forEach(card => {
        const qty = parseFloat(card.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(card.querySelector('.item-rate').value) || 0;
        const timesheetIdsRaw = card.querySelector('.item-timesheet-ids')?.value || '[]';
        let timesheetIds = [];
        try {
            const parsed = JSON.parse(timesheetIdsRaw);
            if (Array.isArray(parsed)) timesheetIds = parsed;
        } catch (e) {
            timesheetIds = [];
        }
        items.push({
            desc: card.querySelector('.item-desc').value,
            qty: qty,
            rate: rate,
            amount: qty * rate,
            amountDisplay: card.querySelector('[data-amount]').textContent,
            client: card.querySelector('.item-client').value,
            consultant: card.querySelector('.item-consultant').value,
            consultant_id: card.querySelector('.item-consultant-id')?.value || '',
            timesheet_ids: timesheetIds,
            period: card.querySelector('.item-period').value,
            work_month: card.querySelector('.item-work-month')?.value || '',
            notes: card.querySelector('.item-notes').value
        });
    });

    const subtotal = parseFloat(document.getElementById('subtotalDisplay').dataset.raw || 0);
    const taxAmount = parseFloat(document.getElementById('taxDisplay').dataset.raw || 0);
    const discountAmount = parseFloat(document.getElementById('discountDisplay').dataset.raw || 0);
    const total = parseFloat(document.getElementById('totalDisplay').dataset.raw || 0);

    const statusEl = document.getElementById('invoiceStatus')
    const paidDateEl = document.getElementById('paidDate')

    return {
        invoice_number: document.getElementById('invoiceNumber').value,
        status: statusEl ? statusEl.value : 'draft',
        paid_date: paidDateEl ? (paidDateEl.value || null) : null,
        business_info: {
            name: document.getElementById('businessName').value,
            email: document.getElementById('businessEmail').value,
            phone: document.getElementById('businessPhone').value,
            address: document.getElementById('businessAddress').value,
            logo: document.querySelector('.pv-logo')?.src || null
        },
        client_info: {
            name: document.getElementById('clientName').value,
            email: document.getElementById('clientEmail').value,
            phone: document.getElementById('clientPhone').value,
            address: document.getElementById('clientAddress').value
        },
        invoice_meta: {
            date: formatDate(document.getElementById('invoiceDate').value),
            dueDate: formatDate(document.getElementById('dueDate').value),
            dateRaw: document.getElementById('invoiceDate').value,
            dueDateRaw: document.getElementById('dueDate').value,
            terms: document.getElementById('paymentTerms').value,
            currency: document.getElementById('currency').value
        },
        settings: {
            brandColor: document.getElementById('brandColor').value,
            taxRate: document.getElementById('taxRate').value,
            discountType: document.getElementById('discountType').value,
            discountValue: document.getElementById('discountValue').value
        },
        items: items,
        totals: {
            subtotal,
            taxAmount,
            discountAmount,
            total,
            subtotalDisplay: document.getElementById('subtotalDisplay').textContent,
            taxDisplay: document.getElementById('taxDisplay').textContent,
            discountDisplay: document.getElementById('discountDisplay').textContent,
            totalDisplay: document.getElementById('totalDisplay').textContent
        },
        notes: document.getElementById('notes').value,
        payment_instructions: document.getElementById('paymentInstructions').value
    };
}

export function updatePreview(state) {
    calculateTotals(state);
    renderPaper(state);
}

export function calculateTotals(state) {
    let subtotal = 0;
    const currency = document.getElementById('currency').value;

    document.querySelectorAll('.item-card').forEach(card => {
        const qty = parseFloat(card.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(card.querySelector('.item-rate').value) || 0;
        const amount = qty * rate;
        card.dataset.amount = amount;
        card.querySelector('[data-amount]').textContent = formatCurrency(amount, currency);
        subtotal += amount;
    });

    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    const taxAmount = subtotal * (taxRate / 100);

    const discountType = document.getElementById('discountType').value;
    const discountValue = parseFloat(document.getElementById('discountValue').value) || 0;
    const discountAmount = discountType === 'percent'
        ? subtotal * (discountValue / 100)
        : discountValue;

    const total = subtotal + taxAmount - discountAmount;

    // Update Display DOM with data attributes for raw values
    const subEl = document.getElementById('subtotalDisplay');
    subEl.textContent = formatCurrency(subtotal, currency);
    subEl.dataset.raw = subtotal;

    const taxEl = document.getElementById('taxDisplay');
    taxEl.textContent = formatCurrency(taxAmount, currency);
    taxEl.dataset.raw = taxAmount;

    const discEl = document.getElementById('discountDisplay');
    discEl.textContent = `-${formatCurrency(discountAmount, currency)}`;
    discEl.dataset.raw = discountAmount;

    const totalEl = document.getElementById('totalDisplay');
    totalEl.textContent = formatCurrency(total, currency);
    totalEl.dataset.raw = total;

    // Update global state if passed (optional, since we gather from DOM)
    if (state) {
        state.subtotal = subtotal;
        state.total = total;
    }
}

function renderPaper(state) {
    const preview = document.getElementById('invoicePreview');
    const rawColor = (document.getElementById('brandColor')?.value || '').trim();
    const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : '#3b82f6';
    const data = gatherFormData();
    // state.logo is the source of truth for the active company's logo.
    if (state?.logo) data.business_info.logo = state.logo;
    const cur = data.invoice_meta.currency;
    const safeInvoiceNumber = escapeHtml(data.invoice_number);
    const safeLogo = data.business_info.logo ? escapeHtml(data.business_info.logo) : '';
    const safeBusinessName = escapeHtml(data.business_info.name || 'Your Company');
    const safeBusinessEmail = escapeHtml(data.business_info.email || '');
    const safeBusinessPhone = escapeHtml(data.business_info.phone || '');
    const safeClientName = escapeHtml(data.client_info.name || '—');
    const safeClientEmail = escapeHtml(data.client_info.email || '');
    const safeClientPhone = escapeHtml(data.client_info.phone || '');
    const safeAddressLines = renderTextLines(data.business_info.address);
    const safeClientAddressLines = renderTextLines(data.client_info.address);
    const safeNotes = escapeHtml(data.notes || '');
    const safePaymentInstructions = escapeHtml(data.payment_instructions || '');

    // ── Line items ─────────────────────────────────────────────────────────
    const itemsHTML = data.items.map((item, idx) => `
        <tr class="pv-item-row${idx % 2 === 1 ? ' pv-item-row--alt' : ''}">
            <td class="pv-td pv-td--desc">
                <div class="pv-item-name">${escapeHtml(item.desc || 'Item')}</div>
                ${renderItemDetails(item)}
            </td>
            <td class="pv-td pv-td--num">${item.qty}</td>
            <td class="pv-td pv-td--num">${formatCurrency(item.rate, cur)}</td>
            <td class="pv-td pv-td--num pv-td--amount">${item.amountDisplay}</td>
        </tr>
    `).join('');

    // ── Totals rows ────────────────────────────────────────────────────────
    const totalsHTML = `
        <tr><td class="pv-tot-label">Subtotal</td><td class="pv-tot-val">${data.totals.subtotalDisplay}</td></tr>
        ${data.totals.taxAmount > 0 ? `<tr><td class="pv-tot-label">Tax</td><td class="pv-tot-val">${data.totals.taxDisplay}</td></tr>` : ''}
        ${data.totals.discountAmount > 0 ? `<tr><td class="pv-tot-label">Discount</td><td class="pv-tot-val" style="color:#16a34a">${data.totals.discountDisplay}</td></tr>` : ''}
        <tr class="pv-tot-grand">
            <td class="pv-tot-label">Total Due</td>
            <td class="pv-tot-val" style="color:${brandColor}">${data.totals.totalDisplay}</td>
        </tr>
    `;

    preview.innerHTML = `
    <style>
        /* ── Scoped preview styles ─────────────────────────────────────── */
        #invoicePreview {
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 13px;
            color: #1a1a2e;
            background: #fff;
            padding: 48px 52px;
            min-height: 960px;
            box-sizing: border-box;
        }
        .pv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .pv-brand-section { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .pv-logo-name-row { display: flex; align-items: center; gap: 14px; }
        .pv-logo { max-height: 56px; max-width: 220px; object-fit: contain; object-position: left center; flex-shrink: 0; }
        .pv-company-name { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: ${brandColor}; margin: 0; line-height: 1; }
        .pv-company-details { font-size: 11px; color: #64748b; line-height: 1.5; }
        .pv-company-details-name { font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
        .pv-badge { text-align: right; }
        .pv-invoice-word { font-size: 32px; font-weight: 900; letter-spacing: 3px; color: #e2e8f0; text-transform: uppercase; margin-bottom: 14px; }
        .pv-meta { font-size: 12px; }
        .pv-meta-row { display: flex; justify-content: flex-end; gap: 12px; margin-bottom: 3px; align-items: baseline; }
        .pv-meta-label { color: #94a3b8; min-width: 72px; text-align: right; }
        .pv-meta-value { color: #1e293b; font-weight: 600; min-width: 90px; text-align: right; }
        .pv-meta-value--total { font-size: 15px; color: ${brandColor}; font-weight: 800; }

        .pv-divider { border: none; border-top: 1.5px solid #f1f5f9; margin: 28px 0; }

        .pv-bill-section { margin-bottom: 32px; }
        .pv-bill-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px; }
        .pv-bill-name { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
        .pv-bill-details { font-size: 12px; color: #64748b; line-height: 1.7; }

        .pv-items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .pv-th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; padding: 0 0 10px; border-bottom: 2px solid #f1f5f9; }
        .pv-th--desc { text-align: left; }
        .pv-th--num { text-align: right; width: 80px; }
        .pv-td { padding: 12px 0 12px; vertical-align: top; border-bottom: 1px solid #f8fafc; }
        .pv-td--desc { text-align: left; }
        .pv-td--num { text-align: right; width: 80px; color: #64748b; font-size: 12px; }
        .pv-td--amount { color: #1e293b; font-weight: 600; font-size: 13px; }
        .pv-item-row--alt { background: #fafbfc; }
        .pv-item-name { font-weight: 600; color: #1e293b; margin-bottom: 3px; }

        .pv-footer { display: flex; gap: 24px; align-items: flex-start; margin-top: 16px; }
        .pv-notes-block { flex: 1; }
        .pv-notes-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px; }
        .pv-notes-text { font-size: 12px; color: #64748b; line-height: 1.6; white-space: pre-wrap; }

        .pv-totals-table { width: 240px; min-width: 200px; border-collapse: collapse; }
        .pv-tot-label { text-align: left; padding: 5px 0; color: #64748b; font-size: 12px; }
        .pv-tot-val { text-align: right; padding: 5px 0; font-weight: 600; font-size: 12px; color: #1e293b; }
        .pv-tot-grand { border-top: 2px solid #f1f5f9; }
        .pv-tot-grand .pv-tot-label { font-size: 14px; font-weight: 700; color: #1e293b; padding-top: 12px; }
        .pv-tot-grand .pv-tot-val { font-size: 18px; font-weight: 800; padding-top: 12px; }

        /* item detail sub-lines */
        .pv-item-detail { font-size: 11px; color: #94a3b8; margin-top: 2px; line-height: 1.5; }
        .pv-item-detail strong { color: #64748b; font-weight: 600; }
    </style>

    <!-- Header -->
    <div class="pv-header">
        <div class="pv-brand-section">
            <div class="pv-logo-name-row">
                ${safeLogo
                    ? `<img class="pv-logo" src="${safeLogo}" alt="${safeBusinessName} logo">`
                    : `<div class="pv-company-name">${safeBusinessName}</div>`}
            </div>
            <div class="pv-company-details">
                ${safeLogo ? `<div class="pv-company-details-name">${safeBusinessName}</div>` : ''}
                ${safeAddressLines}
                ${safeBusinessEmail ? `<div>${safeBusinessEmail}</div>` : ''}
                ${safeBusinessPhone ? `<div>${safeBusinessPhone}</div>` : ''}
            </div>
        </div>
        <div class="pv-badge">
            <div class="pv-invoice-word">Invoice</div>
            <div class="pv-meta">
                <div class="pv-meta-row"><span class="pv-meta-label">Invoice #</span><span class="pv-meta-value">${safeInvoiceNumber}</span></div>
                <div class="pv-meta-row"><span class="pv-meta-label">Date</span><span class="pv-meta-value">${data.invoice_meta.date}</span></div>
                <div class="pv-meta-row"><span class="pv-meta-label">Due Date</span><span class="pv-meta-value">${data.invoice_meta.dueDate}</span></div>
                <div class="pv-meta-row" style="margin-top:8px"><span class="pv-meta-label">Amount Due</span><span class="pv-meta-value pv-meta-value--total">${data.totals.totalDisplay}</span></div>
            </div>
        </div>
    </div>

    <hr class="pv-divider">

    <!-- Bill To -->
    <div class="pv-bill-section">
        <div class="pv-bill-label">Bill To</div>
        <div class="pv-bill-name">${safeClientName}</div>
        <div class="pv-bill-details">
            ${safeClientAddressLines}
            ${safeClientEmail ? `<div>${safeClientEmail}</div>` : ''}
            ${safeClientPhone ? `<div>${safeClientPhone}</div>` : ''}
        </div>
    </div>

    <!-- Items Table -->
    <table class="pv-items-table">
        <thead>
            <tr>
                <th class="pv-th pv-th--desc">Description</th>
                <th class="pv-th pv-th--num">Qty</th>
                <th class="pv-th pv-th--num">Rate</th>
                <th class="pv-th pv-th--num">Amount</th>
            </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
    </table>

    <!-- Footer: Notes + Totals -->
    <div class="pv-footer">
        <div class="pv-notes-block">
            ${safeNotes ? `<div class="pv-notes-label">Notes</div><div class="pv-notes-text">${safeNotes}</div>` : ''}
            ${safePaymentInstructions ? `<div class="pv-notes-label" style="margin-top:12px">Payment Instructions</div><div class="pv-notes-text">${safePaymentInstructions}</div>` : ''}
        </div>
        <table class="pv-totals-table">${totalsHTML}</table>
    </div>
    `;
}

function renderItemDetails(item) {
    if (!item.client && !item.consultant && !item.period && !item.notes) return '';
    const safeClient = escapeHtml(item.client || '');
    const safeConsultant = escapeHtml(item.consultant || '');
    const safePeriod = escapeHtml(item.period || '');
    const safeNotes = escapeHtml(item.notes || '');
    return `
        <div class="pv-item-detail">
            ${safeClient ? `<div><strong>Client:</strong> ${safeClient}</div>` : ''}
            ${safeConsultant ? `<div><strong>Consultant:</strong> ${safeConsultant}</div>` : ''}
            ${safePeriod ? `<div><strong>Period:</strong> ${safePeriod}</div>` : ''}
            ${safeNotes ? `<div>${safeNotes}</div>` : ''}
        </div>
    `;
}

function renderFooterNotes(data) {
    if (!data.notes && !data.payment_instructions) return '';
    const safeNotes = escapeHtml(data.notes || '');
    const safePaymentInstructions = escapeHtml(data.payment_instructions || '');
    return `
        <div class="paper-notes-section">
            ${safeNotes ? `<div><div class="paper-notes-label">Notes</div><div class="paper-notes-text">${safeNotes}</div></div>` : ''}
            ${safePaymentInstructions ? `<div style="margin-top:10px"><div class="paper-notes-label">Payment Instructions</div><div class="paper-notes-text">${safePaymentInstructions}</div></div>` : ''}
        </div>
    `;
}

export function addItem() {
    // Logic to add item card to DOM
    // ... Copying logic from app-main.js heavily but keeping it concise here
    const container = document.getElementById('itemsContainer');
    const itemCard = document.createElement('div');
    itemCard.className = 'item-card glass-panel'; // Added glass-panel class for new theme

    // ... (HTML content same as app-main.js but with class updates potentially)
    itemCard.innerHTML = `
        <button type="button" class="item-card__remove" title="Remove">×</button>
        <div class="item-card__header">
            <div class="item-card__description">
                <div class="form-field">
                    <label class="form-field__label">Description</label>
                    <input type="text" class="form-field__input item-desc" placeholder="Service or product name">
                </div>
            </div>
            <div class="item-card__amount" data-amount>$0.00</div>
        </div>
        <div class="item-card__metrics">
            <div class="form-field">
                <label class="form-field__label">Quantity</label>
                <input type="number" class="form-field__input item-qty" value="1" min="0" step="0.5">
            </div>
            <div class="form-field">
                <label class="form-field__label">Rate</label>
                <input type="number" class="form-field__input item-rate" value="0" min="0" step="0.01">
            </div>
        </div>
        <div class="item-card__details">
             <input type="hidden" class="item-consultant-id" value="">
             <input type="hidden" class="item-timesheet-ids" value="[]">
             <input type="hidden" class="item-work-month" value="">

             <div class="form-field"><input type="text" class="form-field__input item-client" placeholder="Client (optional)"></div>
             <div class="form-field"><input type="text" class="form-field__input item-consultant" placeholder="Consultant (optional)"></div>
             <div class="form-field"><input type="text" class="form-field__input item-period" placeholder="Billing Period (optional)"></div>
             <div class="form-field"><textarea class="form-field__textarea item-notes" rows="1" placeholder="Notes (optional)"></textarea></div>
        </div>
    `;

    // Bind events
    itemCard.querySelector('.item-card__remove').addEventListener('click', () => {
        if (container.children.length > 1) {
            itemCard.remove();
            updatePreview();
        } else {
            showToast('Keep at least one item', 'error');
        }
    });

    itemCard.querySelectorAll('input, textarea').forEach(el => {
        el.addEventListener('input', () => updatePreview());
    });

    container.appendChild(itemCard);
}

export function fillFormWithData(data) {
    if (!data) return;

    // Business
    if (data.business_info) {
        document.getElementById('businessName').value = data.business_info.name || '';
        document.getElementById('businessEmail').value = data.business_info.email || '';
        document.getElementById('businessPhone').value = data.business_info.phone || '';
        document.getElementById('businessAddress').value = data.business_info.address || '';
        
        // Update logo filename if applicable
        const logoName = document.getElementById('logoFileName');
        if (logoName && data.business_info.logo) {
            logoName.textContent = 'Active Branding Logo';
        }
    }

    // Client
    if (data.client_info) {
        document.getElementById('clientName').value = data.client_info.name || '';
        document.getElementById('clientEmail').value = data.client_info.email || '';
        document.getElementById('clientPhone').value = data.client_info.phone || '';
        document.getElementById('clientAddress').value = data.client_info.address || '';
    }

    // Meta
    if (data.invoice_meta) {
        document.getElementById('invoiceDate').value = data.invoice_meta.dateRaw || parseDateToInput(data.invoice_meta.date);
        document.getElementById('dueDate').value = data.invoice_meta.dueDateRaw || parseDateToInput(data.invoice_meta.dueDate);
        document.getElementById('paymentTerms').value = data.invoice_meta.terms || 'Net 30';
        document.getElementById('currency').value = data.invoice_meta.currency || 'USD';
    }

    // Invoice Number
    if (data.invoice_number) {
        document.getElementById('invoiceNumber').value = data.invoice_number;
    }

    // Settings
    if (data.settings) {
        document.getElementById('brandColor').value = data.settings.brandColor || '#3b82f6';
        document.getElementById('taxRate').value = data.settings.taxRate || 0;
        document.getElementById('discountType').value = data.settings.discountType || 'percent';
        document.getElementById('discountValue').value = data.settings.discountValue || 0;
    }

    // Notes
    document.getElementById('notes').value = data.notes || '';
    document.getElementById('paymentInstructions').value = data.payment_instructions || '';

    // Status + Paid Date
    const statusEl = document.getElementById('invoiceStatus')
    if (statusEl) {
        statusEl.value = data.status || 'draft'
        statusEl.dispatchEvent(new Event('change')) // triggers show/hide of paid date field
    }
    const paidDateEl = document.getElementById('paidDate')
    if (paidDateEl && data.paid_date) {
        paidDateEl.value = data.paid_date
    }

    // Items
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';

    if (data.items && data.items.length > 0) {
        data.items.forEach(itemData => {
            addItem();
            const lastCard = container.lastElementChild;
            lastCard.querySelector('.item-desc').value = itemData.desc || '';
            lastCard.querySelector('.item-qty').value = itemData.qty || 1;
            lastCard.querySelector('.item-rate').value = itemData.rate || 0;
            lastCard.querySelector('.item-client').value = itemData.client || '';
            lastCard.querySelector('.item-consultant').value = itemData.consultant || '';
            const consultantIdInput = lastCard.querySelector('.item-consultant-id');
            if (consultantIdInput) consultantIdInput.value = itemData.consultant_id || '';
            const timesheetIdsInput = lastCard.querySelector('.item-timesheet-ids');
            if (timesheetIdsInput) timesheetIdsInput.value = JSON.stringify(itemData.timesheet_ids || []);
            const workMonthInput = lastCard.querySelector('.item-work-month');
            if (workMonthInput) workMonthInput.value = itemData.work_month || '';
            lastCard.querySelector('.item-period').value = itemData.period || '';
            lastCard.querySelector('.item-notes').value = itemData.notes || '';
        });
    } else {
        addItem();
    }
}

export function handleLogoUpload(e, callback) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const logoBase64 = evt.target.result;
            document.getElementById('logoFileName').textContent = file.name;
            if (callback) callback(logoBase64);
        };
        reader.readAsDataURL(file);
    }
}
