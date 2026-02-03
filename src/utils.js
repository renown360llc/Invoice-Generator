export function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast show';
    if (type === 'error') {
        toast.style.backgroundColor = '#C53030';
    } else if (type === 'success') {
        toast.style.backgroundColor = '#2F855A';
    } else {
        toast.style.backgroundColor = '#333';
    }

    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}
