"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#18181b] border border-[#27272a] rounded-2xl p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-white font-bold text-xl">Algo ha ido mal</h1>
          <p className="text-[#71717a] text-sm leading-relaxed">
            Ha ocurrido un error inesperado. Puedes intentar recargar la página o volver al inicio.
          </p>
          {error.digest && (
            <p className="text-[#52525b] text-xs font-mono">
              ref: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reintentar
          </button>
          <a
            href="/"
            className="flex items-center justify-center px-5 py-2.5 rounded-xl border border-[#27272a] text-[#a1a1aa] hover:text-white text-sm font-semibold transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
