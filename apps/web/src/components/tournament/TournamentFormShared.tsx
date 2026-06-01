"use client";

import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LevelData {
  name:             string;
  minValue:         number;
  maxValue?:        number;
  maxParticipants?: number; // undefined = sin límite
  order:            number;
  bestOf?:          number; // match format (odd 1–21); undefined = inherit global
  bestOfLosers?:    number; // losers bracket override; undefined = same as bestOf
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIZE_OPTIONS = [8, 16, 32, 64, 128, 256, 512] as const;

export const FORMAT_OPTIONS = [
  { value: "single_elimination", label: "Eliminación Simple",  desc: "Pierdes una vez y quedas fuera." },
  { value: "double_elimination", label: "Doble Eliminación",   desc: "Necesitas dos derrotas para ser eliminado." },
  { value: "round_robin",        label: "Round Robin + K.O.",  desc: "Fase de grupos seguida de eliminación directa." },
] as const;

export const GAME_OPTIONS = [
  { value: "01",      label: "01"              },
  { value: "cricket", label: "Cricket"         },
  { value: "combo",   label: "Combo 01 & Cricket" },
] as const;

export const METRIC_OPTIONS = [
  { value: "ppd",      label: "PPD",       desc: "Puntos por dardo. Para modalidades 01.",        color: "text-blue-400"   },
  { value: "mpr",      label: "MPR",       desc: "Marcas por ronda. Para Cricket / Combo.",       color: "text-amber-400"  },
  { value: "combined", label: "Combinada", desc: "MPR × 10 + PPD. Visión global del nivel.",      color: "text-purple-400" },
] as const;

export const BEST_OF_OPTIONS = [1, 3, 5, 7] as const;
// Extended odd range for per-level format (1, 3, 5 … 21)
export const BEST_OF_LEVEL_OPTIONS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21] as const;

// ─── SizeSelector ─────────────────────────────────────────────────────────────

export function SizeSelector({
  value,
  onChange,
  label = "Máx. participantes",
  allowUnlimited = true,
  disabled = false,
}: {
  value:          number | undefined;
  onChange:       (v: number | undefined) => void;
  label?:         string;
  allowUnlimited?: boolean;
  disabled?:      boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {allowUnlimited && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all",
              value === undefined
                ? "bg-red-600 border-red-500 text-white shadow-red-sm"
                : "bg-ink-950 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200",
              disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            Sin límite
          </button>
        )}
        {SIZE_OPTIONS.map(n => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-bold border transition-all",
              value === n
                ? "bg-red-600 border-red-500 text-white shadow-red-sm"
                : "bg-ink-950 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200",
              disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── BestOfSelector ───────────────────────────────────────────────────────────

export function BestOfSelector({
  label,
  value,
  onChange,
  disabled,
}: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {BEST_OF_OPTIONS.map(n => {
          const legs   = Math.ceil(n / 2);
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={clsx(
                "flex flex-col items-center px-4 py-3 rounded-xl border text-sm font-bold transition-all min-w-[80px]",
                active
                  ? "bg-red-600 border-red-500 text-white shadow-red-sm"
                  : "bg-ink-950 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200",
                disabled && "opacity-40 cursor-not-allowed"
              )}
            >
              <span className="text-base font-black">BO{n}</span>
              <span className={clsx("text-[11px] mt-0.5 font-normal", active ? "text-red-200" : "text-ink-600")}>
                {legs} {legs === 1 ? "leg" : "legs"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-600">
        Mejor de {value} — gana quien llegue primero a{" "}
        <strong className="text-ink-400">{Math.ceil(value / 2)} {Math.ceil(value / 2) === 1 ? "leg" : "legs"}</strong>
      </p>
    </div>
  );
}

// ─── LevelBuilder ─────────────────────────────────────────────────────────────

const LEVEL_PLACEHOLDERS: Record<string, { name: string; min: number; max?: number }[]> = {
  mpr: [
    { name: "Nivel I",   min: 4.5  },
    { name: "Nivel II",  min: 3.0,  max: 4.49  },
    { name: "Nivel III", min: 0,    max: 2.99   },
  ],
  ppd: [
    { name: "Master",    min: 28    },
    { name: "Nivel I",   min: 22,   max: 27.99  },
    { name: "Nivel II",  min: 15,   max: 21.99  },
    { name: "Nivel III", min: 0,    max: 14.99  },
  ],
  combined: [
    { name: "Master",    min: 70    },
    { name: "Nivel I",   min: 50,   max: 69.99  },
    { name: "Nivel II",  min: 30,   max: 49.99  },
    { name: "Nivel III", min: 0,    max: 29.99  },
  ],
};

// ─── Arrow stepper for per-level bestOf ──────────────────────────────────────
// Options: 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21  (undefined displays as 3)

const STEPPER_OPTIONS = [...BEST_OF_LEVEL_OPTIONS] as number[];
const STEPPER_DEFAULT = 3;

function BestOfStepper({
  label,
  value,
  onChange,
}: {
  label:    string;
  value:    number | undefined;
  onChange: (v: number) => void;
}) {
  // Treat undefined as the default (3)
  const effectiveValue = value ?? STEPPER_DEFAULT;
  const idx     = STEPPER_OPTIONS.indexOf(effectiveValue);
  const safeIdx = idx < 0 ? STEPPER_OPTIONS.indexOf(STEPPER_DEFAULT) : idx;

  const prev = () => onChange(STEPPER_OPTIONS[safeIdx - 1]);
  const next = () => onChange(STEPPER_OPTIONS[safeIdx + 1]);

  const canPrev = safeIdx > 0;
  const canNext = safeIdx < STEPPER_OPTIONS.length - 1;

  const legs = Math.ceil(effectiveValue / 2);

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Label */}
      <span className="text-xs text-ink-300 font-medium shrink-0">{label}</span>

      {/* Stepper */}
      <div className="flex items-center gap-0 bg-ink-950 border border-ink-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={prev}
          disabled={!canPrev}
          className="px-2 py-1.5 text-ink-400 hover:text-white hover:bg-ink-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center px-3 min-w-[52px] border-x border-ink-700">
          <span className="text-sm font-bold leading-tight text-white">
            {effectiveValue}
          </span>
          <span className="text-[9px] text-ink-600 leading-tight">
            {legs} {legs === 1 ? "leg" : "legs"}
          </span>
        </div>

        <button
          type="button"
          onClick={next}
          disabled={!canNext}
          className="px-2 py-1.5 text-ink-400 hover:text-white hover:bg-ink-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function LevelBuilder({
  levels,
  onChange,
  metric,
  format = "single_elimination",
  disabled = false,
}: {
  levels:    LevelData[];
  onChange:  (levels: LevelData[]) => void;
  metric:    string;
  format?:   string;
  disabled?: boolean;
}) {
  const metricLabel = metric === "ppd" ? "PPD" : metric === "mpr" ? "MPR" : "Combinada";
  const isDoubleElim = format === "double_elimination";

  const addLevel = () => {
    const next: LevelData = {
      name:            `Nivel ${levels.length + 1}`,
      minValue:        0,
      maxValue:        undefined,
      maxParticipants: undefined,
      order:           levels.length + 1,
    };
    onChange([...levels, next]);
  };

  const removeLevel = (idx: number) =>
    onChange(levels.filter((_, i) => i !== idx).map((l, i) => ({ ...l, order: i + 1 })));

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const updateLevel = (idx: number, field: keyof LevelData, value: string | number | undefined) => {
    const updated = levels.map((l, i) => (i === idx ? { ...l, [field]: value } : { ...l }));

    // Keep adjacent boundaries continuous (no gaps / overlaps)
    if (field === "minValue" && typeof value === "number") {
      // Auto-set the level immediately below (higher index = lower skill) max to newMin - 0.01
      if (idx + 1 < updated.length) {
        updated[idx + 1] = { ...updated[idx + 1], maxValue: round2(value - 0.01) };
      }
    }
    if (field === "maxValue" && typeof value === "number") {
      // Auto-set the level immediately above (lower index = higher skill) min to newMax + 0.01
      if (idx - 1 >= 0) {
        updated[idx - 1] = { ...updated[idx - 1], minValue: round2(value + 0.01) };
      }
    }

    onChange(updated);
  };

  const useSuggested = () => {
    const sug = LEVEL_PLACEHOLDERS[metric] ?? LEVEL_PLACEHOLDERS.mpr;
    const M = sug.length;
    const N = levels.length;

    if (N === 0) {
      // No levels yet → create from scratch
      onChange(sug.map((s, i) => ({
        name: s.name, minValue: s.min, maxValue: s.max,
        maxParticipants: undefined, order: i + 1,
      })));
      return;
    }

    // ── Generate N min values from M suggestion breakpoints ──────────────────
    let mins: number[];
    if (N <= M) {
      // Take first N suggestion mins
      mins = sug.slice(0, N).map(s => s.min);
    } else {
      // N > M: use top (M-1) mins, subdivide the bottom band into (N-M+1) parts
      const topMins  = sug.slice(0, M - 1).map(s => s.min);
      const bandTop  = sug[M - 2]?.min ?? sug[0].min; // top edge of the bottom band
      const parts    = N - (M - 1);                    // how many segments to fill
      const step     = parts > 1 ? round2(bandTop / parts) : 0;
      const extraMins = Array.from({ length: parts }, (_, k) =>
        round2(step * (parts - 1 - k))
      );
      mins = [...topMins, ...extraMins];
    }

    // ── Apply mins to existing levels, preserve names/settings ───────────────
    const updated = levels.map((lv, i) => ({ ...lv, minValue: mins[i] }));

    // ── Sync max values: levels[0]=top, levels[N-1]=bottom ───────────────────
    // Each level's max = the previous level's min − 0.01
    for (let i = 1; i < updated.length; i++) {
      updated[i] = { ...updated[i], maxValue: round2(updated[i - 1].minValue - 0.01) };
    }
    updated[0] = { ...updated[0], maxValue: undefined }; // top level: no upper bound

    onChange(updated);
  };

  return (
    <div className={clsx("space-y-3", disabled && "opacity-50 pointer-events-none")}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-400">
          Define los niveles usando valores de{" "}
          <strong className="text-white">{metricLabel}</strong>.
          Los jugadores se asignan al nivel que corresponda a su media.
        </p>
        <button
          type="button"
          onClick={useSuggested}
          className="text-xs text-red-400 hover:text-red-300 shrink-0 ml-4 transition-colors"
        >
          Usar sugeridos →
        </button>
      </div>

      {levels.length > 0 && (
        <div className="space-y-3">
          {levels.map((lv, i) => (
            <div key={i} className="p-3 bg-ink-900/60 border border-ink-800 rounded-xl space-y-3">
              {/* Row 1: name + metric range + delete */}
              <div className="grid grid-cols-[1fr_90px_90px_32px] gap-2 items-center">
                <input
                  value={lv.name}
                  onChange={e => updateLevel(i, "name", e.target.value)}
                  placeholder={`Nivel ${i + 1}`}
                  className="px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-white text-sm
                             focus:outline-none focus:border-red-500/60 transition-all"
                />
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-500 pointer-events-none">mín</span>
                  <input
                    type="number" step="0.01"
                    value={lv.minValue}
                    onChange={e => updateLevel(i, "minValue", parseFloat(e.target.value) || 0)}
                    className="pl-7 pr-2 py-2 w-full bg-ink-950 border border-ink-700 rounded-lg text-white text-sm text-right
                               focus:outline-none focus:border-red-500/60 transition-all"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-500 pointer-events-none">máx</span>
                  <input
                    type="number" step="0.01"
                    value={lv.maxValue ?? ""}
                    onChange={e => updateLevel(i, "maxValue", e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="—"
                    className="pl-7 pr-2 py-2 w-full bg-ink-950 border border-ink-700 rounded-lg text-white text-sm text-right
                               focus:outline-none focus:border-red-500/60 transition-all placeholder-ink-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLevel(i)}
                  className="p-1.5 text-ink-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Row 2: max participants + match format — same line */}
              <div className="flex items-start gap-4 flex-wrap">
                {/* Size selector (left) */}
                <div className="flex-1 min-w-0">
                  <SizeSelector
                    label={`Máx. participantes — ${lv.name || `Nivel ${i + 1}`}`}
                    value={lv.maxParticipants}
                    onChange={v => updateLevel(i, "maxParticipants", v)}
                    allowUnlimited
                  />
                </div>

                {/* Best-of steppers (right) */}
                <div className="space-y-2 shrink-0">
                  <BestOfStepper
                    label={isDoubleElim ? "Ganadores al mejor de" : "Partidas al mejor de"}
                    value={lv.bestOf}
                    onChange={v => updateLevel(i, "bestOf", v)}
                  />
                  {isDoubleElim && (
                    <BestOfStepper
                      label="Perdedores al mejor de"
                      value={lv.bestOfLosers}
                      onChange={v => updateLevel(i, "bestOfLosers", v)}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addLevel}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-ink-700
                   text-sm text-ink-500 hover:border-ink-500 hover:text-ink-300 transition-all"
      >
        <Plus className="w-4 h-4" /> Añadir nivel
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO date string as "yyyy-MM-ddTHH:mm" for datetime-local inputs */
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
