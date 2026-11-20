import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env`);
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  corsOrigin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? true,
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "uploads"),
  appUrl: process.env.APP_URL || "http://localhost:5173",
  // Set to 1 when behind nginx/Render/Heroku etc. so rate limits see the real client IP.
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 10,
};
