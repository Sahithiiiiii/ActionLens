
module.exports = {
  apps: [
    {
      name: "actionlens-api",
      script: "dist/server.js",
      autorestart: true
    },
    {
      name: "document-worker",
      script: "dist/workers/document.worker.js",
      autorestart: true
    },
    {
      name: "reminder-worker",
      script: "dist/workers/reminder.worker.js",
      autorestart: true
    },
    {
      name: "email-worker",
      script: "dist/workers/email.worker.js",
      autorestart: true
    }
  ]
};
