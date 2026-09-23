/**
 * Il lettore QR: apre la fotocamera e restituisce quello che legge.
 *
 * Componente generico e volutamente ottuso: non sa cosa sia una commessa, non
 * interroga il database, non decide niente. Legge una stringa da un QR e la
 * passa a chi l'ha aperto. Tutta l'intelligenza — è un QR nostro? a quale
 * commessa corrisponde? — sta fuori di qui, in chi riceve `onScan`. Così il
 * lettore si può riusare domani per gli articoli senza toccarlo.
 *
 * La fotocamera è una risorsa che va spenta: se resta accesa dopo la chiusura,
 * sul telefono la spia resta verde e la batteria si consuma. Per questo lo
 * stop nel cleanup è avvolto in modo che un errore di spegnimento non impedisca
 * comunque la chiusura.
 */
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const DIV_ID = 'qr-scanner-area';

export default function QrScannerModal({ onScan, onClose, titolo = 'Inquadra il QR' }) {
  const [errore, setErrore] = useState('');
  const letto = useRef(false); // una lettura sola: al primo QR valido si chiude

  useEffect(() => {
    let scanner = null;
    let fermato = false;
    const stop = async () => {
      fermato = true;
      if (!scanner) return;
      try { await scanner.stop(); } catch { /* già ferma o mai partita */ }
      try { await scanner.clear(); } catch { /* idem */ }
    };

    (async () => {
      try {
        scanner = new Html5Qrcode(DIV_ID, { verbose: false });
        await scanner.start(
          { facingMode: 'environment' }, // la camera posteriore, non il selfie
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (testo) => {
            if (letto.current) return;
            letto.current = true;
            onScan(testo);
            stop();
          },
          () => { /* frame senza QR: normale, si ignora */ },
        );
        if (fermato) stop(); // chiuso mentre partiva
      } catch (e) {
        // Il caso vero e frequente: permesso camera negato, o niente camera.
        setErrore(
          e?.name === 'NotAllowedError'
            ? 'Permesso fotocamera negato. Concedilo nelle impostazioni del browser.'
            : 'Fotocamera non disponibile: ' + (e?.message || e),
        );
      }
    })();

    return () => { stop(); };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800 text-sm">📷 {titolo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>

        {errore ? (
          <div className="py-8 text-center">
            <div className="text-3xl mb-2">🚫</div>
            <p className="text-sm text-red-600">{errore}</p>
          </div>
        ) : (
          <>
            <div id={DIV_ID} className="w-full rounded-lg overflow-hidden bg-black min-h-[240px]" />
            <p className="text-xs text-gray-400 text-center mt-3">
              Inquadra il QR sul cartellino della commessa.
            </p>
          </>
        )}

        <div className="flex justify-center mt-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annulla</button>
        </div>
      </div>
    </div>
  );
}
