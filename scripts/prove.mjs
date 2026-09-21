/**
 * Lancia tutte le prove dell'app e somma gli esiti.
 *
 *     node scripts/prove.mjs          tutte
 *     node scripts/prove.mjs plurale  solo quelle che contengono «plurale»
 *
 * Ogni file `prova_*.mjs` gira in un processo suo. Costa qualche decimo di
 * secondo in più che importarli tutti insieme, e in cambio una prova che fa
 * esplodere il processo — un import sbagliato, una ricorsione infinita — non
 * porta giù anche le altre: si vede quale è stata, invece di vedere solo che
 * «le prove non partono».
 *
 * È lo stesso motivo per cui i controlli settimanali degli agenti lanciano
 * ogni script separatamente invece di importarli.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const filtro = process.argv[2] || '';

const file = readdirSync(QUI)
  .filter(f => f.startsWith('prova_') && f.endsWith('.mjs'))
  .filter(f => !filtro || f.includes(filtro))
  .sort();

if (file.length === 0) {
  console.log(filtro ? `Nessuna prova che contenga «${filtro}».` : 'Nessuna prova trovata.');
  process.exit(1);
}

let superati = 0, totali = 0;
const rossi = [];

for (const f of file) {
  const r = spawnSync(process.execPath, [join(QUI, f)], { encoding: 'utf8' });
  const uscita = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(uscita);
  const m = uscita.match(/ESITO: (\d+)\/(\d+)/);
  if (m) {
    superati += Number(m[1]);
    totali += Number(m[2]);
    if (m[1] !== m[2]) rossi.push(f);
  } else {
    // Nessun ESITO vuol dire che il file non è arrivato in fondo: conta come
    // rosso, o una prova che esplode passerebbe per una prova che non c'è.
    rossi.push(`${f} (nessun ESITO — è esplosa?)`);
  }
}

console.log('');
console.log('█'.repeat(70));
console.log(`TOTALE: ${superati}/${totali} test superati in ${file.length} file`);
if (rossi.length) {
  console.log(`ROSSI:  ${rossi.join(', ')}`);
} else {
  console.log('Tutto verde.');
}
console.log('█'.repeat(70));
process.exit(rossi.length ? 1 : 0);
