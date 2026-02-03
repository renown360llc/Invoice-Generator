import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Environment Variables from .env
console.log('--- 1. Loading Configuration ---');
const envPath = path.resolve(__dirname, '../.env');
let supabaseUrl, supabaseAnonKey;

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = value.trim();
            if (key.trim() === 'VITE_SUPABASE_ANON_KEY') supabaseAnonKey = value.trim();
        }
    });
} catch (error) {
    console.error('Error reading .env file:', error.message);
    process.exit(1);
}

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseAnonKey.substring(0, 10) + '...');

// 2. Initialize Supabase
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 3. Authenticate and Fetch
async function verifyBackend() {
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
        console.log('\nUsage: node scripts/verify-backend.js <email> <password>');
        console.log('Please provide email and password to verify RLS protected data.');
        return;
    }

    console.log('\n--- 2. Authenticating ---');
    const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (authError) {
        console.error('Authentication Failed:', authError.message);
        return;
    }
    console.log('Authenticated as User ID:', user.id);

    console.log('\n--- 3. Fetching Invoices ---');
    const { data: invoices, error: dbError } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (dbError) {
        console.error('Database Error:', dbError.message);
    } else {
        console.log(`Success! Found ${invoices.length} invoices.`);
        if (invoices.length > 0) {
            console.log('Top 3 Invoices:');
            invoices.slice(0, 3).forEach(inv => {
                console.log(`- ${inv.invoice_number}: ${inv.client_info?.name} ($${inv.totals?.total})`);
            });
        } else {
            console.log('No invoices found. Check if you have created any invoices with this user.');
        }
    }
}

verifyBackend();
