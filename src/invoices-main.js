import { getCurrentUser, signOut } from './auth.js'
import { getInvoices, getInvoice } from './database.js'
import { supabase } from './config.js'
import { generatePDF } from './modules/pdf.js'
import './security.js'

// State
let allInvoices = []
let filteredInvoices = []
let currentPage = 1
const itemsPerPage = 20
let invoiceToDelete = null

// Check authentication
async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) {
        window.location.href = '/login.html'
        return null
    }
    return user
}

// Helper to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast')
    toast.textContent = message
    toast.className = `toast toast--${type} toast--show`
    setTimeout(() => {
        toast.classList.remove('toast--show')
    }, 3000)
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount)
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

// State for consultant filter
let selectedConsultant = '';

// Populate Consultant Filter (Custom Dropdown)
function populateConsultantFilter() {
    const list = document.getElementById('consultantList');
    list.innerHTML = '';

    // Add "All Consultants" option
    const allOption = document.createElement('div');
    allOption.className = `custom-select__option ${selectedConsultant === '' ? 'selected' : ''}`;
    allOption.textContent = 'All Consultants';
    allOption.onclick = () => selectConsultant('', 'All Consultants');
    list.appendChild(allOption);

    const consultants = new Set();
    allInvoices.forEach(inv => {
        if (inv.items && Array.isArray(inv.items)) {
            inv.items.forEach(item => {
                if (item.consultant && item.consultant.trim()) {
                    consultants.add(item.consultant.trim());
                }
            });
        }
    });

    const sortedConsultants = Array.from(consultants).sort((a, b) => a.localeCompare(b));
    sortedConsultants.forEach(consultant => {
        const option = document.createElement('div');
        option.className = `custom-select__option ${selectedConsultant === consultant ? 'selected' : ''}`;
        option.textContent = consultant;
        option.onclick = () => selectConsultant(consultant, consultant);
        list.appendChild(option);
    });
}

// Select Consultant Helper
function selectConsultant(value, label) {
    selectedConsultant = value;

    // Update Trigger Text
    const triggerSpan = document.querySelector('.custom-select__trigger span');
    if (triggerSpan) triggerSpan.textContent = label;

    // Close Dropdown
    document.getElementById('consultantFilterContainer').classList.remove('open');

    // Re-render list to update selection styles
    populateConsultantFilter();

    // Apply Filters
    currentPage = 1;
    applyFilters();
    renderInvoices();
}

// Filter Options in Dropdown
function filterConsultantOptions(query) {
    const options = document.querySelectorAll('.custom-select__option');
    options.forEach(option => {
        if (option.textContent.toLowerCase().includes(query.toLowerCase())) {
            option.style.display = 'block';
        } else {
            option.style.display = 'none';
        }
    });
}

// Unified Filter Application
function applyFilters() {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    const sortSelect = document.getElementById('sortSelect').value;

    filteredInvoices = allInvoices.filter(inv => {
        // 1. Search Filter
        const matchesSearch = !searchQuery ||
            inv.invoice_number.toLowerCase().includes(searchQuery) ||
            inv.client_info?.name?.toLowerCase().includes(searchQuery);

        // 2. Consultant Filter
        let matchesConsultant = true;
        if (selectedConsultant) {
            matchesConsultant = inv.items?.some(item =>
                item.consultant && item.consultant.trim() === selectedConsultant
            );
        }

        return matchesSearch && matchesConsultant;
    });

    // 3. Sort
    sortInvoices(sortSelect, false); // false = don't re-render yet
}

// Search invoices (Delegates to applyFilters)
function searchInvoices() {
    currentPage = 1;
    applyFilters();
    renderInvoices();
}

// Sort invoices
function sortInvoices(sortBy, render = true) {
    switch (sortBy) {
        case 'date-desc':
            filteredInvoices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            break
        case 'date-asc':
            filteredInvoices.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            break
        case 'amount-desc':
            filteredInvoices.sort((a, b) => (b.totals?.total || 0) - (a.totals?.total || 0))
            break
        case 'amount-asc':
            filteredInvoices.sort((a, b) => (a.totals?.total || 0) - (b.totals?.total || 0))
            break
        case 'client-asc':
            filteredInvoices.sort((a, b) => {
                const nameA = a.client_info?.name || ''
                const nameB = b.client_info?.name || ''
                return nameA.localeCompare(nameB)
            })
            break
    }
    if (render) renderInvoices()
}

// Render invoices table
function renderInvoices() {
    console.log('DEBUG: renderInvoices called, count:', filteredInvoices.length);
    const tbody = document.getElementById('invoicesBody')

    if (filteredInvoices.length === 0) {
        console.log('DEBUG: Rendering empty state');
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table__empty">
                    <div class="empty-state">
                        <span class="empty-state__icon">📭</span>
                        <p class="empty-state__text">No invoices found</p>
                        <a href="app.html" class="btn btn--primary btn--sm">Create your first invoice</a>
                    </div>
                </td>
            </tr>
        `
        document.getElementById('pagination').innerHTML = ''
        return
    }

    // Pagination
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const pageInvoices = filteredInvoices.slice(startIndex, endIndex)

    // Render table rows
    tbody.innerHTML = filteredInvoices.map(invoice => `
            <tr>
                <td>${escapeHtml(invoice.invoice_number)}</td>
                <td>${escapeHtml(invoice.client_info?.name || 'N/A')}</td>
                <td>${formatDate(invoice.created_at)}</td>
                <td>${formatCurrency(invoice.totals?.total || 0)}</td>
                <td>
                    <div class="action-pills">
                        <button class="action-pill action-pill--edit" onclick="viewInvoice('${escapeHtml(invoice.invoice_number)}')">
                            Edit
                        </button>
                        <button class="action-pill action-pill--download" onclick="downloadPDF('${escapeHtml(invoice.invoice_number)}')">
                            PDF
                        </button>
                        <button class="action-pill action-pill--email" onclick="emailInvoice('${escapeHtml(invoice.invoice_number)}')">
                            Email
                        </button>
                        <button class="action-pill action-pill--delete" onclick="deleteInvoice('${invoice.id}')">
                            Del
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    // Render pagination
    renderPagination()
}

// Render pagination
function renderPagination() {
    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage)
    const pagination = document.getElementById('pagination')

    if (totalPages <= 1) {
        pagination.innerHTML = ''
        return
    }

    let html = ''

    // Previous button
    if (currentPage > 1) {
        html += `<button class="btn btn--sm" onclick="goToPage(${currentPage - 1})">← Previous</button>`
    }

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="btn btn--primary btn--sm">${i}</button>`
        } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
            html += `<button class="btn btn--sm" onclick="goToPage(${i})">${i}</button>`
        } else if (Math.abs(i - currentPage) === 2) {
            html += `<span style="padding: 0.5rem;">...</span>`
        }
    }

    // Next button
    if (currentPage < totalPages) {
        html += `<button class="btn btn--sm" onclick="goToPage(${currentPage + 1})">Next →</button>`
    }

    pagination.innerHTML = html
}

// Global functions
window.goToPage = function (page) {
    currentPage = page
    renderInvoices()
}

window.viewInvoice = function (invoiceNumber) {
    window.location.href = `app.html?invoice_number=${invoiceNumber}`
}

window.emailInvoice = async function (invoiceNumber) {
    try {
        const data = await getInvoice(invoiceNumber);
        if (!data) throw new Error('Invoice not found');

        const subject = `Invoice ${data.invoice_number} from ${data.business_info.name}`;
        const total = data.totals.totalDisplay || `$${data.totals.total}`;
        const body = `Hi ${data.client_info.name},\n\nPlease find attached invoice ${data.invoice_number} for ${total}.\n\nThank you,\n${data.business_info.name}`;
        const mailto = `mailto:${data.client_info.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
        showToast('Opening email client...', 'success');
    } catch (e) {
        console.error(e);
        showToast('Error: ' + e.message, 'error');
    }
}

window.downloadPDF = async function (invoiceNumber) {
    try {
        showToast('Generating PDF...', 'info');
        const data = await getInvoice(invoiceNumber);
        if (!data) throw new Error('Invoice not found');

        generatePDF(data);
        showToast('Download started', 'success');
    } catch (e) {
        console.error(e);
        showToast('Error: ' + e.message, 'error');
    }
}

window.deleteInvoice = function (invoiceId) {
    invoiceToDelete = invoiceId
    document.getElementById('deleteModal').style.display = 'flex'
}

// Delete confirmation
document.getElementById('confirmDelete').addEventListener('click', async () => {
    if (!invoiceToDelete) return

    try {
        const { error } = await supabase
            .from('invoices')
            .delete()
            .eq('id', invoiceToDelete)

        if (error) throw error

        showToast('Invoice deleted successfully', 'success')

        // Reload invoices
        await loadInvoices()

        // Close modal
        document.getElementById('deleteModal').style.display = 'none'
        invoiceToDelete = null

    } catch (error) {
        console.error('Delete error:', error)
        showToast('Error deleting invoice', 'error')
    }
})

document.getElementById('cancelDelete').addEventListener('click', () => {
    document.getElementById('deleteModal').style.display = 'none'
    invoiceToDelete = null
})

// Load invoices
async function loadInvoices(currentUser = null) {
    try {
        // If not passed, try to get it (though init should pass it)
        const user = currentUser || await getCurrentUser();

        allInvoices = await getInvoices(user)

        filteredInvoices = [...allInvoices]

        // Apply current sort
        const sortSelect = document.getElementById('sortSelect')

        // Populate filter based on loaded data
        populateConsultantFilter();

        // Initial filter application (handles default sort)
        applyFilters();
        renderInvoices();

    } catch (error) {
        console.error('Load invoices error:', error)
        showToast('Error loading invoices', 'error')
    }
}

// Initialize
async function init() {
    try {
        // Check authentication
        const user = await checkAuth()
        if (!user) return

        // Update user name
        const userName = user.user_metadata?.full_name || user.email.split('@')[0]
        document.getElementById('userName').textContent = userName

        // Load invoices
        await loadInvoices(user)

        // Setup event listeners
        document.getElementById('searchInput').addEventListener('input', () => {
            searchInvoices();
        });

        // Custom Dropdown Listeners
        const trigger = document.getElementById('consultantFilterTrigger');
        const searchInput = document.getElementById('consultantSearchInput');

        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent closing immediately
                const container = document.getElementById('consultantFilterContainer');
                container.classList.toggle('open');

                if (container.classList.contains('open')) {
                    searchInput.focus();
                }
            });
        }

        if (searchInput) {
            searchInput.addEventListener('click', (e) => e.stopPropagation()); // Prevent closing when clicking search
            searchInput.addEventListener('input', (e) => {
                filterConsultantOptions(e.target.value);
            });
        }

        document.getElementById('sortSelect').addEventListener('change', (e) => {
            sortInvoices(e.target.value);
        });

    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Error loading page', 'error');
    }
}

// Global Event Delegation for dynamic elements (Nav, etc.)
document.addEventListener('click', (e) => {
    // User Menu Toggle
    const userMenuBtn = e.target.closest('#userMenuBtn');
    if (userMenuBtn) {
        document.getElementById('userMenu').classList.toggle('show');
        return;
    }

    // Close Menu (Click outside)
    if (!e.target.closest('#userMenu') && !e.target.closest('#userMenuBtn')) {
        const userMenu = document.getElementById('userMenu');
        if (userMenu) userMenu.classList.remove('show');
    }

    // Close Custom Dropdown (Click outside)
    if (!e.target.closest('#consultantFilterContainer')) {
        const dropdown = document.getElementById('consultantFilterContainer');
        if (dropdown) dropdown.classList.remove('open');
    }

    // Logout
    const logoutBtn = e.target.closest('#logoutBtn');
    if (logoutBtn) {
        e.preventDefault();
        signOut();
    }
});

// Initialize on page load
init()

// Real-time Sync
const channel = new BroadcastChannel('app_channel');
channel.onmessage = (event) => {
    if (event.data.type === 'invoice_saved') {
        console.log('Received sync event, reloading...');
        loadInvoices();
        showToast('List updated', 'success');
    }
};

// Refresh Button
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('spinning');
        loadInvoices().then(() => {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
            showToast('Refreshed');
        });
    });
}
