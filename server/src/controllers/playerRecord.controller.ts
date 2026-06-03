import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { badRequest, forbidden } from "../utils/errors";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const recordSchema = z.object({
  name:        z.string().min(1).max(100),
  dni:         z.string().max(20).optional(),
  cardNumber:  z.string().max(20).optional(),
  teamName:    z.string().max(100).optional(),
  grupo:       z.string().max(50).optional(),
  stageName:   z.string().max(100).optional(),
  ppd:         z.number().optional(),
  mpr:         z.number().optional(),
  gamesPlayed: z.number().int().optional(),
  level:       z.string().max(50).optional(),
  provincia:   z.string().max(100).optional(),
});

const batchSchema = z.object({
  season:   z.string().min(1),
  gameType: z.enum(["01", "cricket", "combo"]).optional(),
  records:  z.array(recordSchema).min(1).max(20000),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeCombined(ppd?: number | null, mpr?: number | null): number | null {
  if (ppd == null && mpr == null) return null;
  return ((mpr ?? 0) * 10) + (ppd ?? 0);
}

// ─── GET /player-records ─────────────────────────────────────────────────────

export const listPlayerRecords = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const q        = String(req.query.q        || "").trim();
    const season   = String(req.query.season   || "").trim();
    const gameType = String(req.query.gameType || "").trim();
    const page     = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit    = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"))));
    const skip     = (page - 1) * limit;

    const where: any = {};
    if (q)        where.name = { contains: q, mode: "insensitive" };
    if (season)   where.season = season;
    if (gameType) where.gameType = gameType;

    const [records, total] = await Promise.all([
      prisma.playerRecord.findMany({
        where,
        orderBy: [{ season: "desc" }, { mpr: "desc" }, { ppd: "desc" }],
        skip,
        take: limit,
      }),
      prisma.playerRecord.count({ where }),
    ]);

    return res.json({
      data: records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /player-records/seasons ─────────────────────────────────────────────
// Returns distinct season + gameType combos for filter dropdowns.

export const getSeasons = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.playerRecord.findMany({
      select:   { season: true },
      distinct: ["season"],
      orderBy:  { season: "desc" },
    });
    return res.json({ data: rows.map(r => r.season) });
  } catch (err) {
    next(err);
  }
};

// ─── POST /player-records/batch ──────────────────────────────────────────────

export const batchImportRecords = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden("Solo organizadores o admins"));

    const { season, gameType, records } = batchSchema.parse(req.body);

    // Split into records with DNI (can upsert) and without (always insert)
    const withDni    = records.filter(r => !!r.dni);
    const withoutDni = records.filter(r => !r.dni);

    let created = 0;
    let updated = 0;

    // ── Records WITHOUT DNI: bulk insert in one shot ──────────────────────────
    if (withoutDni.length > 0) {
      const toCreate = withoutDni.map(r => ({
        name:        r.name,
        dni:         null,
        cardNumber:  r.cardNumber  || null,
        teamName:    r.teamName    || null,
        grupo:       r.grupo       || null,
        stageName:   r.stageName   || null,
        season,
        gameType:    gameType      ?? null,
        ppd:         r.ppd         ?? null,
        mpr:         r.mpr         ?? null,
        gamesPlayed: r.gamesPlayed ?? null,
        combined:    computeCombined(r.ppd, r.mpr),
        level:       r.level       || null,
        provincia:   r.provincia   || null,
      }));

      // Use createMany with skipDuplicates for safety
      const result = await prisma.playerRecord.createMany({
        data: toCreate,
        skipDuplicates: false,
      });
      created += result.count;
    }

    // ── Records WITH DNI: upsert individually (but in batches of 50) ──────────
    const UPSERT_BATCH = 50;
    for (let i = 0; i < withDni.length; i += UPSERT_BATCH) {
      const batch = withDni.slice(i, i + UPSERT_BATCH);
      await Promise.all(batch.map(async (r) => {
        const data = {
          name:        r.name,
          dni:         r.dni!,
          cardNumber:  r.cardNumber  || null,
          teamName:    r.teamName    || null,
          grupo:       r.grupo       || null,
          stageName:   r.stageName   || null,
          season,
          gameType:    gameType      ?? null,
          ppd:         r.ppd         ?? null,
          mpr:         r.mpr         ?? null,
          gamesPlayed: r.gamesPlayed ?? null,
          combined:    computeCombined(r.ppd, r.mpr),
          level:       r.level       || null,
          provincia:   r.provincia   || null,
        };
        const existing = await prisma.playerRecord.findFirst({
          where: { dni: r.dni!, season },
          select: { id: true },
        });
        if (existing) {
          await prisma.playerRecord.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.playerRecord.create({ data });
          created++;
        }
      }));
    }

    return res.json({ data: { created, updated, errors: 0 } });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /player-records/season ──────────────────────────────────────────
// Deletes all records for a given season + gameType.

export const deleteSeasonRecords = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden("Solo organizadores o admins"));
    const { season } = z.object({ season: z.string().min(1) }).parse(req.body);

    const { count } = await prisma.playerRecord.deleteMany({ where: { season } });
    return res.json({ data: { deleted: count } });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /player-records/:id ─────────────────────────────────────────────

// ─── PATCH /player-records/:id ──────────────────────────────────────────────

export const updatePlayerRecord = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden("Solo organizadores o admins"));
    const { id } = req.params;
    const record = await prisma.playerRecord.findUnique({ where: { id } });
    if (!record) return next(badRequest("Registro no encontrado"));

    const body = z.object({
      name:      z.string().min(1).optional(),
      dni:       z.string().nullable().optional(),
      provincia: z.string().nullable().optional(),
      ppd:       z.number().nullable().optional(),
      mpr:       z.number().nullable().optional(),
    }).parse(req.body);

    const ppd  = body.ppd  != null ? body.ppd  : record.ppd;
    const mpr  = body.mpr  != null ? body.mpr  : record.mpr;
    const combined = mpr != null && ppd != null
      ? mpr * 10 + ppd
      : mpr != null ? mpr * 10
      : ppd != null ? ppd
      : record.combined;

    const updated = await prisma.playerRecord.update({
      where: { id },
      data: {
        name:      body.name      !== undefined ? body.name.trim()  : record.name,
        dni:       body.dni       !== undefined ? (body.dni ?? null) : record.dni,
        provincia: body.provincia !== undefined ? (body.provincia ?? null) : record.provincia,
        ppd:       body.ppd       !== undefined ? body.ppd  : record.ppd,
        mpr:       body.mpr       !== undefined ? body.mpr  : record.mpr,
        combined,
      },
    });
    return res.json({ data: updated });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /player-records/:id ─────────────────────────────────────────────

export const deletePlayerRecord = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden("Solo organizadores o admins"));
    const { id } = req.params;
    const record = await prisma.playerRecord.findUnique({ where: { id } });
    if (!record) return next(badRequest("Registro no encontrado"));
    await prisma.playerRecord.delete({ where: { id } });
    return res.json({ data: { id } });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /player-records/bulk ────────────────────────────────────────────

export const bulkDeletePlayerRecords = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden("Solo organizadores o admins"));
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
    const { count } = await prisma.playerRecord.deleteMany({ where: { id: { in: ids } } });
    return res.json({ data: { deleted: count } });
  } catch (err) {
    next(err);
  }
};

// ─── GET /player-records/search-for-inscription ──────────────────────────────
// Returns all seasons for each matched player, grouped by DNI (or normalised name).
// Searches by name OR DNI.
// Response shape per player:
//   { name, dni, cardNumber, teamName, seasons: [...], avgPpd, avgMpr, avgCombined }

function avgOf(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((v): v is number => v != null);
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

export const searchForInscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const q               = String(req.query.q               || "").trim();
    const gameType        = String(req.query.gameType        || "").trim();
    const preferredSeason = String(req.query.preferredSeason || "").trim() || null;

    if (!q || q.length < 2) return res.json({ data: [] });

    // Fetch raw records: match by name OR DNI.
    // gameType filter is intentionally lenient: include records that match the
    // requested gameType OR have no gameType set (null), because historical data
    // is often imported without a gameType value.
    const records = await prisma.playerRecord.findMany({
      where: {
        AND: [
          { OR: [
            { name: { contains: q, mode: "insensitive" } },
            { dni:  { contains: q, mode: "insensitive" } },
          ]},
          ...(gameType ? [{ OR: [{ gameType }, { gameType: null }] }] : []),
        ],
      },
      orderBy: [{ name: "asc" }, { season: "desc" }],
      take: 300,
    });

    // Group by player key — DNI preferred, else normalised name
    const byPlayer: Record<string, {
      name:       string;
      dni:        string | null;
      cardNumber: string | null;
      teamName:   string | null;
      provincia:  string | null;
      seasons:    Array<{
        season:      string;
        gameType:    string | null;
        ppd:         number | null;
        mpr:         number | null;
        combined:    number | null;
        gamesPlayed: number | null;
        level:       string | null;
      }>;
      ppds:    (number | null)[];
      mprs:    (number | null)[];
      combos:  (number | null)[];
    }> = {};

    for (const r of records) {
      const key = r.dni ? r.dni.toLowerCase().trim() : r.name.toLowerCase().trim();
      if (!byPlayer[key]) {
        byPlayer[key] = {
          name:       r.name,
          dni:        r.dni,
          cardNumber: r.cardNumber,
          teamName:   r.teamName,
          provincia:  r.provincia ?? null,
          seasons:    [],
          ppds:       [],
          mprs:       [],
          combos:     [],
        };
      } else {
        // Keep most recent non-null teamName / provincia
        if (!byPlayer[key].teamName && r.teamName) byPlayer[key].teamName = r.teamName;
        if (!byPlayer[key].provincia && r.provincia) byPlayer[key].provincia = r.provincia;
      }
      byPlayer[key].seasons.push({
        season:      r.season,
        gameType:    r.gameType,
        ppd:         r.ppd,
        mpr:         r.mpr,
        combined:    r.combined,
        gamesPlayed: r.gamesPlayed,
        level:       r.level,
      });
      byPlayer[key].ppds.push(r.ppd);
      byPlayer[key].mprs.push(r.mpr);
      byPlayer[key].combos.push(r.combined);
    }

    const result = Object.values(byPlayer).slice(0, 20).map(p => {
      // When a preferred season is configured, use that season's values as the
      // "historical" metric so "Histórica" in the UI reflects the right number.
      // Fall back to most recent season if the preferred one isn't present.
      let avgPpd: number | null;
      let avgMpr: number | null;
      let avgCombined: number | null;

      if (preferredSeason) {
        const prefSeason = p.seasons.find(s => s.season === preferredSeason);
        const source     = prefSeason ?? p.seasons[0]; // seasons already sorted desc
        avgPpd      = source?.ppd      ?? null;
        avgMpr      = source?.mpr      ?? null;
        avgCombined = source?.combined ?? null;
      } else {
        avgPpd      = avgOf(p.ppds);
        avgMpr      = avgOf(p.mprs);
        avgCombined = avgOf(p.combos);
      }

      return {
        name:        p.name,
        dni:         p.dni,
        cardNumber:  p.cardNumber,
        teamName:    p.teamName,
        provincia:   p.provincia,
        seasons:     p.seasons,
        avgPpd,
        avgMpr,
        avgCombined,
      };
    });

    return res.json({ data: result });
  } catch (err) {
    next(err);
  }
};
