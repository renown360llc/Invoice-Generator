/**
 * PDF Generation Module
 * Handles generating the PDF invoice using jsPDF.
 */

import { hexToRgb, formatCurrency } from './utils.js';

export function generatePDF(data) {
    if (!window.jspdf) {
        console.error('jsPDF not loaded');
        alert('PDF library not loaded. Please refresh the page.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    // Config
    const margin = 20;
    let y = margin;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);

    // Colors
    const brandColor = data.settings.brandColor || '#3b82f6';
    const rgb = hexToRgb(brandColor);

    // --- Header ---

    // Logo
    if (data.business_info.logo) {
        try {
            // Check if logo is data URL or standard URL
            // For simple implementation, assuming data URL or accessible URL
            // doc.addImage is synchronous for data URLs usually
            doc.addImage(data.business_info.logo, 'JPEG', margin, y, 40, 20);
            // Note: Aspect ratio should be handled, but hardcoded 40x20 for now safety
            // Or we just add it and let it scale? 
            // Better to check image dimensions if possible, but let's stick to simple layout
            y += 25;
        } catch (e) {
            console.warn('PDF Logo error:', e);
        }
    }

    // Business Info
    doc.setFontSize(18);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.setFont('helvetica', 'bold');
    doc.text(data.business_info.name || 'Company Name', margin, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);

    const bizAddressLines = (data.business_info.address || '').split('\n');
    bizAddressLines.forEach(line => {
        doc.text(line, margin, y);
        y += 4;
    });
    if (data.business_info.email) { doc.text(data.business_info.email, margin, y); y += 4; }
    if (data.business_info.phone) { doc.text(data.business_info.phone, margin, y); y += 4; }

    // Invoice Title & Meta (Right Adjusted)
    // We restart Y for the right column but ensure we don't overlap if left is huge
    let metaY = margin + 10;
    const rightX = pageWidth - margin;

    doc.setFontSize(24);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', rightX, metaY, { align: 'right' });
    metaY += 10;

    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'bold');

    const metaRows = [
        ['Invoice #:', data.invoice_number],
        ['Date:', data.invoice_meta.date],
        ['Due Date:', data.invoice_meta.dueDate],
        ['Amount Due:', formatCurrency(data.totals.total, data.invoice_meta.currency)]
        // Wait, data.totals has numbers. We need currency symbol.
    ];

    // Helper to format currency if not formatted in data
    // But data passed to generatePDF usually has raw values.
    // Let's assume passed data has formatted strings OR we format them.
    // The previous app.js passed values.
    // Let's rely on data having values we can format or we import formatCurrency?
    // We imported hexToRgb. We can import formatCurrency too. but simpler to pass formatted strings?
    // Let's import formatCurrency from utils.

    // We need to re-import formatCurrency inside this function or at top?
    // At top.

    metaRows.forEach(([label, value]) => {
        doc.text(label, rightX - 35, metaY, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), rightX, metaY, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        metaY += 5;
    });

    // Move Y down to below header
    y = Math.max(y, metaY) + 15;

    // --- Bill To ---
    doc.setFontSize(11);
    doc.setTextColor(150);
    doc.text('BILL TO', margin, y);
    y += 5;

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(data.client_info.name || 'Client Name', margin, y);
    y += 5;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const clientAddr = (data.client_info.address || '').split('\n');
    clientAddr.forEach(line => {
        doc.text(line, margin, y);
        y += 4;
    });
    // Add Email and Phone
    if (data.client_info.email) { doc.text(data.client_info.email, margin, y); y += 4; }
    if (data.client_info.phone) { doc.text(data.client_info.phone, margin, y); y += 4; }

    y += 10;

    // --- Items Table ---
    // Using autoTable plugin
    if (doc.autoTable) {
        const tableHeaders = ['Item', 'Qty', 'Rate', 'Amount'];
        const tableBody = data.items.map(item => {
            // Build rich description
            let fullDesc = item.desc || '';
            const details = [];

            if (item.client) details.push(`Client: ${item.client}`);
            if (item.consultant) details.push(`Consultant: ${item.consultant}`);
            if (item.period) details.push(`Period: ${item.period}`);
            if (item.notes) details.push(item.notes);

            if (details.length > 0) {
                fullDesc += '\n' + details.join('\n');
            }

            return [
                fullDesc,
                item.qty,
                formatCurrency(item.rate, data.invoice_meta.currency), // Use imported formatter
                item.amountDisplay // Already formatted in gatherFormData
            ];
        });

        doc.autoTable({
            startY: y,
            head: [tableHeaders],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [rgb.r, rgb.g, rgb.b] },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 30, halign: 'right' },
                3: { cellWidth: 30, halign: 'right' }
            },
            didDrawPage: function (data) {
                // Resets Y position for next content
                y = data.cursor.y;
            }
        });

        y = doc.lastAutoTable.finalY + 10;
    } else {
        // Fallback manual table
        doc.text('Items table requires autoTable plugin', margin, y);
        y += 20;
    }

    // --- Totals ---
    const rightColX = pageWidth - margin - 40;
    const valueX = pageWidth - margin;

    // Subtotal
    doc.text('Subtotal:', rightColX, y, { align: 'right' });
    doc.text(String(data.totals.subtotalDisplay || data.totals.subtotal), valueX, y, { align: 'right' });
    y += 6;

    // Tax
    if (data.totals.taxAmount > 0) {
        doc.text(`Tax (${data.settings.taxRate}%):`, rightColX, y, { align: 'right' });
        doc.text(String(data.totals.taxDisplay || data.totals.taxAmount), valueX, y, { align: 'right' });
        y += 6;
    }

    // Total
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text('Total:', rightColX, y, { align: 'right' });
    doc.text(String(data.totals.totalDisplay || data.totals.total), valueX, y, { align: 'right' });

    // --- Footer Notes ---
    y += 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);

    if (data.notes) {
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', margin, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.text(data.notes, margin, y, { maxWidth: contentWidth });
        y += 10; // Approx logic
    }

    if (data.payment_instructions) {
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Instructions:', margin, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.text(data.payment_instructions, margin, y, { maxWidth: contentWidth });
    }

    doc.save(`Invoice-${data.invoice_number}.pdf`);
}
