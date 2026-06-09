import { Resend } from "resend";
import { prisma } from "./prisma";

const FROM         = process.env.RESEND_FROM    ?? "DardosDM <noreply@dardosdm.com>";
const BACKUP_EMAIL = process.env.BACKUP_EMAIL   ?? "";
const RESEND_KEY   = process.env.RESEND_API_KEY ?? "";

// Hard caps — prevent OOM on large datasets (each row loads into Node.js RAM)
const BACKUP_LIMITS = {
  matches:   50_000,   // ~40 MB JSON worst-case
  auditLogs: 10_000,   // most recent entries are what matters for incident review
};

/** Export all critical tables as a JSON snapshot using Prisma — no pg_dump needed */
export async function createBackupJson(): Promise<{ json: string; truncated: string[] }> {
  const [
    users, tournaments, participants, matches,
    playerRecords, auditLogs,
    totalMatches, totalAuditLogs,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.tournament.findMany({ include: { levels: true } }),
    prisma.participant.findMany(),
    // Cap at most-recent 50k — full history stays in the DB
    prisma.match.findMany({ orderBy: { createdAt: "desc" }, take: BACKUP_LIMITS.matches }),
    prisma.playerRecord.findMany(),
    // Most recent 10k audit entries
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: BACKUP_LIMITS.auditLogs }),
    // refreshTokens intentionally excluded — ephemeral session data, not business data
    prisma.match.count(),
    prisma.auditLog.count(),
  ]);

  const truncated: string[] = [];
  if (totalMatches   > BACKUP_LIMITS.matches)
    truncated.push(`matches (${totalMatches} total, incluidos ${BACKUP_LIMITS.matches} más recientes)`);
  if (totalAuditLogs > BACKUP_LIMITS.auditLogs)
    truncated.push(`auditLogs (${totalAuditLogs} total, incluidos ${BACKUP_LIMITS.auditLogs} más recientes)`);

  const json = JSON.stringify({
    exportedAt: new Date().toISOString(),
    version:    "1.1",
    note:       truncated.length
      ? `TABLAS TRUNCADAS: ${truncated.join("; ")}`
      : "Exportación completa",
    tables: { users, tournaments, participants, matches, playerRecords, auditLogs },
  }, null, 2);

  return { json, truncated };
}

export async function runBackup(): Promise<{ ok: boolean; message: string }> {
  if (!BACKUP_EMAIL) return { ok: false, message: "BACKUP_EMAIL no configurada en Railway Variables" };
  if (!RESEND_KEY)   return { ok: false, message: "RESEND_API_KEY no configurada" };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename  = `dardosdm-backup-${timestamp}.json`;

  try {
    console.log("[backup] Exporting data via Prisma...");
    const { json, truncated } = await createBackupJson();
    const sizeKB = Math.round(Buffer.byteLength(json, "utf8") / 1024);
    console.log(`[backup] Export done — ${sizeKB} KB${truncated.length ? " (truncated)" : ""}. Sending email...`);

    const resend = new Resend(RESEND_KEY);
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      BACKUP_EMAIL,
      subject: `🗄️ Backup DardosDM — ${timestamp}${truncated.length ? " ⚠️ truncado" : ""}`,
      text: [
        `Copia de seguridad automática de DardosDM.`,
        `Fecha: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
        `Tamaño: ${sizeKB} KB`,
        `Tablas: users, tournaments, participants, matches (≤50k), player_records, audit_logs (≤10k)`,
        truncated.length ? `⚠️  Tablas truncadas:\n${truncated.map(t => `   • ${t}`).join("\n")}` : `✅  Exportación completa`,
      ].join("\n"),
      attachments: [{ filename, content: Buffer.from(json).toString("base64") }],
    });

    if (error) throw new Error(`Resend error: ${error.message}`);

    const msg = `Backup enviado a ${BACKUP_EMAIL} (${sizeKB} KB${truncated.length ? ", truncado" : ""})`;
    console.log(`[backup] ✅ ${msg}`);
    return { ok: true, message: msg };
  } catch (err: any) {
    const msg = `Backup fallido: ${err.message}`;
    console.error(`[backup] ❌ ${msg}`);
    return { ok: false, message: msg };
  }
}
