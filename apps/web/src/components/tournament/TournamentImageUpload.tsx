"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, Upload, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

const SERVER_ORIGIN = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ?? "http://localhost:4000";

interface Props {
  tournamentId: string;
  currentImageUrl: string | null | undefined;
  onUpdated: (imageUrl: string | null) => void;
  readOnly?: boolean;
}

export function TournamentImageUpload({ tournamentId, currentImageUrl, onUpdated, readOnly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const fullUrl = currentImageUrl ? `${SERVER_ORIGIN}${currentImageUrl}` : null;

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar 5 MB");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setLoading(true);
    try {
      const res = await api.post(`/tournaments/${tournamentId}/image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUpdated(res.data.data.imageUrl);
      toast.success("Imagen actualizada");
    } catch {
      toast.error("Error al subir la imagen");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    try {
      await api.delete(`/tournaments/${tournamentId}/image`);
      onUpdated(null);
      toast.success("Imagen eliminada");
    } catch {
      toast.error("Error al eliminar la imagen");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  if (readOnly) {
    if (!fullUrl) return null;
    return (
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ maxHeight: 320 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fullUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-40 pointer-events-none" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fullUrl} alt="Portada del torneo" className="relative z-10 mx-auto block max-w-full" style={{ maxHeight: 320, objectFit: "contain" }} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-ink-400">Foto del torneo</label>

      {fullUrl ? (
        /* ── Existing image preview — blurred bg + contain (good for A4 posters) ── */
        <div className="relative group rounded-2xl overflow-hidden border border-ink-700" style={{ minHeight: 120, maxHeight: 280 }}>
          {/* Blurred fill */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fullUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-40 pointer-events-none select-none" />
          {/* Main image contained */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fullUrl} alt="Portada" className="relative z-10 mx-auto block max-w-full" style={{ maxHeight: 280, objectFit: "contain" }} />
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs font-semibold border border-red-700/40 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
          </div>
          {loading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        /* ── Drop zone ── */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          disabled={loading}
          className={clsx(
            "w-full h-36 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2",
            dragging
              ? "border-red-500 bg-red-900/10"
              : "border-ink-700 hover:border-ink-500 bg-ink-800/30 hover:bg-ink-800/50",
          )}
        >
          {loading
            ? <Loader2 className="w-6 h-6 text-ink-400 animate-spin" />
            : <>
                <ImagePlus className="w-7 h-7 text-ink-500" />
                <span className="text-xs text-ink-400 font-medium">
                  {dragging ? "Suelta la imagen aquí" : "Sube una foto · Arrastra o haz click"}
                </span>
                <span className="text-[10px] text-ink-600">JPG, PNG, WEBP · Máx 5 MB</span>
              </>
          }
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
