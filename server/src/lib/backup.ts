import { Resend } from "resend";
import { prisma } from "./prisma";

const FROM         = process.env.RESEND_FROM    ?? "DardosDM <noreply@dardosdm.com>";
const BACKUP_EMAIL = process.env.BACKUP_EMAIL   ?? "";
const RESEND_KEY   = process.env.RESEND_API_KEY ?? "";

/** Export all critical tables as a JSON snapshot using Prisma — no pg_dump needed */
export async function createBackupJson(): Promise<string> {
  const [
    users, tournaments, participants, matches,
    playerRecords, auditLogs, refreshTokens,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.tournament.findMany({ include: { levels: true } }),
    prisma.participant.findMany(),
    prisma.match.findMany(),
    prisma.playerRecord.findMany(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.refreshToken.findMany(),
  ]);

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: "1.0",
    tables: { users, tournaments, participants, matches, playerRecords, auditLogs, refreshTokens },
  }, null, 2);
}

export async function runBackup(): Promise<{ ok: boolean; message: string }> {
  if (!BACKUP_EMAIL) return { ok: false, message: "BACKUP_EMAIL no configurada en Railway Variables" };
  if (!RESEND_KEY)   return { ok: false, message: "RESEND_API_KEY no configurada" };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename  = `dardosdm-backup-${timestamp}.json`;

  try {
    console.log("[backup] Exporting data via Prisma...");
    const json   = await createBackupJson();
    const sizeKB = Math.round(Buffer.byteLength(json, "utf8") / 1024);
    console.log(`[backup] Export done — ${sizeKB} KB. Sending email...`);

    const resend = new Resend(RESEND_KEY);
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      BACKUP_EMAIL,
      subject: `🗄️ Backup DardosDM — ${timestamp}`,
      text: [
        `Copia de seguridad automática de DardosDM.`,
        `Fecha: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
        `Tamaño: ${sizeKB} KB`,
        `Formato: JSON (todas las tablas: users, tournaments, participants, matches, player_records, audit_logs)`,
      ].join("\n"),
      attachments: [{ filename, content: Buffer.from(json).toString("base64") }],
    });

    if (error) throw new Error(`Resend error: ${error.message}`);

    const msg = `Backup enviado a ${BACKUP_EMAIL} (${sizeKB} KB)`;
    console.log(`[backup] ✅ ${msg}`);
    return { ok: true, message: msg };
  } catch (err: any) {
    const msg = `Backup fallido: ${err.message}`;
    console.error(`[backup] ❌ ${msg}`);
    return { ok: false, message: msg };
  }
}
