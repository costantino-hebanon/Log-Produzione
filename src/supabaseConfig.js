import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iuamlbybtxccucgnathk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1YW1sYnlidHhjY3VjZ25hdGhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTg3NzAsImV4cCI6MjA5NzQzNDc3MH0.DUEWxqQvKcZsm0-MD67tm7Felkfbl1ymzcJ1DJJ7AWY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
