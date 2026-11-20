import documentQueue from "../queues/document.queue.js";

export const getJobStatus = async (jobId: string, userId: string) => {
  const job = await documentQueue.getJob(jobId);

  // Report other users' jobs as "not found" rather than leaking that they exist.
  if (!job || job.data.userId !== userId) {
    return null;
  }

  return {
    jobId: job.id,
    documentId: job.data.documentId,
    status: await job.getState(),
    progress: job.progress,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
  };
};
