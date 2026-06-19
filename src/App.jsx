import { useState, useEffect } from 'react';
import { supabase } from './supabaseConfig';
import { loadDDPCommesse } from './supabaseDDP';
import SmartLogView from './components/SmartLogView';
import SmartLogWizard from './components/SmartLogWizard';

// ── SHA-256 ───────────────────────────────────────────────────────────────────
async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Supabase ──────────────────────────────────────────────────────────────────
async function dbGet(key) {
  const { data } = await supabase.from('app_data').select('value').eq('key', key).single();
  return data?.value ?? null;
}
async function dbSet(key, value) {
  await supabase.from('app_data').upsert({ key, value }, { onConflict: 'key' });
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

const VIEW_TABS = [
  { key: 'cronologico', label: 'Cronologico', icon: '📅' },
  { key: 'commessa',    label: 'Commessa',    icon: '🏗️' },
  { key: 'tipo',        label: 'Tipo',        icon: '🏷️' },
  { key: 'autore',      label: 'Autore',      icon: '👤' },
];

const EMPTY_COMMESSA = '(Senza commessa)';

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
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal]   = useState('');

  const isCustom = value && !commesse.includes(value);

  const handleSelect = (e) => {
    onChange(e.target.value);
    setShowCustom(false);
  };

  const openCustom = () => {
    setCustomVal(isCustom ? value : '');
    setShowCustom(true);
  };

  const confirmCustom = () => {
    if (customVal.trim()) onChange(customVal.trim());
    setShowCustom(false);
    setCustomVal('');
  };

  const cancelCustom = () => { setShowCustom(false); setCustomVal(''); };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={isCustom ? '__custom__' : (value || '')}
          onChange={handleSelect}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white"
        >
          <option value="">— Nessuna —</option>
          {commesse.map(c => <option key={c} value={c}>{c}</option>)}
          {isCustom && <option value="__custom__">✏️ {value}</option>}
        </select>
        <button
          type="button"
          onClick={openCustom}
          title="Inserisci nome personalizzato"
          className={`px-3 rounded-xl border text-sm transition-colors ${
            isCustom ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'
          }`}
        >✏️</button>
      </div>
      {isCustom && !showCustom && (
        <p className="text-xs text-blue-600 px-1">Personalizzata: <strong>{value}</strong></p>
      )}
      {showCustom && (
        <div className="flex gap-2 items-center p-2 bg-blue-50 rounded-xl border border-blue-200">
          <input
            autoFocus
            type="text"
            value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            placeholder="Nuovo"
            className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white"
            onKeyDown={e => { if (e.key === 'Enter') confirmCustom(); if (e.key === 'Escape') cancelCustom(); }}
          />
          <button onClick={confirmCustom} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">✓</button>
          <button onClick={cancelCustom} className="text-gray-400 hover:text-gray-600 text-xl px-1">×</button>
        </div>
      )}
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
function LogEntryForm({ onSave, onClose, currentUser, ddpCommesse = [] }) {
  const isUfficio = currentUser?.level === 'ufficio';
  const [tipo, setTipo]             = useState('annotazione');
  const [operatore, setOperatore]   = useState(currentUser?.username || '');
  const [commessa, setCommessa]     = useState('');
  const [titolo, setTitolo]         = useState('');
  const [descrizione, setDescrizione] = useState('');

  const handleSubmit = () => {
    if (!titolo.trim()) return;
    const now = new Date();
    onSave({
      id: crypto.randomUUID(),
      data: now.toISOString().slice(0, 10),
      ora: now.toTimeString().slice(0, 5),
      operatore: isUfficio ? (operatore.trim() || currentUser?.username) : currentUser?.username,
      tipo, commessa: commessa.trim(), titolo: titolo.trim(), descrizione: descrizione.trim(),
      created_at: now.toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">Nuovo log</h2>
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

// ── SettingsModal ─────────────────────────────────────────────────────────────
function SettingsModal({ users, onSave, onClose, currentUsername }) {
  const [rows, setRows]             = useState(users.map(u => ({ ...u })));
  const [editingIndex, setEditingIndex] = useState(null);
  const [showPwd, setShowPwd]       = useState(false);
  const [newUser, setNewUser]       = useState({ username: '', password: '', level: 'produzione' });
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
    if (!confirm(`Eliminare ${rows[i].username}?`)) return;
    const updated = rows.filter((_, idx) => idx !== i);
    setRows(updated); onSave(updated);
  };

  const handleAdd = async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) return;
    const hashed  = await sha256(newUser.password);
    const updated = [...rows, { username: newUser.username.trim(), password: hashed, level: newUser.level, canBackup: false, canNotify: false }];
    setRows(updated); onSave(updated);
    setNewUser({ username: '', password: '', level: 'produzione' }); setAdding(false);
  };

  const LEVEL_LABEL = { ufficio: 'Ufficio tecnico', produzione: 'Produzione' };

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
            return (
              <div key={i} className={`rounded-2xl border-2 p-4 ${isMe ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-gray-50/40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-gray-800">{row.username}</span>
                  {isMe && <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">Tu</span>}
                </div>
                {!isEditing ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">{LEVEL_LABEL[row.level] || row.level}</span>
                    {row.canBackup  && <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">Backup</span>}
                    {row.canNotify && <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">Notifiche</span>}
                    <div className="ml-auto flex gap-1">
                      <Btn small color="blue" onClick={() => startEdit(i)}>Modifica</Btn>
                      {!isMe && <Btn small color="red" onClick={() => handleDelete(i)}>Elimina</Btn>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input type="text" value={row.username} onChange={e => set(i, 'username', e.target.value)}
                      placeholder="Username" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <select value={row.level} onChange={e => set(i, 'level', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
                      <option value="ufficio">Ufficio tecnico</option>
                      <option value="produzione">Produzione</option>
                    </select>
                    <div className="relative">
                      <input type={showPwd ? 'text' : 'password'} value={row._newPassword || ''}
                        onChange={e => set(i, '_newPassword', e.target.value)}
                        placeholder="Nuova password (lascia vuoto per non cambiare)"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:border-blue-400" />
                      <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPwd ? '🙈' : '👁️'}
                      </button>
                    </div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!row.canBackup} onChange={e => set(i, 'canBackup', e.target.checked)} className="rounded" /> Backup auto
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!row.canNotify} onChange={e => set(i, 'canNotify', e.target.checked)} className="rounded" /> Notifiche
                      </label>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Btn small color="blue" onClick={() => handleSaveRow(i)}>💾 Salva</Btn>
                      <Btn small onClick={() => cancelEdit(i)}>Annulla</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!adding ? (
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
                <option value="ufficio">Ufficio tecnico</option>
                <option value="produzione">Produzione</option>
              </select>
              <div className="flex gap-2 pt-1">
                <Btn small color="blue" onClick={handleAdd} disabled={!newUser.username.trim() || !newUser.password.trim()}>➕ Aggiungi</Btn>
                <Btn small onClick={() => { setAdding(false); setNewUser({ username: '', password: '', level: 'produzione' }); }}>Annulla</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]                 = useState(null);
  const [users, setUsers]               = useState([]);
  const [logs, setLogs]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [smartMode, setSmartMode]       = useState(() => localStorage.getItem('log_produzione_smart_mode') === 'true');
  const [showSmartView, setShowSmartView] = useState(false);
  const [showWizard, setShowWizard]     = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filterTipo, setFilterTipo]     = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [viewMode, setViewMode]         = useState('cronologico');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedLog, setSelectedLog]   = useState(null);
  const [ddpCommesse, setDdpCommesse]   = useState([]);
  const [loginUser, setLoginUser]       = useState('');
  const [loginPass, setLoginPass]       = useState('');
  const [loginErr, setLoginErr]         = useState('');

  useEffect(() => {
    const handler = e => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    (async () => {
      const [u, l, c] = await Promise.all([dbGet('users'), dbGet('logs'), loadDDPCommesse()]);
      setUsers((u || []).map(usr => ({ canBackup: false, canNotify: false, ...usr })));
      setLogs(l || []);
      setDdpCommesse(c);
      setLoading(false);
    })();
  }, []);

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
    setUser(found);
  };

  const handleLogout = () => { setUser(null); setLoginUser(''); setLoginPass(''); };

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

  const handleSaveUsers = async (newUsers) => {
    setUsers(newUsers);
    await dbSet('users', newUsers);
  };

  const changeView = (key) => { setViewMode(key); setSelectedGroup(null); };

  const isUfficio = user?.level === 'ufficio';

  // ── Filtered logs ──
  const filtered = logs.filter(e => {
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
    ? Object.keys(groups).sort((a, b) => b.localeCompare(a))
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

  // ── SMART VIEW ─────────────────────────────────────────────────────────────
  if (smartMode && showSmartView) {
    return (
      <SmartLogView
        logs={logs}
        onSave={handleSaveLogs}
        onClose={() => setShowSmartView(false)}
        currentUser={user}
        isUfficio={isUfficio}
        ddpCommesse={ddpCommesse}
      />
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
                    {canDelete && (
                      <button
                        onClick={ev => { ev.stopPropagation(); handleDeleteLog(e.id); }}
                        className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-base transition-colors"
                      >×</button>
                    )}
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
          <p className="text-lg font-medium">Nessun log presente</p>
          <p className="text-sm">Usa il pulsante + per aggiungere il primo</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map(date => (
            <div key={date}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{formatDate(date)}</p>
              <div className="space-y-2">
                {groups[date].map(e => {
                  const t = TIPO_MAP[e.tipo] || { label: e.tipo, icon: '📝', badge: 'bg-gray-100 text-gray-700' };
                  const canDelete = isUfficio || e.operatore === user.username;
                  return (
                    <div
                      key={e.id}
                      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:border-blue-200 hover:shadow-md cursor-pointer transition-all"
                      onClick={() => setSelectedLog(e)}
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
                        </div>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <span className="text-gray-300 text-xl">›</span>
                          {canDelete && (
                            <button
                              onClick={ev => { ev.stopPropagation(); handleDeleteLog(e.id); }}
                              className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-base transition-colors"
                            >×</button>
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
      )}
    </div>
  );

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
          {isUfficio && (
            <button onClick={() => setShowSettings(true)} className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200 transition-colors">⚙️</button>
          )}
          <button onClick={handleLogout} className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200 transition-colors">Esci</button>
        </div>
      </header>

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

        {/* Smart Mode banner */}
        {smartMode && !selectedGroup && (
          <button onClick={() => setShowSmartView(true)} className="w-full mb-4 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center gap-3 hover:bg-amber-100 transition-colors text-left">
            <span className="text-2xl">⚡</span>
            <div>
              <p className="font-bold text-amber-800">Smart Mode attiva</p>
              <p className="text-sm text-amber-600">Tocca per la vista ottimizzata mobile</p>
            </div>
            <span className="ml-auto text-amber-400 text-xl">→</span>
          </button>
        )}

        {/* Filters */}
        {!selectedGroup && (
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
          </div>
        )}

        {/* Content */}
        {viewMode === 'cronologico'
          ? renderCronologico()
          : selectedGroup
            ? renderDrillDown()
            : renderGroupCards()
        }
      </div>

      {/* FAB */}
      {!selectedGroup && (
        <button
          onClick={() => smartMode ? setShowWizard(true) : setShowForm(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-xl text-3xl flex items-center justify-center transition-colors z-30"
        >+</button>
      )}

      {/* Modali */}
      {showForm     && <LogEntryForm onSave={handleAddLog} onClose={() => setShowForm(false)} currentUser={user} ddpCommesse={ddpCommesse} />}
      {showWizard   && <SmartLogWizard currentUsername={user.username} isUfficio={isUfficio} ddpCommesse={ddpCommesse} onSave={handleAddLog} onClose={() => setShowWizard(false)} />}
      {showSettings && <SettingsModal users={users} onSave={handleSaveUsers} onClose={() => setShowSettings(false)} currentUsername={user.username} />}
      {selectedLog  && <LogDetailModal entry={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
