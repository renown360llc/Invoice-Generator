/**
 * Utility Functions
 */

export function debounce(func, wait) {
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

export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast toast--${type} toast--show`;
    setTimeout(() => {
        toast.classList.remove('toast--show');
    }, 3000);
}

const CURRENCY_SYMBOLS = {
    USD: 'USD $',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    CAD: 'CAD $'
};

export function formatCurrency(amount, currencyCode = 'USD') {
    const symbol = CURRENCY_SYMBOLS[currencyCode] || '$';
    return `${symbol}${amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

export function parseDateToInput(displayDate) {
    if (!displayDate) return '';
    try {
        const date = new Date(displayDate);
        if (isNaN(date.getTime())) return '';
        // Use local time components to avoid timezone shifts from toISOString()
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return '';
    }
}
