// Migrazione 2026-06-23: le commesse DDP ora vivono nello stesso progetto unificato,
// nella chiave `ddp_commesse`. Non serve più un client separato verso il progetto DDP.
import { supabase } from './supabaseConfig';

export async function loadDDPCommesse() {
  try {
    const { data } = await supabase
      .from('app_data')
      .select('value')
      .eq('key', 'ddp_commesse')
      .single();
    return (data?.value || [])
      .map(c => c.nome)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'it'));
  } catch {
    return [];
  }
}
