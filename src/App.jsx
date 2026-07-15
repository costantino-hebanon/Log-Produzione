import { useState, useEffect } from 'react';
import { supabase } from './supabaseConfig';
import { loadDDPCommesse } from './supabaseDDP';
import SmartLogWizard from './components/SmartLogWizard';

// ── SHA-256 ───────────────────────────────────────────────────────────────────
async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Supabase (progetto unificato, migrazione 2026-06-23) ────────────────────────
// Chiavi namespacizzate: i log di questa app vivono in `log_logs`. Gli utenti sono
// nella lista condivisa `utenti` con struttura { username, password_hash, apps:{log:{level}}, ... }.
const APP = 'log';
const KEY_REMAP = { logs: 'log_logs' };
async function dbGet(key) {
  const real = KEY_REMAP[key] || key;
  const { data } = await supabase.from('app_data').select('value').eq('key', real).single();
  return data?.value ?? null;
}
async function dbSet(key, value) {
  const real = KEY_REMAP[key] || key;
  await supabase.from('app_data').upsert({ key: real, value }, { onConflict: 'key' });
}

// Anagrafica condivisa con abilitazione per-app: LOG vede TUTTI gli utenti; l'accesso
// è dato da apps.log.enabled. Campo `password` = hash (come si aspetta la UI LOG).
// Compatibilità: slice presente senza `enabled` = abilitata (stato pre-modifica).
const DEFAULT_LEVEL = 'user';
const sliceEnabled = (slice) => !slice || slice.enabled !== false;
function normalizeLevel(l) { return (l === 'ufficio' || l === 'admin') ? 'admin' : 'user'; }
const ALL_APPS_SEED = (level, canBackup) => ({
  ferramenta: { enabled: true, level, canBackup, canNotify: false },
  magazzino:  { enabled: true, level, canBackup, canNotify: false },
  ddp:        { enabled: true, level, canBackup, canNotify: false },
  log:        { enabled: true, level, canBackup, canNotify: false },
  pannelli:   { enabled: true, level, canBackup: false, canNotify: false },
  analisi:    { enabled: true, level, canBackup: false, canNotify: false },
});
async function loadUsers() {
  let all = (await dbGet('utenti')) || [];
  if (!all.length) {
    const [h1, h2] = await Promise.all([sha256('admin'), sha256('user')]);
    all = [
      { id: '1', username: 'admin', password_hash: h1, apps: ALL_APPS_SEED('admin', true) },
      { id: '2', username: 'user',  password_hash: h2, apps: ALL_APPS_SEED('user', false) },
    ];
    await dbSet('utenti', all);
  }
  return all.map(u => {
    const s = u.apps?.[APP] || {};
    return {
      id: u.id,
      username: u.username,
      password: u.password_hash,
      enabled: sliceEnabled(u.apps?.[APP]),
      level: normalizeLevel(s.level ?? DEFAULT_LEVEL),
      canBackup: !!s.canBackup,
      canNotify: !!s.canNotify,
    };
  });
}
// Aggiorna solo la slice apps.log nell'anagrafica condivisa; gli utenti rimossi
// da questa app perdono solo l'accesso al LOG, non vengono cancellati globalmente.
async function saveUsers(logUsers) {
  const all = (await dbGet('utenti')) || [];
  // Parte da tutti gli utenti globali per non cancellare chi appartiene ad altre app
  const result = all.map(u => ({ ...u, apps: { ...(u.apps || {}) } }));
  for (const lu of logUsers) {
    const idx = result.findIndex(x => (lu.id && x.id === lu.id) || x.username.toLowerCase() === lu.username.toLowerCase());
    if (idx >= 0) {
      const u = result[idx];
      if (lu.password) u.password_hash = lu.password;
      u.username = lu.username;
      u.apps[APP] = { enabled: !!lu.enabled, level: lu.level, canBackup: !!lu.canBackup, canNotify: !!lu.canNotify };
    } else {
      const u = { id: lu.id || (String(Date.now()) + Math.floor(Math.random() * 1e4)), username: lu.username, password_hash: lu.password || '', apps: {} };
      u.apps[APP] = { enabled: !!lu.enabled, level: lu.level, canBackup: !!lu.canBackup, canNotify: !!lu.canNotify };
      result.push(u);
    }
  }
  // Utenti non più in logUsers: rimuove solo la slice di questa app, non l'utente globale
  for (const u of result) {
    const managed = logUsers.some(lu => (lu.id && lu.id === u.id) || lu.username.toLowerCase() === u.username.toLowerCase());
    if (!managed) delete u.apps[APP];
  }
  await dbSet('utenti', result);
}

// ── Costanti ──────────────────────────────────────────────────────────────────
const TIPI = [
  { value: 'cambio_progetto', label: 'Cambio progetto', icon: '🔄', badge: 'bg-blue-100 text-blue-700' },
  { value: 'variazione',      label: 'Variazione',      icon: '⚠️',  badge: 'bg-orange-100 text-orange-700' },
  { value: 'annotazione',     label: 'Annotazione',     icon: '📝', badge: 'bg-gray-100 text-gray-700' },
  { value: 'osservazione',    label: 'Osservazione',    icon: '👁️',  badge: 'bg-purple-100 text-purple-700' },
  { value: 'decisione',       label: 'Decisione',       icon: '✅', badge: 'bg-green-100 text-green-700' },
];
const TIPO_MAP   = Object.fromEntries(TIPI.map(t => [t.value, t]));
const TIPO_ORDER = TIPI.map(t => t.value);

const CHECKLIST_TYPE = { value: 'checklist', label: 'Checklist', icon: '☑️', badge: 'bg-blue-100 text-blue-700' };
function getTipoMeta(tipo) {
  if (tipo === 'checklist') return CHECKLIST_TYPE;
  return TIPO_MAP[tipo] || { label: tipo || 'annotazione', icon: '📝', badge: 'bg-gray-100 text-gray-700' };
}

const VIEW_TABS = [
  { key: 'cronologico',    label: 'Cronologico',      icon: '📅' },
  { key: 'checklist',      label: 'Checklist',        icon: '☑️' },
  { key: 'commessa',       label: 'Commessa',         icon: '🏗️' },
  { key: 'tipo',           label: 'Tipo',             icon: '🏷️' },
  { key: 'autore',         label: 'Autore',           icon: '👤' },
  { key: 'miei_checklist', label: 'Le mie checklist', icon: '✅' },
  { key: 'miei',           label: 'I miei LOG',       icon: '🙋' },
];

const EMPTY_COMMESSA = '(Senza commessa)';

// ── Backup helpers ────────────────────────────────────────────────────────────
const BACKUP_HISTORY_KEY = 'log_backup_history';
const BACKUP_LAST_TS_KEY  = 'log_last_backup_ts';
const MAX_BACKUPS = 10;

function isBackupDue() {
  const now = new Date();
  const checkpoint = new Date(now);
  checkpoint.setHours(8, 0, 0, 0);
  if (now < checkpoint) checkpoint.setDate(checkpoint.getDate() - 1);
  const lastTs = parseInt(localStorage.getItem(BACKUP_LAST_TS_KEY) || '0');
  return lastTs < checkpoint.getTime();
}

function saveBackupToHistory(logs) {
  try {
    const history = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]');
    history.unshift({ ts: Date.now(), logs });
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_BACKUPS)));
    localStorage.setItem(BACKUP_LAST_TS_KEY, Date.now().toString());
  } catch (e) { console.error('Backup fallito:', e); }
}

function downloadBackupFile(logs, ts = Date.now()) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.toISOString().slice(0, 10)}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const blob = new Blob(
    [JSON.stringify({ logs, exportedAt: d.toISOString() }, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `log_produzione_backup_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today)     return 'Oggi';
  if (dateStr === yesterday) return 'Ieri';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function getDateRange(entries) {
  const dates = entries.map(e => e.data).filter(Boolean).sort();
  if (!dates.length) return '';
  if (dates.length === 1 || dates[0] === dates[dates.length - 1]) return formatDateShort(dates[0]);
  return `${formatDateShort(dates[0])} → ${formatDateShort(dates[dates.length - 1])}`;
}

function getUniqueTypes(entries) {
  const set = new Set(entries.map(e => e.tipo).filter(Boolean));
  return TIPO_ORDER.filter(t => set.has(t)).map(t => TIPO_MAP[t]);
}

function getUniqueAuthors(entries) {
  return [...new Set(entries.map(e => e.operatore).filter(Boolean))];
}

// ── Grouping ──────────────────────────────────────────────────────────────────
function groupLogs(logs, mode) {
  const groups = {};
  logs.forEach(e => {
    let key;
    if      (mode === 'commessa') key = e.commessa?.trim() || EMPTY_COMMESSA;
    else if (mode === 'tipo')     key = e.tipo || 'annotazione';
    else if (mode === 'autore')   key = e.operatore || 'Sconosciuto';
    else                          key = e.data || 'Senza data';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  return groups;
}

function sortGroupKeys(keys, mode) {
  if (mode === 'tipo') {
    return [...keys].sort((a, b) => {
      const ai = TIPO_ORDER.indexOf(a), bi = TIPO_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }
  if (mode === 'commessa') {
    return [...keys].sort((a, b) => {
      if (a === EMPTY_COMMESSA) return 1;
      if (b === EMPTY_COMMESSA) return -1;
      return a.localeCompare(b, 'it');
    });
  }
  return [...keys].sort((a, b) => a.localeCompare(b, 'it'));
}

// ── Btn ───────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, color = 'gray', small, disabled, className = '' }) {
  const C = {
    blue:  'bg-blue-600 hover:bg-blue-700 text-white border-blue-700',
    green: 'bg-green-600 hover:bg-green-700 text-white border-green-700',
    red:   'bg-red-600 hover:bg-red-700 text-white border-red-700',
    gray:  'bg-gray-200 hover:bg-gray-300 text-gray-800 border-gray-300',
    amber: 'bg-amber-400 hover:bg-amber-500 text-white border-amber-500',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`font-semibold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
        ${small ? 'text-xs px-2 py-1' : 'text-sm px-3 py-2'} ${C[color] || C.gray} ${className}`}
    >{children}</button>
  );
}

// ── CommessaField ─────────────────────────────────────────────────────────────
function CommessaField({ value, onChange, commesse }) {
  return (
    <div>
      <input
        type="text"
        list="log-commesse-dl"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="— Nessuna —"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white"
      />
      <datalist id="log-commesse-dl">
        {commesse.map(c => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}

// ── LogDetailModal ────────────────────────────────────────────────────────────
function LogDetailModal({ entry, onClose }) {
  const t = TIPO_MAP[entry.tipo] || { label: entry.tipo, icon: '📝', badge: 'bg-gray-100 text-gray-700' };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full rounded-t-3xl sm:rounded-3xl shadow-2xl sm:max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b flex-shrink-0">
          <button onClick={onClose} className="text-blue-600 font-semibold text-sm flex items-center gap-1 hover:text-blue-700">← Indietro</button>
          <span className={`text-xs font-semibold rounded-full px-3 py-1 ${t.badge}`}>{t.icon} {t.label}</span>
          <div className="w-16" />
        </div>
        <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
          <p className="text-2xl font-bold text-gray-800 leading-snug">{entry.titolo}</p>
          {entry.commessa && (
            <span className="inline-block text-sm bg-gray-100 text-gray-600 rounded-full px-3 py-1">{entry.commessa}</span>
          )}
          {entry.descrizione && (
            <p className="text-base text-gray-600 leading-relaxed whitespace-pre-wrap border-l-4 border-gray-200 pl-4">{entry.descrizione}</p>
          )}
          <div className="border-t pt-4 space-y-1.5 text-sm text-gray-500">
            <p>👤 <span className="font-medium text-gray-700">{entry.operatore}</span></p>
            <p>📅 {formatDate(entry.data)}{entry.ora ? ` alle ${entry.ora}` : ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LogEntryForm ──────────────────────────────────────────────────────────────
function LogEntryForm({ onSave, onClose, currentUser, ddpCommesse = [], editEntry = null }) {
  const isUfficio = currentUser?.level === 'admin';
  const [tipo, setTipo]               = useState(editEntry?.tipo || 'annotazione');
  const [operatore, setOperatore]     = useState(editEntry?.operatore || currentUser?.username || '');
  const [commessa, setCommessa]       = useState(editEntry?.commessa || '');
  const [titolo, setTitolo]           = useState(editEntry?.titolo || '');
  const [descrizione, setDescrizione] = useState(editEntry?.descrizione || '');

  const handleSubmit = () => {
    if (!titolo.trim()) return;
    if (editEntry) {
      onSave({
        ...editEntry,
        tipo,
        operatore: isUfficio ? (operatore.trim() || currentUser?.username) : currentUser?.username,
        commessa: commessa.trim(), titolo: titolo.trim(), descrizione: descrizione.trim(),
      });
    } else {
      const now = new Date();
      onSave({
        id: crypto.randomUUID(),
        data: now.toISOString().slice(0, 10),
        ora: now.toTimeString().slice(0, 5),
        operatore: isUfficio ? (operatore.trim() || currentUser?.username) : currentUser?.username,
        tipo, commessa: commessa.trim(), titolo: titolo.trim(), descrizione: descrizione.trim(),
        created_at: now.toISOString(),
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">{editEntry ? 'Modifica log' : 'Nuovo log'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
              {TIPI.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Operatore</label>
            {isUfficio ? (
              <input type="text" value={operatore} onChange={e => setOperatore(e.target.value)}
                placeholder="Nome operatore…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            ) : (
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">{currentUser?.username}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Commessa <span className="font-normal text-gray-400">(opzionale)</span></label>
            {ddpCommesse.length > 0
              ? <CommessaField value={commessa} onChange={setCommessa} commesse={ddpCommesse} />
              : <input type="text" value={commessa} onChange={e => setCommessa(e.target.value)} placeholder="Es. CM-001"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            }
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Titolo *</label>
            <input type="text" value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Breve descrizione…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              onKeyDown={e => { if (e.key === 'Enter' && titolo.trim()) document.getElementById('log-desc')?.focus(); }} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Dettagli <span className="font-normal text-gray-400">(opzionale)</span></label>
            <textarea id="log-desc" rows={4} value={descrizione} onChange={e => setDescrizione(e.target.value)}
              placeholder="Note, contesto, motivazioni, decisioni prese…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2 flex-shrink-0 border-t pt-4">
          <Btn onClick={onClose}>Annulla</Btn>
          <Btn color="green" onClick={handleSubmit} disabled={!titolo.trim()}>✓ Salva</Btn>
        </div>
      </div>
    </div>
  );
}

// ── ChecklistForm ─────────────────────────────────────────────────────────────
function ChecklistForm({ onSave, onClose, ddpCommesse = [], users = [], isUfficio = false }) {
  const [nome, setNome]         = useState('');
  const [commessa, setCommessa] = useState('');
  const [itemText, setItemText] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [items, setItems]       = useState([]);

  const addItem = () => {
    const t = itemText.trim();
    if (!t) return;
    setItems(prev => [...prev, { testo: t, assignedTo: assignTo || null }]);
    setItemText('');
    setAssignTo('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full rounded-t-3xl sm:rounded-2xl shadow-2xl sm:max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">☑️ Nuova checklist</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Nome checklist *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Verifica pre-consegna…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              autoFocus onKeyDown={e => { if (e.key === 'Enter') document.getElementById('cl-commessa-std')?.focus(); }} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Commessa <span className="font-normal text-gray-400">(opzionale)</span></label>
            {ddpCommesse.length > 0
              ? <CommessaField value={commessa} onChange={setCommessa} commesse={ddpCommesse} />
              : <input id="cl-commessa-std" type="text" value={commessa} onChange={e => setCommessa(e.target.value)} placeholder="Es. CM-001"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            }
          </div>
          <div className="border-t pt-4">
            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">
              Elementi iniziali <span className="font-normal text-gray-400">(opzionale — ↵ per aggiungere)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input type="text" value={itemText} onChange={e => setItemText(e.target.value)}
                placeholder="Descrivi l'elemento…"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                onKeyDown={e => { if (e.key === 'Enter') addItem(); }} />
              <Btn color="blue" small onClick={addItem} disabled={!itemText.trim()}>+</Btn>
            </div>
            {isUfficio && (
              <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 mb-2">
                <option value="">— Nessun assegnatario —</option>
                {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
              </select>
            )}
            {items.length > 0 && (
              <div className="space-y-1.5">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-gray-300 text-base">☐</span>
                    <span className="flex-1 text-sm text-gray-700">{it.testo}</span>
                    {it.assignedTo && <span className="text-xs text-blue-500 font-medium">→ {it.assignedTo}</span>}
                    <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-300 hover:text-red-400 text-base transition-colors">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2 flex-shrink-0 border-t pt-4">
          <Btn onClick={onClose}>Annulla</Btn>
          <Btn color="blue" onClick={() => { onSave(nome.trim(), commessa.trim(), items); onClose(); }} disabled={!nome.trim()}>
            ☑️ Crea{items.length > 0 ? ` (${items.length})` : ''}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── SmartChecklistForm ────────────────────────────────────────────────────────
function SmartChecklistForm({ onSave, onClose, users = [], isUfficio = false, ddpCommesse = [] }) {
  const [step, setStep]         = useState(1);
  const [nome, setNome]         = useState('');
  const [commessa, setCommessa] = useState('');
  const [itemText, setItemText] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [items, setItems]       = useState([]);

  const addItem = () => {
    const t = itemText.trim();
    if (!t) return;
    setItems(prev => [...prev, { testo: t, assignedTo: assignTo || null }]);
    setItemText('');
    setAssignTo('');
  };

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const goToStep2 = () => {
    if (!nome.trim()) return;
    setStep(2);
    setTimeout(() => document.getElementById('smart-item-input')?.focus(), 50);
  };

  const handleSubmit = () => {
    onSave(nome.trim(), commessa.trim(), items);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full rounded-t-3xl sm:rounded-3xl shadow-2xl sm:max-w-lg flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <div>
                <p className="text-base font-bold text-gray-800 leading-none">Nuova checklist</p>
                <p className="text-xs text-amber-500 font-semibold mt-0.5">Smart mode</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl">×</button>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${step === 1 ? 'bg-amber-400 text-white' : 'bg-green-500 text-white'}`}>
                {step > 1 ? '✓' : '1'}
              </div>
              <span className={`text-xs font-semibold ${step === 1 ? 'text-gray-700' : 'text-green-600'}`}>Dettagli</span>
            </div>
            <div className={`flex-1 h-0.5 rounded ${step > 1 ? 'bg-green-400' : 'bg-gray-200'}`} />
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${step === 2 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-400'}`}>2</div>
              <span className={`text-xs font-semibold ${step === 2 ? 'text-gray-700' : 'text-gray-400'}`}>Elementi</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100 flex-shrink-0" />

        {/* Step 1 — Dettagli */}
        {step === 1 && (
          <div className="flex-1 overflow-auto px-5 py-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Nome checklist *</label>
              <input id="smart-nome-input" type="text" value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Es. Verifica pre-consegna cantiere…"
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-amber-400 transition-colors"
                autoFocus onKeyDown={e => { if (e.key === 'Enter') goToStep2(); }} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Commessa <span className="font-normal text-gray-400 normal-case">(opzionale)</span>
              </label>
              {ddpCommesse.length > 0
                ? <CommessaField value={commessa} onChange={setCommessa} commesse={ddpCommesse} />
                : <input type="text" value={commessa} onChange={e => setCommessa(e.target.value)} placeholder="Es. CM-001"
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 transition-colors"
                    onKeyDown={e => { if (e.key === 'Enter') goToStep2(); }} />
              }
            </div>
            <div className="bg-amber-50 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <span className="text-amber-400 text-base mt-0.5">💡</span>
              <p className="text-xs text-amber-700 leading-relaxed">Nel passo successivo aggiungerai gli elementi della checklist — tutti creati in un colpo solo, senza voci ridondanti in cronologia.</p>
            </div>
          </div>
        )}

        {/* Step 2 — Elementi */}
        {step === 2 && (
          <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-3">
            {/* Riepilogo header commessa */}
            <div className="bg-amber-50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-amber-500 text-base">☑️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{nome}</p>
                {commessa && <p className="text-xs text-amber-600">{commessa}</p>}
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-amber-600 hover:text-amber-800 font-medium underline underline-offset-2">modifica</button>
            </div>

            {/* Input elemento */}
            <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
              <div className="flex gap-2">
                <input id="smart-item-input" type="text" value={itemText} onChange={e => setItemText(e.target.value)}
                  placeholder="Descrivi l'elemento… (↵ per aggiungere)"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400 transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter') addItem(); }} />
                <button onClick={addItem} disabled={!itemText.trim()}
                  className="w-10 h-10 bg-amber-400 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-lg font-bold transition-colors flex-shrink-0 flex items-center justify-center">+</button>
              </div>
              {isUfficio && (
                <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400">
                  <option value="">— Nessun assegnatario —</option>
                  {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
                </select>
              )}
            </div>

            {/* Lista elementi */}
            <div className="flex-1 space-y-1.5">
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                  <span className="text-3xl mb-2 opacity-40">☐</span>
                  <p className="text-sm">Ancora nessun elemento</p>
                  <p className="text-xs mt-0.5">Puoi creare la checklist vuota e aggiungerne dopo</p>
                </div>
              )}
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
                  <span className="text-amber-400 text-base flex-shrink-0">☐</span>
                  <span className="flex-1 text-sm text-gray-700">{it.testo}</span>
                  {it.assignedTo && <span className="text-xs text-blue-500 font-medium bg-blue-50 px-2 py-0.5 rounded-full">→ {it.assignedTo}</span>}
                  <button onClick={() => removeItem(i)} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors text-base flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="h-px bg-gray-100 flex-shrink-0" />
        <div className="px-5 py-4 flex justify-between items-center flex-shrink-0">
          <Btn onClick={step === 1 ? onClose : () => setStep(1)}>{step === 1 ? 'Annulla' : '← Indietro'}</Btn>
          {step === 1
            ? <Btn color="amber" onClick={goToStep2} disabled={!nome.trim()}>Avanti →</Btn>
            : <Btn color="amber" onClick={handleSubmit}>⚡ Crea{items.length > 0 ? ` (${items.length})` : ''}</Btn>
          }
        </div>
      </div>
    </div>
  );
}

// ── ChecklistDetail (component) ───────────────────────────────────────────────
function ChecklistDetail({ cl, users, currentUser, isUfficio, onBack, onDelete, onCheckItem, onAddItem, onRemoveItem }) {
  const [itemText, setItemText]   = useState('');
  const [itemAssign, setItemAssign] = useState('');
  const total = cl.items.length;
  const done  = cl.items.filter(it => it.checked).length;
  const canManage = isUfficio || cl.createdBy === currentUser.username;

  const handleAdd = () => {
    const t = itemText.trim();
    if (!t) return;
    onAddItem(cl.id, t, itemAssign || null);
    setItemText('');
    setItemAssign('');
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-blue-600 text-sm font-semibold mb-3 hover:text-blue-700">
        ← Tutte le checklist
      </button>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <p className="text-xl font-bold text-gray-800 leading-tight">{cl.nome}</p>
            {cl.commessa && <span className="text-sm bg-gray-100 text-gray-600 rounded-full px-3 py-0.5 mt-1.5 inline-block">{cl.commessa}</span>}
          </div>
          {canManage && (
            <button onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded-lg px-2 py-1 transition-colors flex-shrink-0">
              Elimina
            </button>
          )}
        </div>
        {total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{done} / {total} completati</span>
              <span>{Math.round((done / total) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${done === total ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">Creata da {cl.createdBy} · {new Date(cl.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>

      <div className="space-y-2 mb-4">
        {cl.items.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">Nessun elemento — aggiungi il primo qui sotto</p>
        )}
        {cl.items.map(item => {
          const canItemDelete = isUfficio || item.addedBy === currentUser.username;
          const checkedWhen = item.checkedAt ? (() => {
            const d = new Date(item.checkedAt);
            const isToday = d.toDateString() === new Date().toDateString();
            return isToday
              ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
              : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
          })() : null;
          return (
            <div key={item.id} className={`bg-white rounded-xl border p-3 flex items-start gap-3 transition-all ${item.checked ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
              <input type="checkbox" checked={item.checked}
                onChange={e => onCheckItem(cl.id, item.id, e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-blue-600 flex-shrink-0 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-tight ${item.checked ? 'text-gray-400' : 'text-gray-800'}`}>{item.testo}</p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                  {item.assignedTo && <span className="text-blue-500 font-medium">→ {item.assignedTo}</span>}
                  <span>Aggiunto da {item.addedBy}</span>
                  {item.checked && item.checkedBy && (
                    <span>· ✓ {item.checkedBy}{checkedWhen ? ` · ${checkedWhen}` : ''}</span>
                  )}
                </p>
              </div>
              {canItemDelete && !item.checked && (
                <button onClick={() => onRemoveItem(cl.id, item.id)}
                  className="w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-sm transition-colors flex-shrink-0">×</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Aggiungi elemento</p>
        <div className="flex gap-2 mb-2">
          <input type="text" value={itemText} onChange={e => setItemText(e.target.value)}
            placeholder="Descrizione elemento…"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            onKeyDown={e => { if (e.key === 'Enter' && itemText.trim()) handleAdd(); }} />
          <Btn color="blue" onClick={handleAdd} disabled={!itemText.trim()} small>+</Btn>
        </div>
        {isUfficio && (
          <select value={itemAssign} onChange={e => setItemAssign(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
            <option value="">— Nessun assegnatario —</option>
            {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

// ── SettingsModal ─────────────────────────────────────────────────────────────
function SettingsModal({ users, onSave, onClose, currentUsername, isAdmin = true }) {
  const [rows, setRows]             = useState(users.map(u => ({ ...u })));
  const [editingIndex, setEditingIndex] = useState(null);
  const [showPwd, setShowPwd]       = useState(false);
  const [newUser, setNewUser]       = useState({ username: '', password: '', level: 'user' });
  const [adding, setAdding]         = useState(false);

  const set = (i, k, v) => setRows(r => r.map((row, idx) => idx === i ? { ...row, [k]: v } : row));

  const startEdit  = (i) => { setEditingIndex(i); setShowPwd(false); };
  const cancelEdit = (i) => {
    setRows(r => r.map((row, idx) => idx === i ? { ...users[i] } : row));
    setEditingIndex(null); setShowPwd(false);
  };

  const handleSaveRow = async (i) => {
    const row = rows[i];
    let saved = { ...row };
    if (row._newPassword) saved.password = await sha256(row._newPassword);
    delete saved._newPassword;
    const updated = rows.map((r, idx) => idx === i ? saved : r).map(({ _newPassword, ...rest }) => rest);
    setRows(updated); onSave(updated); setEditingIndex(null); setShowPwd(false);
  };

  const handleDelete = (i) => {
    if (rows[i].username === currentUsername) { alert('Non puoi eliminare te stesso.'); return; }
    if (!confirm(`Eliminare ${rows[i].username}? Verrà rimosso da TUTTE le app (anagrafica condivisa).`)) return;
    const updated = rows.filter((_, idx) => idx !== i);
    setRows(updated); onSave(updated);
  };

  const handleAdd = async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) return;
    const hashed  = await sha256(newUser.password);
    const updated = [...rows, { username: newUser.username.trim(), password: hashed, enabled: true, level: newUser.level, canBackup: false, canNotify: false }];
    setRows(updated); onSave(updated);
    setNewUser({ username: '', password: '', level: 'user' }); setAdding(false);
  };

  const LEVEL_LABEL = { admin: 'Ufficio tecnico', user: 'Produzione' };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">⚙️ Impostazioni</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {rows.map((row, i) => {
            const isMe     = row.username === currentUsername;
            const isEditing = editingIndex === i;
            if (!isAdmin && !isMe) return null;
            return (
              <div key={i} className={`rounded-2xl border-2 p-4 ${isMe ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-gray-50/40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-gray-800">{row.username}</span>
                  {isMe && <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">Tu</span>}
                </div>
                {!isEditing ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {isAdmin && (row.enabled
                      ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">Abilitato</span>
                      : <span className="text-xs bg-gray-100 text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Non abilitato</span>)}
                    {isAdmin && <span className="text-xs text-gray-500 bg-gray-100 rounded-lg px-2 py-1">{LEVEL_LABEL[row.level] || row.level}</span>}
                    {isAdmin && row.canBackup  && <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">Backup</span>}
                    {isAdmin && row.canNotify && <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5">Notifiche</span>}
                    {!isAdmin && <span className="text-xs text-gray-400">Modifica la tua password</span>}
                    <div className="ml-auto flex gap-1">
                      <Btn small color="blue" onClick={() => startEdit(i)}>Modifica</Btn>
                      {isAdmin && !isMe && <Btn small color="red" onClick={() => handleDelete(i)}>Elimina</Btn>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {isAdmin && <input type="text" value={row.username} onChange={e => set(i, 'username', e.target.value)}
                      placeholder="Username" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />}
                    {isAdmin && <select value={row.level} onChange={e => set(i, 'level', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
                      <option value="admin">Ufficio tecnico</option>
                      <option value="user">Produzione</option>
                    </select>}
                    <div className="relative">
                      <input type={showPwd ? 'text' : 'password'} value={row._newPassword || ''}
                        onChange={e => set(i, '_newPassword', e.target.value)}
                        placeholder="Nuova password (lascia vuoto per non cambiare)"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:border-blue-400" />
                      <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPwd ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {isAdmin && <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!row.enabled} onChange={e => set(i, 'enabled', e.target.checked)} className="rounded accent-green-600" /> Abilitato (accesso a questa app)
                    </label>}
                    {isAdmin && <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!row.canBackup} onChange={e => set(i, 'canBackup', e.target.checked)} className="rounded" /> Backup auto
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!row.canNotify} onChange={e => set(i, 'canNotify', e.target.checked)} className="rounded" /> Notifiche
                      </label>
                    </div>}
                    <div className="flex gap-2 pt-1">
                      <Btn small color="blue" onClick={() => handleSaveRow(i)}>💾 Salva</Btn>
                      <Btn small onClick={() => cancelEdit(i)}>Annulla</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {isAdmin && (!adding ? (
            <button onClick={() => setAdding(true)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-gray-400 hover:border-blue-400 hover:text-blue-500 text-sm font-medium transition-colors">
              + Aggiungi utente
            </button>
          ) : (
            <div className="rounded-2xl border-2 border-blue-200 p-4 space-y-2 bg-blue-50/30">
              <p className="text-sm font-semibold text-gray-700">Nuovo utente</p>
              <input type="text" value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))}
                placeholder="Username" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              <input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                placeholder="Password" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              <select value={newUser.level} onChange={e => setNewUser(u => ({ ...u, level: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
                <option value="admin">Ufficio tecnico</option>
                <option value="user">Produzione</option>
              </select>
              <div className="flex gap-2 pt-1">
                <Btn small color="blue" onClick={handleAdd} disabled={!newUser.username.trim() || !newUser.password.trim()}>➕ Aggiungi</Btn>
                <Btn small onClick={() => { setAdding(false); setNewUser({ username: '', password: '', level: 'user' }); }}>Annulla</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]                 = useState(() => { try { return JSON.parse(localStorage.getItem('log_session')) || null; } catch { return null; } });
  const [users, setUsers]               = useState([]);
  const [logs, setLogs]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [smartMode, setSmartMode]       = useState(() => localStorage.getItem('log_produzione_smart_mode') === 'true');
  const [showWizard, setShowWizard]     = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [editEntry, setEditEntry]       = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filterTipo, setFilterTipo]     = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [viewMode, setViewMode]         = useState('cronologico');
  const [sortDir, setSortDir]           = useState(() => localStorage.getItem('log_sort_dir') || 'desc');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedLog, setSelectedLog]   = useState(null);
  const [ddpCommesse, setDdpCommesse]   = useState([]);
  const [backupBanner, setBackupBanner] = useState(false);
  const [loginUser, setLoginUser]       = useState('');
  const [loginPass, setLoginPass]       = useState('');
  const [loginErr, setLoginErr]         = useState('');
  const [checklists, setChecklists]           = useState([]);
  const [selectedChecklist, setSelectedChecklist] = useState(null);
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [showSmartChecklist, setShowSmartChecklist] = useState(false);

  useEffect(() => {
    const handler = e => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    (async () => {
      const [u, l, c, cl] = await Promise.all([loadUsers(), dbGet('logs'), loadDDPCommesse(), dbGet('log_checklists')]);
      const mappedUsers = (u || []).map(usr => ({ canBackup: false, canNotify: false, ...usr }));
      setUsers(mappedUsers);
      setLogs(l || []);
      setDdpCommesse(c);
      setChecklists(cl || []);
      // Hub SSO auto-login
      const params = new URLSearchParams(window.location.search);
      const hubUser = params.get('hub_user');
      const hubToken = params.get('hub_token');
      const commessaParam = params.get('commessa');
      const tabParam = params.get('tab');
      if (hubUser || hubToken || commessaParam || tabParam) history.replaceState(null, '', window.location.pathname);
      if (hubUser && hubToken) {
        const found = mappedUsers.find(usr => usr.username?.toLowerCase() === hubUser.toLowerCase() && usr.password === hubToken);
        if (found) {
          localStorage.setItem('log_session', JSON.stringify(found));
          setUser(found);
        }
      }
      if (tabParam && ['cronologico','checklist','commessa','tipo','autore','miei_checklist','miei'].includes(tabParam)) {
        setViewMode(tabParam);
      } else if (commessaParam) {
        setViewMode('commessa');
        setSelectedGroup(commessaParam);
      }
      setLoading(false);
    })();
  }, []);

  // Backup automatico — solo utenti con canBackup abilitato
  useEffect(() => {
    if (loading || !user) return;
    const fullUser = users.find(u => u.username === user.username);
    if (!fullUser?.canBackup) return;
    if (!isBackupDue()) return;
    saveBackupToHistory(logs);
    setBackupBanner(true);
  }, [loading]);

  const toggleSmartMode = () => {
    const next = !smartMode;
    setSmartMode(next);
    localStorage.setItem('log_produzione_smart_mode', String(next));
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstallPrompt(null);
  };

  const handleLogin = async () => {
    setLoginErr('');
    const hash  = await sha256(loginPass);
    const found = users.find(u => u.username === loginUser && u.password === hash);
    if (!found) { setLoginErr('Credenziali non valide'); return; }
    if (!found.enabled) { setLoginErr('Account non abilitato per questa app'); return; }
    localStorage.setItem('log_session', JSON.stringify(found));
    setUser(found);
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(os => os.User.addTag('username', found.username));
  };

  const handleLogout = () => {
    localStorage.removeItem('log_session');
    setUser(null);
    setLoginUser('');
    setLoginPass('');
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(os => os.User.removeTag('username'));
  };

  const handleSaveLogs = async (newLogs) => {
    setLogs(newLogs);
    await dbSet('logs', newLogs);
  };

  const handleAddLog = async (entry) => {
    const withOp = { ...entry, operatore: entry.operatore || user.username };
    await handleSaveLogs([withOp, ...logs]);
  };

  const handleDeleteLog = async (id) => {
    if (!confirm('Eliminare questo log?')) return;
    await handleSaveLogs(logs.filter(e => e.id !== id));
  };

  const handleEditLog = async (updatedEntry) => {
    await handleSaveLogs(logs.map(e => e.id === updatedEntry.id ? updatedEntry : e));
  };

  const handleSaveUsers = async (newUsers) => {
    setUsers(newUsers);
    await saveUsers(newUsers); // ri-fonde nella lista unificata `utenti`
  };

  // ── Checklist CRUD ──
  const handleSaveChecklists = async (updated) => {
    setChecklists(updated);
    await dbSet('log_checklists', updated);
  };

  const handleCreateChecklist = async (nome, commessa, preItems = []) => {
    const now = new Date();
    const cl = {
      id: crypto.randomUUID(),
      nome,
      commessa,
      createdBy: user.username,
      createdAt: now.toISOString(),
      items: preItems.map(it => ({
        id: crypto.randomUUID(),
        testo: it.testo,
        assignedTo: it.assignedTo || null,
        checked: false,
        checkedBy: null,
        checkedAt: null,
        addedBy: user.username,
        addedAt: now.toISOString(),
      })),
    };
    await handleSaveChecklists([...checklists, cl]);
    await handleAddLog({
      id: crypto.randomUUID(),
      data: now.toISOString().slice(0, 10),
      ora: now.toTimeString().slice(0, 5),
      operatore: user.username,
      tipo: 'checklist',
      commessa,
      titolo: `Creata checklist — ${nome}`,
      checklistId: cl.id,
      created_at: now.toISOString(),
    });
  };

  const handleDeleteChecklist = async (id) => {
    if (!confirm('Eliminare questa checklist e tutti i suoi elementi?')) return false;
    await handleSaveChecklists(checklists.filter(c => c.id !== id));
    if (selectedChecklist === id) setSelectedChecklist(null);
    return true;
  };

  const handleAddChecklistItem = async (checklistId, testo, assignedTo) => {
    const now = new Date();
    const item = {
      id: crypto.randomUUID(),
      testo,
      assignedTo: assignedTo || null,
      checked: false,
      checkedBy: null,
      checkedAt: null,
      addedBy: user.username,
      addedAt: now.toISOString(),
    };
    const updated = checklists.map(c => c.id === checklistId ? { ...c, items: [...c.items, item] } : c);
    await handleSaveChecklists(updated);
    const cl = checklists.find(c => c.id === checklistId);
    await handleAddLog({
      id: crypto.randomUUID(),
      data: now.toISOString().slice(0, 10),
      ora: now.toTimeString().slice(0, 5),
      operatore: user.username,
      tipo: 'checklist',
      commessa: cl?.commessa || '',
      titolo: `Aggiunto: ${testo}`,
      checklistNome: cl?.nome || '',
      checklistId,
      created_at: now.toISOString(),
    });
  };

  const handleCheckItem = async (checklistId, itemId, checked) => {
    const now = new Date();
    const cl = checklists.find(c => c.id === checklistId);
    const item = cl?.items.find(it => it.id === itemId);
    const updated = checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: c.items.map(it => it.id === itemId
            ? { ...it, checked, checkedBy: checked ? user.username : null, checkedAt: checked ? now.toISOString() : null }
            : it) }
        : c
    );
    await handleSaveChecklists(updated);
    if (checked) {
      await handleAddLog({
        id: crypto.randomUUID(),
        data: now.toISOString().slice(0, 10),
        ora: now.toTimeString().slice(0, 5),
        operatore: user.username,
        tipo: 'checklist',
        commessa: cl?.commessa || '',
        titolo: `Spuntato: ${item?.testo || ''}`,
        checklistNome: cl?.nome || '',
        checklistId,
        itemId,
        created_at: now.toISOString(),
      });
    } else {
      const without = logs.filter(e =>
        !(e.tipo === 'checklist' && e.checklistId === checklistId &&
          (e.itemId === itemId || e.titolo === `Spuntato: ${item?.testo || ''}`))
      );
      if (without.length < logs.length) await handleSaveLogs(without);
    }
  };

  const handleRemoveChecklistItem = async (checklistId, itemId) => {
    const updated = checklists.map(c =>
      c.id === checklistId ? { ...c, items: c.items.filter(it => it.id !== itemId) } : c
    );
    await handleSaveChecklists(updated);
  };

  const changeView = (key) => { setViewMode(key); setSelectedGroup(null); setSelectedChecklist(null); };

  const isUfficio = user?.level === 'admin'; // normalizeLevel converte 'ufficio' → 'admin'

  // ── Filtered logs ──
  const filtered = logs.filter(e => {
    // Checklist events only appear in cronologico/miei; excluded from tipo/commessa/autore grouping
    if (e.tipo === 'checklist' && viewMode !== 'cronologico' && viewMode !== 'miei') return false;
    if (viewMode === 'miei' && e.operatore !== user.username) return false;
    if (filterTipo && e.tipo !== filterTipo) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      return (
        (e.titolo || '').toLowerCase().includes(q) ||
        (e.descrizione || '').toLowerCase().includes(q) ||
        (e.commessa || '').toLowerCase().includes(q) ||
        (e.operatore || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Groups ──
  const groups         = groupLogs(filtered, viewMode === 'cronologico' ? 'data' : viewMode);
  const sortedKeys     = viewMode === 'cronologico'
    ? Object.keys(groups).sort((a, b) => sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b))
    : sortGroupKeys(Object.keys(groups), viewMode);
  const groupEntries   = selectedGroup ? (groups[selectedGroup] || []) : [];

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">📋</div>
            <h1 className="text-2xl font-black text-gray-800">LOG Produzione</h1>
            <p className="text-gray-400 text-sm mt-1">Tracciamento attività</p>
          </div>
          {loading ? (
            <p className="text-center text-gray-400 py-4">Caricamento…</p>
          ) : (
            <div className="space-y-3">
              <input type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Username"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="Password"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              {loginErr && <p className="text-red-500 text-sm text-center">{loginErr}</p>}
              <button onClick={handleLogin} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl py-3 text-sm transition-colors">Accedi</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── GROUP CARDS ────────────────────────────────────────────────────────────
  const renderGroupCards = () => (
    <div className="space-y-2">
      {sortedKeys.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <span className="text-5xl">📋</span>
          <p>Nessun log trovato</p>
        </div>
      )}
      {sortedKeys.map(groupKey => {
        const entries      = groups[groupKey];
        const uniqueTypes  = getUniqueTypes(entries);
        const uniqueAuthors = getUniqueAuthors(entries);
        const dateRange    = getDateRange(entries);
        const t            = viewMode === 'tipo' ? (TIPO_MAP[groupKey] || null) : null;

        return (
          <button
            key={groupKey}
            onClick={() => setSelectedGroup(groupKey)}
            className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-left hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {/* Group title */}
                {viewMode === 'commessa' && (
                  <p className={`font-bold text-base ${groupKey === EMPTY_COMMESSA ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                    {groupKey}
                  </p>
                )}
                {viewMode === 'tipo' && (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{t?.icon || '📝'}</span>
                    <p className="font-bold text-gray-800 text-base">{t?.label || groupKey}</p>
                  </div>
                )}
                {viewMode === 'autore' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xl">👤</span>
                    <p className="font-bold text-gray-800 text-base">{groupKey}</p>
                  </div>
                )}

                {/* Meta row */}
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {viewMode !== 'tipo' && uniqueTypes.length > 0 && (
                    <div className="flex gap-1">
                      {uniqueTypes.map(tp => (
                        <span key={tp.value} title={tp.label} className="text-base">{tp.icon}</span>
                      ))}
                    </div>
                  )}
                  {viewMode !== 'autore' && uniqueAuthors.length > 0 && (
                    <span className="text-xs text-gray-500">{uniqueAuthors.join(', ')}</span>
                  )}
                  {dateRange && (
                    <span className="text-xs text-gray-400 ml-auto">{dateRange}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                <span className="text-lg font-bold text-blue-600">{entries.length}</span>
                <span className="text-xs text-gray-400">log</span>
                <span className="text-gray-300 text-xl mt-1">›</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  // ── DRILL-DOWN ─────────────────────────────────────────────────────────────
  const renderDrillDown = () => {
    const t = viewMode === 'tipo' ? TIPO_MAP[selectedGroup] : null;
    const groupTitle = t ? `${t.icon} ${t.label}` : selectedGroup;

    return (
      <div>
        <button onClick={() => setSelectedGroup(null)} className="flex items-center gap-1 text-blue-600 text-sm font-semibold mb-3 hover:text-blue-700">
          ← Tutti
        </button>
        <p className="text-xl font-bold text-gray-800 mb-4">{groupTitle}</p>
        <div className="space-y-2">
          {groupEntries.length === 0 && (
            <p className="text-center text-gray-400 py-10">Nessun log in questo gruppo</p>
          )}
          {groupEntries.map(e => {
            const tp = TIPO_MAP[e.tipo] || { label: e.tipo, icon: '📝', badge: 'bg-gray-100 text-gray-700' };
            const canDelete = isUfficio || e.operatore === user.username;
            return (
              <div
                key={e.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:border-blue-200 hover:shadow-md cursor-pointer transition-all"
                onClick={() => setSelectedLog(e)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5 flex-shrink-0">{tp.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {viewMode !== 'tipo' && (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${tp.badge}`}>{tp.label}</span>
                      )}
                      {viewMode !== 'commessa' && e.commessa && (
                        <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{e.commessa}</span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">{formatDateShort(e.data)}{e.ora ? ` · ${e.ora}` : ''}</span>
                    </div>
                    <p className="font-semibold text-gray-800 leading-tight">{e.titolo}</p>
                    {e.descrizione && (
                      <p className="text-sm text-gray-400 mt-0.5 truncate">{e.descrizione}</p>
                    )}
                    {viewMode !== 'autore' && (
                      <p className="text-xs text-gray-400 mt-1">— {e.operatore}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-gray-300 text-xl">›</span>
                    <div className="flex gap-1">
                      {canDelete && (
                        <button
                          onClick={ev => { ev.stopPropagation(); setEditEntry(e); }}
                          className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 flex items-center justify-center text-sm transition-colors"
                        >✏️</button>
                      )}
                      {canDelete && (
                        <button
                          onClick={ev => { ev.stopPropagation(); handleDeleteLog(e.id); }}
                          className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-base transition-colors"
                        >×</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── CRONOLOGICO ────────────────────────────────────────────────────────────
  const renderCronologico = () => (
    <div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
          <span className="text-6xl">📋</span>
          <p className="text-lg font-medium">{viewMode === 'miei' ? 'Non hai ancora inserito log' : 'Nessun log presente'}</p>
          <p className="text-sm">Usa il pulsante + per aggiungere il primo</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map(date => (
            <div key={date}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{formatDate(date)}</p>
              <div className="space-y-2">
                {groups[date].map(e => {
                  const t = getTipoMeta(e.tipo);
                  const isChecklistEvent = e.tipo === 'checklist';
                  const canDelete = !isChecklistEvent && (isUfficio || e.operatore === user.username);
                  return (
                    <div
                      key={e.id}
                      className={`bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md cursor-pointer transition-all ${
                        isChecklistEvent ? 'border-blue-200 hover:border-blue-400' : 'border-gray-200 hover:border-blue-200'
                      }`}
                      onClick={() => {
                        if (isChecklistEvent && e.checklistId) {
                          setViewMode('checklist');
                          setSelectedGroup(null);
                          setSelectedChecklist(e.checklistId);
                        } else {
                          setSelectedLog(e);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl mt-0.5 flex-shrink-0">{t.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${t.badge}`}>{t.label}</span>
                            {e.commessa && <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{e.commessa}</span>}
                            <span className="text-xs text-gray-400 ml-auto">{e.ora}</span>
                          </div>
                          <p className="font-semibold text-gray-800 leading-tight">{e.titolo}</p>
                          {e.descrizione && <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">{e.descrizione}</p>}
                          <p className="text-xs text-gray-400 mt-1.5">— {e.operatore}</p>
                          {isChecklistEvent && (
                            <p className="text-xs text-blue-400 mt-0.5">
                              {e.checklistNome ? `☑️ ${e.checklistNome} · ` : ''}Tocca per aprire →
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <span className="text-gray-300 text-xl">›</span>
                          <div className="flex gap-1">
                            {canDelete && (
                              <button
                                onClick={ev => { ev.stopPropagation(); setEditEntry(e); }}
                                className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 flex items-center justify-center text-sm transition-colors"
                              >✏️</button>
                            )}
                            {canDelete && (
                              <button
                                onClick={ev => { ev.stopPropagation(); handleDeleteLog(e.id); }}
                                className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-base transition-colors"
                              >×</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── CHECKLIST LIST ─────────────────────────────────────────────────────────
  const renderChecklistList = () => {
    const byCommessa = {};
    checklists.forEach(cl => {
      const key = cl.commessa?.trim() || '(Senza commessa)';
      if (!byCommessa[key]) byCommessa[key] = [];
      byCommessa[key].push(cl);
    });
    const keys = Object.keys(byCommessa).sort((a, b) => {
      if (a === '(Senza commessa)') return 1;
      if (b === '(Senza commessa)') return -1;
      return a.localeCompare(b, 'it');
    });

    if (checklists.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <span className="text-5xl">☑️</span>
          <p className="text-lg font-medium">Nessuna checklist presente</p>
          <p className="text-sm">Usa il pulsante + per creare la prima</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {keys.map(key => (
          <div key={key}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{key}</p>
            <div className="space-y-2">
              {byCommessa[key].map(cl => {
                const total = cl.items.length;
                const done  = cl.items.filter(it => it.checked).length;
                const myPending = cl.items.filter(it => it.assignedTo === user.username && !it.checked).length;
                const canManage = isUfficio || cl.createdBy === user.username;
                return (
                  <div key={cl.id}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all"
                    onClick={() => setSelectedChecklist(cl.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-gray-800 text-base flex-1 min-w-0 truncate">{cl.nome}</p>
                          {total > 0 && (
                            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${done === total ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                              {done}/{total}
                            </span>
                          )}
                        </div>
                        {total > 0 && (
                          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${done === total ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${(done / total) * 100}%` }} />
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-gray-400">da {cl.createdBy} · {new Date(cl.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</p>
                          {myPending > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">{myPending} miei in sospeso</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-gray-300 text-xl">›</span>
                        {canManage && (
                          <button onClick={ev => { ev.stopPropagation(); handleDeleteChecklist(cl.id); }}
                            className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-base transition-colors">×</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── CHECKLIST DETAIL ────────────────────────────────────────────────────────
  const renderChecklistDetail = () => {
    const cl = checklists.find(c => c.id === selectedChecklist);
    if (!cl) return <p className="text-center text-gray-400 py-10">Checklist non trovata</p>;
    return (
      <ChecklistDetail
        cl={cl}
        users={users}
        currentUser={user}
        isUfficio={isUfficio}
        onBack={() => setSelectedChecklist(null)}
        onDelete={async () => { await handleDeleteChecklist(cl.id); }}
        onCheckItem={handleCheckItem}
        onAddItem={handleAddChecklistItem}
        onRemoveItem={handleRemoveChecklistItem}
      />
    );
  };

  // ── LE MIE CHECKLIST ────────────────────────────────────────────────────────
  const renderMieiChecklist = () => {
    const myItems = [];
    checklists.forEach(cl => {
      cl.items.forEach(item => {
        if (item.assignedTo === user.username && !item.checked) {
          myItems.push({ ...item, clId: cl.id, clNome: cl.nome, clCommessa: cl.commessa });
        }
      });
    });

    if (myItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <span className="text-5xl">✅</span>
          <p className="text-lg font-medium">Nessun elemento in sospeso</p>
          <p className="text-sm">Ottimo! Non hai compiti assegnati in attesa</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-400 mb-3">{myItems.length} elemento{myItems.length !== 1 ? 'i' : ''} in sospeso</p>
        {myItems.map(item => (
          <div key={`${item.clId}-${item.id}`} className="bg-white rounded-2xl border border-blue-200 shadow-sm p-4 flex items-start gap-3">
            <input type="checkbox" checked={false}
              onChange={() => handleCheckItem(item.clId, item.id, true)}
              className="w-5 h-5 mt-0.5 accent-blue-600 flex-shrink-0 cursor-pointer" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 leading-tight">{item.testo}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <button onClick={() => { setViewMode('checklist'); setSelectedChecklist(item.clId); }}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium">☑️ {item.clNome}</button>
                {item.clCommessa && <span className="text-xs text-gray-400">{item.clCommessa}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── MAIN RENDER ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
          <h1 className="font-black text-gray-800 text-base flex items-center gap-2 flex-1 min-w-0">
            <span>📋</span><span className="truncate">LOG Produzione</span>
          </h1>
          {installPrompt && (
            <button onClick={handleInstall} className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-2 rounded-lg border border-green-600 transition-colors">
              📲 Installa app
            </button>
          )}
          <button onClick={toggleSmartMode}
            className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
              smartMode ? 'bg-amber-400 border-amber-500 text-white' : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
            }`}
          >⚡ Smart {smartMode ? 'ON' : 'OFF'}</button>
          <button onClick={() => setShowSettings(true)} className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200 transition-colors">⚙️</button>
          <button onClick={handleLogout} className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200 transition-colors">Esci</button>
        </div>
      </header>

      {/* Backup banner */}
      {backupBanner && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-blue-700 text-sm flex-1">💾 <b>Backup delle 08:00</b> salvato localmente — vuoi scaricare anche il file?</span>
          <button onClick={() => { downloadBackupFile(logs); setBackupBanner(false); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Scarica</button>
          <button onClick={() => setBackupBanner(false)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Ignora</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="bg-white border-b sticky top-[57px] z-20">
        <div className="overflow-x-auto">
          <div className="flex gap-2 min-w-max px-4 py-2.5 max-w-3xl mx-auto">
            {VIEW_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => changeView(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  viewMode === tab.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">


        {/* Filters — only for log views, not checklist views */}
        {!selectedGroup && viewMode !== 'checklist' && viewMode !== 'miei_checklist' && (
          <div className="flex gap-2 mb-4">
            <input type="text"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 bg-white shadow-sm"
              placeholder="Cerca nel log…"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
            />
            {viewMode !== 'tipo' && (
              <select className="text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:border-blue-400 bg-white shadow-sm"
                value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                <option value="">Tutti i tipi</option>
                {TIPI.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            )}
            {(viewMode === 'cronologico' || viewMode === 'miei') && (
              <button
                onClick={() => setSortDir(d => { const next = d === 'desc' ? 'asc' : 'desc'; localStorage.setItem('log_sort_dir', next); return next; })}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white shadow-sm hover:bg-gray-50 transition-colors whitespace-nowrap"
                title={sortDir === 'desc' ? 'Dal più recente' : 'Dal meno recente'}
              >
                {sortDir === 'desc' ? '↓ Recenti' : '↑ Vecchi'}
              </button>
            )}
          </div>
        )}

        {/* Content */}
        {viewMode === 'checklist'
          ? (selectedChecklist ? renderChecklistDetail() : renderChecklistList())
          : viewMode === 'miei_checklist'
            ? renderMieiChecklist()
            : (viewMode === 'cronologico' || viewMode === 'miei')
              ? renderCronologico()
              : selectedGroup
                ? renderDrillDown()
                : renderGroupCards()
        }
      </div>

      {/* FAB — checklist tab */}
      {viewMode === 'checklist' && !selectedChecklist && (
        <button
          onClick={() => smartMode ? setShowSmartChecklist(true) : setShowChecklistForm(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-xl text-3xl flex items-center justify-center transition-colors z-30"
        >+</button>
      )}
      {/* FAB — log tabs */}
      {viewMode !== 'checklist' && viewMode !== 'miei_checklist' && !selectedGroup && (
        <button
          onClick={() => smartMode ? setShowWizard(true) : setShowForm(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-xl text-3xl flex items-center justify-center transition-colors z-30"
        >+</button>
      )}

      {/* Modali */}
      {showChecklistForm && <ChecklistForm onSave={handleCreateChecklist} onClose={() => setShowChecklistForm(false)} ddpCommesse={ddpCommesse} users={users} isUfficio={isUfficio} />}
      {showSmartChecklist && <SmartChecklistForm onSave={handleCreateChecklist} onClose={() => setShowSmartChecklist(false)} users={users} isUfficio={isUfficio} ddpCommesse={ddpCommesse} />}
      {showForm     && <LogEntryForm onSave={handleAddLog} onClose={() => setShowForm(false)} currentUser={user} ddpCommesse={ddpCommesse} />}
      {editEntry    && <LogEntryForm editEntry={editEntry} onSave={entry => { handleEditLog(entry); setEditEntry(null); }} onClose={() => setEditEntry(null)} currentUser={user} ddpCommesse={ddpCommesse} />}
      {showWizard   && <SmartLogWizard currentUsername={user.username} isUfficio={isUfficio} ddpCommesse={ddpCommesse} onSave={handleAddLog} onClose={() => setShowWizard(false)} />}
      {showSettings && <SettingsModal users={users} onSave={handleSaveUsers} onClose={() => setShowSettings(false)} currentUsername={user.username} isAdmin={isUfficio} />}
      {selectedLog  && <LogDetailModal entry={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
