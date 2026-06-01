import { IRouter, Router } from "express";
import {
  listPlayerRecords,
  getSeasons,
  batchImportRecords,
  deleteSeasonRecords,
  deletePlayerRecord,
  bulkDeletePlayerRecords,
  searchForInscription,
  updatePlayerRecord,
} from "../controllers/playerRecord.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router: IRouter = Router();

router.get("/",                      authenticate, listPlayerRecords);
router.get("/seasons",               authenticate, getSeasons);
router.get("/search-for-inscription", authenticate, searchForInscription);
router.post("/batch",                authenticate, batchImportRecords);
router.delete("/season",             authenticate, deleteSeasonRecords);
router.delete("/bulk",               authenticate, bulkDeletePlayerRecords);
router.patch("/:id",                 authenticate, updatePlayerRecord);
router.delete("/:id",                authenticate, deletePlayerRecord);

export default router;
