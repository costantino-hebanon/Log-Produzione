/**
 * Il codice QR di una commessa: cosa ci sta scritto dentro.
 *
 * ## Perché l'ID e non il nome
 *
 * La commessa nasce nel Diario e tutte le altre app la richiamano. Fino a una
 * certa data la richiamavano **per nome**, testo libero, ed è da lì che
 * nascevano gli scarichi che non entravano in nessun costo: bastava scrivere
 * «Chechile» invece di «Chechile - Porta Piscina». Il QR chiude quel buco alla
 * radice — dentro c'è l'**ID univoco** della commessa (la sua targa, es.
 * `CHE-PAR-7K9Z`), non il nome. Chi scansiona ottiene l'ID giusto, e da lì il
 * nome canonico, senza possibilità di sbagliare.
 *
 * L'ID è indipendente dal nome: il nome può essere corretto a mano, l'ID no.
 *
 * ## Il formato
 *
 * `hebanon://commessa/<ID>` — uno schema con un prefisso riconoscibile, non un
 * ID nudo, così il lettore distingue un QR di commessa da uno qualsiasi (un
 * pacco, l'etichetta di un fornitore) e rifiuta ciò che non capisce.
 *
 * Il nome resta stampato **accanto** al QR per l'occhio umano, ma non dentro
 * il codice: nel codice conta solo l'ID.
 */

const SCHEMA = 'hebanon://commessa/';
// Il formato dell'ID commessa: SIGLA-SIGLA-CODICE (vedi commessaId.js). Qui si
// tiene una copia del controllo perché questo file viaggia in più app.
const RE_ID = /^[A-Z]{3}-[A-Z]{3}-[A-Z0-9]{4,}$/;

/** Vero per un ID che ha la forma giusta. */
function idPlausibile(id) {
  return typeof id === 'string' && RE_ID.test(id.trim().toUpperCase());
}

/**
 * Il contenuto del QR per una commessa, dato il suo ID.
 * Lancia se l'ID non c'è o è malformato: un'etichetta con un ID sbagliato è
 * peggio di nessuna etichetta, perché sembra funzionare.
 */
export function payloadCommessa(id) {
  const pulito = (id == null ? '' : String(id)).trim().toUpperCase();
  if (!idPlausibile(pulito)) {
    throw new Error(`ID commessa non valido per il QR: ${JSON.stringify(id)}`);
  }
  return SCHEMA + pulito;
}

/**
 * L'ID letto da un QR scansionato, o null se non è un QR di commessa Hebanon.
 * Tollerante su ciò che non conta (spazi, maiuscole nello schema) e severo
 * sulla forma dell'ID: un lettore che accetta qualunque cosa rimette in
 * circolo l'errore che il QR doveva togliere. Ritorna null, non lancia,
 * perché lo scanner incontra di continuo codici che non sono nostri.
 */
export function leggiPayloadCommessa(testo) {
  if (typeof testo !== 'string') return null;
  const t = testo.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith(SCHEMA)) return null;
  const id = t.slice(SCHEMA.length).trim().toUpperCase();
  return idPlausibile(id) ? id : null;
}

/** Il nome file per l'etichetta stampata/scaricata di una commessa. */
export function nomeFileEtichetta(nome) {
  const base = (nome || 'commessa').trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return `qr_${base || 'commessa'}`;
}
