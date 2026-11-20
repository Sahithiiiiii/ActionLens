# ActionLens frontend

React + Vite + TypeScript. Login/register, PDF upload, deadlines (complete / reopen / change reminders), and a notification bell that updates live over SSE.

```bash
npm install
npm run dev      # http://localhost:5173  (proxies /api to http://localhost:5000)
npm run build    # production build in dist/ (set VITE_API_URL to your API's public URL first)
```
Backend needs `CORS_ORIGIN` set to this site's origin in production, and `APP_URL` for email links.
