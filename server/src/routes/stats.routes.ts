import { Router, IRouter } from "express";
import { getRankings, getPlayerStats } from "../controllers/stats.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router: IRouter = Router();

// VULN-015 fix: stats endpoints require authentication
// (previously exposed player IDs, ELO and match history without login)
router.get("/rankings",        authenticate, getRankings);
router.get("/players/:userId", authenticate, getPlayerStats);

export default router;
