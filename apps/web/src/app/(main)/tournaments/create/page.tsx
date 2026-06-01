"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, ChevronDown, ChevronUp, ImagePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  SizeSelector, LevelBuilder, LevelData,
  FORMAT_OPTIONS, GAME_OPTIONS, METRIC_OPTIONS,
} from "@/components/tournament/TournamentFormShared";
import { DateTimePicker } from "@/components/ui/DateTimePicker";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name:             z.string().min(3, "Mínimo 3 caracteres"),
  description:      z.string().optional(),
  format:           z.enum(["single_elimination", "double_elimination", "round_robin"]),
  maxParticipants:  z.coerce.number().int().min(0).max(512), // 0 = sin límite
  participantType:  z.enum(["individual", "parejas", "parejas_ciegas", "trios", "equipos"]),
  rules:            z.string().optional(),
  startDate:        z.string().optional(),
  gameType:         z.enum(["01", "cricket", "combo"]).optional(),
  metric:           z.enum(["ppd", "mpr", "combined"]).optional(),
  rrGroupSize:      z.coerce.number().int().min(3).max(8).optional(),
  rrAdvancingTeams: z.coerce.number().int().min(2).max(4).optional(),
});

type FormData = z.infer<typeof schema>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateTournamentPage() {
  const router = useRouter();
  const [levels,           setLevels]           = useState<LevelData[]>([]);
  const [showAdvanced,     setShowAdvanced]     = useState(false);
  const [rrGroupSize,      setRrGroupSize]      = useState(4);
  const [rrAdvancingTeams, setRrAdvancingTeams] = useState(2);
  const [teamSizeMin,      setTeamSizeMin]      = useState(4);   // required players
  const [teamSizeMax,      setTeamSizeMax]      = useState(7);   // max/optional players
  const [metricPlayers,    setMetricPlayers]    = useState(4);
  const [maxMetric,        setMaxMetric]        = useState("");
  const [flashField,       setFlashField]       = useState<string | null>(null);
  const [pendingImage,     setPendingImage]     = useState<File | null>(null);
  const [imagePreview,     setImagePreview]     = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { format: "single_elimination", participantType: "individual", maxParticipants: 0 },
  });

  const selectedFormat   = watch("format");
  const selectedGame     = watch("gameType");
  const selectedMetric   = watch("metric");

  const selectImage = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máx 5 MB"); return; }
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        ...data,
        startDate:  data.startDate ? new Date(data.startDate).toISOString() : undefined,
        levels:     levels.length > 0 ? levels : undefined,
        ...(data.format === "round_robin" ? { rrGroupSize, rrAdvancingTeams } : {}),
        ...(data.participantType === "equipos" ? { teamSize: teamSizeMax, teamSizeMin, metricPlayers } : {}),
        ...(maxMetric ? { maxMetric: parseFloat(maxMetric) } : {}),
      };
      const { data: res } = await api.post("/tournaments", payload);
      const tournamentId = res.data.id;

      // Upload image if one was selected
      if (pendingImage) {
        const fd = new FormData();
        fd.append("image", pendingImage);
        await api.post(`/tournaments/${tournamentId}/image`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        }).catch(() => {}); // non-blocking — user can retry in settings
      }

      toast.success("¡Torneo creado!");
      router.push(`/tournaments/${tournamentId}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al crear el torneo");
    }
  };

  const onError = (errs: typeof errors) => {
    const firstKey = Object.keys(errs)[0];
    const el = fieldRefs.current[firstKey];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashField(firstKey);
      setTimeout(() => setFlashField(null), 1900); // 3 pulses × ~0.6 s
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white placeholder-ink-500 " +
    "focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/tournaments" className="text-ink-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Nuevo torneo</h1>
          <p className="text-ink-400 text-sm mt-0.5">Configura el torneo y abre inscripciones</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-5">

        {/* ── Información básica ─────────────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-400 uppercase tracking-wider">Información básica</h2>

          <div
            ref={el => { fieldRefs.current["name"] = el; }}
            className={clsx(flashField === "name" && "field-error-flash")}
          >
            <label className="label">Nombre del torneo *</label>
            <input {...register("name")} className={inputCls} placeholder="Copa de Primavera 2026" />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea {...register("description")} className={inputCls + " resize-none"} rows={2} placeholder="Describe el torneo…" />
          </div>

          {/* ── Foto del torneo ── */}
          <div className="space-y-2">
            <label className="label">Foto del torneo <span className="text-ink-600 font-normal">(opcional)</span></label>
            {imagePreview ? (
              <div className="relative group rounded-2xl overflow-hidden border border-ink-700 h-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button type="button" onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all">
                    <ImagePlus className="w-3.5 h-3.5" /> Cambiar
                  </button>
                  <button type="button" onClick={() => { setPendingImage(null); setImagePreview(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs font-semibold border border-red-700/40 transition-all">
                    <Trash2 className="w-3.5 h-3.5" /> Quitar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => imageInputRef.current?.click()}
                className="w-full h-32 rounded-2xl border-2 border-dashed border-ink-700 hover:border-ink-500 bg-ink-800/30 hover:bg-ink-800/50 transition-all flex flex-col items-center justify-center gap-2">
                <ImagePlus className="w-7 h-7 text-ink-500" />
                <span className="text-xs text-ink-400 font-medium">Sube una foto · Arrastra o haz click</span>
                <span className="text-[10px] text-ink-600">JPG, PNG, WEBP · Máx 5 MB</span>
              </button>
            )}
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) selectImage(f); e.target.value = ""; }} />
          </div>

          {/* ── Tipo de torneo ── */}
          <div className="space-y-2">
            <label className="label">Tipo de torneo</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([
                { value: "individual",     label: "Individual"       },
                { value: "parejas",        label: "Parejas"          },
                { value: "parejas_ciegas", label: "Parejas Ciegas"   },
                { value: "trios",          label: "Tríos"            },
                { value: "equipos",        label: "Equipos"          },
              ] as const).map(opt => (
                <label key={opt.value} className={clsx(
                  "flex items-center justify-center p-2.5 rounded-xl border cursor-pointer transition-all text-sm font-semibold",
                  watch("participantType") === opt.value
                    ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20 text-white"
                    : "border-ink-700 text-ink-400 hover:border-ink-500 hover:text-white"
                )}>
                  <input {...register("participantType")} type="radio" value={opt.value} className="sr-only" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* teamSize + metricPlayers — solo para Equipos */}
          {watch("participantType") === "equipos" && (
            <>
              {/* ── Min / Max team size ── */}
              <div className="space-y-2">
                <label className="label">Jugadores por equipo</label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Min */}
                  <div className="bg-ink-950 border border-ink-700 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                      Mínimo <span className="text-red-400">*</span> requeridos
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={teamSizeMin <= 1}
                        onClick={() => setTeamSizeMin(v => Math.max(1, v - 1))}
                        className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">−</button>
                      <span className="flex-1 text-center text-white font-black text-xl tabular-nums">{teamSizeMin}</span>
                      <button type="button" disabled={teamSizeMin >= teamSizeMax}
                        onClick={() => setTeamSizeMin(v => Math.min(teamSizeMax, v + 1))}
                        className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">+</button>
                    </div>
                  </div>
                  {/* Max */}
                  <div className="bg-ink-950 border border-ink-700 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Máximo opcional</p>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={teamSizeMax <= teamSizeMin}
                        onClick={() => setTeamSizeMax(v => Math.max(teamSizeMin, v - 1))}
                        className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">−</button>
                      <span className="flex-1 text-center text-white font-black text-xl tabular-nums">{teamSizeMax}</span>
                      <button type="button" disabled={teamSizeMax >= 7}
                        onClick={() => setTeamSizeMax(v => Math.min(7, v + 1))}
                        className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">+</button>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-ink-500">
                  {teamSizeMin === teamSizeMax
                    ? `Equipos de exactamente ${teamSizeMin} jugadores`
                    : `${teamSizeMin} jugadores obligatorios + hasta ${teamSizeMax - teamSizeMin} opcionales`}
                </p>
              </div>

              {/* ── metricPlayers ── */}
              <div className="space-y-2">
                <label className="label">
                  Jugadores para calcular la media
                  <span className="ml-1 text-ink-500 font-normal">(los N mejores)</span>
                </label>
                <div className="flex gap-2">
                  {[3, 4, 5, 6, 7].map(n => (
                    <button key={n} type="button"
                      disabled={n > teamSizeMax}
                      onClick={() => setMetricPlayers(n)}
                      className={clsx(
                        "flex-1 py-2 rounded-xl border text-sm font-bold transition-all",
                        metricPlayers === n ? "border-red-500/60 bg-red-900/15 text-white" : "border-ink-700 text-ink-400 hover:border-ink-500",
                        n > teamSizeMax && "opacity-30 cursor-not-allowed"
                      )}>{n}</button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-500">
                  {metricPlayers === teamSizeMax
                    ? `Media de todos los jugadores del equipo`
                    : `Media de los ${metricPlayers} jugadores con mayor media`}
                </p>
              </div>
            </>
          )}

          {/* maxMetric — límite de media */}
          <div>
            <label className="label">Límite de media máxima <span className="text-ink-500 font-normal">(opcional)</span></label>
            <input type="number" value={maxMetric} onChange={e => setMaxMetric(e.target.value)}
              step="0.01" min="0" placeholder="Ej: 3.00 (deja vacío para sin límite)"
              className={inputCls} />
            <p className="text-[11px] text-ink-500 mt-1">Los jugadores con media superior no podrán inscribirse.</p>
          </div>

          <div
            ref={el => { fieldRefs.current["maxParticipants"] = el; }}
            className={clsx(flashField === "maxParticipants" && "field-error-flash")}
          >
            <SizeSelector
              label="Máx. participantes del torneo"
              value={watch("maxParticipants") === 0 ? undefined : watch("maxParticipants")}
              onChange={(v) => setValue("maxParticipants", v ?? 0, { shouldValidate: true })}
            />
            {errors.maxParticipants && <p className="text-red-400 text-xs mt-1">{errors.maxParticipants.message}</p>}
          </div>

          <div>
            <label className="label">Fecha de inicio</label>
            <DateTimePicker
              value={watch("startDate") ?? ""}
              onChange={v => setValue("startDate", v, { shouldValidate: true })}
              placeholder="Sin fecha establecida"
            />
          </div>
        </div>

        {/* ── Modalidad de juego + Métrica ──────────────────────────────── */}
        <div className="card">
          <div className="grid grid-cols-3 gap-3">
            {/* ── título fila 1 ── */}
            <h2 className="col-span-3 text-xs font-bold text-ink-400 uppercase tracking-wider">Modalidad de juego</h2>

            <label className={clsx(
              "flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all",
              selectedGame === "01" ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20" : "border-ink-700 hover:border-ink-500"
            )}>
              <input {...register("gameType")} type="radio" value="01" className="sr-only"
                onChange={() => { setValue("gameType", "01", { shouldValidate: true }); setValue("metric", "ppd", { shouldValidate: true }); }} />
              <span className="text-sm font-bold text-white">01</span>
            </label>
            <label className={clsx(
              "flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all",
              selectedGame === "cricket" ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20" : "border-ink-700 hover:border-ink-500"
            )}>
              <input {...register("gameType")} type="radio" value="cricket" className="sr-only"
                onChange={() => { setValue("gameType", "cricket", { shouldValidate: true }); setValue("metric", "mpr", { shouldValidate: true }); }} />
              <span className="text-sm font-bold text-white">Cricket</span>
            </label>
            <label className={clsx(
              "flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all",
              selectedGame === "combo" ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20" : "border-ink-700 hover:border-ink-500"
            )}>
              <input {...register("gameType")} type="radio" value="combo" className="sr-only"
                onChange={() => { setValue("gameType", "combo", { shouldValidate: true }); setValue("metric", "combined", { shouldValidate: true }); }} />
              <span className="text-sm font-bold text-white text-center">Combo 01 & Cricket</span>
            </label>

            {/* ── título fila 2 ── */}
            <h2 className="col-span-3 text-xs font-bold text-ink-400 uppercase tracking-wider mt-2">Tipo de rating</h2>

            <label className={clsx(
              "flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all",
              selectedMetric === "ppd" ? "border-white/70 bg-ink-700" : "border-ink-600 hover:border-ink-400"
            )}>
              <input {...register("metric")} type="radio" value="ppd" className="sr-only" />
              <span className="text-sm font-bold text-blue-400">PPD</span>
            </label>
            <label className={clsx(
              "flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all",
              selectedMetric === "mpr" ? "border-white/70 bg-ink-700" : "border-ink-600 hover:border-ink-400"
            )}>
              <input {...register("metric")} type="radio" value="mpr" className="sr-only" />
              <span className="text-sm font-bold text-amber-400">MPR</span>
            </label>
            <label className={clsx(
              "flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition-all gap-0.5",
              selectedMetric === "combined" ? "border-white/70 bg-ink-700" : "border-ink-600 hover:border-ink-400"
            )}>
              <input {...register("metric")} type="radio" value="combined" className="sr-only" />
              <span className="text-sm font-bold text-purple-400">Combinada</span>
              <span className="text-[10px] text-ink-500">PPD+(MPR×10)</span>
            </label>
          </div>

          {selectedGame && (
            <button type="button"
              onClick={() => { setValue("gameType", undefined, { shouldValidate: true }); setValue("metric", undefined, { shouldValidate: true }); setLevels([]); }}
              className="text-xs text-ink-500 hover:text-red-400 transition-colors mt-4 block">
              × Quitar modalidad
            </button>
          )}
        </div>

        {/* ── Niveles / cuadrantes ──────────────────────────────────────── */}
        {selectedMetric && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-ink-400 uppercase tracking-wider">Niveles de competición</h2>
              <span className="text-xs text-ink-500">opcional</span>
            </div>
            <LevelBuilder
              levels={levels}
              onChange={setLevels}
              metric={selectedMetric}
              format={selectedFormat}
            />
          </div>
        )}

        {/* ── Formato ──────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-400 uppercase tracking-wider">Formato del bracket</h2>
          <div className="space-y-2">
            {FORMAT_OPTIONS.map(f => (
              <label
                key={f.value}
                className={clsx(
                  "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                  selectedFormat === f.value
                    ? "border-red-500/60 bg-red-900/15"
                    : "border-ink-700 hover:border-ink-600"
                )}
              >
                <input {...register("format")} type="radio" value={f.value} className="mt-1 accent-red-500" />
                <div>
                  <p className="text-white font-semibold text-sm">{f.label}</p>
                  <p className="text-ink-400 text-xs mt-0.5">{f.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Configuración Round Robin ─────────────────────────────────── */}
        {selectedFormat === "round_robin" && (
          <div className="card space-y-4">
            <h2 className="text-xs font-bold text-ink-400 uppercase tracking-wider">Configuración de grupos</h2>

            {/* Jugadores por grupo */}
            <div>
              <label className="label">Jugadores por grupo</label>
              <div className="flex items-center gap-3 mt-1.5">
                <button type="button" disabled={rrGroupSize <= 3}
                  onClick={() => setRrGroupSize(v => Math.max(3, v - 1))}
                  className="w-8 h-8 rounded-lg bg-ink-900 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all">
                  −
                </button>
                <span className="w-8 text-center text-white font-bold text-lg tabular-nums">{rrGroupSize}</span>
                <button type="button" disabled={rrGroupSize >= 8}
                  onClick={() => setRrGroupSize(v => Math.min(8, v + 1))}
                  className="w-8 h-8 rounded-lg bg-ink-900 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all">
                  +
                </button>
                <span className="text-xs text-ink-500 ml-1">jugadores · {rrGroupSize - 1} partidos por jugador</span>
              </div>
            </div>

            {/* Clasifican al KO */}
            <div>
              <label className="label">Clasifican al KO por grupo</label>
              <div className="flex gap-2 mt-1.5">
                {[2, 3, 4].map(n => (
                  <button key={n} type="button"
                    disabled={n >= rrGroupSize}
                    onClick={() => setRrAdvancingTeams(n)}
                    className={clsx(
                      "w-12 h-10 rounded-xl text-sm font-bold border transition-all",
                      rrAdvancingTeams === n
                        ? "bg-red-600 border-red-500 text-white"
                        : "bg-ink-900 border-ink-700 text-ink-300 hover:border-ink-500",
                      n >= rrGroupSize && "opacity-30 cursor-not-allowed"
                    )}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Reglas (collapsible) ──────────────────────────────────────── */}
        <div className="card">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="text-xs font-bold text-ink-400 uppercase tracking-wider">Reglas y notas</h2>
            {showAdvanced ? <ChevronUp className="w-4 h-4 text-ink-500" /> : <ChevronDown className="w-4 h-4 text-ink-500" />}
          </button>
          {showAdvanced && (
            <div className="mt-4">
              <textarea
                {...register("rules")}
                className={inputCls + " resize-none mt-1"}
                rows={4}
                placeholder="Especifica las reglas, horarios, sistema de puntuación…"
              />
            </div>
          )}
        </div>

        <button type="submit" disabled={isSubmitting}
          className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl
                     shadow-red-sm transition-all disabled:opacity-50 text-sm">
          {isSubmitting ? "Creando…" : "Crear torneo"}
        </button>
      </form>
    </div>
  );
}
