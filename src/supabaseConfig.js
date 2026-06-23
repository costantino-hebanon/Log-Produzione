import { createClient } from '@supabase/supabase-js';

// Progetto Supabase UNIFICATO (migrazione 2026-06-23).
// Prima della migrazione LOG usava il progetto iuamlbybtxccucgnathk (ora dismesso).
const SUPABASE_URL = 'https://ckbolwvwnsabsblzcbet.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrYm9sd3Z3bnNhYnNibHpjYmV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTc5NDAsImV4cCI6MjA5NzI3Mzk0MH0.hR9tg_UjO5Dt0RzdJihXJWPaKJisVXk9ZZrDSAZ9KLQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
