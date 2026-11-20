import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  completeDeadline,
  deleteDeadline,
  getDeadline,
  listDeadlines,
  reopenDeadline,
  updateDeadline,
} from "./deadline.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listDeadlines);
router.get("/:id", getDeadline);
router.patch("/:id", updateDeadline);
router.post("/:id/complete", completeDeadline);
router.post("/:id/reopen", reopenDeadline);
router.delete("/:id", deleteDeadline);

export default router;
