import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: invoices } = await supabase.from('invoices').select('*');
  const { data: timesheets } = await supabase.from('timesheets').select('*');
  
  console.log('--- INVOICES ---');
  invoices.forEach(i => {
    console.log(`Invoice: ${i.invoice_number} | Created: ${i.created_at} | Paid: ${i.paid_date} | DateMeta: ${i.invoice_meta?.dateRaw} | Total: ${i.totals?.total}`);
  });
  
  console.log('\n--- TIMESHEETS ---');
  timesheets.filter(t => t.invoice_number).forEach(t => {
    console.log(`Timesheet: ${t.period_start} | Inv#: ${t.invoice_number} | Projected: ${t.hours_worked * t.consultants.bill_rate}`);
  });
}
run();
