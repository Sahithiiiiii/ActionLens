import { Router } from "express";
import { forgotPassword, login, me, resetPassword, register, resendVerification, updateMe, verifyEmail } from "./auth.controller.js";
import { forgotLimiter, loginLimiter, registerLimiter, resendLimiter, verifyLimiter } from "../../middleware/rateLimit.js";
import { requireAuth } from "./auth.middleware.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/verify-email", verifyLimiter, verifyEmail);
router.post("/resend-verification", resendLimiter, resendVerification);
router.post("/forgot-password", forgotLimiter, forgotPassword);
router.post("/reset-password", verifyLimiter, resetPassword);
router.post("/login", loginLimiter, login);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateMe);

export default router;
