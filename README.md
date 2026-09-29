# Nexi

The Nexi web app includes a static frontend and an Express API backed by Neon PostgreSQL. Registration, login, and logout use persistent database records and server-managed sessions.

## Run locally

Set `DATABASE_URL` in `nexi-backend/.env` to a PostgreSQL connection string. The backend creates the required user and session tables at startup. Start the API:

```powershell
cd nexi-backend
npm install
npm run dev
```

In a second terminal, serve the frontend from the repository root:

```powershell
python -m http.server 4173 --directory .
```

Visit `http://localhost:4173/login.html`. On localhost, the frontend connects to `http://localhost:5000/api`.

The user sign-in and registration screen is `login.html`. The admin entry page is `admin.html`. The role dashboards are available at `user-dashboard.html` and `admin-dashboard.html`.

## Deployment configuration

Configure `DATABASE_URL`, `NODE_ENV=production`, and `FRONTEND_ORIGINS` on the backend host. `FRONTEND_ORIGINS` must contain the exact frontend origin, including scheme, for example `https://app.example.com`. Production cookies use `Secure` and `SameSite=None` for a separately hosted frontend. If the API is not `https://nexi-6qk9.onrender.com/api`, set `window.NEXI_API_BASE_URL` to the API base URL before `nexi-api.js` loads.

Passwords are hashed with bcrypt. Session tokens are random, stored only as hashes in PostgreSQL, and sent to the browser in HttpOnly cookies. Dashboard check-ins, reminders, sample circle members, invitations, notifications, and service listings remain local/demo features and are not persisted to the database.
