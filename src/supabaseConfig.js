import { createClient } from '@supabase/supabase-js';

// Progetto Supabase UNIFICATO (migrazione 2026-06-23).
// Prima della migrazione LOG usava il progetto iuamlbybtxccucgnathk (ora dismesso).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
