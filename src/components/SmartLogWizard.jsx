import { useState } from 'react';

const TIPI = [
  { value: 'cambio_progetto', label: 'Cambio progetto', icon: '🔄', bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800' },
  { value: 'variazione',      label: 'Variazione',      icon: '⚠️',  bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800' },
  { value: 'annotazione',     label: 'Annotazione',     icon: '📝', bg: 'bg-gray-50',   border: 'border-gray-300',   text: 'text-gray-800' },
  { value: 'osservazione',    label: 'Osservazione',    icon: '👁️',  bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-800' },
  { value: 'decisione',       label: 'Decisione',       icon: '✅', bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-800' },
];

const STEPS_BASE = [
  { key: 'commessa',    label: 'Commessa',  type: 'text',     placeholder: 'Es. CM-001…',                   optional: true  },
  { key: 'titolo',      label: 'Titolo',    type: 'text',     placeholder: 'Breve descrizione…',            optional: false },
  { key: 'descrizione', label: 'Dettagli',  type: 'textarea', placeholder: 'Note, contesto, motivazioni…',  optional: true  },
];

const STEP_OPERATORE = {
  key: 'operatore', label: 'Per conto di', type: 'text', placeholder: 'Nome operatore…', optional: false,
};

export default function SmartLogWizard({ onSave, onClose, currentUsername, isUfficio, ddpCommesse = [] }) {
  const STEPS = isUfficio ? [STEP_OPERATORE, ...STEPS_BASE] : STEPS_BASE;

  const [phase, setPhase] = useState('tipo'); // 'tipo' | number
  const [data, setData]   = useState({
    tipo: '', operatore: currentUsername, commessa: '', titolo: '', descrizione: '',
  });

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const total    = STEPS.length + 1; // tipo + steps
  const progress = phase === 'tipo' ? 0 : Math.round(((phase + 1) / (total - 1)) * 100);

  const handleSelectTipo = (tipo) => { set('tipo', tipo); setPhase(0); };

  const canNext = () => {
    if (phase === 'tipo') return false;
    const s = STEPS[phase];
    if (s.optional) return true;
    return (data[s.key] || '').trim().length > 0;
  };

  const advance = () => {
    if (phase < STEPS.length - 1) setPhase(p => p + 1);
    else handleFinish();
  };

  const handleFinish = () => {
    const now = new Date();
    onSave({
      id:          crypto.randomUUID(),
      data:        now.toISOString().slice(0, 10),
      ora:         now.toTimeString().slice(0, 5),
      operatore:   isUfficio ? (data.operatore.trim() || currentUsername) : currentUsername,
      tipo:        data.tipo,
      commessa:    data.commessa.trim(),
      titolo:      data.titolo.trim(),
      descrizione: data.descrizione.trim(),
      created_at:  now.toISOString(),
    });
    onClose();
  };

  const currentTipo = TIPI.find(t => t.value === data.tipo);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full rounded-t-3xl sm:rounded-3xl shadow-2xl sm:max-w-md flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
          <span className="text-sm font-medium text-gray-500">
            {phase === 'tipo' ? 'Scegli tipo' : `Passo ${phase + 2} di ${total}`}
          </span>
          <div className="w-10" />
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-4 flex-shrink-0">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 pb-4">

          {/* Step 0 — tipo */}
          {phase === 'tipo' && (
            <div className="flex flex-col gap-3">
              <p className="text-2xl font-bold text-gray-800 text-center mb-1">Tipo di log</p>
              {TIPI.map(t => (
                <button key={t.value} onClick={() => handleSelectTipo(t.value)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] ${t.bg} ${t.border} ${t.text}`}
                >
                  <span className="text-3xl">{t.icon}</span>
                  <span className="text-lg font-semibold">{t.label}</span>
                  <span className="ml-auto text-xl opacity-40">→</span>
                </button>
              ))}
            </div>
          )}

          {/* Steps 1+ */}
          {phase !== 'tipo' && (() => {
            const s = STEPS[phase];
            return (
              <div className="flex flex-col items-center gap-5 w-full">
                {/* Tipo badge */}
                {currentTipo && (
                  <div className={`flex items-center gap-2 text-xs font-medium rounded-full px-3 py-1.5 ${currentTipo.bg} ${currentTipo.text}`}>
                    <span>{currentTipo.icon}</span><span>{currentTipo.label}</span>
                  </div>
                )}
                {/* Produzione banner (solo se non ufficio e step 0 base = commessa) */}
                {!isUfficio && phase === 0 && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2 text-center">
                    Log registrato da: <strong>{currentUsername}</strong>
                  </div>
                )}
                <p className="text-2xl font-bold text-gray-800 text-center">
                  {s.label}
                  {s.optional && <span className="text-base font-normal text-gray-400 ml-2">(opzionale)</span>}
                </p>
                {s.type === 'textarea' ? (
                  <textarea
                    key={phase} rows={5}
                    className="w-full border-2 border-gray-300 rounded-2xl px-4 py-4 text-base focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 resize-none"
                    value={data[s.key]} placeholder={s.placeholder}
                    onChange={e => set(s.key, e.target.value)}
                  />
                ) : (
                  <>
                    <input
                      key={phase} type="text"
                      className="w-full max-w-xs text-2xl text-center border-2 border-gray-300 rounded-2xl px-4 py-5 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      value={data[s.key]} placeholder={s.placeholder}
                      onChange={e => set(s.key, e.target.value)}
                      onFocus={e => e.target.select()}
                      onKeyDown={e => { if (e.key === 'Enter' && canNext()) advance(); }}
                    />
                    {s.key === 'commessa' && ddpCommesse.length > 0 && (
                      <div className="w-full max-w-xs">
                        <p className="text-xs text-gray-400 text-center mb-2">Dal Diario di Produzione</p>
                        <div className="flex flex-wrap gap-2 justify-center max-h-36 overflow-auto">
                          {ddpCommesse.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => { set('commessa', c); advance(); }}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                data.commessa === c
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50'
                              }`}
                            >{c}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        {phase !== 'tipo' && (
          <div className="px-5 pb-5 pt-3 flex gap-2 flex-shrink-0 border-t bg-gray-50 rounded-b-3xl">
            <div className="flex-1">
              <button onClick={() => setPhase(p => p === 0 ? 'tipo' : p - 1)}
                className="w-full py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-100 transition-colors"
              >← Indietro</button>
            </div>
            <div className="flex-1">
              {phase < STEPS.length - 1 ? (
                <button onClick={advance} disabled={!canNext()}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40"
                >Successivo →</button>
              ) : (
                <button onClick={handleFinish} disabled={!canNext()}
                  className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-40"
                >✓ Salva log</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
