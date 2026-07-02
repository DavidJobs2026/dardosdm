import { Resend } from "resend";
import crypto from "crypto";
import { prisma } from "./prisma";

const FROM         = process.env.RESEND_FROM         ?? "DardosDM <noreply@dardosdm.com>";
const BACKUP_EMAIL = process.env.BACKUP_EMAIL        ?? "";
const RESEND_KEY   = process.env.RESEND_API_KEY      ?? "";
const BACKUP_PASS  = process.env.BACKUP_PASSPHRASE   ?? "";

// ─── Encryption (GDPR) ────────────────────────────────────────────────────────
// The backup contains full PII (DNI, phone, birth date). Email is not a secure
// channel — the attachment persists in Resend's servers and the recipient inbox.
// We encrypt with AES-256-CBC in OpenSSL's standard "Salted__" envelope so the
// file can be decrypted anywhere with one command and NO dependency on this app:
//
//   openssl enc -d -aes-256-cbc -pbkdf2 -in backup.json.enc -out backup.json
//
// KDF matches openssl defaults with -pbkdf2: PBKDF2-HMAC-SHA256, 10 000 iters,
// 48-byte output → 32-byte key + 16-byte IV.
function encryptOpenSSL(plaintext: string, passphrase: string): Buffer {
  const salt    = crypto.randomBytes(8);
  const keyIv   = crypto.pbkdf2Sync(passphrase, salt, 10_000, 48, "sha256");
  const key     = keyIv.subarray(0, 32);
  const iv      = keyIv.subarray(32, 48);
  const cipher  = crypto.createCipheriv("aes-256-cbc", key, iv);
  const body    = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from("Salted__"), salt, body]);
}

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
    prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, elo: true,
        dni: true, phone: true, province: true, birthDate: true,
        ligaCard: true, clubCard: true, avatarUrl: true,
        gdprConsent: true, whatsappConsent: true, emailConsent: true,
        emailVerified: true, createdAt: true, updatedAt: true,
      },
    }),
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
  const resend    = new Resend(RESEND_KEY);

  // Fail-secure: without a passphrase we NEVER email PII in cleartext.
  // Send a warning email instead so the admin notices backups are paused.
  if (!BACKUP_PASS) {
    const msg = "BACKUP_PASSPHRASE no configurada — backup NO enviado (no se envían datos sin cifrar)";
    console.error(`[backup] ❌ ${msg}`);
    await resend.emails.send({
      from:    FROM,
      to:      BACKUP_EMAIL,
      subject: `⚠️ Backup DardosDM NO enviado — falta BACKUP_PASSPHRASE`,
      text: [
        `El backup diario no se ha enviado porque falta la variable BACKUP_PASSPHRASE.`,
        ``,
        `Los backups contienen datos personales (DNI, teléfono) y solo se envían cifrados.`,
        ``,
        `Solución: en Railway → servicio del servidor → Variables, añade:`,
        `  BACKUP_PASSPHRASE = una frase larga y difícil (guárdala en un sitio seguro,`,
        `  sin ella los backups no se pueden recuperar)`,
      ].join("\n"),
    }).catch(() => { /* best effort */ });
    return { ok: false, message: msg };
  }

  const filename = `dardosdm-backup-${timestamp}.json.enc`;

  try {
    console.log("[backup] Exporting data via Prisma...");
    const { json, truncated } = await createBackupJson();
    const sizeKB = Math.round(Buffer.byteLength(json, "utf8") / 1024);

    console.log(`[backup] Export done — ${sizeKB} KB${truncated.length ? " (truncated)" : ""}. Encrypting...`);
    const encrypted   = encryptOpenSSL(json, BACKUP_PASS);
    const sizeEncKB   = Math.round(encrypted.length / 1024);
    console.log(`[backup] Encrypted (${sizeEncKB} KB). Sending email...`);

    const { error } = await resend.emails.send({
      from:    FROM,
      to:      BACKUP_EMAIL,
      subject: `🗄️ Backup DardosDM — ${timestamp}${truncated.length ? " ⚠️ truncado" : ""}`,
      text: [
        `Copia de seguridad automática de DardosDM (cifrada, AES-256).`,
        `Fecha: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
        `Tamaño: ${sizeEncKB} KB cifrado (${sizeKB} KB original)`,
        `Tablas: users, tournaments, participants, matches (≤50k), player_records, audit_logs (≤10k)`,
        truncated.length ? `⚠️  Tablas truncadas:\n${truncated.map(t => `   • ${t}`).join("\n")}` : `✅  Exportación completa`,
        ``,
        `── Cómo descifrar ─────────────────────────────`,
        `1. Guarda el adjunto (${filename})`,
        `2. En un terminal (Mac/Linux, o Git Bash en Windows):`,
        ``,
        `   openssl enc -d -aes-256-cbc -pbkdf2 -in ${filename} -out backup.json`,
        ``,
        `3. Introduce la BACKUP_PASSPHRASE cuando la pida.`,
        `La passphrase NO va en este email — está en Railway → Variables.`,
      ].join("\n"),
      attachments: [{ filename, content: encrypted.toString("base64") }],
    });

    if (error) throw new Error(`Resend error: ${error.message}`);

    const msg = `Backup cifrado enviado a ${BACKUP_EMAIL} (${sizeEncKB} KB${truncated.length ? ", truncado" : ""})`;
    console.log(`[backup] ✅ ${msg}`);
    return { ok: true, message: msg };
  } catch (err: any) {
    const msg = `Backup fallido: ${err.message}`;
    console.error(`[backup] ❌ ${msg}`);
    return { ok: false, message: msg };
  }
}
