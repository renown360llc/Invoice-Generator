/**
 * Invoice Generator Pro - Application Logic
 * Professional invoice generation with detailed line items
 */

// ============================================================================
// State Management
// ============================================================================
const state = {
    logo: null,
    items: [],
    subtotal: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 0
};

const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    CAD: '$'
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', init);

function init() {
    setDefaultDates();
    setDefaultInvoiceNumber();
    bindEventListeners();
    addItem(); // Start with one empty item
    updatePreview();
}

function setDefaultDates() {
    const today = new Date();
    const dueDate = new Date();
    dueDate.setDate(today.getDate() + 30);

    document.getElementById('invoiceDate').valueAsDate = today;
    document.getElementById('dueDate').valueAsDate = dueDate;
}

function setDefaultInvoiceNumber() {
    // Get the last invoice number from localStorage
    const lastNumber = parseInt(localStorage.getItem('lastInvoiceNumber') || '0');
    const nextNumber = lastNumber + 1;

    // Format as INV-0001, INV-0002, etc.
    const paddedNumber = String(nextNumber).padStart(4, '0');
    document.getElementById('invoiceNumber').value = `INV-${paddedNumber}`;

    // Store the new number
    localStorage.setItem('lastInvoiceNumber', nextNumber.toString());
}

// ============================================================================
// Event Binding
// ============================================================================
function bindEventListeners() {
    // Form inputs trigger preview update
    document.querySelectorAll('input, textarea, select').forEach(el => {
        el.addEventListener('input', debounce(updatePreview, 100));
        el.addEventListener('change', updatePreview);
    });

    // Logo upload
    document.getElementById('logoUpload').addEventListener('change', handleLogoUpload);

    // Action buttons
    document.getElementById('addItemBtn').addEventListener('click', addItem);
    document.getElementById('newBtn').addEventListener('click', handleNew);
    document.getElementById('saveBtn').addEventListener('click', handleSave);
    document.getElementById('printBtn').addEventListener('click', () => window.print());
    document.getElementById('downloadPdfBtn').addEventListener('click', generatePDF);

    // Template management
    document.getElementById('saveTemplateBtn').addEventListener('click', saveAsTemplate);
    document.getElementById('templateSelect').addEventListener('change', (e) => {
        loadTemplate(e.target.value);
        e.target.value = ''; // Reset dropdown
    });

    // Initialize template dropdown
    updateTemplateDropdown();
}

function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            state.logo = evt.target.result;
            document.getElementById('logoFileName').textContent = file.name;
            updatePreview();
        };
        reader.readAsDataURL(file);
    }
}

function handleNew() {
    if (confirm('Start a new invoice? All current data will be cleared.')) {
        document.getElementById('invoiceForm').reset();
        document.getElementById('itemsContainer').innerHTML = '';
        state.logo = null;
        document.getElementById('logoFileName').textContent = 'Choose Logo';
        setDefaultDates();
        setDefaultInvoiceNumber();
        addItem();
        updatePreview();
        showToast('New invoice created');
    }
}

function handleSave() {
    const invoiceNumber = document.getElementById('invoiceNumber').value || 'INV-DRAFT';

    // Gather all form data
    const invoiceData = {
        business: {
            name: document.getElementById('businessName').value,
            email: document.getElementById('businessEmail').value,
            phone: document.getElementById('businessPhone').value,
            address: document.getElementById('businessAddress').value,
            logo: state.logo
        },
        client: {
            name: document.getElementById('clientName').value,
            email: document.getElementById('clientEmail').value,
            phone: document.getElementById('clientPhone').value,
            address: document.getElementById('clientAddress').value
        },
        invoice: {
            number: invoiceNumber,
            date: document.getElementById('invoiceDate').value,
            dueDate: document.getElementById('dueDate').value,
            terms: document.getElementById('paymentTerms').value,
            currency: document.getElementById('currency').value
        },
        settings: {
            brandColor: document.getElementById('brandColor').value,
            taxRate: document.getElementById('taxRate').value,
            discountType: document.getElementById('discountType').value,
            discountValue: document.getElementById('discountValue').value
        },
        items: [],
        notes: document.getElementById('notes').value,
        paymentInstructions: document.getElementById('paymentInstructions').value,
        savedAt: new Date().toISOString()
    };

    // Gather items
    document.querySelectorAll('.item-card').forEach(card => {
        invoiceData.items.push({
            desc: card.querySelector('.item-desc').value,
            qty: card.querySelector('.item-qty').value,
            rate: card.querySelector('.item-rate').value,
            client: card.querySelector('.item-client').value,
            consultant: card.querySelector('.item-consultant').value,
            period: card.querySelector('.item-period').value,
            notes: card.querySelector('.item-notes').value
        });
    });

    // Save to localStorage
    const savedInvoices = JSON.parse(localStorage.getItem('savedInvoices') || '{}');
    savedInvoices[invoiceNumber] = invoiceData;
    localStorage.setItem('savedInvoices', JSON.stringify(savedInvoices));

    // Update the load dropdown
    updateLoadDropdown();

    showToast(`Invoice "${invoiceNumber}" saved to browser storage`);
}

function updateLoadDropdown() {
    const select = document.getElementById('loadInvoiceSelect') || createLoadSelect();
    if (!select) return;

    const savedInvoices = JSON.parse(localStorage.getItem('savedInvoices') || '{}');
    const invoiceNumbers = Object.keys(savedInvoices);

    // Clear existing options except first
    select.innerHTML = '<option value="">Load saved...</option>';

    invoiceNumbers.forEach(num => {
        const option = document.createElement('option');
        option.value = num;
        const savedAt = new Date(savedInvoices[num].savedAt).toLocaleDateString();
        option.textContent = `${num} (${savedAt})`;
        select.appendChild(option);
    });
}

function loadInvoice(invoiceNumber) {
    if (!invoiceNumber) return;

    const savedInvoices = JSON.parse(localStorage.getItem('savedInvoices') || '{}');
    const data = savedInvoices[invoiceNumber];

    if (!data) {
        showToast('Invoice not found');
        return;
    }

    // Load business info
    document.getElementById('businessName').value = data.business.name || '';
    document.getElementById('businessEmail').value = data.business.email || '';
    document.getElementById('businessPhone').value = data.business.phone || '';
    document.getElementById('businessAddress').value = data.business.address || '';
    state.logo = data.business.logo || null;
    if (state.logo) {
        document.getElementById('logoFileName').textContent = 'Logo loaded';
    }

    // Load client info
    document.getElementById('clientName').value = data.client.name || '';
    document.getElementById('clientEmail').value = data.client.email || '';
    document.getElementById('clientPhone').value = data.client.phone || '';
    document.getElementById('clientAddress').value = data.client.address || '';

    // Load invoice meta
    document.getElementById('invoiceNumber').value = data.invoice.number || '';
    document.getElementById('invoiceDate').value = data.invoice.date || '';
    document.getElementById('dueDate').value = data.invoice.dueDate || '';
    document.getElementById('paymentTerms').value = data.invoice.terms || 'Net 30';
    document.getElementById('currency').value = data.invoice.currency || 'USD';

    // Load settings
    document.getElementById('brandColor').value = data.settings.brandColor || '#2563eb';
    document.getElementById('taxRate').value = data.settings.taxRate || 0;
    document.getElementById('discountType').value = data.settings.discountType || 'percent';
    document.getElementById('discountValue').value = data.settings.discountValue || 0;

    // Load notes
    document.getElementById('notes').value = data.notes || '';
    document.getElementById('paymentInstructions').value = data.paymentInstructions || '';

    // Load items
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
            updateItemAmount(lastCard);
        });
    } else {
        addItem();
    }

    calculateTotals();
    updatePreview();
    showToast(`Loaded invoice "${invoiceNumber}"`);
}

// ============================================================================
// Template Management
// ============================================================================
function saveAsTemplate() {
    const templateName = prompt('Enter a name for this template (e.g., "Acme Corp - Consulting"):');
    if (!templateName || !templateName.trim()) return;

    const templateData = {
        name: templateName.trim(),
        business: {
            name: document.getElementById('businessName').value,
            email: document.getElementById('businessEmail').value,
            phone: document.getElementById('businessPhone').value,
            address: document.getElementById('businessAddress').value,
            logo: state.logo
        },
        client: {
            name: document.getElementById('clientName').value,
            email: document.getElementById('clientEmail').value,
            phone: document.getElementById('clientPhone').value,
            address: document.getElementById('clientAddress').value
        },
        settings: {
            brandColor: document.getElementById('brandColor').value,
            currency: document.getElementById('currency').value,
            terms: document.getElementById('paymentTerms').value,
            taxRate: document.getElementById('taxRate').value
        },
        createdAt: new Date().toISOString()
    };

    // Save to localStorage
    const templates = JSON.parse(localStorage.getItem('invoiceTemplates') || '{}');
    templates[templateName] = templateData;
    localStorage.setItem('invoiceTemplates', JSON.stringify(templates));

    updateTemplateDropdown();
    showToast(`Template "${templateName}" saved successfully`);
}

function loadTemplate(templateName) {
    if (!templateName) return;

    const templates = JSON.parse(localStorage.getItem('invoiceTemplates') || '{}');
    const template = templates[templateName];

    if (!template) {
        showToast('Template not found');
        return;
    }

    // Load business info
    document.getElementById('businessName').value = template.business.name || '';
    document.getElementById('businessEmail').value = template.business.email || '';
    document.getElementById('businessPhone').value = template.business.phone || '';
    document.getElementById('businessAddress').value = template.business.address || '';
    state.logo = template.business.logo || null;
    if (state.logo) {
        document.getElementById('logoFileName').textContent = 'Logo loaded';
    }

    // Load client info
    document.getElementById('clientName').value = template.client.name || '';
    document.getElementById('clientEmail').value = template.client.email || '';
    document.getElementById('clientPhone').value = template.client.phone || '';
    document.getElementById('clientAddress').value = template.client.address || '';

    // Load settings
    document.getElementById('brandColor').value = template.settings.brandColor || '#000000';
    document.getElementById('currency').value = template.settings.currency || 'USD';
    document.getElementById('paymentTerms').value = template.settings.terms || 'Net 30';
    document.getElementById('taxRate').value = template.settings.taxRate || 0;

    // Set new invoice number and dates
    setDefaultInvoiceNumber();
    setDefaultDates();

    // Clear items - user will add new ones
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';
    addItem();

    calculateTotals();
    updatePreview();
    showToast(`Template "${templateName}" loaded - ready for new invoice`);
}

function updateTemplateDropdown() {
    const select = document.getElementById('templateSelect');
    if (!select) return;

    const templates = JSON.parse(localStorage.getItem('invoiceTemplates') || '{}');
    const templateNames = Object.keys(templates);

    // Clear existing options except first
    select.innerHTML = '<option value="">Load template...</option>';

    templateNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}

function deleteTemplate(templateName) {
    if (!confirm(`Delete template "${templateName}"?`)) return;

    const templates = JSON.parse(localStorage.getItem('invoiceTemplates') || '{}');
    delete templates[templateName];
    localStorage.setItem('invoiceTemplates', JSON.stringify(templates));

    updateTemplateDropdown();
    showToast(`Template "${templateName}" deleted`);
}


// ============================================================================
// Line Item Management
// ============================================================================
function addItem() {
    const container = document.getElementById('itemsContainer');
    const itemId = `item-${Date.now()}`;

    const itemCard = document.createElement('div');
    itemCard.className = 'item-card';
    itemCard.dataset.id = itemId;

    itemCard.innerHTML = `
        <button type="button" class="item-card__remove" title="Remove Item">×</button>
        
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
            <div></div>
        </div>
        
        <div class="item-card__details">
            <div class="form-field">
                <label class="form-field__label">Client Name (optional)</label>
                <input type="text" class="form-field__input item-client" placeholder="Client for this service">
            </div>
            <div class="form-field">
                <label class="form-field__label">Consultant Name (optional)</label>
                <input type="text" class="form-field__input item-consultant" placeholder="Consultant assigned">
            </div>
            <div class="form-field item-card__details-full">
                <label class="form-field__label">Billing Period (optional)</label>
                <input type="text" class="form-field__input item-period" placeholder="e.g., Jan 1 - Jan 15, 2024">
            </div>
            <div class="form-field item-card__details-full">
                <label class="form-field__label">Notes (optional)</label>
                <textarea class="form-field__textarea item-notes" rows="2" placeholder="Additional details about this line item..."></textarea>
            </div>
        </div>
    `;

    // Bind remove button
    itemCard.querySelector('.item-card__remove').addEventListener('click', () => {
        if (container.children.length > 1) {
            itemCard.remove();
            calculateTotals();
            updatePreview();
        } else {
            showToast('At least one item is required');
        }
    });

    // Bind input changes
    itemCard.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('input', () => {
            updateItemAmount(itemCard);
            calculateTotals();
            updatePreview();
        });
    });

    container.appendChild(itemCard);
    updateItemAmount(itemCard);
}

function updateItemAmount(itemCard) {
    const qty = parseFloat(itemCard.querySelector('.item-qty').value) || 0;
    const rate = parseFloat(itemCard.querySelector('.item-rate').value) || 0;
    const amount = qty * rate;

    const currency = document.getElementById('currency').value;
    itemCard.querySelector('[data-amount]').textContent = formatCurrency(amount, currency);
    itemCard.dataset.amount = amount;
}

// ============================================================================
// Calculations
// ============================================================================
function calculateTotals() {
    let subtotal = 0;

    document.querySelectorAll('.item-card').forEach(card => {
        subtotal += parseFloat(card.dataset.amount) || 0;
    });

    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    const taxAmount = subtotal * (taxRate / 100);

    const discountType = document.getElementById('discountType').value;
    const discountValue = parseFloat(document.getElementById('discountValue').value) || 0;
    const discountAmount = discountType === 'percent'
        ? subtotal * (discountValue / 100)
        : discountValue;

    const total = subtotal + taxAmount - discountAmount;

    // Update state
    state.subtotal = subtotal;
    state.taxAmount = taxAmount;
    state.discountAmount = discountAmount;
    state.total = total;

    // Update display
    const currency = document.getElementById('currency').value;
    document.getElementById('subtotalDisplay').textContent = formatCurrency(subtotal, currency);
    document.getElementById('taxDisplay').textContent = formatCurrency(taxAmount, currency);
    document.getElementById('discountDisplay').textContent = `-${formatCurrency(discountAmount, currency)}`;
    document.getElementById('totalDisplay').textContent = formatCurrency(total, currency);
}

function formatCurrency(amount, currencyCode = 'USD') {
    const symbol = CURRENCY_SYMBOLS[currencyCode] || '$';
    return `${symbol}${amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// ============================================================================
// Preview Generation
// ============================================================================
function updatePreview() {
    calculateTotals();

    const preview = document.getElementById('invoicePreview');
    const currency = document.getElementById('currency').value;
    const brandColor = document.getElementById('brandColor').value;

    // Gather business info
    const business = {
        name: document.getElementById('businessName').value || 'Your Company Name',
        email: document.getElementById('businessEmail').value,
        phone: document.getElementById('businessPhone').value,
        address: document.getElementById('businessAddress').value
    };

    // Gather client info
    const client = {
        name: document.getElementById('clientName').value || 'Client Name',
        email: document.getElementById('clientEmail').value,
        phone: document.getElementById('clientPhone').value,
        address: document.getElementById('clientAddress').value
    };
    console.log('DEBUG: updatePreview client data:', client); // Debug log

    // Gather invoice meta
    const invoiceMeta = {
        number: document.getElementById('invoiceNumber').value,
        date: formatDate(document.getElementById('invoiceDate').value),
        dueDate: formatDate(document.getElementById('dueDate').value),
        terms: document.getElementById('paymentTerms').value
    };

    // Gather items
    const items = [];
    document.querySelectorAll('.item-card').forEach(card => {
        const desc = card.querySelector('.item-desc').value;
        const qty = parseFloat(card.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(card.querySelector('.item-rate').value) || 0;
        const amount = parseFloat(card.dataset.amount) || 0;

        // Optional details
        const clientName = card.querySelector('.item-client').value;
        const consultant = card.querySelector('.item-consultant').value;
        const period = card.querySelector('.item-period').value;
        const notes = card.querySelector('.item-notes').value;

        items.push({ desc, qty, rate, amount, clientName, consultant, period, notes });
    });

    // Gather notes
    const notes = document.getElementById('notes').value;
    const paymentInstructions = document.getElementById('paymentInstructions').value;

    // Build items HTML
    let itemsHTML = items.map(item => {
        let detailsHTML = '';

        if (item.clientName || item.consultant || item.period || item.notes) {
            detailsHTML = '<div class="paper-item-details">';

            if (item.clientName) {
                detailsHTML += `<div class="paper-item-detail-line"><span class="paper-item-detail-label">Client Name:</span> ${escapeHtml(item.clientName)}</div>`;
            }
            if (item.consultant) {
                detailsHTML += `<div class="paper-item-detail-line"><span class="paper-item-detail-label">Consultant Name:</span> ${escapeHtml(item.consultant)}</div>`;
            }
            if (item.period) {
                detailsHTML += `<div class="paper-item-detail-line"><span class="paper-item-detail-label">Billing Period:</span> ${escapeHtml(item.period)}</div>`;
            }
            if (item.notes) {
                detailsHTML += `<div class="paper-item-detail-line" style="margin-top: 4px;">${escapeHtml(item.notes)}</div>`;
            }

            detailsHTML += '</div>';
        }

        return `
            <div class="paper-item">
                <div class="paper-item-row">
                    <div class="paper-item-desc">
                        <div class="paper-item-title">${escapeHtml(item.desc || 'Item')}</div>
                        ${detailsHTML}
                    </div>
                    <div class="paper-item-metrics">
                        <div class="paper-item-metric">
                            <div class="paper-item-metric-label">Qty</div>
                            <div>${item.qty}</div>
                        </div>
                        <div class="paper-item-metric">
                            <div class="paper-item-metric-label">Rate</div>
                            <div>${formatCurrency(item.rate, currency)}</div>
                        </div>
                    </div>
                    <div class="paper-item-amount">${formatCurrency(item.amount, currency)}</div>
                </div>
            </div>
        `;
    }).join('');

    // Build footer notes HTML
    let footerNotesHTML = '';
    if (notes || paymentInstructions) {
        footerNotesHTML = '<div class="paper-notes-section">';
        if (notes) {
            footerNotesHTML += `
                <div style="margin-bottom: 16px;">
                    <div class="paper-notes-label">Notes</div>
                    <div class="paper-notes-text">${notes}</div>
                </div>
            `;
        }
        if (paymentInstructions) {
            footerNotesHTML += `
                <div>
                    <div class="paper-notes-label">Payment Instructions</div>
                    <div class="paper-notes-text">${paymentInstructions}</div>
                </div>
            `;
        }
        footerNotesHTML += '</div>';
    }

    // Render preview
    preview.innerHTML = `
        <!-- Header -->
        <div class="paper-header">
            <div>
                ${state.logo ? `<img src="${escapeHtml(state.logo)}" class="paper-logo" alt="Logo">` : ''}
                <div class="paper-company-name" style="color: ${brandColor}">${escapeHtml(business.name)}</div>
                <div class="paper-company-details">
                    ${business.address ? `<div>${escapeHtml(business.address).replace(/\n/g, '<br>')}</div>` : ''}
                    ${business.email ? `<div>${escapeHtml(business.email)}</div>` : ''}
                    ${business.phone ? `<div>${escapeHtml(business.phone)}</div>` : ''}
                </div>
            </div>
            <div class="paper-invoice-block">
                <div class="paper-invoice-title">Invoice</div>
                <div class="paper-meta-table">
                    <div class="paper-meta-label">Invoice #</div>
                    <div class="paper-meta-value">${escapeHtml(invoiceMeta.number)}</div>
                    
                    <div class="paper-meta-label">Date</div>
                    <div class="paper-meta-value">${escapeHtml(invoiceMeta.date)}</div>
                    
                    <div class="paper-meta-label">Due Date</div>
                    <div class="paper-meta-value">${escapeHtml(invoiceMeta.dueDate)}</div>
                    
                    <div class="paper-meta-label">Amount Due</div>
                    <div class="paper-meta-value paper-meta-value--highlight" style="color: ${brandColor}">${formatCurrency(state.total, currency)}</div>
                </div>
            </div>
        </div>
        
        <!-- Bill To -->
        <div class="paper-addresses">
            <div class="paper-address-label">Bill To</div>
            <div class="paper-client-name">${escapeHtml(client.name)}</div>
            <div class="paper-client-details">
                ${client.address ? `<div>${escapeHtml(client.address).replace(/\n/g, '<br>')}</div>` : ''}
                ${client.email ? `<div>${escapeHtml(client.email)}</div>` : ''}
                ${client.phone ? `<div>${escapeHtml(client.phone)}</div>` : ''}
            </div>
        </div>
        
        <!-- Items Table -->
        <div class="paper-items-section">
            <div class="paper-items-header">
                <div class="paper-items-header-desc">Items</div>
                <div class="paper-items-header-cols">
                    <div class="paper-items-header-col">Qty</div>
                    <div class="paper-items-header-col">Rate</div>
                    <div class="paper-items-header-col">Amount</div>
                </div>
            </div>
            <div class="paper-items-list">
                ${itemsHTML}
            </div>
        </div>
        
        <!-- Footer -->
        <div class="paper-footer">
            ${footerNotesHTML}
            <div class="paper-totals-section" style="${!footerNotesHTML ? 'margin-left: auto;' : ''}">
                <div class="paper-totals-row">
                    <span class="paper-totals-label">Subtotal</span>
                    <span class="paper-totals-value">${formatCurrency(state.subtotal, currency)}</span>
                </div>
                ${state.taxAmount > 0 ? `
                    <div class="paper-totals-row">
                        <span class="paper-totals-label">Tax (${document.getElementById('taxRate').value}%)</span>
                        <span class="paper-totals-value">${formatCurrency(state.taxAmount, currency)}</span>
                    </div>
                ` : ''}
                ${state.discountAmount > 0 ? `
                    <div class="paper-totals-row">
                        <span class="paper-totals-label">Discount</span>
                        <span class="paper-totals-value">-${formatCurrency(state.discountAmount, currency)}</span>
                    </div>
                ` : ''}
                <div class="paper-totals-row paper-totals-row--grand">
                    <span class="paper-totals-label">Amount Due</span>
                    <span class="paper-totals-value" style="color: ${brandColor}">${formatCurrency(state.total, currency)}</span>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// PDF Generation
// ============================================================================
async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const currency = document.getElementById('currency').value;
    const brandColor = document.getElementById('brandColor').value;
    const rgb = hexToRgb(brandColor);

    let y = 20;
    const marginLeft = 20;
    const pageWidth = 190;

    // Logo
    if (state.logo) {
        try {
            doc.addImage(state.logo, 'JPEG', marginLeft, y, 40, 0);
            y += 25;
        } catch (e) {
            console.warn('Could not add logo:', e);
        }
    }

    // Company Name
    doc.setFontSize(18);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.setFont(undefined, 'bold');
    doc.text(document.getElementById('businessName').value || 'Your Company', marginLeft, y);

    // Company Details
    y += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);

    const bizAddress = document.getElementById('businessAddress').value;
    const bizEmail = document.getElementById('businessEmail').value;
    const bizPhone = document.getElementById('businessPhone').value;

    if (bizAddress) {
        bizAddress.split('\n').forEach(line => {
            doc.text(line, marginLeft, y);
            y += 4;
        });
    }
    if (bizEmail) { doc.text(bizEmail, marginLeft, y); y += 4; }
    if (bizPhone) { doc.text(bizPhone, marginLeft, y); y += 4; }

    // Invoice Title (right side)
    doc.setFontSize(28);
    doc.setTextColor(180, 180, 180);
    doc.setFont(undefined, 'normal');
    doc.text('INVOICE', 190, 30, { align: 'right' });

    // Invoice Meta (right side)
    doc.setFontSize(10);
    let metaY = 40;

    const invoiceNum = document.getElementById('invoiceNumber').value;
    const invoiceDate = formatDate(document.getElementById('invoiceDate').value);
    const dueDate = formatDate(document.getElementById('dueDate').value);
    const terms = document.getElementById('paymentTerms').value;

    const metaItems = [
        ['Invoice #', invoiceNum],
        ['Date', invoiceDate],
        ['Due Date', dueDate],
        ['Terms', terms]
    ];

    metaItems.forEach(([label, value]) => {
        doc.setTextColor(120, 120, 120);
        doc.text(label, 155, metaY, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(value, 190, metaY, { align: 'right' });
        doc.setFont(undefined, 'normal');
        metaY += 6;
    });

    // Bill To
    y = Math.max(y, metaY) + 10;

    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, 190, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.setFont(undefined, 'bold');
    doc.text('BILL TO', marginLeft, y);
    y += 6;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(document.getElementById('clientName').value || 'Client Name', marginLeft, y);
    y += 5;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80, 80, 80);

    const clientAddress = document.getElementById('clientAddress').value;
    const clientEmail = document.getElementById('clientEmail').value;
    const clientPhone = document.getElementById('clientPhone').value;

    if (clientAddress) {
        clientAddress.split('\n').forEach(line => {
            if (line.trim()) {
                doc.text(line, marginLeft, y);
                y += 4;
            }
        });
    }
    if (clientEmail) { doc.text(clientEmail, marginLeft, y); y += 4; }
    if (clientPhone) { doc.text(clientPhone, marginLeft, y); y += 4; }

    y += 10;
    doc.line(marginLeft, y, 190, y);
    y += 10;

    // Items Table
    const tableBody = [];

    document.querySelectorAll('.item-card').forEach(card => {
        const desc = card.querySelector('.item-desc').value || 'Item';
        const qty = card.querySelector('.item-qty').value;
        const rate = parseFloat(card.querySelector('.item-rate').value) || 0;
        const amount = parseFloat(card.dataset.amount) || 0;

        // Build description with details
        let fullDesc = desc;
        const clientName = card.querySelector('.item-client').value;
        const consultant = card.querySelector('.item-consultant').value;
        const period = card.querySelector('.item-period').value;
        const notes = card.querySelector('.item-notes').value;

        const details = [];
        if (clientName) details.push(`Client Name: ${clientName}`);
        if (consultant) details.push(`Consultant Name: ${consultant}`);
        if (period) details.push(`Billing Period: ${period}`);
        if (notes) details.push(notes);

        if (details.length > 0) {
            fullDesc += '\n' + details.join('\n');
        }

        tableBody.push([
            fullDesc,
            qty,
            formatCurrency(rate, currency),
            formatCurrency(amount, currency)
        ]);
    });

    doc.autoTable({
        startY: y,
        head: [['Description', 'Qty', 'Rate', 'Amount']],
        body: tableBody,
        theme: 'plain',
        margin: { left: marginLeft, right: 20 },
        headStyles: {
            fillColor: [249, 250, 251],
            textColor: [100, 100, 100],
            fontSize: 9,
            fontStyle: 'bold',
            cellPadding: 4
        },
        styles: {
            fontSize: 10,
            cellPadding: 5,
            textColor: [50, 50, 50],
            lineColor: [230, 230, 230],
            lineWidth: 0.1
        },
        columnStyles: {
            0: { cellWidth: 90 },
            1: { halign: 'center', cellWidth: 25 },
            2: { halign: 'right', cellWidth: 35 },
            3: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
        }
    });

    // Totals
    let finalY = doc.lastAutoTable.finalY + 15;

    // Notes (left side)
    const notes = document.getElementById('notes').value;
    if (notes) {
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.setFont(undefined, 'bold');
        doc.text('NOTES', marginLeft, finalY);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(80, 80, 80);
        const splitNotes = doc.splitTextToSize(notes, 80);
        doc.text(splitNotes, marginLeft, finalY + 5);
    }

    // Totals (right side)
    const totalsX = 140;
    const valuesX = 190;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);

    doc.text('Subtotal', totalsX, finalY);
    doc.text(formatCurrency(state.subtotal, currency), valuesX, finalY, { align: 'right' });

    if (state.taxAmount > 0) {
        finalY += 6;
        doc.text(`Tax (${document.getElementById('taxRate').value}%)`, totalsX, finalY);
        doc.text(formatCurrency(state.taxAmount, currency), valuesX, finalY, { align: 'right' });
    }

    if (state.discountAmount > 0) {
        finalY += 6;
        doc.text('Discount', totalsX, finalY);
        doc.text(`-${formatCurrency(state.discountAmount, currency)}`, valuesX, finalY, { align: 'right' });
    }

    // Total Due
    finalY += 10;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(totalsX, finalY - 2, valuesX, finalY - 2);

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Amount Due', totalsX, finalY + 4);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text(formatCurrency(state.total, currency), valuesX, finalY + 4, { align: 'right' });

    // Save
    const invoiceNum2 = document.getElementById('invoiceNumber').value;
    doc.save(`Invoice_${invoiceNum2}.pdf`);
    showToast('PDF downloaded successfully!');
}

// ============================================================================
// Utility Functions
// ============================================================================
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    // console.log('DEBUG: escapeHtml input:', unsafe);
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('toast--visible');

    setTimeout(() => {
        toast.classList.remove('toast--visible');
    }, 3000);
}
