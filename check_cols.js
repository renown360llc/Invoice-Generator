import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  // Let's just pull one consultant and log it entirely to see all available columns.
  const { data: cols, error } = await supabase.from('consultants').select('*').limit(1);
  if (error) console.error("Error:", error.message);
  else console.log('Consultant Record Columns:', Object.keys(cols[0] || {}));
}

run();
