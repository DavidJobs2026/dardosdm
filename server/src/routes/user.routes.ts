import { IRouter, Router } from "express";
import { searchUsers, getMyProfile, batchCreateUsers, findOrCreatePlayer, listPlayers, listUsers, updateUserRole, updateUserName, updateUserPassword, updateUserProfile, resetPasswordToDni, deleteUser, getAuditLogs, absorbGhost, ghostPreview } from "../controllers/user.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router: IRouter = Router();

router.get("/",                    authenticate, listUsers);
router.get("/audit-logs",          authenticate, getAuditLogs);
router.get("/players",             authenticate, listPlayers);
router.patch("/:id/profile",       authenticate, updateUserProfile);
router.post("/:id/reset-password", authenticate, resetPasswordToDni);
router.get("/search",              authenticate, searchUsers);
router.get("/me/profile",          authenticate, getMyProfile);
router.post("/batch-create",       authenticate, batchCreateUsers);
router.post("/find-or-create",     authenticate, findOrCreatePlayer);
router.patch("/:id/role",          authenticate, updateUserRole);
router.patch("/:id/name",          authenticate, updateUserName);
router.patch("/:id/password",      authenticate, updateUserPassword);
router.get("/:id/ghost-preview",   authenticate, ghostPreview);
router.post("/:id/absorb-ghost",   authenticate, absorbGhost);
router.delete("/:id",              authenticate, deleteUser);

export default router;
