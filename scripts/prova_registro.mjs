/**
 * Il registro: raggruppamento, ordinamento, date.
 *
 * Il LOG è la memoria della produzione, e la domanda a cui deve rispondere è
 * «chi ha deciso questa cosa, e quando». Un raggruppamento che perde una voce
 * è peggio di uno disordinato: il disordine si vede, la voce mancante no.
 *
 * Per questo la prova che conta di più è in fondo — **nessuna voce sparisce**,
 * in nessuno dei quattro modi di raggruppare, nemmeno quando i campi su cui
 * si raggruppa sono vuoti.
 *
 * E c'è un controllo che esiste per una lezione già pagata altrove: la data
 * «Oggi»/«Ieri» dipende dall'orologio, e prima era preso dentro la funzione.
 * Una prova scritta così è verde il giorno in cui la si scrive e rossa il
 * giorno dopo. Adesso l'orologio si passa da fuori, e queste prove dicono la
 * stessa cosa a marzo e ad agosto.
 */
import { suite, titolo, check, uguale, fine } from './_prova.mjs';
import {
  dataLeggibile, dataBreve, arcoDate, raggruppa, ordinaChiavi,
  tipiPresenti, autoriPresenti, getTipoMeta, TIPO_ORDER, EMPTY_COMMESSA,
} from '../src/utils/registro.js';

suite('IL REGISTRO DI PRODUZIONE');

const OGGI = new Date('2026-09-21T14:30:00');

titolo('Le date non dipendono da quando si lancia la prova');
uguale('oggi', dataLeggibile('2026-09-21', OGGI), 'Oggi');
uguale('ieri', dataLeggibile('2026-09-20', OGGI), 'Ieri');
check('l\'altro ieri si scrive per esteso',
  /19/.test(dataLeggibile('2026-09-19', OGGI)), dataLeggibile('2026-09-19', OGGI));
uguale('niente resta niente', dataLeggibile('', OGGI), '');
// Il caso che rompe i conti sulle date: il primo del mese.
uguale('il primo del mese, «ieri» è l\'ultimo del mese prima',
  dataLeggibile('2026-08-31', new Date('2026-09-01T10:00:00')), 'Ieri');
// E il cambio d'anno.
uguale('capodanno', dataLeggibile('2025-12-31', new Date('2026-01-01T10:00:00')), 'Ieri');

titolo('La data breve e l\'arco');
check('una data breve è corta', dataBreve('2026-03-05').length <= 8, dataBreve('2026-03-05'));
uguale('senza data non c\'è arco', arcoDate([]), '');
uguale('una sola data non è un arco',
  arcoDate([{ data: '2026-03-05' }]), dataBreve('2026-03-05'));
uguale('date uguali non fanno un arco',
  arcoDate([{ data: '2026-03-05' }, { data: '2026-03-05' }]), dataBreve('2026-03-05'));
check('due date diverse fanno un arco, dalla più vecchia',
  arcoDate([{ data: '2026-03-09' }, { data: '2026-03-05' }]).startsWith(dataBreve('2026-03-05')),
  arcoDate([{ data: '2026-03-09' }, { data: '2026-03-05' }]));
uguale('le voci senza data non contano',
  arcoDate([{ data: '' }, { data: '2026-03-05' }]), dataBreve('2026-03-05'));

titolo('I tipi si ordinano per gravità, non per alfabeto');
const ordinati = ordinaChiavi(['annotazione', 'cambio_progetto', 'decisione'], 'tipo');
uguale('il cambio progetto viene prima dell\'annotazione',
  ordinati[0], 'cambio_progetto');
check('e l\'ordine è quello dichiarato',
  ordinati.every((t, i, arr) =>
    i === 0 || TIPO_ORDER.indexOf(arr[i - 1]) <= TIPO_ORDER.indexOf(t)), ordinati);
const conIgnoto = ordinaChiavi(['zzz_ignoto', 'decisione'], 'tipo');
uguale('un tipo sconosciuto va in fondo, non sparisce',
  conIgnoto[conIgnoto.length - 1], 'zzz_ignoto');

titolo('«Senza commessa» sta in fondo');
const comm = ordinaChiavi([EMPTY_COMMESSA, 'Bianchi', 'Alberti'], 'commessa');
uguale('le commesse vere prima, in ordine', comm.slice(0, 2), ['Alberti', 'Bianchi']);
uguale('e quella vuota per ultima', comm[comm.length - 1], EMPTY_COMMESSA,
  'l\'alfabeto la metterebbe in cima per via della parentesi');

titolo('L\'aspetto di un tipo');
uguale('un tipo noto ha la sua etichetta', getTipoMeta('decisione').label, 'Decisione');
uguale('la checklist è a parte', getTipoMeta('checklist').label, 'Checklist');
check('un tipo sconosciuto si mostra com\'è invece di sparire',
  getTipoMeta('boh').label === 'boh', getTipoMeta('boh'));
check('e senza tipo si cade su «annotazione»',
  getTipoMeta(null).label === 'annotazione');

titolo('Tipi e autori presenti');
const voci = [
  { tipo: 'decisione', operatore: 'Gino' },
  { tipo: 'cambio_progetto', operatore: 'Mario' },
  { tipo: 'decisione', operatore: 'Gino' },
  { tipo: '', operatore: '' },
];
uguale('i tipi, una volta e in ordine',
  tipiPresenti(voci).map(t => t.value), ['cambio_progetto', 'decisione']);
uguale('gli autori, una volta ciascuno', autoriPresenti(voci), ['Gino', 'Mario']);
uguale('elenco vuoto', autoriPresenti([]), []);
uguale('elenco assente', autoriPresenti(null), []);

titolo('Nessuna voce si perde — la prova che conta di più');
const registro = [
  { data: '2026-03-01', tipo: 'decisione', operatore: 'Gino', commessa: 'A' },
  { data: '2026-03-01', tipo: '', operatore: '', commessa: '' },
  { data: '', tipo: 'variazione', operatore: 'Mario', commessa: '   ' },
  { data: '2026-03-02', tipo: 'annotazione', operatore: 'Gino', commessa: 'B' },
  { data: '2026-03-02' },
];
for (const modo of ['data', 'commessa', 'tipo', 'autore']) {
  const g = raggruppa(registro, modo);
  const totale = Object.values(g).reduce((s, v) => s + v.length, 0);
  uguale(`raggruppando per ${modo} restano tutte e ${registro.length}`, totale, registro.length);
  const chiavi = ordinaChiavi(Object.keys(g), modo);
  uguale(`e ordinando per ${modo} non se ne perde nessuna`, chiavi.length, Object.keys(g).length);
}
const perCommessa = raggruppa(registro, 'commessa');
check('una commessa fatta di soli spazi finisce fra le «senza commessa»',
  (perCommessa[EMPTY_COMMESSA] || []).length === 3,
  Object.fromEntries(Object.entries(perCommessa).map(([k, v]) => [k, v.length])));
uguale('registro vuoto: nessun gruppo', Object.keys(raggruppa([], 'data')).length, 0);
uguale('registro assente', Object.keys(raggruppa(null, 'data')).length, 0);

fine();
