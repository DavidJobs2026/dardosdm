"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { PlayerRecord } from "@tournament/types";
import {
  Database, Upload, Search, Trash2, FileSpreadsheet,
  Loader2, X, ChevronLeft, ChevronRight,
  CheckCircle2, Users, CheckSquare, Square, AlertTriangle, Pencil,
} from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import * as XLSX from "xlsx";

const SPECIAL_SEASON = "JUGADORES PROPIOS";

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Excel parser (same column mapping as InscriptionPanel) ──────────────────

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

interface ParsedRecord {
  name:         string;
  dni?:         string;
  cardNumber?:  string;
  teamName?:    string;
  grupo?:       string;
  stageName?:   string;
  ppd?:         number;
  mpr?:         number;
  gamesPlayed?: number;
  provincia?:   string;
  season:       string;
}

function parseRecordsFromExcel(data: Record<string, unknown>[], season: string): ParsedRecord[] {
  return data
    .map((row): ParsedRecord | null => {
      const name       = pick(row, "Real Name", "nombre", "name", "Nombre", "NOMBRE", "jugador");
      const dni        = pick(row, "DNI", "dni", "Document", "document") || undefined;
      const cardNumber = pick(row, "Card Number", "card_number", "CardNumber", "tarjeta") || undefined;
      const teamName   = pick(row, "Team Name", "equipo", "team", "Equipo", "EQUIPO", "club") || undefined;
      const grupo      = pick(row, "GRUPO", "Grupo", "grupo", "Group", "group") || undefined;
      const stageName  = pick(row, "Stage Name", "stage", "Stage", "categoria", "nivel") || undefined;

      const ppdRaw   = row["PPD"]  ?? row["ppd"]  ?? row["Ppd"];
      const mprRaw   = row["MPR"]  ?? row["mpr"]  ?? row["Mpr"];
      const gamesRaw = row["PARTIDAS JUGADAS"] ?? row["games"] ?? row["partidas"] ?? row["Games"];

      const ppd         = ppdRaw  != null && ppdRaw  !== "" ? parseFloat(String(ppdRaw))  : undefined;
      const mpr         = mprRaw  != null && mprRaw  !== "" ? parseFloat(String(mprRaw))  : undefined;
      const gamesPlayed = gamesRaw != null && gamesRaw !== "" ? parseInt(String(gamesRaw)) : undefined;

      const provincia = pick(row, "PROVINCIA", "Provincia", "provincia", "Province", "province", "region", "Region") || undefined;

      if (!name) return null;

      return { name, dni, cardNumber, teamName, grupo, stageName, ppd, mpr, gamesPlayed, provincia, season };
    })
    .filter((r): r is ParsedRecord => r !== null);
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void;
  onImported: () => void;
}

function UploadModal({ onClose, onImported }: UploadModalProps) {
  const [season,   setSeason]   = useState("LIGA 25-26");
  const [rows,     setRows]     = useState<ParsedRecord[]>([]);
  const [step,     setStep]     = useState<"config" | "preview" | "sending" | "done">("config");
  const [results,  setResults]  = useState<{ created: number; updated: number; errors: number }>({ created: 0, updated: 0, errors: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = (file: File) => {
    if (!season.trim()) { toast.error("Escribe el nombre de la temporada antes de subir el archivo"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target?.result, { type: "binary" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        const parsed = parseRecordsFromExcel(data, season);
        if (parsed.length === 0) { toast.error("No se encontraron jugadores válidos"); return; }
        setRows(parsed);
        setStep("preview");
      } catch {
        toast.error("No se pudo leer el archivo");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleSend = async () => {
    setStep("sending");
    try {
      const { data } = await api.post("/player-records/batch", { season, records: rows });
      setResults(data.data);
      setStep("done");
      onImported();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al importar");
      setStep("preview");
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 bg-ink-900 border border-ink-700 rounded-xl text-white " +
    "focus:outline-none focus:border-red-500/60 transition-all text-sm";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-ink-900 border border-ink-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-gradient rounded-lg flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-bold text-white">Importar jugadores</h2>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Step: config ──────────────────────────────────────────────────── */}
          {step === "config" && (
            <>
              {/* Only season — no game type here */}
              <div>
                <label className="block text-xs font-medium text-ink-400 mb-1.5">Temporada / Liga</label>
                <input
                  value={season}
                  onChange={e => setSeason(e.target.value)}
                  placeholder="LIGA 25-26"
                  className={inputCls}
                />
                <p className="text-xs text-ink-600 mt-1.5">
                  El archivo puede contener estadísticas de cualquier modalidad (01, Cricket, Count Up).
                  La modalidad se selecciona al crear el torneo.
                </p>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  "border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-all",
                  dragOver ? "border-red-500/60 bg-red-500/5" : "border-ink-700 hover:border-ink-500 bg-ink-950"
                )}
              >
                <div className={clsx("w-16 h-16 rounded-2xl flex items-center justify-center transition-colors", dragOver ? "bg-red-500/20" : "bg-ink-800")}>
                  <FileSpreadsheet className={clsx("w-8 h-8", dragOver ? "text-red-400" : "text-ink-500")} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-ink-300">{dragOver ? "Suelta aquí" : "Arrastra el Excel aquí"}</p>
                  <p className="text-xs text-ink-500 mt-1">
                    Columnas detectadas: <code className="text-red-400">Real Name</code>, <code className="text-red-400">PPD</code>,{" "}
                    <code className="text-red-400">MPR</code>, <code className="text-red-400">DNI</code>, <code className="text-red-400">Team Name</code>…
                  </p>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} className="hidden" />
              </div>
            </>
          )}

          {/* Step: preview ─────────────────────────────────────────────────── */}
          {step === "preview" && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{rows.length} jugadores</span>
                  <span className="text-xs text-ink-500 bg-ink-800 px-2 py-0.5 rounded-full">{season}</span>
                </div>
                <button onClick={() => { setStep("config"); setRows([]); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-xs text-ink-400 hover:text-white transition-colors flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Cambiar
                </button>
              </div>

              {/* Preview table */}
              <div className="bg-ink-950 border border-ink-800 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1.3fr_1fr_0.8fr_60px_55px_55px] gap-x-2 px-4 py-2 border-b border-ink-800 text-[11px] font-semibold text-ink-500 uppercase tracking-wide">
                  <span>Nombre</span>
                  <span>Equipo</span>
                  <span>Provincia</span>
                  <span className="text-right">Partidas</span>
                  <span className="text-right">PPD</span>
                  <span className="text-right">MPR</span>
                </div>
                <div className="divide-y divide-ink-800/60 max-h-64 overflow-y-auto">
                  {rows.slice(0, 100).map((r, i) => (
                    <div key={i} className="grid grid-cols-[1.3fr_1fr_0.8fr_60px_55px_55px] gap-x-2 px-4 py-2.5 text-sm items-center">
                      <div>
                        <span className="text-white truncate block">{r.name}</span>
                        {r.dni && <span className="text-[10px] text-ink-600">{r.dni}</span>}
                      </div>
                      <span className="text-ink-400 text-xs truncate">{r.teamName ?? "—"}</span>
                      <span className="text-ink-400 text-xs truncate">{r.provincia ?? "—"}</span>
                      <span className="text-right text-ink-500 font-mono text-xs">{r.gamesPlayed ?? "—"}</span>
                      <span className="text-right text-ink-400 font-mono text-xs">{r.ppd?.toFixed(2) ?? "—"}</span>
                      <span className="text-right text-amber-400 font-mono text-xs font-semibold">{r.mpr?.toFixed(2) ?? "—"}</span>
                    </div>
                  ))}
                  {rows.length > 100 && (
                    <div className="px-4 py-2 text-xs text-ink-600 text-center">… y {rows.length - 100} más</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Step: done ────────────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-white">¡Importación completada!</p>
                <p className="text-sm text-ink-400 mt-1">{season}</p>
              </div>
              <div className="flex gap-4 text-center">
                <div className="bg-green-900/20 border border-green-800/40 rounded-xl px-5 py-3">
                  <p className="text-2xl font-bold text-green-400">{results.created}</p>
                  <p className="text-xs text-ink-400 mt-0.5">Nuevos</p>
                </div>
                <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl px-5 py-3">
                  <p className="text-2xl font-bold text-blue-400">{results.updated}</p>
                  <p className="text-xs text-ink-400 mt-0.5">Actualizados</p>
                </div>
                {results.errors > 0 && (
                  <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-5 py-3">
                    <p className="text-2xl font-bold text-red-400">{results.errors}</p>
                    <p className="text-xs text-ink-400 mt-0.5">Errores</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink-800 flex gap-3 justify-end shrink-0">
          {step === "done" ? (
            <button onClick={onClose} className="btn-primary px-6">Cerrar</button>
          ) : step === "sending" ? (
            /* Sending state — disable everything, show spinner */
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
              <span className="text-sm text-ink-400">
                Importando {rows.length.toLocaleString()} jugadores… puede tardar unos segundos
              </span>
            </div>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-ink-400 hover:text-white transition-colors">Cancelar</button>
              {step === "preview" && (
                <button
                  onClick={handleSend}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                >
                  <Upload className="w-4 h-4" /> Importar {rows.length.toLocaleString()} jugadores
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

const SPANISH_PROVINCES = [
  "Álava","Albacete","Alicante","Almería","Asturias","Ávila","Badajoz","Barcelona",
  "Burgos","Cáceres","Cádiz","Cantabria","Castellón","Ciudad Real","Córdoba","Cuenca",
  "Girona","Granada","Guadalajara","Guipúzcoa","Huelva","Huesca","Islas Baleares",
  "Jaén","La Coruña","La Rioja","Las Palmas","León","Lleida","Lugo","Madrid","Málaga",
  "Murcia","Navarra","Ourense","Palencia","Pontevedra","Salamanca",
  "Santa Cruz de Tenerife","Segovia","Sevilla","Soria","Tarragona","Teruel","Toledo",
  "Valencia","Valladolid","Vizcaya","Zamora","Zaragoza","Ceuta","Melilla",
];

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
function validateDni(val: string): "empty" | "valid" | "invalid" {
  const v = val.trim().toUpperCase();
  if (!v) return "empty";
  const isDni = /^[0-9]{8}[A-Z]$/.test(v);
  const isNie = /^[XYZ][0-9]{7}[A-Z]$/.test(v);
  if (!isDni && !isNie) return "invalid";
  const numStr = isNie
    ? String("XYZ".indexOf(v[0])) + v.slice(1, -1)
    : v.slice(0, -1);
  return v[v.length - 1] === DNI_LETTERS[parseInt(numStr, 10) % 23] ? "valid" : "invalid";
}

function EditModal({
  record,
  onClose,
  onSaved,
}: {
  record:   PlayerRecord;
  onClose:  () => void;
  onSaved:  (updated: PlayerRecord) => void;
}) {
  const [name,      setName]      = useState(record.name);
  const [dni,       setDni]       = useState(record.dni ?? "");
  const [provincia, setProvincia] = useState(record.provincia ?? "");
  const [ppd,       setPpd]       = useState(record.ppd  != null ? String(record.ppd)  : "");
  const [mpr,       setMpr]       = useState(record.mpr  != null ? String(record.mpr)  : "");
  const [saving,    setSaving]    = useState(false);

  const dniStatus = validateDni(dni);

  const inputCls =
    "w-full px-3.5 py-2.5 bg-ink-900 border border-ink-700 rounded-xl text-white " +
    "placeholder-ink-500 focus:outline-none focus:border-red-500/60 focus:ring-1 " +
    "focus:ring-red-500/20 transition-all text-sm";

  const handleSave = async () => {
    if (!name.trim() || dniStatus === "invalid") return;
    setSaving(true);
    try {
      const ppdVal = ppd.trim() !== "" ? parseFloat(ppd) : null;
      const mprVal = mpr.trim() !== "" ? parseFloat(mpr) : null;
      const { data } = await api.patch(`/player-records/${record.id}`, {
        name:      name.trim(),
        dni:       dni.trim()      || null,
        provincia: provincia.trim() || null,
        ppd:       ppdVal,
        mpr:       mprVal,
      });
      toast.success("Jugador actualizado");
      onSaved(data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="bg-ink-950 border border-ink-800 rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-ink-800 flex items-center justify-between">
          <h3 className="font-bold text-white text-base">Editar jugador externo</h3>
          <button onClick={onClose} className="text-ink-600 hover:text-ink-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Nombre <span className="text-red-500">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>

          {/* DNI/NIE */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">DNI / NIE</label>
            <div className="relative">
              <input
                value={dni}
                onChange={e => setDni(e.target.value)}
                maxLength={9}
                placeholder="12345678A"
                className={clsx(inputCls, "pr-8",
                  dniStatus === "valid"   && "border-green-500/60",
                  dniStatus === "invalid" && dni.length >= 8 && "border-red-500/60"
                )}
              />
              {dniStatus === "valid" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-xs font-bold">✓</span>
              )}
              {dniStatus === "invalid" && dni.length >= 8 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-xs font-bold">✗</span>
              )}
            </div>
          </div>

          {/* Provincia */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Provincia</label>
            <input
              list="edit-prov-list"
              value={provincia}
              onChange={e => setProvincia(e.target.value)}
              placeholder="Madrid"
              className={inputCls}
            />
            <datalist id="edit-prov-list">
              {SPANISH_PROVINCES.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* MPR + PPD */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-400 mb-1.5">MPR</label>
              <input type="number" value={mpr} onChange={e => setMpr(e.target.value)}
                placeholder="0.00" step="0.01" min="0" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-400 mb-1.5">PPD</label>
              <input type="number" value={ppd} onChange={e => setPpd(e.target.value)}
                placeholder="0.00" step="0.01" min="0" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-500 text-sm font-semibold transition-all">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || dniStatus === "invalid" || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Jugadores externos tab ────────────────────────────────────────────────────

function ExternosTab() {
  const [records,       setRecords]       = useState<PlayerRecord[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [loading,       setLoading]       = useState(false);
  const [q,             setQ]             = useState("");
  // Selection mode
  const [selectMode,    setSelectMode]    = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [confirmBulk,   setConfirmBulk]   = useState(false);
  const [bulkDeleting,  setBulkDeleting]  = useState(false);
  // Single delete confirm
  const [confirmId,     setConfirmId]     = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  // Edit
  const [editingRecord, setEditingRecord] = useState<PlayerRecord | null>(null);

  const LIMIT = 50;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: p, limit: LIMIT, season: SPECIAL_SEASON,
      };
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get("/player-records", { params });
      setRecords(data.data);
      setTotal(data.total);
      setPage(p);
    } catch { toast.error("Error cargando jugadores"); }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => load(1), 300);
    return () => clearTimeout(t);
  }, [load]);

  const combined = (r: PlayerRecord) => r.combined ?? ((r.mpr ?? 0) * 10 + (r.ppd ?? 0));
  const totalPages = Math.ceil(total / LIMIT);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => setSelectedIds(new Set(records.map(r => r.id)));
  const handleDeselectAll = () => setSelectedIds(new Set());

  const handleDeleteOne = async (id: string) => {
    setDeleting(true);
    try {
      await api.delete(`/player-records/${id}`);
      toast.success("Jugador eliminado");
      setRecords(prev => prev.filter(r => r.id !== id));
      setTotal(t => t - 1);
      setConfirmId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await api.delete("/player-records/bulk", { data: { ids } });
      toast.success(`${ids.length} jugador${ids.length !== 1 ? "es" : ""} eliminado${ids.length !== 1 ? "s" : ""}`);
      setRecords(prev => prev.filter(r => !selectedIds.has(r.id)));
      setTotal(t => t - ids.length);
      setSelectedIds(new Set());
      setConfirmBulk(false);
      setSelectMode(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al eliminar");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-900/10 border border-blue-800/30 rounded-xl">
        <Users className="w-4 h-4 text-blue-400 shrink-0" />
        <p className="text-xs text-blue-300">
          Jugadores inscritos manualmente que no pertenecen a ninguna liga registrada.
          Sus estadísticas se guardan para que aparezcan en búsquedas de futuros torneos.
        </p>
      </div>

      {/* Toolbar: search + select mode toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre o DNI…"
            className="w-full pl-10 pr-10 py-3 bg-ink-900 border border-ink-700 rounded-xl text-white placeholder-ink-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 text-sm transition-all"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-600 hover:text-ink-300">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()); setConfirmBulk(false); }}
          className={clsx(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all",
            selectMode
              ? "bg-blue-900/40 border-blue-700/60 text-blue-300"
              : "border-ink-700 text-ink-400 hover:text-white hover:border-ink-500"
          )}
        >
          <CheckSquare className="w-4 h-4" />
          Seleccionar
        </button>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex items-center gap-3 px-4 py-3 bg-ink-900 border border-ink-800 rounded-xl">
          <span className="text-sm text-ink-300 font-medium flex-1">
            {selectedIds.size === 0 ? "Ninguno seleccionado" : `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? "s" : ""}`}
          </span>
          <button onClick={handleSelectAll} className="text-xs text-ink-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-ink-800">
            Todos
          </button>
          <button onClick={handleDeselectAll} className="text-xs text-ink-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-ink-800">
            Ninguno
          </button>
          {selectedIds.size > 0 && !confirmBulk && (
            <button
              onClick={() => setConfirmBulk(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-900/40 border border-red-700/50 text-red-400 hover:bg-red-900/60 text-xs font-semibold transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar ({selectedIds.size})
            </button>
          )}
          {confirmBulk && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-300 font-medium">¿Eliminar {selectedIds.size}?</span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="px-3 py-1.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Sí"}
              </button>
              <button
                onClick={() => setConfirmBulk(false)}
                className="px-3 py-1.5 rounded-xl border border-ink-700 text-ink-400 hover:text-white text-xs font-semibold transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">
        <div className={clsx(
          "gap-x-3 px-5 py-3 border-b border-ink-800 text-[11px] font-bold text-ink-500 uppercase tracking-wide",
          selectMode
            ? "grid grid-cols-[24px_1.4fr_0.8fr_0.7fr_70px_70px_80px_72px]"
            : "grid grid-cols-[1.4fr_0.8fr_0.7fr_70px_70px_80px_72px]"
        )}>
          {selectMode && <span />}
          <span>Jugador</span>
          <span>DNI</span>
          <span>Provincia</span>
          <span className="text-right">PPD</span>
          <span className="text-right">MPR</span>
          <span className="text-right">Combinada</span>
          <span />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-ink-500 animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 mx-auto mb-3 text-ink-800" />
            <p className="text-ink-500 text-sm">Sin jugadores externos aún</p>
            <p className="text-xs text-ink-700 mt-1">
              Aparecerán aquí cuando inscribas jugadores manualmente en un torneo
            </p>
          </div>
        ) : (
          <div className="divide-y divide-ink-800/60">
            {records.map(r => {
              const isConfirming = confirmId === r.id;
              const isSelected = selectedIds.has(r.id);
              return (
                <div
                  key={r.id}
                  onClick={selectMode ? () => toggleSelect(r.id) : undefined}
                  className={clsx(
                    "gap-x-3 px-5 py-3 items-center transition-colors",
                    selectMode
                      ? "grid grid-cols-[24px_1.4fr_0.8fr_0.7fr_70px_70px_80px_72px] cursor-pointer"
                      : "grid grid-cols-[1.4fr_0.8fr_0.7fr_70px_70px_80px_72px]",
                    isSelected ? "bg-blue-900/20" : "hover:bg-ink-800/30"
                  )}
                >
                  {selectMode && (
                    <div className="flex items-center justify-center">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-blue-400" />
                        : <Square className="w-4 h-4 text-ink-600" />
                      }
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{r.name}</p>
                    {r.teamName && (
                      <p className="text-[11px] text-ink-500 truncate">{r.teamName}</p>
                    )}
                  </div>
                  <span className="text-xs font-mono text-ink-400">{r.dni ?? "—"}</span>
                  <span className="text-xs text-ink-400 truncate">{r.provincia ?? "—"}</span>
                  <span className="text-right text-xs font-mono text-ink-300">{r.ppd?.toFixed(2) ?? "—"}</span>
                  <span className="text-right text-xs font-mono text-amber-400 font-semibold">{r.mpr?.toFixed(2) ?? "—"}</span>
                  <span className="text-right text-sm font-bold font-mono text-white">
                    {(r.ppd != null || r.mpr != null) ? combined(r).toFixed(2) : "—"}
                  </span>
                  {/* Edit + Delete buttons / confirm */}
                  {!selectMode && (
                    <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                      {!isConfirming ? (
                        <>
                          <button
                            onClick={() => setEditingRecord(r)}
                            className="p-1.5 text-ink-700 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmId(r.id)}
                            className="p-1.5 text-ink-700 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteOne(r.id)}
                            disabled={deleting}
                            className="px-2 py-1 rounded-lg bg-red-700 hover:bg-red-600 text-white text-[11px] font-bold transition-colors disabled:opacity-50"
                          >
                            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Sí"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="px-2 py-1 rounded-lg border border-ink-700 text-ink-400 hover:text-white text-[11px] font-semibold transition-colors"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {selectMode && <span />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-500">
            Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => load(page - 1)} disabled={page === 1 || loading}
              className="p-2 text-ink-400 hover:text-white disabled:opacity-40 hover:bg-ink-800 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-ink-400 px-2">{page} / {totalPages}</span>
            <button onClick={() => load(page + 1)} disabled={page === totalPages || loading}
              className="p-2 text-ink-400 hover:text-white disabled:opacity-40 hover:bg-ink-800 rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingRecord && (
        <EditModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSaved={updated => {
            setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
            setEditingRecord(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HistoricoPage() {
  const [activeTab,  setActiveTab]  = useState<"liga" | "externos">("liga");
  const [records,    setRecords]    = useState<PlayerRecord[]>([]);
  // Exclude the special season from the league sidebar
  const [seasons,    setSeasons]    = useState<string[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Filters (league tab)
  const [q,      setQ]      = useState("");
  const [season, setSeason] = useState("");

  const LIMIT = 50;

  // Load seasons list (exclude JUGADORES PROPIOS from league sidebar)
  const loadSeasons = useCallback(async () => {
    try {
      const { data } = await api.get("/player-records/seasons");
      setSeasons((data.data as string[]).filter(s => s !== SPECIAL_SEASON));
    } catch { /* silent */ }
  }, []);

  // Load records (league tab)
  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: LIMIT };
      if (q.trim()) params.q      = q.trim();
      if (season)   params.season = season;
      // Exclude the special season from league view when showing all
      // (we only need to handle this when season is empty / "all")
      const { data } = await api.get("/player-records", { params });
      // Filter out JUGADORES PROPIOS from league results when viewing all seasons
      const filtered = season
        ? data.data
        : (data.data as PlayerRecord[]).filter(r => r.season !== SPECIAL_SEASON);
      setRecords(filtered);
      setTotal(season ? data.total : data.total); // approximate; filtered count shown per page
      setPage(p);
    } catch { toast.error("Error cargando registros"); }
    finally { setLoading(false); }
  }, [q, season]);

  useEffect(() => { loadSeasons(); }, [loadSeasons]);
  useEffect(() => {
    if (activeTab === "liga") {
      const t = setTimeout(() => load(1), 300);
      return () => clearTimeout(t);
    }
  }, [load, activeTab]);

  // Delete season
  const handleDeleteSeason = async (s: string) => {
    if (!confirm(`¿Eliminar todos los registros de "${s}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete("/player-records/season", { data: { season: s } });
      toast.success("Temporada eliminada");
      if (season === s) setSeason("");
      loadSeasons();
      load(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar");
    }
  };

  // Compute combined metric for display
  const combined = (r: PlayerRecord) => r.combined ?? ((r.mpr ?? 0) * 10 + (r.ppd ?? 0));

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-gradient rounded-xl flex items-center justify-center shadow-red-sm">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de jugadores</h1>
            <p className="text-sm text-ink-400 mt-0.5">
              {total.toLocaleString()} registros · {seasons.length} temporadas
            </p>
          </div>
        </div>
        {activeTab === "liga" && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-red-sm transition-all"
          >
            <Upload className="w-4 h-4" /> Importar Excel
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-xl bg-ink-900 border border-ink-800 p-1 gap-1 w-fit">
        <button
          onClick={() => setActiveTab("liga")}
          className={clsx(
            "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all",
            activeTab === "liga" ? "bg-ink-700 text-white shadow-sm" : "text-ink-500 hover:text-ink-300"
          )}
        >
          <Database className="w-4 h-4" /> Liga
        </button>
        <button
          onClick={() => setActiveTab("externos")}
          className={clsx(
            "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all",
            activeTab === "externos" ? "bg-ink-700 text-white shadow-sm" : "text-ink-500 hover:text-ink-300"
          )}
        >
          <Users className="w-4 h-4" /> Jugadores externos
        </button>
      </div>

      {/* ── Externos tab ──────────────────────────────────────────────────── */}
      {activeTab === "externos" && <ExternosTab />}

      {/* ── Liga tab ──────────────────────────────────────────────────────── */}
      {activeTab === "liga" && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">

          {/* Sidebar: seasons */}
          <div className="space-y-3">
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-3">Temporadas cargadas</h3>
              {seasons.length === 0 ? (
                <p className="text-xs text-ink-600 text-center py-4">Sin datos aún</p>
              ) : (
                <div className="space-y-1">
                  <button
                    onClick={() => setSeason("")}
                    className={clsx(
                      "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      !season ? "bg-red-900/40 text-red-400" : "text-ink-400 hover:bg-ink-800 hover:text-white"
                    )}
                  >
                    Todas las temporadas
                  </button>
                  {seasons.map(s => (
                    <div key={s} className="flex items-center gap-1">
                      <button
                        onClick={() => setSeason(s)}
                        className={clsx(
                          "flex-1 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          season === s
                            ? "bg-red-900/40 text-red-400"
                            : "text-ink-400 hover:bg-ink-800 hover:text-white"
                        )}
                      >
                        {s}
                      </button>
                      <button
                        onClick={() => handleDeleteSeason(s)}
                        className="p-1.5 text-ink-700 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                        title={`Eliminar "${s}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main: records table */}
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar por nombre…"
                className="w-full pl-10 pr-10 py-3 bg-ink-900 border border-ink-700 rounded-xl text-white placeholder-ink-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 text-sm transition-all"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-600 hover:text-ink-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Table */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[1.6fr_1fr_0.8fr_0.7fr_70px_70px_80px] gap-x-3 px-5 py-3 border-b border-ink-800 text-[11px] font-bold text-ink-500 uppercase tracking-wide">
                <span>Jugador</span>
                <span>Equipo / Grupo</span>
                <span>Temporada</span>
                <span>Provincia</span>
                <span className="text-right">Partidas</span>
                <span className="text-right">PPD / MPR</span>
                <span className="text-right">Combinada</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-ink-500 animate-spin" />
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-16">
                  <Database className="w-10 h-10 mx-auto mb-3 text-ink-800" />
                  <p className="text-ink-500 text-sm">Sin registros</p>
                  {!q && !season && (
                    <button onClick={() => setShowUpload(true)} className="mt-3 text-xs text-red-400 hover:text-red-300 transition-colors">
                      Importar el primer Excel →
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-ink-800/60">
                  {records.map(r => (
                    <div key={r.id} className="grid grid-cols-[1.6fr_1fr_0.8fr_0.7fr_70px_70px_80px] gap-x-3 px-5 py-3 items-center hover:bg-ink-800/30 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{r.name}</p>
                        {(r.dni || r.stageName) && (
                          <p className="text-[11px] text-ink-500 truncate">
                            {r.stageName}{r.stageName && r.dni ? " · " : ""}{r.dni}
                          </p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-ink-300 truncate">{r.teamName ?? "—"}</p>
                        {r.grupo && <p className="text-[11px] text-ink-600 truncate">{r.grupo}</p>}
                      </div>
                      <span className="text-xs text-ink-400 truncate">{r.season}</span>
                      <span className="text-xs text-ink-400 truncate">{r.provincia ?? "—"}</span>
                      <span className="text-right text-xs font-mono text-ink-400">{r.gamesPlayed ?? "—"}</span>
                      <div className="text-right">
                        <span className="text-xs font-mono text-ink-300 block">{r.ppd?.toFixed(2) ?? "—"}</span>
                        <span className="text-xs font-mono text-amber-400 font-semibold block">{r.mpr?.toFixed(2) ?? "—"}</span>
                      </div>
                      <span className="text-right text-sm font-bold font-mono text-white">
                        {(r.ppd != null || r.mpr != null) ? combined(r).toFixed(2) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-500">
                  Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => load(page - 1)}
                    disabled={page === 1 || loading}
                    className="p-2 text-ink-400 hover:text-white disabled:opacity-40 hover:bg-ink-800 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-ink-400 px-2">{page} / {totalPages}</span>
                  <button
                    onClick={() => load(page + 1)}
                    disabled={page === totalPages || loading}
                    className="p-2 text-ink-400 hover:text-white disabled:opacity-40 hover:bg-ink-800 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onImported={() => { loadSeasons(); load(1); }}
        />
      )}
    </div>
  );
}
