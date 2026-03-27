import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: timesheets } = await supabase.from('timesheets').select('period_start, invoice_number').eq('invoice_number', 'INV-0004');
  console.log('Timesheets for INV-0004:', timesheets);
}
run();
