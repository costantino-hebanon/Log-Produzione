/**
 * L'impalcatura delle prove, uguale in tutte le app del M.E.S.
 *
 * È la traduzione in JavaScript di quella che gli agenti sul server usano da
 * mesi in Python, e ne tiene due abitudini che lì si sono rivelate le più
 * utili:
 *
 * **`ESITO: N/N test superati`.** Una riga sola, sempre nello stesso formato,
 * leggibile da un occhio e da un `grep`. È quella che permette a un runner di
 * sommare venti file senza sapere cosa fanno, e a una GitHub Action di dire
 * «rosso» senza interpretare niente.
 *
 * **Il dettaglio solo quando serve.** Una prova che passa stampa una riga; una
 * che fallisce stampa anche il valore che ha trovato. Le suite che stampano
 * tutto smettono di essere lette dopo la seconda settimana.
 *
 * Nessuna dipendenza, di proposito. Queste app non hanno un framework di test
 * installato e non è il caso di aggiungerne uno: `node scripts/prova_x.mjs`
 * funziona sul portatile, su un runner di GitHub e fra due anni.
 */

let esiti = [];
let nomeSuite = '';

/** Apre una suite: serve solo a far capire da dove arriva l'esito. */
export function suite(nome) {
  nomeSuite = nome;
  console.log('='.repeat(70));
  console.log(nome);
  console.log('='.repeat(70));
}

/** Un titolo di sezione dentro la suite. */
export function titolo(t) {
  console.log('');
  console.log('─'.repeat(70));
  console.log(t);
  console.log('─'.repeat(70));
}

/**
 * Un controllo.
 *
 * `dettaglio` si stampa solo se il controllo fallisce: è quello che serve per
 * capire *cosa* è successo senza dover rilanciare con dei console.log a mano.
 */
export function check(nome, condizione, dettaglio) {
  const ok = !!condizione;
  esiti.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nome}`);
  if (!ok && dettaglio !== undefined) {
    const d = typeof dettaglio === 'string' ? dettaglio : JSON.stringify(dettaglio);
    console.log(`         ${String(d).slice(0, 300)}`);
  }
  return ok;
}

/** Due valori che devono coincidere. Il dettaglio se lo costruisce da sé. */
export function uguale(nome, avuto, atteso) {
  const ok = JSON.stringify(avuto) === JSON.stringify(atteso);
  return check(nome, ok, ok ? undefined : `${JSON.stringify(avuto)} invece di ${JSON.stringify(atteso)}`);
}

/**
 * Un avviso: qualcosa da sapere che non fa fallire la suite.
 *
 * Serve per le cose vere ma non azionabili adesso — una fonte muta per un
 * giorno, un file che sta crescendo. Senza questa distinzione finiscono tutte
 * fra i guasti, e una suite che segnala guasti inesistenti smette di essere
 * creduta.
 */
const avvisi = [];
export function avviso(testo) {
  avvisi.push(testo);
  console.log(`  ~    ${testo}`);
}

/** Chiude la suite, stampa l'esito e restituisce il codice di uscita. */
export function esito() {
  const superati = esiti.filter(Boolean).length;
  const totale = esiti.length;
  console.log('');
  console.log('='.repeat(70));
  if (avvisi.length) console.log(`AVVISI: ${avvisi.length}`);
  console.log(`ESITO: ${superati}/${totale} test superati`);
  console.log('='.repeat(70));
  return superati === totale ? 0 : 1;
}

/** Chiude e termina il processo. Da usare in fondo a ogni file di prove. */
export function fine() {
  process.exit(esito());
}

/** Azzera lo stato: serve solo a chi esegue più suite nello stesso processo. */
export function azzera() {
  esiti = [];
  avvisi.length = 0;
  nomeSuite = '';
}
