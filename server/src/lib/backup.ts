import { exec } from "child_process";
import { promisify } from "util";
import { Resend } from "resend";

const execAsync = promisify(exec);

const FROM         = process.env.RESEND_FROM    ?? "DardosDM <noreply@dardosdm.com>";
const BACKUP_EMAIL = process.env.BACKUP_EMAIL   ?? process.env.RESEND_FROM ?? "";
const RESEND_KEY   = process.env.RESEND_API_KEY ?? "";

export async function runBackup(): Promise<{ ok: boolean; message: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { ok: false, message: "DATABASE_URL no configurada" };
  if (!BACKUP_EMAIL) return { ok: false, message: "BACKUP_EMAIL no configurada" };
  if (!RESEND_KEY)   return { ok: false, message: "RESEND_API_KEY no configurada" };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename  = `dardosdm-backup-${timestamp}.sql`;

  try {
    console.log("[backup] Starting pg_dump...");
    const { stdout, stderr } = await execAsync(
      `pg_dump --no-password "${dbUrl}"`,
      { maxBuffer: 100 * 1024 * 1024 }
    );
    if (stderr && !stderr.toLowerCase().includes("warning")) {
      throw new Error(`pg_dump error: ${stderr}`);
    }

    const sizeKB = Math.round(Buffer.byteLength(stdout, "utf8") / 1024);
    console.log(`[backup] pg_dump done — ${sizeKB} KB. Sending email...`);

    const resend = new Resend(RESEND_KEY);
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      BACKUP_EMAIL,
      subject: `🗄️ Backup DardosDM — ${timestamp}`,
      text: [
        `Copia de seguridad automática de DardosDM.`,
        `Fecha: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
        `Tamaño: ${sizeKB} KB`,
        ``,
        `Para restaurar: psql DATABASE_URL < ${filename}`,
      ].join("\n"),
      attachments: [{
        filename,
        content: Buffer.from(stdout).toString("base64"),
      }],
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
