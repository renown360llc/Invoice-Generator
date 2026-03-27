import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: invoices } = await supabase.from('invoices').select('invoice_number, status, totals, created_at');
  const { data: timesheets } = await supabase.from('timesheets').select('period_start, invoice_number');
  
  const paidInvs = invoices.filter(i => String(i.status).toLowerCase() === 'paid');
  console.log('PAID INVOICES:');
  paidInvs.forEach(i => console.log(i));
  
  console.log('\nTIMESHEET MATCHES FOR PAID INVOICES:');
  timesheets.forEach(t => {
    if (paidInvs.some(i => String(i.invoice_number).trim() === String(t.invoice_number).trim())) {
      console.log(`Matched timesheet: ${t.period_start} has invoice ${t.invoice_number}`);
    }
  });

  console.log('\nMARCH INVOICES:');
  invoices.forEach(i => {
    if (i.created_at && i.created_at.startsWith('2026-03')) {
      console.log(i);
    }
  });
}
run();
