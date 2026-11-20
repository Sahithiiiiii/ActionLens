# ActionLens backend

Upload a PDF → Gemini extracts deadlines → repeating reminders are delivered **in-app (live over SSE)** and **by email**, all driven by BullMQ/Redis.

```
API (Express) ──► document-processing queue ──► document.worker ──► PostgreSQL (+ Gemini)
                                                      │
                                                      ▼
                  deadline-reminders queue ◄── schedules first reminder
                          │
                          ▼
                  reminder.worker ──► Notification row ──► Redis pub/sub ──► API ──► browser (SSE)
                          │
                          └────────► email-delivery queue ──► email.worker ──► SMTP (Gmail)
                  (same process) deadline-maintenance queue: sweep every 5 min
                                 (expire past-due deadlines, re-queue reminders lost from Redis)
```

## Run it

```bash
cp .env.example .env        # fill in JWT_SECRET, DATABASE_URL, GEMINI_API_KEY, SMTP_USER, SMTP_PASS
npm install
npm run db:migrate          # prisma migrate deploy
npm run db:generate
npm run dev:all             # API + document, reminder and email workers
```
Each piece also runs alone: `npm run dev`, `worker`, `reminder-worker`, `email-worker`.
`npm test` runs the timezone unit tests.

## API  (all but register/login need `Authorization: Bearer <token>`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` `{name,email,password,timezone?}` | creates an unverified account, emails a 6-digit code → `{needsVerification}` |
| POST | `/api/auth/verify-email` `{email,code}` | → `{user, token}` |
| POST | `/api/auth/resend-verification` `{email}` | new code (60 s cooldown) |
| POST | `/api/auth/forgot-password` `{email}` | emails a 6-digit reset code (same reply whether or not the account exists) |
| POST | `/api/auth/reset-password` `{email,code,password}` | sets the new password → `{user, token}` |
| POST | `/api/auth/login` `{email,password}` | → `{user, token}`, or 403 `EMAIL_NOT_VERIFIED` |
| GET/PATCH | `/api/auth/me` | profile; PATCH `{name?, timezone?}` |
| POST | `/api/documents` | multipart, field `file` (PDF) → 202 `{documentId, jobId}` |
| GET | `/api/documents`, `/api/documents/:id` | list / detail with deadlines |
| DELETE | `/api/documents/:id` | removes file, deadlines, queued reminders |
| GET | `/api/jobs/:jobId` | processing progress |
| GET | `/api/deadlines?status=&documentId=` | list (includes computed `dueAt`) |
| PATCH | `/api/deadlines/:id` `{reminderLeadMinutes?, repeatIntervalMinutes?}` | re-schedules the reminder |
| POST | `/api/deadlines/:id/complete` · `/reopen` | stop / resume reminders |
| DELETE | `/api/deadlines/:id` | |
| GET | `/api/notifications?unread=true&limit=&cursor=` | → `{notifications, nextCursor, unreadCount}` |
| GET | `/api/notifications/unread-count` | |
| PATCH | `/api/notifications/:id/read` · POST `/read-all` · DELETE `/:id` | |
| GET | `/api/notifications/stream?token=<jwt>` | Server-Sent Events: `ready`, `notification`, `document` |

Browser usage:
```js
const es = new EventSource(`${API}/api/notifications/stream?token=${token}`);
es.addEventListener("notification", (e) => addToBell(JSON.parse(e.data)));
es.addEventListener("document", (e) => refreshDocument(JSON.parse(e.data)));
```

## Notes
- **Deadlines without a time** get reminders from 09:00 on the due date (repeating until 23:59), in the deadline's timezone.
- **Emails** are HTML + plain-text (`src/lib/emailTemplate.ts`); the button links to `APP_URL`.
- **Rate limits** (Redis-backed, `src/middleware/rateLimit.ts`): 10 failed logins / 15 min / IP, 5 sign-ups / hour / IP, 300 API requests / min / IP. Behind a proxy, set `TRUST_PROXY=1`.
- **Email verification**: codes are 6 digits, valid 10 minutes, stored only as a keyed hash, locked after 5 wrong tries. In development (`NODE_ENV` not `production`) the code is also printed in the API log.
- **Email** goes out over SMTP (`src/lib/mailer.ts`, nodemailer). Default is Gmail: turn on 2-Step Verification, create an App Password at https://myaccount.google.com/apppasswords, and set `SMTP_USER` (your full Gmail address) and `SMTP_PASS`. Personal Gmail allows roughly 500 recipients per day. Any other SMTP server works by changing `SMTP_HOST`, `SMTP_PORT` and `SMTP_SECURE`.
