import { Router, IRouter } from "express";
import { authenticate, requireRole } from "../middlewares/auth.middleware";
import { exec } from "child_process";
import { promisify } from "util";
import { runBackup } from "../lib/backup";

const execAsync = promisify(exec);
const router: IRouter = Router();

let lastBackupAt: string | null = null;
let lastBackupStatus: string    = "Nunca ejecutado";

/** POST /backup/run — trigger a backup manually (sends email immediately) */
router.post("/run", authenticate, requireRole("admin"), async (_req, res) => {
  const result = await runBackup();
  if (result.ok) {
    lastBackupAt     = new Date().toISOString();
    lastBackupStatus = result.message;
  }
  res.json(result);
});

/** GET /backup/status — last backup info */
router.get("/status", authenticate, requireRole("admin"), (_req, res) => {
  res.json({
    lastBackupAt,
    lastBackupStatus,
    backupEmail: process.env.BACKUP_EMAIL ?? "(no configurado — añade BACKUP_EMAIL en Railway)",
    schedule: "Automático cada noche a las 03:00 (hora España)",
  });
});

/**
 * GET /backup/download — stream pg_dump directly to browser (no email)
 */
router.get("/download", authenticate, requireRole("admin"), async (_req, res, next) => {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) { res.status(500).json({ message: "DATABASE_URL no configurada" }); return; }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const { stdout } = await execAsync(
      `pg_dump --no-password "${dbUrl}"`,
      { maxBuffer: 100 * 1024 * 1024 }
    );

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="dardosdm-backup-${timestamp}.sql"`);
    res.send(stdout);
  } catch (err) { next(err); }
});

export { lastBackupAt, lastBackupStatus };
export default router;
