import { Router, IRouter } from "express";
import { getRankings, getPlayerStats } from "../controllers/stats.controller";

const router: IRouter = Router();

router.get("/rankings", getRankings);
router.get("/players/:userId", getPlayerStats);

export default router;
