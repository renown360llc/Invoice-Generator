/**
 * POST /api/send-invoice
 * Vercel serverless function: emails an invoice PDF via Resend.
 *
 * The browser generates the PDF (jsPDF) and posts it here as base64, along
 * with the caller's Supabase access token. We verify the token so this
 * endpoint can't be used as an open email relay, then hand off to Resend.
 *
 * Required env vars (set in the Vercel project, not committed):
 *   RESEND_API_KEY  - Resend API key (server-only secret)
 *   FROM_EMAIL      - verified sender, e.g. "Renown360 <billing@yourdomain.com>"
 *   SUPABASE_URL / SUPABASE_ANON_KEY (falls back to VITE_ prefixed values)
 */

import { createClient } from '@supabase/supabase-js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getEnv(...names) {
    for (const name of names) {
        if (process.env[name]) return process.env[name];
    }
    return '';
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const resendKey = getEnv('RESEND_API_KEY');
    const fromEmail = getEnv('FROM_EMAIL');
    const supabaseUrl = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
    const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

    if (!resendKey || !fromEmail) {
        res.status(500).json({ error: 'Email service is not configured. Set RESEND_API_KEY and FROM_EMAIL.' });
        return;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
        res.status(500).json({ error: 'Supabase credentials are not configured on the server.' });
        return;
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const { token, to, subject, html, pdfBase64, filename } = body;

    if (!token) {
        res.status(401).json({ error: 'Missing authentication token.' });
        return;
    }
    if (!EMAIL_RE.test(String(to || '').trim())) {
        res.status(400).json({ error: 'A valid recipient email is required.' });
        return;
    }
    if (!subject || !html || !pdfBase64) {
        res.status(400).json({ error: 'Missing subject, body, or PDF attachment.' });
        return;
    }

    // Verify the caller is a real, authenticated user.
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
        res.status(401).json({ error: 'Invalid or expired session.' });
        return;
    }

    try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: fromEmail,
                to: [String(to).trim()],
                subject: String(subject),
                html: String(html),
                attachments: [
                    { filename: filename || 'invoice.pdf', content: pdfBase64 }
                ]
            })
        });

        if (!resendResponse.ok) {
            const detail = await resendResponse.text();
            console.error('[send-invoice] Resend error', resendResponse.status, detail);
            res.status(502).json({ error: 'Failed to send email.' });
            return;
        }

        const result = await resendResponse.json();
        res.status(200).json({ ok: true, id: result?.id || null });
    } catch (err) {
        console.error('[send-invoice] Unexpected error', err);
        res.status(500).json({ error: 'Unexpected error sending email.' });
    }
}

function safeJson(value) {
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}
