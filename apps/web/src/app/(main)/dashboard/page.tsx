"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Tournament } from "@tournament/types";
import { useAuthStore } from "@/store/auth.store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Trophy, Users, Play, CheckCircle, ArrowRight, Swords,
  ShieldCheck, CalendarCog, Trash2, ChevronDown, Loader2, UserPlus, X, Eye, EyeOff, Pencil, KeyRound,
  UserCog, RotateCcw, Phone, MapPin, CreditCard, Search, ClipboardList, ChevronLeft, ChevronRight,
  GitMerge, AlertTriangle, CheckCircle2, History, Download,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

const STATUS_BADGE: Record<string, string> = {
  draft:        "badge-gray",
  registration: "badge-blue",
  in_progress:  "badge-red",
  completed:    "badge-purple",
  cancelled:    "badge-gray",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", registration: "Inscripciones",
  in_progress: "En curso", completed: "Finalizado", cancelled: "Cancelado",
};
const FORMAT_SHORT: Record<string, string> = {
  single_elimination: "Elim. Simple",
  double_elimination: "Doble Elim.",
  round_robin: "Round Robin",
};

const ROLE_LABELS: Record<string, string> = {
  admin:     "Super Admin",
  organizer: "Organizador",
  player:    "Jugador",
};
const ROLE_COLOR: Record<string, string> = {
  admin:     "text-yellow-400 bg-yellow-900/20 border-yellow-800/40",
  organizer: "text-red-400 bg-red-900/20 border-red-800/40",
  player:    "text-ink-400 bg-ink-800 border-ink-700",
};

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "organizer" | "player";
  elo: number;
  createdAt: string;
}

// ─── Create / promote organizer modal ────────────────────────────────────────
type SearchResult = { id: string; name: string; email: string; role: string; dni?: string | null };

function CreateOrganizerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: AppUser) => void }) {
  const [tab,      setTab]      = useState<"search" | "new">("search");
  const [role,     setRole]     = useState<"organizer" | "admin">("organizer");

  // ── Search tab state ──
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [searching,setSearching]= useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [promoting,setPromoting]= useState(false);

  // ── New account tab state ──
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [dni,      setDni]      = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);

  // Debounced search
  useEffect(() => {
    if (tab !== "search") return;
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
        setResults((data.data as SearchResult[]).filter(u => u.role === "player"));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, tab]);

  const handlePromote = async () => {
    if (!selected) return;
    setPromoting(true);
    try {
      await api.patch(`/users/${selected.id}/role`, { role });
      onCreated({ id: selected.id, name: selected.name, email: selected.email, role, elo: 1000, createdAt: new Date().toISOString() });
      toast.success(`${selected.name} ahora es ${role === "admin" ? "Super Admin" : "Organizador"}`);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al asignar rol");
    } finally {
      setPromoting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !dni.trim() || password.length < 8) {
      toast.error("Rellena todos los campos incluyendo DNI/NIE (contraseña mínimo 8 caracteres)");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/auth/register", {
        name, email, password, role,
        dni: dni.trim().toUpperCase(),
        gdprConsent: true, // admin-created accounts are pre-consented
      });
      onCreated(data.data.user);
      toast.success(`Cuenta creada para ${name}`);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  };

  const RoleSelector = () => (
    <div>
      <label className="label mb-2">Rol a asignar</label>
      <div className="grid grid-cols-2 gap-2">
        {([
          { value: "organizer", label: "Organizador", icon: CalendarCog, color: "red" },
          { value: "admin",     label: "Super Admin",  icon: ShieldCheck, color: "yellow" },
        ] as const).map(({ value, label, icon: Icon, color }) => (
          <button key={value} type="button" onClick={() => setRole(value)}
            className={clsx(
              "flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all",
              role === value && color === "red"    && "border-red-500 bg-red-900/15 text-white",
              role === value && color === "yellow" && "border-yellow-500 bg-yellow-900/15 text-white",
              role !== value && "border-ink-700 text-ink-400 hover:border-ink-500",
            )}>
            <Icon className={clsx("w-4 h-4", role === value && color === "red" ? "text-red-400" : role === value ? "text-yellow-400" : "text-ink-500")} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-ink-800">
          <div>
            <h3 className="text-white font-bold">Asignar rol</h3>
            <p className="text-ink-400 text-xs mt-0.5">Busca un jugador existente o crea una cuenta nueva</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-ink-500 hover:text-white rounded-lg hover:bg-ink-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink-800">
          {([
            { id: "search", label: "Buscar jugador existente" },
            { id: "new",    label: "Crear cuenta nueva" },
          ] as const).map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={clsx(
                "flex-1 py-3 text-xs font-semibold transition-colors",
                tab === id ? "text-white border-b-2 border-red-500" : "text-ink-500 hover:text-ink-300",
              )}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === "search" ? (
            <>
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelected(null); }}
                  className="input pl-10"
                  placeholder="Buscar por nombre o DNI/NIE…"
                />
                {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 animate-spin" />}
              </div>

              {/* Results */}
              {results.length > 0 && !selected && (
                <div className="border border-ink-700 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {results.map(u => (
                    <button key={u.id} type="button" onClick={() => setSelected(u)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-800 transition-colors text-left border-b border-ink-800 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-ink-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{u.name}</p>
                        <p className="text-ink-500 text-xs truncate">{u.dni ? `DNI: ${u.dni} · ` : ""}{u.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {query.length >= 2 && !searching && results.length === 0 && !selected && (
                <p className="text-ink-500 text-xs text-center py-2">No se encontraron jugadores</p>
              )}

              {/* Selected user */}
              {selected && (
                <div className="border border-red-700/40 bg-red-900/10 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-900/40 flex items-center justify-center text-sm font-bold text-red-300 shrink-0">
                    {selected.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{selected.name}</p>
                    <p className="text-ink-400 text-xs truncate">{selected.email}</p>
                  </div>
                  <button type="button" onClick={() => { setSelected(null); setQuery(""); }}
                    className="text-ink-500 hover:text-white transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <RoleSelector />

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={handlePromote} disabled={!selected || promoting}
                  className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-50">
                  {promoting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Asignar rol"}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <RoleSelector />
              <div>
                <label className="label">Nombre</label>
                <input value={name} onChange={e => setName(e.target.value.toUpperCase())} className="input" placeholder="NOMBRE COMPLETO" style={{ textTransform: "uppercase" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="input" placeholder="correo@ejemplo.com" />
                </div>
                <div>
                  <label className="label">DNI / NIE <span className="text-red-400">*</span></label>
                  <input
                    value={dni}
                    onChange={e => setDni(e.target.value.toUpperCase().replace(/\s/g, ""))}
                    className="input"
                    placeholder="12345678A"
                    maxLength={12}
                  />
                </div>
              </div>
              <div>
                <label className="label">Contraseña</label>
                <div className="relative">
                  <input
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    type={showPw ? "text" : "password"}
                    className="input pr-10"
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-white transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Crear cuenta"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── User management (admin only) ────────────────────────────────────────────
function UserManagement() {
  const { user: me } = useAuthStore();
  const [users,         setUsers]         = useState<AppUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [savingRole,    setSavingRole]    = useState<string | null>(null);
  const [editingRole,   setEditingRole]   = useState<string | null>(null);
  const [editingName,   setEditingName]   = useState<string | null>(null);
  const [draftName,     setDraftName]     = useState("");
  const [savingName,    setSavingName]    = useState<string | null>(null);
  const [editingPw,     setEditingPw]     = useState<string | null>(null);
  const [draftPw,       setDraftPw]       = useState("");
  const [showDraftPw,   setShowDraftPw]   = useState(false);
  const [savingPw,      setSavingPw]      = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [showCreate,    setShowCreate]    = useState(false);

  const sortUsers = (list: AppUser[]) =>
    [...list].sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (a.role !== "admin" && b.role === "admin") return  1;
      return 0;
    });

  useEffect(() => {
    api.get("/users")
      .then(({ data }) => setUsers(
        sortUsers((data.data as AppUser[]).filter(u => u.role !== "player"))
      ))
      .catch(() => toast.error("Error cargando usuarios"))
      .finally(() => setLoading(false));
  }, []);

  const startEditName = (u: AppUser) => {
    setEditingName(u.id);
    setDraftName(u.name);
    setEditingRole(null);
  };

  const handleNameSave = async (userId: string) => {
    const trimmed = draftName.trim();
    if (trimmed.length < 2) { toast.error("Mínimo 2 caracteres"); return; }
    setSavingName(userId);
    setEditingName(null);
    try {
      await api.patch(`/users/${userId}/name`, { name: trimmed });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, name: trimmed } : u));
      toast.success("Nombre actualizado");
    } catch {
      toast.error("Error al cambiar el nombre");
    } finally {
      setSavingName(null);
    }
  };

  const startEditPw = (userId: string) => {
    setEditingPw(userId);
    setDraftPw("");
    setShowDraftPw(false);
    setEditingName(null);
    setEditingRole(null);
  };

  const handlePwSave = async (userId: string) => {
    if (draftPw.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    setSavingPw(userId);
    setEditingPw(null);
    try {
      await api.patch(`/users/${userId}/password`, { password: draftPw });
      toast.success("Contraseña actualizada");
    } catch {
      toast.error("Error al cambiar la contraseña");
    } finally {
      setSavingPw(null);
    }
  };

  const handleRoleChange = async (userId: string, role: "admin" | "organizer" | "player") => {
    setSavingRole(userId);
    setEditingRole(null);
    try {
      await api.patch(`/users/${userId}/role`, { role });
      if (role === "player") {
        // Demoted — remove from the organizer list; they still appear in the players panel
        setUsers(prev => prev.filter(u => u.id !== userId));
        toast.success("Rol eliminado — el jugador sigue en el panel de jugadores");
      } else {
        setUsers(prev => sortUsers(prev.map(u => u.id === userId ? { ...u, role } : u)));
        toast.success("Rol actualizado");
      }
    } catch {
      toast.error("Error al cambiar el rol");
    } finally {
      setSavingRole(null);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeleting(true);
    try {
      await api.delete(`/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDelete(null);
      toast.success("Usuario eliminado");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 text-ink-500 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Create button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 shadow-red-glow"
        >
          <UserPlus className="w-4 h-4" /> Crear usuario
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateOrganizerModal
          onClose={() => setShowCreate(false)}
          onCreated={(u) => setUsers(prev => sortUsers([...prev, u as AppUser]))}
        />
      )}

      {users.map(u => {
        const isMe             = u.id === me?.id;
        const isConfirming     = confirmDelete === u.id;
        const isSavingRole     = savingRole === u.id;
        const isEditingRole    = editingRole === u.id;
        const isEditingName    = editingName === u.id;
        const isSavingThisName = savingName === u.id;
        const isEditingThisPw  = editingPw === u.id;
        const isSavingThisPw   = savingPw === u.id;

        return (
          <div key={u.id} className="flex items-center gap-4 px-5 py-4 bg-ink-900 border border-ink-800 rounded-xl">
            {/* Avatar */}
            <div className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
              u.role === "admin" ? "bg-yellow-900/40 text-yellow-400" : "bg-red-900/40 text-red-400"
            )}>
              {(isEditingName ? draftName[0] : u.name[0])?.toUpperCase() ?? "?"}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <form onSubmit={e => { e.preventDefault(); handleNameSave(u.id); }}
                      className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={e => setDraftName(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Escape" && setEditingName(null)}
                    className="input py-1 text-sm h-7 flex-1 min-w-0"
                    placeholder="NOMBRE"
                    style={{ textTransform: "uppercase" }}
                  />
                  <button type="submit"
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors shrink-0">
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditingName(null)}
                    className="p-1 text-ink-500 hover:text-white transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {isSavingThisName ? (
                    <span className="text-ink-400 text-sm flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Guardando…
                    </span>
                  ) : (
                    <p className="text-white font-semibold text-sm truncate">{u.name}</p>
                  )}
                  {isMe && <span className="text-[10px] font-bold text-ink-500 bg-ink-800 px-1.5 py-0.5 rounded">Tú</span>}
                  {!isSavingThisName && (
                    <button onClick={() => startEditName(u)}
                      className="text-ink-600 hover:text-ink-300 transition-colors"
                      title="Editar nombre">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-ink-500 text-xs truncate mt-0.5">{u.email}</p>

              {/* Password form — inline below email */}
              {isEditingThisPw && (
                <form onSubmit={e => { e.preventDefault(); handlePwSave(u.id); }}
                      className="flex items-center gap-1.5 mt-2">
                  <div className="relative flex-1 min-w-0">
                    <input
                      autoFocus
                      value={draftPw}
                      onChange={e => setDraftPw(e.target.value)}
                      onKeyDown={e => e.key === "Escape" && setEditingPw(null)}
                      type={showDraftPw ? "text" : "password"}
                      className="input py-1 text-sm h-7 w-full pr-8"
                      placeholder="Nueva contraseña (mín. 8)"
                    />
                    <button type="button" onClick={() => setShowDraftPw(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-white transition-colors">
                      {showDraftPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button type="submit"
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors shrink-0">
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditingPw(null)}
                    className="p-1 text-ink-500 hover:text-white transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>

            {/* Actions */}
            {isConfirming ? (
              /* ── Delete confirm ── */
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-red-400 font-medium">¿Eliminar?</span>
                <button onClick={() => handleDelete(u.id)} disabled={deleting}
                  className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold transition-colors disabled:opacity-50">
                  {deleting ? "…" : "Sí"}
                </button>
                <button onClick={() => setConfirmDelete(null)}
                  className="px-3 py-1.5 rounded-lg border border-ink-700 text-ink-300 text-xs font-semibold hover:text-white transition-colors">
                  No
                </button>
              </div>
            ) : isSavingRole ? (
              /* ── Saving spinner ── */
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-700 text-xs shrink-0">
                <Loader2 className="w-3 h-3 animate-spin text-ink-400" />
                <span className="text-ink-400">Guardando…</span>
              </div>
            ) : isEditingRole ? (
              /* ── Inline role selector ── */
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {(["admin", "organizer", "player"] as const).map(r => (
                  <button key={r} onClick={() => handleRoleChange(u.id, r)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                      u.role === r
                        ? r === "admin"
                          ? "border-yellow-500 bg-yellow-900/25 text-yellow-300"
                          : r === "organizer"
                            ? "border-red-500 bg-red-900/25 text-red-300"
                            : "border-ink-600 bg-ink-800 text-ink-300"
                        : r === "player"
                          ? "border-ink-700 text-ink-500 hover:border-ink-500 hover:text-ink-300"
                          : "border-ink-700 text-ink-400 hover:border-ink-500 hover:text-white"
                    )}>
                    {r === "admin" ? "Super Admin" : r === "organizer" ? "Organizador" : "Jugador"}
                  </button>
                ))}
                <button onClick={() => setEditingRole(null)}
                  className="p-1.5 rounded-lg text-ink-500 hover:text-white hover:bg-ink-800 transition-colors"
                  title="Cancelar">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* ── Default view ── */
              <div className="flex items-center gap-2 shrink-0">
                {/* Role badge */}
                <span className={clsx(
                  "px-2.5 py-1 rounded-lg border text-xs font-semibold",
                  ROLE_COLOR[u.role]
                )}>
                  {ROLE_LABELS[u.role]}
                </span>

                {/* Change password */}
                {!isEditingName && !isEditingThisPw && (
                  <button onClick={() => startEditPw(u.id)}
                    className={clsx(
                      "p-1.5 rounded-lg border border-transparent transition-all",
                      isSavingThisPw
                        ? "text-ink-600 cursor-default"
                        : "text-ink-600 hover:text-yellow-400 hover:bg-yellow-900/20 hover:border-yellow-800/40"
                    )}
                    title="Cambiar contraseña"
                    disabled={isSavingThisPw}>
                    {isSavingThisPw
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <KeyRound className="w-3.5 h-3.5" />}
                  </button>
                )}

                {/* Edit role */}
                {!isMe && !isEditingName && !isEditingThisPw && (
                  <button onClick={() => setEditingRole(u.id)}
                    className="p-1.5 rounded-lg text-ink-600 hover:text-white hover:bg-ink-800 border border-transparent hover:border-ink-700 transition-all"
                    title="Editar rol">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Delete */}
                {!isMe && !isEditingName && !isEditingThisPw && (
                  <button onClick={() => setConfirmDelete(u.id)}
                    className="p-1.5 rounded-lg text-ink-600 hover:text-red-400 hover:bg-red-900/20 border border-transparent hover:border-red-800/40 transition-all"
                    title="Eliminar usuario">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {users.length === 0 && (
        <p className="text-center text-ink-500 py-8 text-sm">No hay usuarios registrados</p>
      )}
    </div>
  );
}

// ─── Player profile (full) ───────────────────────────────────────────────────
interface PlayerProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  dni: string | null;
  phone: string | null;
  province: string | null;
  birthDate: string | null;
  gdprConsent: boolean;
  whatsappConsent: boolean;
  emailConsent: boolean;
  ligaCard: string | null;
  clubCard: string | null;
  emailVerified: boolean;
  createdAt: string;
}

// ─── DNI / NIE validator ─────────────────────────────────────────────────────
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
function validateDni(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  if (/^[0-9]{8}[A-Z]$/.test(v)) return v[8] === DNI_LETTERS[parseInt(v.slice(0, 8), 10) % 23];
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(v)) {
    const p: Record<string, string> = { X: "0", Y: "1", Z: "2" };
    return v[8] === DNI_LETTERS[parseInt(p[v[0]] + v.slice(1, 8), 10) % 23];
  }
  return false;
}

// ─── Edit player modal ────────────────────────────────────────────────────────
function EditPlayerModal({ player, onClose, onSaved }: {
  player: PlayerProfile;
  onClose: () => void;
  onSaved: (updated: PlayerProfile) => void;
}) {
  const [name,      setName]      = useState(player.name);
  const [email,     setEmail]     = useState(player.email);
  const [dni,       setDni]       = useState(player.dni ?? "");
  const [phone,     setPhone]     = useState(player.phone ?? "");
  const [province,  setProvince]  = useState(player.province ?? "");
  const [birthDate, setBirthDate] = useState(
    player.birthDate ? player.birthDate.substring(0, 10) : ""
  );
  const [ligaCard,      setLigaCard]      = useState(player.ligaCard ?? "");
  const [clubCard,      setClubCard]      = useState(player.clubCard ?? "");
  const [emailVerified, setEmailVerified] = useState(player.emailVerified);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { toast.error("Nombre y email son obligatorios"); return; }
    if (!dni.trim()) { toast.error("El DNI/NIE es obligatorio"); return; }
    if (!validateDni(dni.trim())) { toast.error("DNI/NIE inválido — revisa el número y la letra"); return; }
    setSaving(true);
    try {
      const { data } = await api.patch(`/users/${player.id}/profile`, {
        name: name.trim(),
        email: email.trim(),
        dni: dni.trim().toUpperCase() || null,
        phone: phone.trim() || null,
        province: province || null,
        birthDate: birthDate || null,
        ligaCard: ligaCard.trim() || null,
        clubCard: clubCard.trim() || null,
        emailVerified,
      });
      onSaved(data.data);
      toast.success("Perfil actualizado");
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800">
          <div>
            <h3 className="text-white font-bold">Editar jugador</h3>
            <p className="text-ink-500 text-xs mt-0.5">{player.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-ink-500 hover:text-white rounded-lg hover:bg-ink-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre completo</label>
              <input value={name} onChange={e => setName(e.target.value.toUpperCase())} className="input" placeholder="NOMBRE" style={{ textTransform: "uppercase" }} />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">DNI / NIE</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input
                  value={dni}
                  onChange={e => setDni(e.target.value.toUpperCase())}
                  className={clsx("input pl-9", dni.trim() && !validateDni(dni.trim()) && "border-red-500/70")}
                  placeholder="12345678A"
                />
              </div>
              {dni.trim() && !validateDni(dni.trim()) && (
                <p className="text-red-400 text-xs mt-1">DNI/NIE inválido</p>
              )}
            </div>
            <div>
              <label className="label">Teléfono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input value={phone} onChange={e => setPhone(e.target.value)} className="input pl-9"
                  placeholder="6XX XXX XXX" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Provincia</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input value={province} onChange={e => setProvince(e.target.value)} className="input pl-9"
                  placeholder="Madrid" />
              </div>
            </div>
            <div>
              <label className="label">Fecha de nacimiento</label>
              <input value={birthDate} onChange={e => setBirthDate(e.target.value)} type="date"
                className="input" style={{ colorScheme: "dark" }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tarjeta liga PhoenixDarts</label>
              <input
                value={ligaCard}
                onChange={e => setLigaCard(e.target.value.replace(/\D/g, "").slice(0, 16))}
                className="input font-mono tracking-wider"
                placeholder="16 dígitos"
                maxLength={16}
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="label">Tarjeta club PhoenixDarts</label>
              <input
                value={clubCard}
                onChange={e => setClubCard(e.target.value.replace(/\D/g, "").slice(0, 16))}
                className="input font-mono tracking-wider"
                placeholder="16 dígitos"
                maxLength={16}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Email verification toggle */}
          <button
            type="button"
            onClick={() => setEmailVerified(v => !v)}
            className={clsx(
              "flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all text-sm font-semibold",
              emailVerified
                ? "bg-green-900/20 border-green-600/40 text-green-300 hover:bg-green-900/30"
                : "bg-amber-900/20 border-amber-600/40 text-amber-300 hover:bg-amber-900/30"
            )}
          >
            <span className="flex items-center gap-2">
              {emailVerified ? "✓" : "⚠"} Email verificado
            </span>
            <span className={clsx(
              "text-xs font-normal px-2 py-0.5 rounded-full",
              emailVerified ? "bg-green-700/40 text-green-200" : "bg-amber-700/40 text-amber-200"
            )}>
              {emailVerified ? "Verificado" : "Sin verificar"}
            </span>
          </button>

          {/* Consents — read-only info */}
          <div className="flex items-center gap-4 px-3 py-2 bg-ink-800/50 rounded-lg text-xs text-ink-500">
            <span className={player.gdprConsent ? "text-green-400" : ""}>RGPD {player.gdprConsent ? "✓" : "✗"}</span>
            <span className={player.whatsappConsent ? "text-green-400" : ""}>WhatsApp {player.whatsappConsent ? "✓" : "✗"}</span>
            <span className={player.emailConsent ? "text-green-400" : ""}>Email {player.emailConsent ? "✓" : "✗"}</span>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Absorb ghost preview modal ───────────────────────────────────────────────
interface GhostParticipant {
  id: string;
  finalRank: number | null;
  registeredAt: string;
  conflict: boolean;
  tournament: { id: string; name: string; status: string; startDate: string | null };
}
interface GhostData {
  id: string;
  name: string;
  email: string;
  elo: number;
  createdAt: string;
  participants: GhostParticipant[];
}

function AbsorbGhostModal({
  player,
  onClose,
  onMerged,
}: {
  player: PlayerProfile;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [loading,   setLoading]   = useState(true);
  const [ghost,     setGhost]     = useState<GhostData | null>(null);
  const [transfer,  setTransfer]  = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [merging,   setMerging]   = useState(false);

  useEffect(() => {
    api.get(`/users/${player.id}/ghost-preview`)
      .then(({ data }) => {
        setGhost(data.data.ghost ?? null);
        setTransfer(data.data.transferCount ?? 0);
        setConflicts(data.data.conflictCount ?? 0);
      })
      .catch(() => toast.error("Error al cargar el jugador fantasma"))
      .finally(() => setLoading(false));
  }, [player.id]);

  const handleMerge = async () => {
    setMerging(true);
    try {
      const { data } = await api.post(`/users/${player.id}/absorb-ghost`, {});
      toast.success(data.message);
      onMerged();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al fusionar");
    } finally {
      setMerging(false);
    }
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "85vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <GitMerge className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-white font-bold">Fusionar jugador fantasma</h3>
              <p className="text-ink-500 text-xs mt-0.5">
                Revisa los datos antes de confirmar
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-ink-500 hover:text-white rounded-lg hover:bg-ink-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-ink-500 animate-spin" />
            </div>
          ) : !ghost ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-ink-400">No se encontró ningún jugador fantasma con DNI <span className="font-mono text-white">{player.dni}</span>.</p>
              <p className="text-ink-600 text-xs">El historial ya está fusionado o nunca se creó un jugador con ese DNI.</p>
            </div>
          ) : (
            <>
              {/* Comparison: ghost ←→ real */}
              <div className="grid grid-cols-2 gap-3">
                {/* Ghost card */}
                <div className="bg-ink-800 border border-ink-700 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-ink-600 flex items-center justify-center text-xs font-bold text-ink-300">
                      {ghost.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-ink-300 text-xs font-bold truncate">{ghost.name}</p>
                      <p className="text-ink-600 text-[10px] truncate">Jugador importado</p>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-500">Torneos</span>
                      <span className="text-ink-300 font-mono">{ghost.participants.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-500">Creado</span>
                      <span className="text-ink-300">{fmtDate(ghost.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Real card */}
                <div className="bg-ink-800 border border-blue-700/40 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-300">
                      {player.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-bold truncate">{player.name}</p>
                      <p className="text-blue-400/70 text-[10px] truncate">Cuenta registrada ✓</p>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-500">Email</span>
                      <span className="text-ink-300 truncate max-w-[100px]" title={player.email}>{player.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-500">DNI</span>
                      <span className="text-ink-300 font-mono">{player.dni}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-500">Provincia</span>
                      <span className="text-ink-300">{player.province || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* What will happen summary */}
              <div className="bg-ink-800/60 border border-ink-700 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3">Resultado de la fusión</p>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <span className="text-ink-300">
                    <span className="text-white font-semibold">{transfer} torneo{transfer !== 1 ? "s" : ""}</span>
                    {" "}se transferir{transfer !== 1 ? "án" : "á"} al historial de <span className="text-white font-semibold">{player.name}</span>
                  </span>
                </div>
                {conflicts > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-ink-300">
                      <span className="text-amber-300 font-semibold">{conflicts} torneo{conflicts !== 1 ? "s" : ""} en conflicto</span>
                      {" "}(ya inscrito como cuenta real — se descartará la entrada del fantasma)
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2 text-sm">
                  <Trash2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-ink-300">El jugador fantasma <span className="text-ink-400 font-mono text-xs">{ghost.email}</span> se eliminará</span>
                </div>
              </div>

              {/* Tournament list */}
              {ghost.participants.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Historial del jugador fantasma
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {ghost.participants.map(gp => (
                      <div key={gp.id}
                        className={clsx(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-xs border",
                          gp.conflict
                            ? "bg-amber-900/10 border-amber-800/30"
                            : "bg-ink-800 border-ink-700"
                        )}>
                        <span className={clsx(
                          "w-2 h-2 rounded-full shrink-0",
                          gp.conflict ? "bg-amber-500" : "bg-green-500"
                        )} />
                        <span className="flex-1 text-ink-300 truncate">{gp.tournament.name}</span>
                        {gp.finalRank && (
                          <span className="text-ink-500 shrink-0">#{gp.finalRank}</span>
                        )}
                        <span className="text-ink-600 shrink-0">{fmtDate(gp.tournament.startDate)}</span>
                        {gp.conflict && (
                          <span className="text-amber-500 font-semibold shrink-0">conflicto</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-ink-800 shrink-0 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white transition-colors">
            Cancelar
          </button>
          {ghost && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors disabled:opacity-50">
              {merging
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><GitMerge className="w-4 h-4" /> Confirmar fusión</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Player management panel ──────────────────────────────────────────────────
function PlayerManagement() {
  const [players,       setPlayers]       = useState<PlayerProfile[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [editingPlayer, setEditingPlayer] = useState<PlayerProfile | null>(null);
  const [resetting,     setResetting]     = useState<string | null>(null);
  const [confirmReset,  setConfirmReset]  = useState<string | null>(null);
  const [confirmDelete,    setConfirmDelete]    = useState<string | null>(null);
  const [deleting,         setDeleting]         = useState(false);
  const [mergingPlayer,    setMergingPlayer]    = useState<PlayerProfile | null>(null);

  useEffect(() => {
    api.get("/users/players")
      .then(({ data }) => setPlayers(data.data))
      .catch(() => toast.error("Error cargando jugadores"))
      .finally(() => setLoading(false));
  }, []);

  const handleResetPassword = async (player: PlayerProfile) => {
    if (!player.dni) {
      toast.error("El jugador no tiene DNI/NIE. Edítalo primero.");
      setConfirmReset(null);
      return;
    }
    setResetting(player.id);
    setConfirmReset(null);
    try {
      await api.post(`/users/${player.id}/reset-password`, {});
      toast.success(`Contraseña de ${player.name} restablecida al DNI: ${player.dni.toUpperCase()}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al restablecer");
    } finally {
      setResetting(null);
    }
  };

  const handleOpenMerge = (player: PlayerProfile) => {
    if (!player.dni) {
      toast.error("El jugador no tiene DNI. Añádelo primero para poder fusionar.");
      return;
    }
    setMergingPlayer(player);
  };

  const handleMerged = async () => {
    const { data } = await api.get("/users/players");
    setPlayers(data.data);
  };

  const handleDeletePlayer = async (playerId: string) => {
    setDeleting(true);
    try {
      await api.delete(`/users/${playerId}`);
      setPlayers(prev => prev.filter(p => p.id !== playerId));
      setConfirmDelete(null);
      toast.success("Jugador eliminado");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = players.filter(p =>
    `${p.name} ${p.email} ${p.dni ?? ""} ${p.province ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 text-ink-500 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="input pl-9" placeholder="Buscar por nombre, email, DNI o provincia…" />
      </div>

      <p className="text-xs text-ink-600">{filtered.length} jugador{filtered.length !== 1 ? "es" : ""}</p>

      {filtered.map(p => {
        const isConfirmingReset  = confirmReset  === p.id;
        const isConfirmingDelete = confirmDelete === p.id;
        const isResetting        = resetting === p.id;

        return (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-ink-900 border border-ink-800 rounded-xl">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-lg bg-ink-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
              {p.name[0].toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-semibold text-sm truncate">{p.name.toUpperCase()}</p>
                {p.role === "organizer" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-800/40 shrink-0">
                    Organizador
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="text-ink-500 text-xs truncate">{p.email}</span>
                {p.dni && (
                  <span className="text-xs font-mono text-ink-400 bg-ink-800 px-1.5 py-0.5 rounded">
                    {p.dni.toUpperCase()}
                  </span>
                )}
                {p.phone && <span className="text-xs text-ink-500">{p.phone}</span>}
                {p.province && <span className="text-xs text-ink-600">{p.province}</span>}
              </div>
            </div>

            {/* Actions */}
            {isConfirmingDelete ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-red-400 font-medium">¿Eliminar?</span>
                <button onClick={() => handleDeletePlayer(p.id)} disabled={deleting}
                  className="px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold transition-colors disabled:opacity-50">
                  {deleting ? "…" : "Sí"}
                </button>
                <button onClick={() => setConfirmDelete(null)}
                  className="px-2.5 py-1 rounded-lg border border-ink-700 text-ink-300 text-xs font-semibold hover:text-white transition-colors">
                  No
                </button>
              </div>
            ) : isConfirmingReset ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-yellow-400 font-medium">¿Resetear a DNI?</span>
                <button onClick={() => handleResetPassword(p)} disabled={isResetting}
                  className="px-2.5 py-1 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold transition-colors disabled:opacity-50">
                  Sí
                </button>
                <button onClick={() => setConfirmReset(null)}
                  className="px-2.5 py-1 rounded-lg border border-ink-700 text-ink-300 text-xs font-semibold hover:text-white transition-colors">
                  No
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Fusionar fantasma → usuario real (solo en cuentas reales con DNI) */}
                {!p.email.endsWith("@torneo.local") && p.dni && (
                  <button
                    onClick={() => handleOpenMerge(p)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border border-blue-700/40 text-blue-400 hover:bg-blue-900/20 transition-all"
                    title="Fusionar histórico del jugador fantasma con este usuario">
                    <GitMerge className="w-3 h-3" />
                    <span className="hidden sm:inline">Fusionar</span>
                  </button>
                )}
                {/* Edit */}
                <button onClick={() => setEditingPlayer(p)}
                  className="p-1.5 rounded-lg text-ink-600 hover:text-white hover:bg-ink-800 border border-transparent hover:border-ink-700 transition-all"
                  title="Editar jugador">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {/* Reset password */}
                <button
                  onClick={() => p.dni ? setConfirmReset(p.id) : toast.error("Sin DNI — edita primero el jugador")}
                  disabled={isResetting}
                  className={clsx(
                    "p-1.5 rounded-lg border border-transparent transition-all",
                    isResetting
                      ? "text-ink-600 cursor-default"
                      : p.dni
                        ? "text-ink-600 hover:text-yellow-400 hover:bg-yellow-900/20 hover:border-yellow-800/40"
                        : "text-ink-800 cursor-not-allowed"
                  )}
                  title={p.dni ? "Resetear contraseña al DNI" : "Sin DNI"}>
                  {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                </button>
                {/* Delete */}
                <button onClick={() => setConfirmDelete(p.id)}
                  className="p-1.5 rounded-lg text-ink-600 hover:text-red-400 hover:bg-red-900/20 border border-transparent hover:border-red-800/40 transition-all"
                  title="Eliminar jugador">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && !loading && (
        <p className="text-center text-ink-500 py-8 text-sm">
          {search ? "Sin resultados para esa búsqueda" : "No hay jugadores registrados"}
        </p>
      )}

      {/* Edit modal */}
      {editingPlayer && (
        <EditPlayerModal
          player={editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSaved={(updated) => {
            setPlayers(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
            setEditingPlayer(null);
          }}
        />
      )}

      {/* Merge / absorb ghost modal */}
      {mergingPlayer && (
        <AbsorbGhostModal
          player={mergingPlayer}
          onClose={() => setMergingPlayer(null)}
          onMerged={handleMerged}
        />
      )}
    </div>
  );
}

// ─── Action labels (audit log) ────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  "tournament.create":            "Torneo creado",
  "tournament.update":            "Torneo editado",
  "tournament.delete":            "Torneo eliminado",
  "tournament.start":             "Torneo iniciado",
  "tournament.finalize":          "Torneo finalizado",
  "tournament.reset":             "Torneo reiniciado",
  "tournament.open_registration": "Inscripciones abiertas",
  "tournament.close_registration":"Inscripciones cerradas",
  "participant.add":              "Participante añadido",
  "participant.remove":           "Participante eliminado",
  "participant.payment":          "Pago actualizado",
  "participant.no_show":          "No presentado",
  "match.report":                 "Resultado registrado",
  "match.reset":                  "Resultado reiniciado",
  "user.role_change":             "Rol cambiado",
  "user.reset_password":          "Contraseña restablecida",
  "user.ban":                     "Usuario bloqueado",
};

const ACTION_COLOR: Record<string, string> = {
  "tournament.delete":   "text-red-400 bg-red-900/20",
  "tournament.reset":    "text-orange-400 bg-orange-900/20",
  "tournament.start":    "text-green-400 bg-green-900/20",
  "tournament.finalize": "text-purple-400 bg-purple-900/20",
  "user.role_change":    "text-yellow-400 bg-yellow-900/20",
  "user.reset_password": "text-yellow-400 bg-yellow-900/20",
  "match.report":        "text-blue-400 bg-blue-900/20",
};

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string };
}

function AuditLogPanel() {
  const [logs,    setLogs]    = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [filter,  setFilter]  = useState("");
  const LIMIT = 25;

  const load = (p: number, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (q) params.set("action", q);
    api.get(`/users/audit-logs?${params}`)
      .then(({ data }) => {
        setLogs(data.data);
        setTotal(data.total);
      })
      .catch(() => toast.error("Error cargando logs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1, ""); }, []);

  const handleFilterChange = (v: string) => {
    setFilter(v);
    setPage(1);
    load(1, v);
  };

  const handlePage = (p: number) => {
    setPage(p);
    load(p, filter);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filter}
          onChange={e => handleFilterChange(e.target.value)}
          className="input text-sm py-2 pr-8 flex-1 min-w-[180px]"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button onClick={() => handleFilterChange("")}
          className="px-3 py-2 text-xs text-ink-400 hover:text-white border border-ink-700 rounded-lg hover:bg-ink-800 transition-colors">
          Limpiar
        </button>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-lg bg-ink-800 animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-center text-ink-500 py-10 text-sm">Sin registros</p>
      ) : (
        <div className="space-y-1.5">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-ink-800 border border-ink-700/60">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold",
                    ACTION_COLOR[log.action] ?? "text-ink-300 bg-ink-700"
                  )}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  {log.entityName && (
                    <span className="text-ink-300 text-xs font-medium truncate max-w-[160px]" title={log.entityName}>
                      {log.entityName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-500 flex-wrap">
                  <span className="font-medium text-ink-400">{log.user.name}</span>
                  <span>·</span>
                  <span>{fmt(log.createdAt)}</span>
                  {log.ip && <><span>·</span><span className="font-mono">{log.ip}</span></>}
                  {log.details && log.action === "user.role_change" && (log.details as any).from && (
                    <><span>·</span>
                    <span>{(log.details as any).from} → {(log.details as any).to}</span></>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-ink-500">{total} registros</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => handlePage(page - 1)}
              className="p-1.5 rounded-lg text-ink-400 hover:text-white hover:bg-ink-800 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-ink-400 px-2">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => handlePage(page + 1)}
              className="p-1.5 rounded-lg text-ink-400 hover:text-white hover:bg-ink-800 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const [tournaments,  setTournaments]  = useState<Tournament[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showRoleMenu,   setShowRoleMenu]   = useState(false);
  const [showUserMgmt,   setShowUserMgmt]   = useState(false);
  const [showPlayerMgmt, setShowPlayerMgmt] = useState(false);
  const [showAuditLog,   setShowAuditLog]   = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { router.push("/auth/login"); return; }
    if (user.role === "player") { router.push("/torneos"); return; }
    api.get("/tournaments")
      .then(({ data }) => setTournaments(data.data))
      .catch(() => toast.error("Error cargando torneos"))
      .finally(() => setLoading(false));
  }, [user, router]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setShowRoleMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user || user.role === "player") return null;

  const isAdmin = user.role === "admin";

  const [downloadingBackup, setDownloadingBackup] = useState(false);

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      const res = await api.get("/backup/download", { responseType: "blob" });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `dardosdm-backup-${timestamp}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup descargado");
    } catch {
      toast.error("Error al descargar el backup");
    } finally {
      setDownloadingBackup(false);
    }
  };

  const stats = {
    total:     tournaments.length,
    active:    tournaments.filter(t => t.status === "in_progress").length,
    completed: tournaments.filter(t => t.status === "completed").length,
    players:   tournaments.reduce((s, t) => s + t.participantsCount, 0),
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-ink-500 text-sm font-medium uppercase tracking-widest mb-1">Dashboard</p>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Hola, <span className="text-gradient">{user.name}</span>
          </h1>

          {/* Role badge — clickable for both admin and organizer */}
          <div className="relative mt-2" ref={roleMenuRef}>
            <button
              onClick={() => setShowRoleMenu(v => !v)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold hover:opacity-80 transition-opacity",
                isAdmin
                  ? "text-yellow-400 bg-yellow-900/20 border-yellow-800/40"
                  : "text-red-400 bg-red-900/20 border-red-800/40"
              )}
            >
              {isAdmin
                ? <><ShieldCheck className="w-3.5 h-3.5" /> Super Admin</>
                : <><CalendarCog className="w-3.5 h-3.5" /> Organizador de Torneos</>}
              <ChevronDown className={clsx("w-3 h-3 transition-transform duration-150", showRoleMenu && "rotate-180")} />
            </button>

            {showRoleMenu && (
              <div className="absolute top-full left-0 mt-1.5 bg-ink-900 border border-ink-700
                              rounded-xl shadow-2xl z-20 min-w-[200px] py-1 overflow-hidden">
                <button
                  onClick={() => { setShowPlayerMgmt(true); setShowRoleMenu(false); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                             text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
                >
                  <UserCog className="w-4 h-4" /> Panel de jugadores
                </button>
                {isAdmin && (
                  <>
                    <div className="my-1 border-t border-ink-800" />
                    <button
                      onClick={() => { setShowUserMgmt(true); setShowRoleMenu(false); }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                                 text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
                    >
                      <Users className="w-4 h-4" /> Gestión de roles
                    </button>
                    <button
                      onClick={() => { setShowAuditLog(true); setShowRoleMenu(false); }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                                 text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
                    >
                      <ClipboardList className="w-4 h-4" /> Registro de actividad
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadBackup}
            disabled={downloadingBackup}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-ink-700 text-ink-300
                       hover:border-ink-500 hover:text-white transition-all text-sm font-semibold
                       disabled:opacity-40 disabled:cursor-not-allowed"
            title="Descargar copia de seguridad SQL"
          >
            {downloadingBackup
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Descargando…</>
              : <><Download className="w-4 h-4" /> Backup</>
            }
          </button>
          <Link href="/tournaments/create" className="btn-primary shadow-red-glow">
            <Plus className="w-4 h-4" /> Nuevo torneo
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Trophy,      value: stats.total,     label: "Total torneos", accent: "text-red-400",    bg: "bg-red-900/20 border-red-900/40" },
          { icon: Play,        value: stats.active,    label: "En curso",      accent: "text-green-400",  bg: "bg-green-900/20 border-green-900/40" },
          { icon: CheckCircle, value: stats.completed, label: "Completados",   accent: "text-purple-400", bg: "bg-purple-900/20 border-purple-900/40" },
          { icon: Users,       value: stats.players,   label: "Participantes", accent: "text-white",      bg: "bg-ink-800 border-ink-700" },
        ].map(({ icon: Icon, value, label, accent, bg }) => (
          <div key={label} className={`rounded-xl p-5 border flex items-center gap-4 ${bg}`}>
            <div className={`w-10 h-10 rounded-lg bg-ink-900/60 flex items-center justify-center ${accent}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-3xl font-black ${accent}`}>{value}</p>
              <p className="text-xs text-ink-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tournaments list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Mis torneos</h2>
          <span className="text-xs text-ink-500">{tournaments.length} torneos</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="card h-16 animate-pulse bg-ink-900" />)}
          </div>
        ) : tournaments.length === 0 ? (
          <div className="card text-center py-16 border-dashed border-ink-700">
            <Swords className="w-10 h-10 text-ink-800 mx-auto mb-4" />
            <p className="text-ink-500 mb-5">Aún no has creado ningún torneo</p>
            <Link href="/tournaments/create" className="btn-primary inline-flex shadow-red-glow">
              <Plus className="w-4 h-4" /> Crear primer torneo
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {tournaments.map((t) => (
              <Link href={`/tournaments/${t.id}`} key={t.id}>
                <div className="flex items-center justify-between gap-4 px-5 py-4
                                bg-ink-900 border border-ink-800 rounded-xl
                                hover:border-ink-600 hover:bg-ink-800/60 transition-all group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={clsx("shrink-0", STATUS_BADGE[t.status])}>
                      {STATUS_LABELS[t.status]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate group-hover:text-red-400 transition-colors">
                        {t.name}
                      </p>
                      <p className="text-ink-500 text-xs mt-0.5">
                        {t.participantsCount}/{t.maxParticipants} · {FORMAT_SHORT[t.format]}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-700 group-hover:text-red-400 transition-colors shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Player management modal (admin + organizer) */}
      {showPlayerMgmt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl flex flex-col"
               style={{ maxHeight: "85vh" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
              <div>
                <h3 className="text-white font-bold text-lg">Panel de jugadores</h3>
                <p className="text-ink-500 text-xs mt-0.5">Edita datos y restablece contraseñas al DNI/NIE</p>
              </div>
              <button onClick={() => setShowPlayerMgmt(false)}
                className="p-1.5 text-ink-500 hover:text-white rounded-lg hover:bg-ink-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <PlayerManagement />
            </div>
          </div>
        </div>
      )}

      {/* User management modal (admin only) */}
      {showUserMgmt && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl flex flex-col"
               style={{ maxHeight: "80vh" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
              <div>
                <h3 className="text-white font-bold text-lg">Gestión de roles</h3>
                <p className="text-ink-500 text-xs mt-0.5">Administra usuarios y permisos de la plataforma</p>
              </div>
              <button
                onClick={() => setShowUserMgmt(false)}
                className="p-1.5 text-ink-500 hover:text-white rounded-lg hover:bg-ink-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <UserManagement />
            </div>
          </div>
        </div>
      )}

      {/* Audit log modal (admin only) */}
      {showAuditLog && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl flex flex-col"
               style={{ maxHeight: "85vh" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
              <div>
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-yellow-400" /> Registro de actividad
                </h3>
                <p className="text-ink-500 text-xs mt-0.5">Todas las acciones realizadas por organizadores y admins</p>
              </div>
              <button
                onClick={() => setShowAuditLog(false)}
                className="p-1.5 text-ink-500 hover:text-white rounded-lg hover:bg-ink-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <AuditLogPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
