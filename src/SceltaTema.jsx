// Selettore del tema: chiaro / scuro / automatico (Hebanon M.E.S., 2026-10-08).
// Copia identica in ogni app (src/SceltaTema.jsx); sorgente in
// Hebanon-Reference/tema/. Il tema lo applica lo script nella testata di
// index.html (window.hebanonTema), che legge la stessa chiave.
import { useState } from "react";

const CHIAVE = "hebanon_tema";
const SCELTE = [
  ["chiaro", "☀️", "Tema chiaro"],
  ["scuro", "🌙", "Tema scuro"],
  ["auto", "Auto", "Automatico: segue il tema del dispositivo"],
];

function leggi() {
  try { return localStorage.getItem(CHIAVE) || "chiaro"; } catch { return "chiaro"; }
}

export default function SceltaTema({ className = "" }) {
  const [tema, setTema] = useState(leggi);
  const scegli = (t) => {
    try { localStorage.setItem(CHIAVE, t); } catch { /* navigazione privata: vale fino alla chiusura */ }
    setTema(t);
    window.hebanonTema?.applica();
  };
  return (
    <div role="group" aria-label="Tema"
      className={`inline-flex rounded-lg border border-gray-300 overflow-hidden flex-shrink-0 ${className}`}>
      {SCELTE.map(([k, etichetta, titolo]) => (
        <button key={k} type="button" title={titolo} aria-pressed={tema === k} onClick={() => scegli(k)}
          className={`px-2 min-h-[36px] text-xs font-semibold transition-colors
            ${tema === k ? "bg-gray-700 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
          {etichetta}
        </button>
      ))}
    </div>
  );
}
