"use client";

import React, {
  useState, useRef, useMemo, useCallback, useEffect,
} from "react";
import { clsx } from "clsx";
import { X, Save, Plus, LayoutGrid, Wand2, Info, ArrowLeftRight, ArrowDownUp } from "lucide-react";
import type { Diana, Tournament } from "@tournament/types";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

// ── Constants ──────────────────────────────────────────────────────────────────
const COLS      = 72;   // fits up to 72 dianas per row
const ROWS      = 20;
const MIN_CELL  = 14;   // minimum cell size in px
const DRAG_THRES = 4;   // px before mousedown becomes a drag

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── Local types ────────────────────────────────────────────────────────────────
interface LD {
  id:      string;
  number:  number;
  matchId: string | null;
  broken:  boolean;
  room:    string;
  posX:    number | null;
  posY:    number | null;
}

interface DragState {
  primaryId: string;
  ids:       string[];
  origins:   Map<string, { x: number; y: number }>;
  fromTray:  boolean;
  targetX:   number;
  targetY:   number;
}

interface BoxSel { x1: number; y1: number; x2: number; y2: number }

type Pending =
  | { kind: "diana"; diana: LD; fromTray: boolean;
      startX: number; startY: number; shiftKey: boolean; selSnapshot: Set<string> }
  | { kind: "box";   startX: number; startY: number;    shiftKey: boolean };

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  tournament: Tournament;
  dianas:     Diana[];
  onClose:    () => void;
  onSaved:    () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
export function DianaFloorPlanEditor({ tournament, dianas, onClose, onSaved }: Props) {

  // ── React state ──────────────────────────────────────────────────────────────
  const [local,      setLocal]      = useState<LD[]>(() =>
    dianas.map(d => ({
      id: d.id, number: d.number, matchId: d.matchId ?? null,
      broken: d.broken ?? false,
      room: d.room ?? "Sala 1", posX: d.posX ?? null, posY: d.posY ?? null,
    }))
  );
  const [extraRooms, setExtraRooms] = useState<string[]>([]);
  const [activeRoom, setActiveRoom] = useState<string>(() => dianas[0]?.room ?? "Sala 1");
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [drag,       setDrag]       = useState<DragState | null>(null);
  const [boxSel,     setBoxSel]     = useState<BoxSel | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [cellSize,   setCellSize]   = useState(26);

  // ── Refs (synchronous reads in global handlers — no stale closures) ───────────
  const gridRef         = useRef<HTMLDivElement>(null);
  const wrapperRef      = useRef<HTMLDivElement>(null);   // drives ResizeObserver
  const pendingRef      = useRef<Pending | null>(null);
  const dragRef         = useRef<DragState | null>(null);
  const boxSelRef       = useRef<BoxSel | null>(null);
  const localRef        = useRef<LD[]>(local);
  const activeRoomRef   = useRef<string>(activeRoom);
  const shiftHeld       = useRef(false);
  const lastHoveredCell = useRef<{ x: number; y: number } | null>(null);
  const cellSizeRef     = useRef(26);   // always in sync with cellSize state

  // Mirror state → refs
  useEffect(() => { localRef.current      = local;      }, [local]);
  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);

  // Dynamic cell size: fill wrapper without scrolling
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const c = Math.max(MIN_CELL, Math.floor(Math.min(width / COLS, height / ROWS)));
      if (c !== cellSizeRef.current) {
        cellSizeRef.current = c;
        setCellSize(c);
      }
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Track Shift key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { shiftHeld.current = e.shiftKey; };
    window.addEventListener("keydown", h);
    window.addEventListener("keyup",   h);
    return () => { window.removeEventListener("keydown", h); window.removeEventListener("keyup", h); };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const allRooms   = useMemo(() => [...new Set([...local.map(d => d.room), ...extraRooms])].sort(), [local, extraRooms]);
  const roomDianas = useMemo(() => local.filter(d => d.room === activeRoom), [local, activeRoom]);
  const gridDianas = useMemo(() => roomDianas.filter(d => d.posX !== null && d.posY !== null), [roomDianas]);
  const trayDianas = useMemo(() => roomDianas.filter(d => d.posX === null  || d.posY === null),  [roomDianas]);
  const otherRooms = useMemo(() => allRooms.filter(r => r !== activeRoom), [allRooms, activeRoom]);

  // ── Display position during live drag ────────────────────────────────────────
  const displayPos = useCallback((d: LD): { x: number; y: number } | null => {
    if (!drag || !drag.ids.includes(d.id)) {
      return d.posX !== null && d.posY !== null ? { x: d.posX, y: d.posY } : null;
    }
    if (drag.fromTray && d.id === drag.primaryId) return { x: drag.targetX, y: drag.targetY };
    const pOrigin = drag.origins.get(drag.primaryId);
    const origin  = drag.origins.get(d.id);
    if (!pOrigin || !origin) return null;
    return {
      x: clamp(origin.x + (drag.targetX - pOrigin.x), 0, COLS - 1),
      y: clamp(origin.y + (drag.targetY - pOrigin.y), 0, ROWS - 1),
    };
  }, [drag]);

  // ── Global mouse handlers (run once — all state reads via refs) ───────────────
  useEffect(() => {

    // Helpers — defined inside effect so they capture the stable refs
    const cellFrom = (cx: number, cy: number) => {
      const r  = gridRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      const cs = cellSizeRef.current;
      return { x: clamp(Math.floor((cx - r.left) / cs), 0, COLS - 1),
               y: clamp(Math.floor((cy - r.top)  / cs), 0, ROWS - 1) };
    };
    const relPx = (cx: number, cy: number) => {
      const r = gridRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: clamp(cx - r.left, 0, r.width), y: clamp(cy - r.top, 0, r.height) };
    };
    const isOnGrid = (cx: number, cy: number) => {
      const r = gridRef.current?.getBoundingClientRect();
      if (!r) return false;
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    };

    // Commit drag — swap displaced dianas into vacated slots
    const applyDrag = (d: DragState, onGrid: boolean) => {
      setLocal(prev => {
        if (!onGrid) {
          return prev.map(it => d.ids.includes(it.id) ? { ...it, posX: null, posY: null } : it);
        }
        const room    = activeRoomRef.current;
        const pOrigin = d.origins.get(d.primaryId) ?? { x: d.targetX, y: d.targetY };
        const dx = d.targetX - pOrigin.x;
        const dy = d.targetY - pOrigin.y;

        const proposed = new Map<string, { x: number; y: number }>();
        for (const id of d.ids) {
          if (d.fromTray && id === d.primaryId) {
            proposed.set(id, { x: d.targetX, y: d.targetY });
          } else {
            const o = d.origins.get(id);
            if (o) proposed.set(id, { x: clamp(o.x + dx, 0, COLS - 1), y: clamp(o.y + dy, 0, ROWS - 1) });
          }
        }
        const proposedKeys = new Set([...proposed.values()].map(p => `${p.x},${p.y}`));
        const dragging     = new Set(d.ids);

        const vacated: { x: number; y: number }[] = [];
        for (const id of d.ids) {
          const o = d.origins.get(id);
          if (o && !proposedKeys.has(`${o.x},${o.y}`)) vacated.push(o);
        }

        const displaced: LD[] = [];
        for (const it of prev) {
          if (dragging.has(it.id) || it.room !== room || it.posX === null || it.posY === null) continue;
          if (proposedKeys.has(`${it.posX},${it.posY}`)) displaced.push(it);
        }

        const swapMap = new Map<string, { x: number; y: number }>();
        displaced.forEach((it, i) => { if (i < vacated.length) swapMap.set(it.id, vacated[i]); });

        return prev.map(it => {
          if (proposed.has(it.id)) {
            const p = proposed.get(it.id)!;
            return { ...it, posX: p.x, posY: p.y, room };
          }
          if (swapMap.has(it.id)) {
            const p = swapMap.get(it.id)!;
            return { ...it, posX: p.x, posY: p.y };
          }
          return it;
        });
      });
    };

    // Commit box selection
    const applyBox = (box: BoxSel, additive: boolean) => {
      const cs = cellSizeRef.current;
      const x1 = Math.floor(Math.min(box.x1, box.x2) / cs);
      const y1 = Math.floor(Math.min(box.y1, box.y2) / cs);
      const x2 = Math.floor(Math.max(box.x1, box.x2) / cs);
      const y2 = Math.floor(Math.max(box.y1, box.y2) / cs);
      const ids = localRef.current
        .filter(d => d.room === activeRoomRef.current && d.posX !== null && d.posY !== null
                     && d.posX >= x1 && d.posX <= x2 && d.posY >= y1 && d.posY <= y2)
        .map(d => d.id);
      if (additive) setSelected(s => { const n = new Set(s); ids.forEach(id => n.add(id)); return n; });
      else          setSelected(new Set(ids));
    };

    // ── mousemove ──────────────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      const pd = pendingRef.current;

      if (pd) {
        const dist = Math.hypot(e.clientX - pd.startX, e.clientY - pd.startY);
        if (dist < DRAG_THRES) return;

        if (pd.kind === "diana") {
          const { diana, fromTray, selSnapshot: sel } = pd;
          const room  = activeRoomRef.current;
          const inSel = sel.has(diana.id);
          let dragIds: string[];
          if (fromTray) {
            dragIds = [diana.id];
          } else if (inSel) {
            dragIds = [...sel].filter(id => {
              const ld = localRef.current.find(d => d.id === id);
              return ld && ld.room === room && ld.posX !== null;
            });
            if (!dragIds.length || !dragIds.includes(diana.id)) dragIds = [diana.id];
          } else {
            dragIds = [diana.id];
            setSelected(new Set([diana.id]));
          }

          const origins = new Map<string, { x: number; y: number }>();
          dragIds.forEach(id => {
            const ld = localRef.current.find(d => d.id === id);
            if (ld && ld.posX !== null && ld.posY !== null) origins.set(id, { x: ld.posX, y: ld.posY });
          });

          const startCell = !fromTray && diana.posX !== null && diana.posY !== null
            ? { x: diana.posX, y: diana.posY }
            : cellFrom(e.clientX, e.clientY);

          const ds: DragState = { primaryId: diana.id, ids: dragIds, origins, fromTray, targetX: startCell.x, targetY: startCell.y };
          dragRef.current = ds;
          setDrag(ds);
          pendingRef.current = null;

        } else {
          const start  = relPx(pd.startX, pd.startY);
          const cur    = relPx(e.clientX, e.clientY);
          const newBox = { x1: start.x, y1: start.y, x2: cur.x, y2: cur.y };
          boxSelRef.current = newBox;
          setBoxSel(newBox);
          pendingRef.current = null;
        }
        return;
      }

      if (dragRef.current) {
        const cell    = cellFrom(e.clientX, e.clientY);
        const newDrag = { ...dragRef.current, targetX: cell.x, targetY: cell.y };
        dragRef.current = newDrag;
        setDrag(newDrag);
        return;
      }

      if (boxSelRef.current) {
        const cur    = relPx(e.clientX, e.clientY);
        const newBox = { ...boxSelRef.current, x2: cur.x, y2: cur.y };
        boxSelRef.current = newBox;
        setBoxSel(newBox);
        return;
      }

      // Shift+hover paint-select
      if (shiftHeld.current && isOnGrid(e.clientX, e.clientY)) {
        const cell = cellFrom(e.clientX, e.clientY);
        const last = lastHoveredCell.current;
        if (!last || last.x !== cell.x || last.y !== cell.y) {
          lastHoveredCell.current = cell;
          const d = localRef.current.find(ld =>
            ld.room === activeRoomRef.current && ld.posX === cell.x && ld.posY === cell.y
          );
          if (d) setSelected(s => { if (s.has(d.id)) return s; const n = new Set(s); n.add(d.id); return n; });
        }
      } else {
        lastHoveredCell.current = null;
      }
    };

    // ── mouseup ────────────────────────────────────────────────────────────────
    const onUp = (e: MouseEvent) => {
      if (boxSelRef.current) {
        applyBox(boxSelRef.current, shiftHeld.current);
        boxSelRef.current = null;
        setBoxSel(null);
        pendingRef.current = null;
        return;
      }

      if (dragRef.current) {
        applyDrag(dragRef.current, isOnGrid(e.clientX, e.clientY));
        dragRef.current = null;
        setDrag(null);
        pendingRef.current = null;
        return;
      }

      const pd = pendingRef.current;
      if (pd) {
        pendingRef.current = null;
        if (pd.kind === "diana") {
          const { diana, shiftKey } = pd;
          if (shiftKey) {
            setSelected(s => { const n = new Set(s); n.has(diana.id) ? n.delete(diana.id) : n.add(diana.id); return n; });
          } else {
            setSelected(s => s.size === 1 && s.has(diana.id) ? new Set() : new Set([diana.id]));
          }
        } else if (!pd.shiftKey) {
          setSelected(new Set());
        }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []); // runs ONCE — all state via refs

  // ── Mousedown on a diana ──────────────────────────────────────────────────────
  const handleDianaMouseDown = useCallback((e: React.MouseEvent, diana: LD, fromTray: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    pendingRef.current = {
      kind: "diana", diana, fromTray,
      startX: e.clientX, startY: e.clientY,
      shiftKey: e.shiftKey,
      selSnapshot: new Set(selected),
    };
  }, [selected]);

  // ── Mousedown on empty grid area (start box-select) ──────────────────────────
  const handleGridMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-diana]")) return;
    e.preventDefault();
    pendingRef.current = { kind: "box", startX: e.clientX, startY: e.clientY, shiftKey: e.shiftKey };
  }, []);

  // ── Room management ───────────────────────────────────────────────────────────
  const addRoom = useCallback(() => {
    const name = `Sala ${allRooms.length + 1}`;
    setExtraRooms(r => [...r, name]);
    setActiveRoom(name);
  }, [allRooms.length]);

  const moveDianasToRoom = useCallback((ids: string[], targetRoom: string) => {
    setLocal(prev => prev.map(d => ids.includes(d.id) ? { ...d, room: targetRoom, posX: null, posY: null } : d));
    setSelected(new Set());
  }, []);

  // ── Auto-arrange ──────────────────────────────────────────────────────────────
  const autoArrange = useCallback(() => {
    setLocal(prev => {
      const occ = new Set(prev.filter(d => d.room === activeRoom && d.posX !== null).map(d => `${d.posX},${d.posY}`));
      let idx = 0;
      return prev.map(d => {
        if (d.room !== activeRoom || d.posX !== null) return d;
        while (idx < COLS * ROWS) {
          const cx = idx % COLS, cy = Math.floor(idx / COLS); idx++;
          if (!occ.has(`${cx},${cy}`)) { occ.add(`${cx},${cy}`); return { ...d, posX: cx, posY: cy }; }
        }
        return d;
      });
    });
  }, [activeRoom]);

  // ── Invert selection positions ────────────────────────────────────────────────
  const handleInvert = useCallback(() => {
    setLocal(prev => {
      // Only selected dianas in the active room that are on the grid
      const selDianas = prev.filter(d =>
        selected.has(d.id) && d.room === activeRoom && d.posX !== null && d.posY !== null
      );
      if (selDianas.length < 2) return prev;

      // Sort by reading order: row first (Y), then column (X)
      const sorted = [...selDianas].sort((a, b) =>
        a.posY! !== b.posY! ? a.posY! - b.posY! : a.posX! - b.posX!
      );

      // Collect positions then reverse them
      const positions = sorted.map(d => ({ posX: d.posX!, posY: d.posY! }));
      const reversed  = [...positions].reverse();

      const newPos = new Map<string, { posX: number; posY: number }>();
      sorted.forEach((d, i) => newPos.set(d.id, reversed[i]));

      return prev.map(it => newPos.has(it.id) ? { ...it, ...newPos.get(it.id)! } : it);
    });
  }, [selected, activeRoom]);

  // ── Transpose selection (swap X↔Y offsets from bounding-box origin) ──────────
  const handleTranspose = useCallback(() => {
    setLocal(prev => {
      const selDianas = prev.filter(d =>
        selected.has(d.id) && d.room === activeRoom && d.posX !== null && d.posY !== null
      );
      if (selDianas.length < 2) return prev;

      const minX = Math.min(...selDianas.map(d => d.posX!));
      const minY = Math.min(...selDianas.map(d => d.posY!));

      const newPos = new Map<string, { posX: number; posY: number }>();
      selDianas.forEach(d => {
        const dx = d.posX! - minX;
        const dy = d.posY! - minY;
        // Swap offsets: horizontal → vertical, vertical → horizontal
        newPos.set(d.id, {
          posX: clamp(minX + dy, 0, COLS - 1),
          posY: clamp(minY + dx, 0, ROWS - 1),
        });
      });

      return prev.map(it => newPos.has(it.id) ? { ...it, ...newPos.get(it.id)! } : it);
    });
  }, [selected, activeRoom]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/tournaments/${tournament.id}/dianas/layout`, {
        dianas: local.map(d => ({ id: d.id, posX: d.posX, posY: d.posY, room: d.room })),
      });
      toast.success("Plano guardado");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al guardar");
    } finally { setSaving(false); }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────
  const selectedTrayIds = useMemo(
    () => [...selected].filter(id => trayDianas.some(d => d.id === id)),
    [selected, trayDianas]
  );
  const boxStyle = useMemo(() => !boxSel ? null : ({
    left:   Math.min(boxSel.x1, boxSel.x2),
    top:    Math.min(boxSel.y1, boxSel.y2),
    width:  Math.abs(boxSel.x2 - boxSel.x1),
    height: Math.abs(boxSel.y2 - boxSel.y1),
  }), [boxSel]);

  // Diana sizing derived from cell size
  const pad      = Math.max(2, Math.floor(cellSize * 0.08));
  const dSize    = cellSize - pad * 2;
  const fontSize = cellSize < 20 ? "7px" : cellSize < 26 ? "8px" : cellSize < 32 ? "9px" : "10px";
  const chipSize = Math.max(26, Math.min(dSize, 34));

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-[#0e0e0e] border border-[#222] rounded-2xl w-full flex flex-col shadow-2xl"
           style={{ height: "calc(100vh - 1.5rem)", maxWidth: 1800 }}>

        {/* ── Header ── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-red-400" />
            <div>
              <h2 className="font-black text-white text-base">Editor de Plano de Dianas</h2>
              <p className="text-xs text-[#555]">
                {tournament.name} · {local.length} dianas · {allRooms.length} sala{allRooms.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={autoArrange}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#333] text-[#888] hover:text-white hover:border-[#555] transition-colors">
              <Wand2 className="w-3.5 h-3.5" /> Auto-posicionar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {saving ? "Guardando…" : "Guardar plano"}
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#1e1e1e] text-[#555] hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Instructions ── */}
        <div className="shrink-0 flex items-start gap-2 px-5 py-1.5 border-b border-[#1a1a1a] bg-[#111] text-[11px] text-[#555]">
          <Info className="w-3 h-3 mt-0.5 shrink-0 text-[#444]" />
          <span>
            <strong className="text-[#777]">Arrastra</strong> desde la bandeja al plano ·{" "}
            <strong className="text-[#777]">Shift+mover</strong> para seleccionar ·{" "}
            <strong className="text-[#777]">Rectángulo</strong> en zona vacía para selección en bloque ·{" "}
            Las dianas hacen <strong className="text-[#777]">swap</strong> al soltarse encima de otra
          </span>
        </div>

        {/* ── Room tabs ── */}
        <div className="shrink-0 flex items-center gap-1.5 px-5 py-2 border-b border-[#1a1a1a] flex-wrap">
          {allRooms.map(room => (
            <button key={room}
              onClick={() => { setActiveRoom(room); setSelected(new Set()); }}
              className={clsx(
                "px-3 py-1 rounded-lg text-xs font-bold transition-colors border",
                activeRoom === room
                  ? "bg-red-600/20 text-red-300 border-red-600/40"
                  : "text-[#666] hover:text-[#aaa] border-transparent hover:border-[#333]"
              )}>
              {room} <span className="opacity-50">({local.filter(d => d.room === room).length})</span>
            </button>
          ))}
          <button onClick={addRoom}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#555] hover:text-[#aaa] border border-dashed border-[#2a2a2a] hover:border-[#444] transition-colors ml-1">
            <Plus className="w-3 h-3" /> Sala
          </button>
          <div className="ml-auto text-[11px] text-[#444] flex items-center gap-2">
            {selected.size >= 2 && (
              <>
                <button
                  onClick={handleInvert}
                  title="Invertir el orden de posiciones de las dianas seleccionadas"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#444] text-[#aaa] hover:text-white hover:border-[#666] transition-colors font-semibold">
                  <ArrowLeftRight className="w-3 h-3" /> Invertir
                </button>
                <button
                  onClick={handleTranspose}
                  title="Transponer: rotar 90° la selección (horizontal ↔ vertical)"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#444] text-[#aaa] hover:text-white hover:border-[#666] transition-colors font-semibold">
                  <ArrowDownUp className="w-3 h-3" /> Transponer
                </button>
              </>
            )}
            {selected.size > 0 && (
              <span className="text-blue-400 font-semibold">{selected.size} sel.</span>
            )}
            <span>{gridDianas.length} posicionadas</span>
            {trayDianas.length > 0 && <span className="text-amber-600">{trayDianas.length} en bandeja</span>}
          </div>
        </div>

        {/* ── Editor body ── */}
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">

          {/* Grid wrapper — flex-1 → drives ResizeObserver → determines cell size */}
          <div ref={wrapperRef} className="flex-1 min-h-0 overflow-hidden">
            <div
              ref={gridRef}
              onMouseDown={handleGridMouseDown}
              className="relative rounded-xl border border-[#2a2a2a] select-none overflow-hidden"
              style={{
                width:  COLS * cellSize,
                height: ROWS * cellSize,
                cursor: drag ? "grabbing" : "crosshair",
                backgroundColor: "#212121",
                backgroundImage: [
                  `linear-gradient(to bottom, transparent ${cellSize - 1}px, #2e2e2e ${cellSize - 1}px)`,
                  `linear-gradient(to right,  transparent ${cellSize - 1}px, #2e2e2e ${cellSize - 1}px)`,
                ].join(", "),
                backgroundSize: `${cellSize}px ${cellSize}px`,
              }}
            >
              {/* Col labels */}
              {Array.from({ length: COLS }, (_, i) => (
                <span key={`c${i}`}
                  className="absolute text-[7px] text-[#383838] font-mono pointer-events-none"
                  style={{ left: i * cellSize + 2, top: 1 }}>
                  {i + 1}
                </span>
              ))}
              {/* Row labels */}
              {Array.from({ length: ROWS }, (_, i) => (
                <span key={`r${i}`}
                  className="absolute text-[7px] text-[#383838] font-mono pointer-events-none"
                  style={{ left: 2, top: i * cellSize + 1 }}>
                  {String.fromCharCode(65 + i)}
                </span>
              ))}

              {/* Positioned dianas */}
              {gridDianas.map(d => {
                const dp      = displayPos(d);
                if (!dp) return null;
                const isDragged = !!drag?.ids.includes(d.id);
                const isSel     = selected.has(d.id);
                const isOcc     = !!d.matchId;
                return (
                  <div
                    key={d.id}
                    data-diana={d.id}
                    onMouseDown={e => handleDianaMouseDown(e, d, false)}
                    title={`Diana ${d.number}${isOcc ? " — En uso" : ""}`}
                    className={clsx(
                      "absolute flex items-center justify-center rounded-lg border-2 z-10 font-black",
                      isDragged ? "opacity-50 z-20 cursor-grabbing scale-90"
                               : "cursor-grab hover:scale-110 hover:z-10",
                      isSel && !isDragged && "ring-2 ring-blue-400 ring-offset-1 ring-offset-[#212121]",
                      isOcc
                        ? "bg-red-900/80 border-red-500/80 text-red-200 shadow-[0_0_8px_0_rgba(239,68,68,0.4)]"
                        : d.broken
                        ? "bg-amber-900/60 border-amber-600/60 text-amber-300"
                        : "bg-green-900/60 border-green-700/60 text-green-300",
                    )}
                    style={{
                      left:       dp.x * cellSize + pad,
                      top:        dp.y * cellSize + pad,
                      width:      dSize,
                      height:     dSize,
                      fontSize,
                      transition: isDragged ? "none" : "left 60ms ease, top 60ms ease",
                    }}
                  >
                    {d.number}
                    {isSel && !isDragged && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 border border-[#212121]" />
                    )}
                    {isOcc && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-[#212121]" />
                    )}
                  </div>
                );
              })}

              {/* Tray-drag ghost */}
              {drag?.fromTray && (() => {
                const d = local.find(ld => ld.id === drag.primaryId);
                if (!d) return null;
                return (
                  <div
                    className={clsx(
                      "absolute rounded-lg border-2 border-dashed flex items-center justify-center font-black pointer-events-none z-20",
                      d.matchId ? "border-red-400/60 bg-red-900/20 text-red-300/50"
                      : d.broken ? "border-amber-500/60 bg-amber-900/20 text-amber-300/50"
                                 : "border-green-500/60 bg-green-900/20 text-green-300/50",
                    )}
                    style={{
                      left:     drag.targetX * cellSize + pad,
                      top:      drag.targetY * cellSize + pad,
                      width:    dSize,
                      height:   dSize,
                      fontSize,
                    }}
                  >
                    {d.number}
                  </div>
                );
              })()}

              {/* Rubber-band box */}
              {boxStyle && (
                <div
                  className="absolute border border-blue-400/80 bg-blue-500/10 pointer-events-none z-30 rounded"
                  style={boxStyle}
                />
              )}
            </div>
          </div>

          {/* ── Tray ── */}
          <div className="shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[#555] font-semibold uppercase tracking-widest">
                Bandeja — sin posicionar ({trayDianas.length})
                {trayDianas.length === 0 && (
                  <span className="ml-2 text-green-600 normal-case tracking-normal font-normal">
                    ✓ Todo posicionado
                  </span>
                )}
              </p>
              {selectedTrayIds.length > 0 && otherRooms.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#555]">Mover a:</span>
                  {otherRooms.map(r => (
                    <button key={r} onClick={() => moveDianasToRoom(selectedTrayIds, r)}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold border border-[#333] text-[#888] hover:text-white transition-colors">
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {trayDianas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl border border-dashed border-[#252525] bg-[#111] max-h-[66px] overflow-y-auto">
                {trayDianas.map(d => {
                  const isBeingDragged = drag?.fromTray && drag.ids.includes(d.id);
                  const isSel          = selected.has(d.id);
                  return (
                    <div key={d.id} data-diana={d.id}
                      onMouseDown={e => handleDianaMouseDown(e, d, true)}
                      title={`Diana ${d.number} — arrastra al plano`}
                      className={clsx(
                        "relative flex items-center justify-center rounded-lg font-black border-2 select-none cursor-grab transition-all text-[10px]",
                        isBeingDragged && "opacity-20 scale-90 cursor-grabbing",
                        isSel && !isBeingDragged && "ring-2 ring-blue-400 ring-offset-1 ring-offset-[#111]",
                        d.matchId
                          ? "bg-red-900/50 border-red-600/60 text-red-200"
                          : d.broken
                          ? "bg-amber-900/40 border-amber-600/60 text-amber-300"
                          : "bg-[#1e1e1e] border-[#303030] text-[#888] hover:text-[#ccc] hover:border-[#444]",
                      )}
                      style={{ width: chipSize, height: chipSize }}>
                      {d.number}
                      {isSel && !isBeingDragged && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 border border-[#111]" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {otherRooms.length > 0 && (
              <div className="text-[11px] text-[#3a3a3a] flex gap-4">
                {otherRooms.map(r => {
                  const cnt = local.filter(d => d.room === r).length;
                  const pos = local.filter(d => d.room === r && d.posX !== null).length;
                  return (
                    <button key={r} onClick={() => setActiveRoom(r)} className="hover:text-[#777]">
                      {r}: {pos}/{cnt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-2.5 border-t border-[#1a1a1a] flex items-center justify-between">
          <p className="text-[11px] text-[#3a3a3a]">
            {COLS}×{ROWS} · celda {cellSize}px · {local.filter(d => d.posX !== null).length}/{local.length} posicionadas
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-[#333] text-[#666] hover:text-white hover:border-[#555] transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {saving ? "Guardando…" : "Guardar plano"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
