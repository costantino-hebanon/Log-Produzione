import { createClient } from '@supabase/supabase-js';

const supabaseDDP = createClient(
  'https://nkomysmcwflwnbpjljnb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rb215c21jd2Zsd25icGpsam5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODQ5MjUsImV4cCI6MjA5NzM2MDkyNX0.HPk7voqOpplPoM9RjE0yqMZrjsI_gISwj0SocC3Onrw'
);

export async function loadDDPCommesse() {
  try {
    const { data } = await supabaseDDP
      .from('app_data')
      .select('value')
      .eq('key', 'commesse')
      .single();
    return (data?.value || [])
      .map(c => c.nome)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'it'));
  } catch {
    return [];
  }
}
