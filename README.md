# ActionLens

Upload a PDF → AI finds the deadlines → you get reminders in the app and by email.

- `backend/`: Express + PostgreSQL (Prisma) + Redis (BullMQ) + Gemini + Gmail SMTP. See `backend/README.md`.
- `frontend/`: React + Vite. See `frontend/README.md`.

## Quick start
```bash
# backend
cd backend && cp .env.example .env     # fill in the values
npm install && npm run db:migrate && npm run db:generate
npm run dev:all                        # API + 3 workers

# frontend (another terminal)
cd frontend && npm install && npm run dev
```
Needs PostgreSQL and Redis running locally (or in Docker).

## Docker

1. Copy `backend/.env.example` to `backend/.env` and set at least `JWT_SECRET`, `GEMINI_API_KEY`, and any SMTP values you want to use.
2. Start the stack:
   ```bash
   docker compose up --build
   ```
3. Open `http://localhost:5174`.

Docker Compose starts PostgreSQL, Redis, database migrations, the API, all three workers, and the frontend. Uploaded PDFs are stored in the `uploads` volume.
