import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import multer from "multer";
import { env } from "./config/env.js";
import authRoutes from "./modules/auth/auth.routes.js";
import documentRoutes from "./modules/documents/document.routes.js";
import deadlineRoutes from "./modules/deadlines/deadline.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import jobRoutes from "./modules/jobs/job.routes.js";
import { apiLimiter } from "./middleware/rateLimit.js";

const app = express();

if (env.trustProxy) app.set("trust proxy", env.trustProxy);

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "ActionLens API is running",
  });
});

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/deadlines", deadlineRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/jobs", jobRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ message: error.message });
  }
  if (error instanceof Error && error.message === "Only PDF files are allowed") {
    return res.status(400).json({ message: error.message });
  }
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  console.error("Unhandled error:", error);
  return res.status(500).json({ message: "Internal server error" });
};
app.use(errorHandler);

export default app;
