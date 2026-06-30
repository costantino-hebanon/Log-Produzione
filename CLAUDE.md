# LOG Produzione — CLAUDE.md

## Stack

- React 18 + Vite 5, Tailwind CSS via CDN
- Supabase (`@supabase/supabase-js` v2) — progetto unificato `ckbolwvwnsabsblzcbet`
- Deploy: Vercel, push su `main` → deploy automatico
- URL: https://log-produzione.vercel.app

## Variabili d'ambiente

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Struttura dati (Supabase)

| Tabella/chiave | Uso |
|---|---|
| `app_data` key `log_logs` | Log di produzione (lettura/scrittura) |
| `commesse` | Anagrafica commesse — sola lettura |
| `app_data` key `utenti` | Utenti condivisi tra tutte le app |

**KEY_REMAP**: il codice usa `dbGet('logs')` / `dbSet('logs', …)` tradotti internamente
in `log_logs`. Non usare la chiave `logs` direttamente su Supabase.

## Schema log entry

```js
{
  id: string,          // UUID
  data: string,        // 'YYYY-MM-DD'
  ora: string,         // 'HH:MM'
  operatore: string,
  tipo: 'cambio_progetto' | 'variazione' | 'annotazione' | 'osservazione' | 'decisione',
  commessa?: string,
  titolo: string,
  descrizione?: string,
  created_at: string,
  // NOTA: updated_at non presente — sort usa solo il campo `data` della voce
}
```

## Autenticazione

- Password hashata SHA-256 lato client
- Sessione in `sessionStorage` chiave `log_session`; `APP_KEY = 'log'`
- Slice utente: `apps.log = { enabled, level, canBackup, canNotify }`
- `normalizeLevel`: `'ufficio'` → `'admin'`; tutto il resto → `'user'`
- `isUfficio = user?.level === 'admin'`
- Compatibilità: slice senza `enabled` = utente abilitato (stato pre-migrazione)

## SSO Hub → App

Query param: `?hub_user=<username>&hub_token=<sha256>`
L'app verifica il token e apre la sessione senza richiedere password.

## Deep-link

Query param `?commessa=<codice>` → imposta `viewMode='commessa'` e preseleziona il gruppo.

## Permessi

| Livello | Modifica/elimina log altrui | Modifica/elimina propri |
|---|---|---|
| `admin` (ufficio) | Si | Si |
| `user` (produzione) | No | Si |

## Viste disponibili

1. **Cronologico** — tutti i log ordinati per data
2. **Commessa** — raggruppati per codice commessa
3. **Tipo** — raggruppati per tipo voce
4. **Autore** — raggruppati per operatore
5. **I miei LOG** — solo le voci dell'utente corrente

## Smart Mode

Componente `SmartLogWizard` — wizard a step per guidare l'inserimento di nuove voci.

## OneSignal (notifiche push)

- Worker: `public/OneSignalSDKWorker.js`
- Al login: imposta tag `username` sul dispositivo
- Al logout: rimuove il tag

## Avvertenze / Bug noti

- **KEY_REMAP**: usare sempre `dbGet('logs')` / `dbSet('logs', …)`, mai `log_logs` diretto.
- **`updated_at` assente**: le voci log non hanno `updated_at`; sort solo su `data`.
- **`saveUsers` distruttivo**: riscrive l'intera lista `utenti`. Utenti non inclusi
  vengono eliminati da tutte le app — usare con cautela.

## Comandi

```bash
npm run dev      # sviluppo locale
npm run build    # build produzione
npm run preview  # anteprima build
```
