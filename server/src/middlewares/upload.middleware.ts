import multer from "multer";
import path from "path";
import fs from "fs";
import { Request, Response, NextFunction, RequestHandler } from "express";

const UPLOADS_DIR = process.env.UPLOADS_PATH
  ? path.join(process.env.UPLOADS_PATH, "tournaments")
  : path.join(__dirname, "../../../uploads/tournaments");

// Ensure directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Map allowed MIME types to safe extensions
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png":  ".png",
  "image/webp": ".webp",
  "image/gif":  ".gif",
};

/**
 * Detects the real MIME type by reading the file's magic bytes (first 12 bytes).
 * This cannot be spoofed by the client, unlike the Content-Type header.
 *
 * Magic signatures:
 *   JPEG  → FF D8 FF
 *   PNG   → 89 50 4E 47 0D 0A 1A 0A
 *   GIF   → 47 49 46 38 (GIF8…)
 *   WebP  → 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF????WEBP)
 */
function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    return "image/jpeg";
  }
  // PNG
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
    buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A
  ) {
    return "image/png";
  }
  // GIF87a or GIF89a
  if (
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38
  ) {
    return "image/gif";
  }
  // WebP: "RIFF" at 0-3 and "WEBP" at 8-11
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

// Step 1 — Multer with memory storage: load file into req.file.buffer (no disk write yet).
// The 5 MB size limit is enforced here before the buffer is allocated.
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).single("image");

/**
 * Two-phase upload middleware:
 *  1. Multer buffers the file in memory (size-limited to 5 MB).
 *  2. Magic bytes are read from the buffer to verify the real format.
 *  3. Only if valid, the file is written to disk and req.file.filename is set
 *     so downstream controllers work exactly as before.
 */
export const tournamentImageUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  memUpload(req, res, (err) => {
    if (err) return next(err);

    // No file attached — let the controller decide whether that's an error
    if (!req.file) return next();

    // ── Magic-byte validation ──────────────────────────────────────────────
    const detectedMime = detectMimeFromBuffer(req.file.buffer);

    if (!detectedMime || !MIME_TO_EXT[detectedMime]) {
      return res.status(400).json({
        error: "Solo se permiten imágenes reales (jpg, png, webp, gif)",
      });
    }

    // The declared Content-Type must match the actual content —
    // catches files where the extension was merely renamed.
    if (detectedMime !== req.file.mimetype) {
      return res.status(400).json({
        error: "El tipo de archivo no coincide con su contenido real",
      });
    }

    // ── Write to disk ──────────────────────────────────────────────────────
    const ext      = MIME_TO_EXT[detectedMime];
    const unique   = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${unique}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    fs.writeFile(filepath, req.file.buffer, (writeErr) => {
      if (writeErr) return next(writeErr);

      // Patch req.file to look like it came from diskStorage so controllers
      // reading file.filename / file.path continue to work unchanged.
      req.file!.filename = filename;
      req.file!.path     = filepath;

      // Free the buffer from memory — it has been persisted to disk
      (req.file as any).buffer = undefined;

      next();
    });
  });
};
