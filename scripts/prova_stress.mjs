/**
 * Test cattivi — LOG.
 *
 * Il LOG è la memoria della produzione: un raggruppamento che perde una voce è
 * peggio di uno disordinato, perché la voce mancante non si vede. Questi test
 * bombardano il registro di voci malformate e pretendono che **nessuna
 * sparisca** e che niente esploda, in nessuna delle quattro viste.
 */
import { suite, titolo, check, uguale, fine } from './_prova.mjs';
import {
  raggruppa, ordinaChiavi, dataLeggibile, dataBreve, arcoDate,
  tipiPresenti, autoriPresenti, getTipoMeta, EMPTY_COMMESSA,
} from '../src/utils/registro.js';

suite('TEST CATTIVI — LOG');

titolo('Date storte non fanno esplodere né mentire');
for (const d of [null, undefined, 42, {}, '', 'ieri', '2026-13-99', '31/02/2026', '📅', '0000-00-00']) {
  let ok = true; try { dataLeggibile(d); dataBreve(d); } catch { ok = false; }
  check(`data ${JSON.stringify(d)} gestita senza errori`, ok);
}
check('una data valida resta leggibile', typeof dataLeggibile('2026-03-05', new Date('2026-03-06T10:00:00')) === 'string');

titolo('arcoDate su voci spazzatura');
for (const v of [null, undefined, 'x', [null, undefined], [{ data: null }, { data: 'boh' }], [{}, {}]]) {
  let ok = true, r; try { r = arcoDate(v); } catch { ok = false; }
  check(`arcoDate(${JSON.stringify(v)}) → stringa, senza errori`, ok && typeof r === 'string', r);
}

titolo('Raggruppamento: nessuna voce si perde, mai, in nessuna vista');
const registroCattivo = [
  null, undefined, 'stringa', 42, {},
  { tipo: 'decisione', operatore: 'Gino', commessa: 'A', data: '2026-03-01' },
  { tipo: null, operatore: null, commessa: null, data: null },
  { tipo: '', operatore: '   ', commessa: '   ', data: '' },
  { tipo: 42, operatore: {}, commessa: [], data: 99 },
  { commessa: 'B' },
];
const vociValide = registroCattivo.filter(v => v && typeof v === 'object').length;
for (const modo of ['data', 'commessa', 'tipo', 'autore']) {
  let g = null, ok = true;
  try { g = raggruppa(registroCattivo, modo); } catch { ok = false; }
  check(`raggruppa per ${modo} non esplode`, ok && g && typeof g === 'object', ok);
  if (g) {
    const totale = Object.values(g).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
    // Le voci non-oggetto possono essere scartate, ma quelle valide NON devono sparire.
    check(`per ${modo}: le ${vociValide} voci valide non spariscono (contate ${totale})`, totale >= vociValide, totale);
    let ok2 = true; try { ordinaChiavi(Object.keys(g), modo); } catch { ok2 = false; }
    check(`ordinaChiavi per ${modo} non esplode`, ok2);
  }
}

titolo('Raggruppamento su volume grande (5000 voci)');
{
  const tipi = ['decisione', 'variazione', 'annotazione', '', null];
  const grande = Array.from({ length: 5000 }, (_, i) => ({
    tipo: tipi[i % tipi.length], operatore: 'Op' + (i % 30),
    commessa: i % 7 === 0 ? '' : 'Comm' + (i % 50), data: `2026-0${1 + (i % 9)}-15`,
  }));
  let g = null, ok = true;
  try { g = raggruppa(grande, 'commessa'); } catch { ok = false; }
  const totale = g ? Object.values(g).reduce((s, v) => s + v.length, 0) : -1;
  check('5000 voci raggruppate senza errori', ok);
  uguale('tutte e 5000 presenti', totale, 5000);
}

titolo('ordinaChiavi e getTipoMeta con input strani');
for (const ch of [null, undefined, [null, 'A', undefined, ''], [1, 2, 3]]) {
  let ok = true; try { ordinaChiavi(ch, 'commessa'); ordinaChiavi(ch, 'tipo'); } catch { ok = false; }
  check(`ordinaChiavi(${JSON.stringify(ch)}) gestito`, ok);
}
for (const t of [null, undefined, 42, {}, 'boh', 'decisione']) {
  let ok = true, m; try { m = getTipoMeta(t); } catch { ok = false; }
  check(`getTipoMeta(${JSON.stringify(t)}) → oggetto con label`, ok && m && 'label' in m, m);
}
uguale('autori: elenco nullo → array vuoto', autoriPresenti(null).length, 0);
uguale('tipi: elenco nullo → array vuoto', tipiPresenti(null).length, 0);

fine();
