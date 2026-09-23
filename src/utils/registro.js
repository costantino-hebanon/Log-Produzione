/**
 * Il registro: come si raggruppano le voci e come si scrivono le date.
 *
 * Il LOG è la memoria cronologica della produzione: chi ha deciso cosa, e
 * quando. Il raggruppamento non è cosmetica — è il modo in cui si ritrova una
 * decisione presa tre mesi fa, e un ordinamento sbagliato la nasconde in
 * fondo a un elenco invece che perderla del tutto, che è peggio.
 *
 * ## Il pezzo che dipendeva dall'orologio
 *
 * `dataLeggibile` scriveva «Oggi» e «Ieri» confrontando con `new Date()` preso
 * dentro la funzione. Funziona, ma non si può provare: la stessa chiamata dà
 * risposte diverse a seconda del giorno in cui la si fa, e una prova scritta
 * a marzo diventa rossa ad aprile.
 *
 * Adesso «oggi» arriva da fuori, col valore di sempre come predefinito. È la
 * stessa correzione fatta su una prova degli agenti che falliva ogni lunedì
 * mattina: quando un conto dipende dall'orologio, l'orologio si passa.
 *
 * ## Le due regole di ordinamento che non sono alfabetiche
 *
 * **Per tipo** si ordina secondo l'ordine dichiarato in `TIPI` — che è un
 * ordine di gravità, non alfabetico: un cambio di progetto va letto prima di
 * un'annotazione. I tipi sconosciuti vanno in fondo invece di sparire.
 *
 * **Per commessa**, «(Senza commessa)» sta sempre in fondo anche se
 * l'alfabeto lo metterebbe in cima per via della parentesi. Le voci senza
 * commessa sono quasi sempre annotazioni generiche, e trovarsele come primo
 * gruppo spinge giù tutto il lavoro vero.
 */

export const TIPI = [
  { value: 'cambio_progetto', label: 'Cambio progetto', icon: '🔄', badge: 'bg-blue-100 text-blue-700' },
  { value: 'variazione',      label: 'Variazione',      icon: '⚠️',  badge: 'bg-orange-100 text-orange-700' },
  { value: 'annotazione',     label: 'Annotazione',     icon: '📝', badge: 'bg-gray-100 text-gray-700' },
  { value: 'osservazione',    label: 'Osservazione',    icon: '👁️',  badge: 'bg-purple-100 text-purple-700' },
  { value: 'decisione',       label: 'Decisione',       icon: '✅', badge: 'bg-green-100 text-green-700' },
];
export const TIPO_MAP = Object.fromEntries(TIPI.map(t => [t.value, t]));
export const TIPO_ORDER = TIPI.map(t => t.value);
export const CHECKLIST_TYPE = { value: 'checklist', label: 'Checklist', icon: '☑️', badge: 'bg-blue-100 text-blue-700' };
export const EMPTY_COMMESSA = '(Senza commessa)';

/** L'aspetto di un tipo. Un tipo sconosciuto non sparisce: si mostra com'è. */
export function getTipoMeta(tipo) {
  if (tipo === 'checklist') return CHECKLIST_TYPE;
  return TIPO_MAP[tipo] || { label: tipo || 'annotazione', icon: '📝', badge: 'bg-gray-100 text-gray-700' };
}

/** `Date` → `AAAA-MM-GG`, come le date del registro. */
function giorno(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Una data come si legge: «Oggi», «Ieri», o per esteso.
 *
 * `oggi` si passa da fuori così la funzione è verificabile. Il valore
 * predefinito è l'adesso vero, quindi chi la chiama non cambia niente.
 */
export function dataLeggibile(dataStr, oggi = new Date()) {
  if (!dataStr) return '';
  const g = giorno(oggi);
  const ieri = giorno(new Date(new Date(oggi).getTime() - 86400000));
  if (dataStr === g) return 'Oggi';
  if (dataStr === ieri) return 'Ieri';
  return new Date(dataStr + 'T00:00:00').toLocaleDateString('it-IT',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** La data in breve: «3 mar». */
export function dataBreve(dataStr) {
  if (!dataStr) return '';
  return new Date(dataStr + 'T00:00:00').toLocaleDateString('it-IT',
    { day: 'numeric', month: 'short' });
}

/** L'arco di tempo coperto da un gruppo di voci. */
export function arcoDate(voci) {
  const date = (Array.isArray(voci) ? voci : []).map(e => e?.data).filter(Boolean).map(String).sort();
  if (!date.length) return '';
  if (date.length === 1 || date[0] === date[date.length - 1]) return dataBreve(date[0]);
  return `${dataBreve(date[0])} → ${dataBreve(date[date.length - 1])}`;
}

/** I tipi presenti, nell'ordine dichiarato. */
export function tipiPresenti(voci) {
  const set = new Set((Array.isArray(voci) ? voci : []).map(e => e?.tipo).filter(Boolean));
  return TIPO_ORDER.filter(t => set.has(t)).map(t => TIPO_MAP[t]);
}

/** Gli autori, una volta ciascuno. */
export function autoriPresenti(voci) {
  return [...new Set((Array.isArray(voci) ? voci : []).map(e => e?.operatore).filter(Boolean))];
}

/**
 * Le voci raggruppate.
 *
 * Nessuna voce si perde: quelle senza commessa, senza tipo o senza autore
 * finiscono in un gruppo dichiarato invece di sparire. Un registro che
 * nasconde una voce è peggio di un registro disordinato.
 */
export function raggruppa(voci, modo) {
  const gruppi = {};
  const testo = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
  for (const e of (Array.isArray(voci) ? voci : [])) {
    if (!e || typeof e !== 'object') continue; // una voce che non e' un oggetto si salta
    let chiave;
    if (modo === 'commessa') chiave = testo(e.commessa) || EMPTY_COMMESSA;
    else if (modo === 'tipo') chiave = testo(e.tipo) || 'annotazione';
    else if (modo === 'autore') chiave = testo(e.operatore) || 'Sconosciuto';
    else chiave = testo(e.data) || 'Senza data';
    (gruppi[chiave] ||= []).push(e);
  }
  return gruppi;
}

/** Le chiavi dei gruppi nell'ordine giusto per quel modo. */
export function ordinaChiavi(chiavi, modo) {
  const lista = (Array.isArray(chiavi) ? chiavi : []).map(k => k == null ? '' : String(k));
  if (modo === 'tipo') {
    // Ordine di gravita', non alfabetico. Quelli sconosciuti in fondo.
    return [...lista].sort((a, b) => {
      const ai = TIPO_ORDER.indexOf(a), bi = TIPO_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }
  if (modo === 'commessa') {
    // «(Senza commessa)» in fondo: l'alfabeto lo metterebbe in cima per la
    // parentesi, spingendo giu' tutto il lavoro vero.
    return [...lista].sort((a, b) => {
      if (a === EMPTY_COMMESSA) return 1;
      if (b === EMPTY_COMMESSA) return -1;
      return a.localeCompare(b, 'it');
    });
  }
  return [...lista].sort((a, b) => a.localeCompare(b, 'it'));
}
