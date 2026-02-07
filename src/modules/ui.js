/**
 * UI Module
 * Handles DOM manipulation, event listeners, and preview rendering.
 */

import { formatCurrency, formatDate, parseDateToInput, showToast } from './utils.js';

// ... (rest of imports/code)



// Re-using the logic from app-main.js but cleanly componentized

export function gatherFormData() {
    const items = [];
    document.querySelectorAll('.item-card').forEach(card => {
        const qty = parseFloat(card.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(card.querySelector('.item-rate').value) || 0;
        items.push({
            desc: card.querySelector('.item-desc').value,
            qty: qty,
            rate: rate,
            amount: qty * rate,
            amountDisplay: card.querySelector('[data-amount]').textContent,
            client: card.querySelector('.item-client').value,
            consultant: card.querySelector('.item-consultant').value,
            period: card.querySelector('.item-period').value,
            notes: card.querySelector('.item-notes').value
        });
    });

    const subtotal = parseFloat(document.getElementById('subtotalDisplay').dataset.raw || 0);
    const taxAmount = parseFloat(document.getElementById('taxDisplay').dataset.raw || 0);
    const discountAmount = parseFloat(document.getElementById('discountDisplay').dataset.raw || 0);
    const total = parseFloat(document.getElementById('totalDisplay').dataset.raw || 0);

    return {
        invoice_number: document.getElementById('invoiceNumber').value,
        status: 'Draft',
        business_info: {
            name: document.getElementById('businessName').value,
            email: document.getElementById('businessEmail').value,
            phone: document.getElementById('businessPhone').value,
            address: document.getElementById('businessAddress').value,
            logo: document.querySelector('.paper-logo')?.src
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
    const currency = document.getElementById('currency').value;
    const brandColor = document.getElementById('brandColor').value;

    // Gather data purely for rendering (similar to gatherFormData but lighter)
    const data = gatherFormData(); // Reuse gather logic? Or simple read?
    // Using gatherFormData is safest to ensure PDF and Preview match.

    // Reuse the exact HTML template logic from before
    // ...
    // Note: I will reimplement the render logic here to match the Crystal Air theme structure
    // or keep the old one for now and update later?
    // Plan: keep functional parity first.

    let itemsHTML = data.items.map(item => `
        <div class="paper-item">
            <div class="paper-item-row">
                <div class="paper-item-desc">
                    <div class="paper-item-title">${item.desc || 'Item'}</div>
                    ${renderItemDetails(item)}
                </div>
                <div class="paper-item-metrics">
                    <div class="paper-item-metric"><div>${item.qty}</div></div>
                    <div class="paper-item-metric"><div>${formatCurrency(item.rate, data.invoice_meta.currency)}</div></div>
                </div>
                <div class="paper-item-amount">${item.amountDisplay}</div>
            </div>
        </div>
    `).join('');

    preview.innerHTML = `
        <div class="paper-header">
            <div>
                ${state.logo ? `<img src="${state.logo}" class="paper-logo" alt="Logo">` : ''}
                <div class="paper-company-name" style="color: ${brandColor}">${data.business_info.name || 'Your Company'}</div>
                <div class="paper-company-details">
                    ${(data.business_info.address || '').split('\n').map(l => `<div>${l}</div>`).join('')}
                    ${data.business_info.email ? `<div>${data.business_info.email}</div>` : ''}
                    ${data.business_info.phone ? `<div>${data.business_info.phone}</div>` : ''}
                </div>
            </div>
            <div class="paper-invoice-block">
                <div class="paper-invoice-title">INVOICE</div>
                <div class="paper-meta-table">
                    <div class="paper-meta-label">Invoice #</div><div class="paper-meta-value">${data.invoice_number}</div>
                    <div class="paper-meta-label">Date</div><div class="paper-meta-value">${data.invoice_meta.date}</div>
                    <div class="paper-meta-label">Due Date</div><div class="paper-meta-value">${data.invoice_meta.dueDate}</div>
                    <div class="paper-meta-label">Amount Due</div><div class="paper-meta-value paper-meta-value--highlight" style="color:${brandColor}">${data.totals.totalDisplay}</div>
                </div>
            </div>
        </div>
        
        <div class="paper-addresses">
            <div class="paper-address-label">Bill To</div>
            <div class="paper-client-name">${data.client_info.name}</div>
            <div class="paper-client-details">
                ${(data.client_info.address || '').split('\n').map(l => `<div>${l}</div>`).join('')}
                ${data.client_info.email ? `<div>${data.client_info.email}</div>` : ''}
                ${data.client_info.phone ? `<div>${data.client_info.phone}</div>` : ''}
            </div>
        </div>
        
        <div class="paper-items-section">
            <div class="paper-items-header">
                <div class="paper-items-header-desc">Items</div>
                <div class="paper-items-header-cols">
                    <div class="paper-items-header-col">Qty</div>
                    <div class="paper-items-header-col">Rate</div>
                    <div class="paper-items-header-col">Amount</div>
                </div>
            </div>
            <div class="paper-items-list">${itemsHTML}</div>
        </div>
        
        <div class="paper-footer">
            ${renderFooterNotes(data)}
            <div class="paper-totals-section" style="margin-left:auto">
                <div class="paper-totals-row"><span class="paper-totals-label">Subtotal</span><span class="paper-totals-value">${data.totals.subtotalDisplay}</span></div>
                ${data.totals.taxAmount > 0 ? `<div class="paper-totals-row"><span class="paper-totals-label">Tax</span><span class="paper-totals-value">${data.totals.taxDisplay}</span></div>` : ''}
                ${data.totals.discountAmount > 0 ? `<div class="paper-totals-row"><span class="paper-totals-label">Discount</span><span class="paper-totals-value">${data.totals.discountDisplay}</span></div>` : ''}
                <div class="paper-totals-row paper-totals-row--grand"><span class="paper-totals-label">Total Due</span><span class="paper-totals-value" style="color:${brandColor}">${data.totals.totalDisplay}</span></div>
            </div>
        </div>
    `;
}

function renderItemDetails(item) {
    if (!item.client && !item.consultant && !item.period && !item.notes) return '';
    return `
        <div class="paper-item-details">
            ${item.client ? `<div class="paper-item-detail-line"><span class="paper-item-detail-label">Client:</span> ${item.client}</div>` : ''}
            ${item.consultant ? `<div class="paper-item-detail-line"><span class="paper-item-detail-label">Consultant:</span> ${item.consultant}</div>` : ''}
            ${item.period ? `<div class="paper-item-detail-line"><span class="paper-item-detail-label">Period:</span> ${item.period}</div>` : ''}
            ${item.notes ? `<div class="paper-item-detail-line">${item.notes}</div>` : ''}
        </div>
    `;
}

function renderFooterNotes(data) {
    if (!data.notes && !data.payment_instructions) return '';
    return `
        <div class="paper-notes-section">
            ${data.notes ? `<div><div class="paper-notes-label">Notes</div><div class="paper-notes-text">${data.notes}</div></div>` : ''}
            ${data.payment_instructions ? `<div style="margin-top:10px"><div class="paper-notes-label">Payment Instructions</div><div class="paper-notes-text">${data.payment_instructions}</div></div>` : ''}
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
        // Logo is handled via state usually, but valid reference in preview image can work for now
        // or we pass state?
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
