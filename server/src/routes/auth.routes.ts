import { Router, IRouter } from "express";
import { register, login, logout, logoutAll, refresh, me, checkDni, checkEmail, checkPhone, verifyEmail, resendVerification, requestVerification } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router: IRouter = Router();

router.get("/check-dni",           checkDni);                         // public — used during registration
router.get("/check-email",         checkEmail);                       // public — used during registration
router.get("/check-phone",         checkPhone);                       // public — used during registration
router.get("/verify-email",        verifyEmail);                     // public — ?token=xxx
router.post("/register",           register);
router.post("/login",              login);
router.post("/logout",             logout);
router.post("/logout-all",         authenticate, logoutAll);  // revokes all sessions
router.post("/refresh",            refresh);
router.get("/me",                  authenticate, me);
router.post("/resend-verification",         authenticate, resendVerification);
router.post("/request-verification",        requestVerification);              // public — email in body

export default router;
