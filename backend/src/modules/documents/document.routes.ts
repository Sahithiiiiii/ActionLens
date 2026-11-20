import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  deleteDocument,
  getDocument,
  listDocuments,
  uploadDocument,
} from "./document.controller.js";
import { uploadPdf } from "./document.upload.js";

const router = Router();

router.use(requireAuth);

router.post("/", uploadPdf, uploadDocument);
router.get("/", listDocuments);
router.get("/:id", getDocument);
router.delete("/:id", deleteDocument);

export default router;
