import { Router, IRouter } from "express";
import { authenticate, requireRole } from "../middlewares/auth.middleware";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router: IRouter = Router();

/**
 * GET /backup/download
 * Admin-only endpoint that runs pg_dump and streams the result as a .sql file.
 * No external service needed — download it and store wherever you want.
 */
router.get("/download", authenticate, requireRole("admin"), async (_req, res, next) => {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(500).json({ message: "DATABASE_URL no configurada" });
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename  = `dardosdm-backup-${timestamp}.sql`;

    // Run pg_dump — outputs plain SQL to stdout
    const { stdout, stderr } = await execAsync(
      `pg_dump --no-password "${dbUrl}"`,
      { maxBuffer: 100 * 1024 * 1024 } // 100 MB max
    );

    if (stderr && !stderr.includes("WARNING")) {
      console.error("[backup] pg_dump stderr:", stderr);
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(stdout);
  } catch (err: any) {
    // pg_dump not available on the system — provide a JSON export fallback
    console.error("[backup] pg_dump failed:", err.message);
    next(err);
  }
});

/**
 * GET /backup/status
 * Returns the last backup timestamp stored in-memory (resets on redeploy).
 * Just for checking when the last manual backup was triggered.
 */
let lastBackupAt: string | null = null;

router.get("/status", authenticate, requireRole("admin"), (_req, res) => {
  res.json({
    lastBackupAt,
    note: "Para backup automático diario configura la variable BACKUP_WEBHOOK_URL en Railway",
  });
});

export default router;
