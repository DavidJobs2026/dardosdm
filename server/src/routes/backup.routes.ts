import { Router, IRouter } from "express";
import { authenticate, requireRole } from "../middlewares/auth.middleware";
import { runBackup, createBackupJson } from "../lib/backup";
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
 * GET /backup/download — export all tables as JSON and stream to browser
 */
router.get("/download", authenticate, requireRole("admin"), async (_req, res, next) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const { json: backupJson } = await createBackupJson();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="dardosdm-backup-${timestamp}.json"`);
    res.send(backupJson);
  } catch (err) { next(err); }
});

export { lastBackupAt, lastBackupStatus };
export default router;
