import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import documentQueue from "../../queues/document.queue.js";
import { prisma } from "../../lib/prisma.js";
import { parseId } from "../../lib/http.js";
import { getUserId } from "../auth/auth.middleware.js";
import { cancelReminders } from "../reminders/reminder.scheduler.js";
import { looksLikePdf } from "./document.upload.js";

async function removeFile(filePath: string) {
  await fs.unlink(filePath).catch(() => undefined);
}

/** POST /api/documents  (multipart/form-data, field "file") */
export const uploadDocument = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'A PDF file is required (field name: "file")' });
  }

  if (!(await looksLikePdf(file.path))) {
    await removeFile(file.path);
    return res.status(400).json({ message: "The uploaded file is not a valid PDF" });
  }

  const documentId = randomUUID();

  try {
    // 1. Create the document record in PostgreSQL.
    await prisma.document.create({
      data: {
        id: documentId,
        fileName: file.originalname,
        filePath: file.path,
        userId,
        status: "PROCESSING",
      },
    });

    try {
      // 2. Queue the document for background processing.
      const job = await documentQueue.add(
        "process-document",
        { documentId, fileName: file.originalname, userId, filePath: file.path },
        { jobId: `document-${documentId}` },
      );

      return res.status(202).json({
        message: "Document queued successfully",
        documentId,
        jobId: job.id,
        status: "waiting",
      });
    } catch (queueError) {
      // The database record exists, but queueing failed.
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED" },
      });
      throw queueError;
    }
  } catch (error) {
    console.error("Failed to create or queue document:", error);
    await removeFile(file.path);
    return res.status(500).json({ message: "Failed to create or queue document" });
  }
};

/** GET /api/documents */
export const listDocuments = async (req: Request, res: Response) => {
  const documents = await prisma.document.findMany({
    where: { userId: getUserId(req) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { deadlines: true } },
    },
  });

  return res.json({ documents });
};

/** GET /api/documents/:id */
export const getDocument = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid document id" });

  const document = await prisma.document.findFirst({
    where: { id, userId: getUserId(req) },
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      deadlines: { orderBy: [{ date: "asc" }, { time: "asc" }] },
    },
  });

  if (!document) return res.status(404).json({ message: "Document not found" });
  return res.json({ document });
};

/** DELETE /api/documents/:id */
export const deleteDocument = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid document id" });

  const document = await prisma.document.findFirst({
    where: { id, userId: getUserId(req) },
    select: { id: true, filePath: true, deadlines: { select: { id: true } } },
  });
  if (!document) return res.status(404).json({ message: "Document not found" });

  // Deadlines and notifications are removed by the database cascade;
  // queued reminder jobs and the file on disk have to be cleaned up here.
  await prisma.document.delete({ where: { id } });
  await Promise.all(document.deadlines.map((d) => cancelReminders(d.id)));
  await removeFile(document.filePath);

  return res.status(204).send();
};
