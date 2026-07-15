# LOG Produzione — CLAUDE.md

## Stack

- React 18 + Vite 5, Tailwind CSS via CDN
- Supabase (`@supabase/supabase-js` v2) — progetto unificato `ckbolwvwnsabsblzcbet` — **password dashboard:** `Basile@1830!`
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
| `app_data` key `log_checklists` | Checklist di progetto (lettura/scrittura) |
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
  tipo: 'cambio_progetto' | 'variazione' | 'annotazione' | 'osservazione' | 'decisione' | 'checklist',
  commessa?: string,
  titolo: string,
  descrizione?: string,
  checklistId?: string,   // presente quando tipo === 'checklist' — usato per navigazione
  itemId?: string,        // presente per eventi "Spuntato: X" — usato per rimozione precisa
  checklistNome?: string, // nome della checklist — mostrato nel cronologico per contesto
  created_at: string,
  // NOTA: updated_at non presente — sort usa solo il campo `data` della voce
}
```

## Schema checklist entry

```js
{
  id: string,        // UUID
  nome: string,
  commessa: string,  // opzionale
  createdBy: string,
  createdAt: string, // ISO timestamp
  items: [
    {
      id: string,
      testo: string,
      assignedTo: string | null,
      checked: boolean,
      checkedBy: string | null,
      checkedAt: string | null,
      addedBy: string,
      addedAt: string,
    }
  ]
}
```

**preItems pattern**: `handleCreateChecklist(nome, commessa, preItems=[])` crea tutti gli
item in un colpo solo con una singola voce in log_logs ("Creata checklist — nome"), evitando
spam di "Aggiunto: X" nel Cronologico. ChecklistForm e SmartChecklistForm usano entrambi preItems.

**Logica log spunta/deselect** (`handleCheckItem`):
- `checked = true` → scrive entry in log_logs con `tipo: 'checklist'`, `titolo: 'Spuntato: X'`, `itemId`, `checklistNome`
- `checked = false` → rimuove silenziosamente (senza confirm) l'entry corrispondente dal log,
  cercando per `checklistId + itemId` (entry nuove) o fallback su `titolo` (entry vecchie senza itemId)
- Se non trova nessuna entry corrispondente, non fa nulla

**Cronologico — eventi checklist**: mostrano `☑️ <checklistNome> · Tocca per aprire →` sotto
il titolo, così "Spuntato: X" e "Aggiunto: X" hanno contesto su quale checklist appartengono.

**ChecklistDetail — item completati**: mostrano orario (se spuntato oggi) o data breve (se altro
giorno) accanto a `checkedBy`, es. `· ✓ mario · 14:32` oppure `· ✓ mario · 10 lug`.

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

1. **Cronologico** — tutti i log ordinati per data (include eventi checklist cliccabili)
2. **Checklist** — lista checklist + vista dettaglio singola checklist con progress bar
3. **Commessa** — raggruppati per codice commessa
4. **Tipo** — raggruppati per tipo voce
5. **Autore** — raggruppati per operatore
6. **Le mie checklist** — checklist con item assegnati all'utente corrente
7. **I miei LOG** — solo le voci dell'utente corrente

## Deep-link

- `?commessa=<codice>` → imposta `viewMode='commessa'` e preseleziona il gruppo
- `?tab=checklist` → apre direttamente la tab Checklist al caricamento

## Checklist — permessi

| Azione | Admin (ufficio) | User (produzione) |
|---|---|---|
| Creare checklist | Sì | Sì |
| Eliminare checklist | Qualsiasi | Solo proprie |
| Aggiungere item | Sì | Sì |
| Rimuovere item | Sì | Solo item propri non ancora checkati |
| Checkare item | Sì | Solo item assegnati a sé |
| Assegnare item | Sì (con select utenti) | No |

## Smart Mode

Componente `SmartLogWizard` — wizard a step per guidare l'inserimento di nuove voci.

`SmartChecklistForm` — wizard a 2 step per creare checklist:
- Step 1: Nome + Commessa
- Step 2: Elementi (input + assign per admin, lista preview)

Il FAB nella tab Checklist apre `SmartChecklistForm` se smart mode ON, `ChecklistForm` se OFF.
`ChecklistForm` (standard) include anch'esso la sezione preItems.

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
