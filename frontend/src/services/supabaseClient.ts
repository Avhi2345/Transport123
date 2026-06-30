import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://egxfsmtlcfgtyzjvepas.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_htLwUS0VnIpphYdoutfXKw_sZGSPLU8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
