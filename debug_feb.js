import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: invoices } = await supabase.from('invoices').select('invoice_number, status, totals, created_at, paid_date, invoice_meta');
  const { data: timesheets } = await supabase.from('timesheets').select('period_start, invoice_number');
  
  const paidInvs = invoices.filter(i => String(i.status).toLowerCase() === 'paid');
  console.log('--- PAID INVOICES ---');
  paidInvs.forEach(i => {
    console.log(`INV: ${i.invoice_number} | Status: ${i.status} | Total: ${i.totals?.total} | PaidDate: ${i.paid_date} | MetaDate: ${i.invoice_meta?.dateRaw} | Created: ${i.created_at}`);
  });
  
  console.log('\n--- ALL INVOICES MAPPED TO FEB ---');
  invoices.forEach(i => {
    const num = String(i.invoice_number || '').trim();
    const tsMatches = timesheets.filter(t => String(t.invoice_number || '').trim() === num);
    const months = [...new Set(tsMatches.map(t => String(t.period_start).slice(0,7)))];
    
    let isFeb = false;
    if (months.includes('2026-02') || months.includes('2025-02')) isFeb = true;
    
    const fallback = String(i.paid_date || i.invoice_meta?.dateRaw || i.created_at || '').slice(0,7);
    if (!num || tsMatches.length === 0) {
      if (fallback === '2026-02' || fallback === '2025-02') isFeb = true;
    }
    
    if (isFeb) {
      console.log(`INV: ${i.invoice_number} | Status: ${i.status} | Mapped Months: ${months.join(',')} | Fallback: ${fallback}`);
    }
  });
}
run();
