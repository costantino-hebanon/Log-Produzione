# LOG Produzione — CLAUDE.md

## Reference dati & analisi
[📊 Hebanon — Reference dati, schemi DB e catalogo analisi](https://claude.ai/code/artifact/74178f73-e552-4e31-9f15-86ca14d1e772) — documento completo con architettura Supabase (3 progetti), schemi di tutte le app, ~70 analisi di business, avvertenze critiche (no prezzi, no commessa unificata, date miste) e blocco da incollare in chat.

## Scopo
App per tracciare il log delle attività di produzione: cambi di progetto, variazioni in corso d'opera, annotazioni, osservazioni, decisioni prese durante conversazioni, ecc.

## Stack
- **React 18 + Vite 5** — tutto in `src/App.jsx` + componenti in `src/components/`
- **Tailwind CSS** via CDN in `index.html` (nessun `tailwind.config.js`)
- **Supabase** — key-value store su tabella `app_data` (chiave `key`, valore JSONB `value`)
- **Vercel** — deploy + serverless function in `api/notify.js`
- **OneSignal** — notifiche push (App ID da configurare in `api/notify.js`)

## Struttura file
```
src/
  App.jsx                       # Tutto il codice principale
  main.jsx                      # Entry point + registrazione SW
  supabaseConfig.js             # Credenziali Supabase (da configurare)
  components/
    SmartLogView.jsx            # Vista fullscreen in Smart Mode
    SmartLogWizard.jsx          # Wizard inserimento log (Smart Mode)
api/
  notify.js                     # Vercel serverless — push via OneSignal
public/
  manifest.json                 # PWA manifest
  sw.js                         # Service worker base
  icon-192.png                  # Icona PWA (da aggiungere)
  icon-512.png                  # Icona PWA (da aggiungere)
```

## Dati su Supabase
Tabella `app_data`, stessa struttura delle altre app:
- `users` — array `{ username, password (SHA-256), level, canBackup, canNotify }`
- `logs` — array di voci log, ordinate più recente prima:
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

## Tipi di log
| Valore | Label | Icona |
|---|---|---|
| `cambio_progetto` | Cambio progetto | 🔄 |
| `variazione` | Variazione | ⚠️ |
| `annotazione` | Annotazione | 📝 |
| `osservazione` | Osservazione | 👁️ |
| `decisione` | Decisione | ✅ |

## Utenti e ruoli
- `level: 'ufficio'` — accesso completo, vede ⚙️ impostazioni, può eliminare qualsiasi log
- `level: 'produzione'` — può aggiungere log e eliminare solo i propri
- `canBackup`, `canNotify` — stessa logica delle altre app

## Smart Mode
- Toggle persistito in `localStorage` con chiave `log_produzione_smart_mode`
- **OFF**: lista normale con filtri + FAB "+" per modal form (`LogEntryForm`)
- **ON**: banner arancione → apre `SmartLogView` (fullscreen); FAB "+" → `SmartLogWizard`
- `SmartLogWizard`: step 0 = selezione tipo con card grandi (auto-avanza), poi commessa → titolo → descrizione
- `SmartLogView`: lista raggruppata per data con filtri, "Aggiungi log" in fondo

## PWA / Install
- `beforeinstallprompt` catturato → pulsante "📲 Installa app" verde nell'header
- Service worker in `public/sw.js` (base, solo cache-then-network)
- **Aggiungere icone**: metti `icon-192.png` e `icon-512.png` in `public/` per completare la PWA

## Setup iniziale
1. Crea progetto Supabase → copia URL e anon key in `src/supabaseConfig.js`
2. Esegui questo SQL su Supabase per creare la tabella:
   ```sql
   create table app_data (
     key text primary key,
     value jsonb
   );
   ```
3. Inserisci il primo utente admin:
   ```sql
   insert into app_data (key, value) values (
     'users',
     '[{"username":"admin","password":"<sha256 della password>","level":"ufficio","canBackup":false,"canNotify":false}]'
   );
   ```
4. Inserisci `logs` vuoto:
   ```sql
   insert into app_data (key, value) values ('logs', '[]');
   ```
5. Configura OneSignal: inserisci App ID in `api/notify.js` e `ONESIGNAL_API_KEY` nelle env vars Vercel

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
- `SettingsModal` usa lo stesso pattern view/edit mode della Ferramenta App (`editingIndex`, `showPwd`)
