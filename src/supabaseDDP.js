// Migrazione 2026-06-23: le commesse DDP ora vivono nello stesso progetto unificato,
// nella chiave `ddp_commesse`. Non serve più un client separato verso il progetto DDP.
import { supabase } from './supabaseConfig';

export async function loadDDPCommesse() {
  try {
    // Fase 2: i nomi commessa arrivano dalla tabella relazionale `commesse` (stato attiva).
    const { data } = await supabase
      .from('commesse')
      .select('nome')
      .eq('stato', 'attiva');
    return (data || [])
      .map(c => c.nome)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'it'));
  } catch {
    return [];
  }
}
