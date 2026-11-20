import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { getJobStatusController } from "./job.controller.js";

const router = Router();

router.get("/:jobId", requireAuth, getJobStatusController);

export default router;