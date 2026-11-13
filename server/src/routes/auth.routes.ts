import { Router, IRouter } from "express";
import { register, login, login2FA, logout, logoutAll, refresh, me, checkDni, checkEmail, checkPhone, verifyEmail, resendVerification, requestVerification, forgotPassword, resetPassword, changeMyPassword, setup2FA, enable2FA, disable2FA } from "../controllers/auth.controller";
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
router.post("/forgot-password",             forgotPassword);                   // public — send reset email
router.post("/reset-password",              resetPassword);                    // public — token + new password
router.patch("/me/password",                authenticate, changeMyPassword);   // authenticated — change own password
// ── Two-factor authentication ──
router.post("/2fa/login",                   login2FA);                         // public — second step after password
router.post("/2fa/setup",                   authenticate, setup2FA);           // generate secret + QR
router.post("/2fa/enable",                   authenticate, enable2FA);          // confirm code, turn on, get recovery codes
router.post("/2fa/disable",                  authenticate, disable2FA);         // requires password

export default router;
