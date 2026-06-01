"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Calendar } from "lucide-react";
import { clsx } from "clsx";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_NAMES_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const offset = (firstDay + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatLabel(d: Date): string {
  const day = DAY_NAMES_ES[(d.getDay() + 6) % 7];
  return `${day} ${pad2(d.getDate())} ${MONTH_NAMES_ES[d.getMonth()]} ${d.getFullYear()}  ·  ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ─── component ───────────────────────────────────────────────────────────────

interface DateTimePickerProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Sin fecha establecida",
}: DateTimePickerProps) {
  const [open, setOpen]         = useState(false);
  const [openUp, setOpenUp]     = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);
  const popoverRef              = useRef<HTMLDivElement>(null);

  const parsed = parseValue(value);
  const now    = new Date();

  const [viewYear,  setViewYear]  = useState(parsed?.getFullYear()  ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth()     ?? now.getMonth());
  const [selYear,   setSelYear]   = useState(parsed?.getFullYear()  ?? now.getFullYear());
  const [selMonth,  setSelMonth]  = useState(parsed?.getMonth()     ?? now.getMonth());
  const [selDay,    setSelDay]    = useState(parsed?.getDate()      ?? now.getDate());
  const [selHour,   setSelHour]   = useState(parsed?.getHours()     ?? now.getHours());
  const [selMin,    setSelMin]    = useState(parsed?.getMinutes()   ?? 0);

  // Sync state when value changes externally (while closed)
  useEffect(() => {
    if (open) return;
    const p = parseValue(value);
    if (p) {
      setViewYear(p.getFullYear());  setViewMonth(p.getMonth());
      setSelYear(p.getFullYear());   setSelMonth(p.getMonth());
      setSelDay(p.getDate());        setSelHour(p.getHours());
      setSelMin(p.getMinutes());
    }
  }, [value, open]);

  // Decide whether to open upward after the popover is mounted
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 480); // popover is ~460px tall
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // ── calendar nav ─────────────────────────────────────────────────────────
  const prevMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 0) { setViewYear(y => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 11) { setViewYear(y => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const selectDay = useCallback((day: number) => {
    setSelYear(viewYear);
    setSelMonth(viewMonth);
    setSelDay(day);
  }, [viewYear, viewMonth]);

  const stepHour = useCallback((delta: number) => setSelHour(h => (h + delta + 24) % 24), []);
  const stepMin  = useCallback((delta: number) => setSelMin(m => (m + delta + 60) % 60), []);

  const confirm = useCallback(() => {
    onChange(toInputValue(new Date(selYear, selMonth, selDay, selHour, selMin)));
    setOpen(false);
  }, [selYear, selMonth, selDay, selHour, selMin, onChange]);

  // ── derived ──────────────────────────────────────────────────────────────
  const cells  = buildCalendarCells(viewYear, viewMonth);
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();
  const hasValue = !!parsed;

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger ── */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={clsx(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all text-left",
          "bg-ink-950 border-ink-700",
          !disabled && "hover:border-ink-500 cursor-pointer",
          disabled  && "opacity-40 cursor-not-allowed",
          open      && "border-red-500/60 ring-1 ring-red-500/20",
        )}
      >
        <Calendar className="w-4 h-4 text-ink-500 shrink-0" />
        <span className={clsx("flex-1 truncate", hasValue ? "text-white" : "text-ink-500")}>
          {hasValue ? formatLabel(parsed!) : placeholder}
        </span>
        <ChevronDown className={clsx("w-4 h-4 text-ink-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* ── Popover ── */}
      {open && (
        <div
          ref={popoverRef}
          className={clsx(
            "absolute z-50 w-[320px] bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl",
            openUp ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {/* Month header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#666] hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-white select-none">
              {MONTH_NAMES_ES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#666] hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 px-2 pb-1">
            {DAY_NAMES_ES.map(d => (
              <div key={d} className="flex items-center justify-center h-7">
                <span className="text-[11px] font-semibold text-[#555] select-none">{d}</span>
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 px-2 pb-2">
            {cells.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} className="h-9" />;

              const isToday    = day === todayD && viewMonth === todayM && viewYear === todayY;
              const isSelected = day === selDay && viewMonth === selMonth && viewYear === selYear;

              return (
                <div key={`d-${day}`} className="flex items-center justify-center h-9">
                  <button
                    type="button"
                    onClick={() => selectDay(day)}
                    className={clsx(
                      "h-8 w-8 rounded-lg text-sm font-medium transition-all select-none",
                      isSelected
                        ? "bg-red-600 text-white font-bold"
                        : isToday
                          ? "bg-[#2a2a2a] text-white ring-1 ring-red-500/50"
                          : "text-[#aaa] hover:bg-[#2a2a2a] hover:text-white",
                    )}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="mx-3 border-t border-[#2a2a2a]" />

          {/* Time picker */}
          <div className="flex items-center justify-center gap-2 px-4 py-3">
            {/* Hour stepper */}
            <div className="flex flex-col items-center gap-0.5">
              <button type="button" onClick={() => stepHour(1)}
                className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-[#555] hover:text-white transition-colors">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <div className="w-12 h-9 flex items-center justify-center bg-[#111] border border-[#333] rounded-lg">
                <span className="text-lg font-bold text-white tabular-nums">{pad2(selHour)}</span>
              </div>
              <button type="button" onClick={() => stepHour(-1)}
                className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-[#555] hover:text-white transition-colors">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <span className="text-xl font-bold text-[#444] select-none mb-0.5">:</span>

            {/* Minute stepper */}
            <div className="flex flex-col items-center gap-0.5">
              <button type="button" onClick={() => stepMin(5)}
                className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-[#555] hover:text-white transition-colors">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <div className="w-12 h-9 flex items-center justify-center bg-[#111] border border-[#333] rounded-lg">
                <span className="text-lg font-bold text-white tabular-nums">{pad2(selMin)}</span>
              </div>
              <button type="button" onClick={() => stepMin(-5)}
                className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-[#555] hover:text-white transition-colors">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Confirm */}
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={confirm}
              className="w-full py-2 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-sm font-semibold transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
