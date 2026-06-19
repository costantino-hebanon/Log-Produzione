import { useState } from 'react';
import SmartLogWizard from './SmartLogWizard';

const TIPO_MAP = {
  cambio_progetto: { label: 'Cambio progetto', icon: '🔄', badge: 'bg-blue-100 text-blue-700' },
  variazione:      { label: 'Variazione',       icon: '⚠️',  badge: 'bg-orange-100 text-orange-700' },
  annotazione:     { label: 'Annotazione',      icon: '📝', badge: 'bg-gray-100 text-gray-700' },
  osservazione:    { label: 'Osservazione',     icon: '👁️',  badge: 'bg-purple-100 text-purple-700' },
  decisione:       { label: 'Decisione',        icon: '✅', badge: 'bg-green-100 text-green-700' },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Oggi';
  if (dateStr === yesterday) return 'Ieri';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function SmartLogView({ logs, onSave, onClose, currentUser, isUfficio, ddpCommesse = [] }) {
  const [entries, setEntries] = useState(() => JSON.parse(JSON.stringify(logs || [])));
  const [showWizard, setShowWizard] = useState(false);
  const [filterTipo, setFilterTipo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const handleAdd = (entry) => {
    const updated = [entry, ...entries];
    setEntries(updated);
    onSave(updated);
  };

  const handleDelete = (id) => {
    if (!confirm('Eliminare questo log?')) return;
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    onSave(updated);
  };

  const filtered = entries.filter(e => {
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

  const grouped = filtered.reduce((acc, e) => {
    const d = e.data || 'Senza data';
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="fixed inset-0 bg-gray-100 z-40 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onClose} className="text-blue-600 font-semibold text-sm flex items-center gap-1 shrink-0 hover:text-blue-700">← Chiudi</button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-800 text-base">📋 Log Produzione</h1>
          <p className="text-xs text-gray-400">{entries.length} voci totali</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2 flex gap-2 flex-shrink-0">
        <input
          type="text"
          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400"
          placeholder="Cerca…"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        <select
          className="text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:border-blue-400 bg-white"
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value)}
        >
          <option value="">Tutti</option>
          {Object.entries(TIPO_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-3 py-3 space-y-5">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
            <span className="text-5xl">📋</span>
            <p className="text-base">Nessun log presente</p>
            <p className="text-sm">Usa il pulsante qui sotto per aggiungerne uno</p>
          </div>
        )}
        {sortedDates.map(date => (
          <div key={date}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{formatDate(date)}</p>
            <div className="space-y-2">
              {grouped[date].map(e => {
                const t = TIPO_MAP[e.tipo] || { label: e.tipo, icon: '📝', badge: 'bg-gray-100 text-gray-700' };
                const canDelete = isUfficio || e.operatore === currentUser.username;
                return (
                  <div key={e.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5 flex-shrink-0">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${t.badge}`}>{t.label}</span>
                          {e.commessa && (
                            <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{e.commessa}</span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{e.ora}</span>
                        </div>
                        <p className="font-semibold text-gray-800 leading-tight">{e.titolo}</p>
                        {e.descrizione && (
                          <p className="text-sm text-gray-500 mt-1 leading-relaxed whitespace-pre-wrap">{e.descrizione}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1.5">— {e.operatore}</p>
                      </div>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-lg flex-shrink-0 transition-colors"
                        >×</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Add button */}
      <div className="px-4 pb-6 pt-3 flex-shrink-0 bg-white border-t">
        <button
          onClick={() => setShowWizard(true)}
          className="w-full bg-blue-600 active:bg-blue-800 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl py-5 transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-2xl leading-none">+</span>
          Aggiungi log
        </button>
      </div>

      {showWizard && (
        <SmartLogWizard
          currentUsername={currentUser.username}
          isUfficio={isUfficio}
          ddpCommesse={ddpCommesse}
          onSave={handleAdd}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
