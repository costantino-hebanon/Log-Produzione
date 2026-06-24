# LOG Produzione — CLAUDE.md

## Reference dati & analisi
[📊 Hebanon — Reference dati, schemi DB e catalogo analisi](../HEBANON-REFERENCE.md) — documento completo (DB unificato): architettura Supabase, schemi di tutte le app, modello utenti, flussi cross-app, catalogo analisi, avvertenze e blocco da incollare in chat. Aggiornato 2026-06-24.

## Scopo
App per tracciare il log delle attività di produzione: cambi di progetto, variazioni in corso d'opera, annotazioni, osservazioni, decisioni prese durante conversazioni, ecc.

## Stack
- **React 18 + Vite 5** — tutto in `src/App.jsx` + componenti in `src/components/`
- **Tailwind CSS** via CDN in `index.html` (nessun `tailwind.config.js`)
- **Supabase** — tabella `app_data`, progetto unificato `ckbolwvwnsabsblzcbet`. Credenziali in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env` gitignored)
- **Vercel** — deploy + serverless function in `api/notify.js`
- **OneSignal** — notifiche push (App ID: `08ba5dcc-dbd5-4c44-99c6-bf423f2eb1bb`)

## Struttura file
```
src/
  App.jsx                       # Tutto il codice principale
  main.jsx                      # Entry point + registrazione SW
  supabaseConfig.js             # Legge VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY da env
  supabaseDDP.js                # loadDDPCommesse() — stesso DB unificato
  components/
    SmartLogView.jsx            # Vista fullscreen in Smart Mode
    SmartLogWizard.jsx          # Wizard inserimento log (Smart Mode)
api/
  notify.js                     # Vercel serverless — push via OneSignal
public/
  manifest.json                 # PWA manifest
  sw.js                         # Service worker base
  OneSignalSDKWorker.js         # Service worker OneSignal (OBBLIGATORIO per push)
  icon-192.png
  icon-512.png
```

## Dati su Supabase
Tabella `app_data`, progetto unificato `ckbolwvwnsabsblzcbet`:
- `utenti` — anagrafica condivisa cross-app: `[{ id, username, password_hash, apps:{ log:{enabled,level,canBackup,canNotify}, … } }]`
- `log_logs` — array di voci log (chiave logica `logs` rimappata via `KEY_REMAP` in App.jsx → `log_logs`):
  ```json
  {
    "id": "uuid",
    "data": "2026-06-19",
    "ora": "10:30",
    "operatore": "mario",
    "tipo": "cambio_progetto",
    "commessa": "CM-001",
    "titolo": "Cambio materiale porta",
    "descrizione": "Testo libero con dettagli...",
    "created_at": "2026-06-19T10:30:00.000Z"
  }
  ```

> `log_logs` è attualmente vuoto (`[]`): nessuna voce reale inserita post-migrazione.

## Tipi di log
| Valore | Label | Icona |
|---|---|---|
| `cambio_progetto` | Cambio progetto | 🔄 |
| `variazione` | Variazione | ⚠️ |
| `annotazione` | Annotazione | 📝 |
| `osservazione` | Osservazione | 👁️ |
| `decisione` | Decisione | ✅ |

## Utenti e ruoli
Anagrafica condivisa `utenti` — slice `apps.log.{enabled, level, canBackup, canNotify}`.
- `level: 'ufficio'` — accesso completo, vede ⚙️ impostazioni, può eliminare qualsiasi log
- `level: 'produzione'` — può aggiungere log e eliminare solo i propri
- `canBackup`, `canNotify` — stessa logica delle altre app
- Slice assente = utente abilitato (backward compat)

## Smart Mode
- Toggle persistito in `localStorage` con chiave `log_produzione_smart_mode`
- **OFF**: lista normale con filtri + FAB "+" per modal form (`LogEntryForm`)
- **ON**: banner arancione → apre `SmartLogView` (fullscreen); FAB "+" → `SmartLogWizard`
- `SmartLogWizard`: step 0 = selezione tipo con card grandi (auto-avanza), poi commessa → titolo → descrizione
- `SmartLogView`: lista raggruppata per data con filtri, "Aggiungi log" in fondo

## Notifiche push OneSignal
- App ID: `08ba5dcc-dbd5-4c44-99c6-bf423f2eb1bb` (in `index.html`)
- `public/OneSignalSDKWorker.js` — obbligatorio per la registrazione del service worker push
- Tag `username` impostato su login (`os.User.addTag`), rimosso su logout
- `api/notify.js` — serverless, usa `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY` da env vars
- Il frontend LOG **non chiama ancora** `sendNotify` — i trigger di notifica non sono implementati

## PWA / Install
- `beforeinstallprompt` catturato → pulsante "📲 Installa app" verde nell'header
- Service worker in `public/sw.js` (base, solo cache-then-network)

## Variabili d'ambiente Vercel
Settings → Environment Variables:
```
VITE_SUPABASE_URL=https://ckbolwvwnsabsblzcbet.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
ONESIGNAL_APP_ID=08ba5dcc-dbd5-4c44-99c6-bf423f2eb1bb
ONESIGNAL_REST_API_KEY=<os_v2_app_...>
```

## Comandi
```bash
cd "F:\Claude sessioni\LOG Produzione"
npm install
npm run dev        # localhost:5173
npm run build
git add . && git commit -m "..." && git push   # deploy Vercel
```

## Note tecniche
- SHA-256 hashing identico alle altre app (non reversibile)
- `Btn` component definito inline in `App.jsx`
- I log sono salvati in ordine inverso (più recente in cima all'array)
- La visualizzazione normale raggruppa per data (`formatDate` riconosce "Oggi" e "Ieri")
- `KEY_REMAP` in App.jsx mappa la chiave logica `logs` → `log_logs` (la chiave bare `logs` nel DB era usata da una versione precedente, ora rimossa)
- `sliceEnabled(slice)`: `!slice || slice.enabled !== false` — slice assente = abilitato (backward compat)
