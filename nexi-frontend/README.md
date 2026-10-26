# NALSAFE

NALSAFE uses a static frontend, an Express API, and Neon PostgreSQL. Accounts, circles, invitations, check-ins, reminder preferences, and verified service listings are stored server-side.

## Local setup

1. Create a Neon PostgreSQL project and copy its connection string with SSL enabled.
2. In `nexi-backend`, copy `.env.example` to `.env`; set `DATABASE_URL`, a strong `JWT_SECRET`, and `FRONTEND_URL=http://localhost:4173`.
3. Run `db/schema.sql` in the Neon SQL Editor. The script is repeatable and backfills circles and reminder preferences for existing accounts.
4. Start the API:

```powershell
cd nexi-backend
npm install
npm run dev
```

5. In a second terminal, serve the frontend:

```powershell
cd nexi-frontend
python -m http.server 4173
```

Open `http://localhost:4173`. The frontend uses `http://localhost:5000/api` on localhost. `GET http://localhost:5000/health` checks the Neon connection.

To designate the initial super administrator, first create the account, then run this once in Neon using that account's email:

```sql
UPDATE users
SET role = 'admin', is_super_admin = TRUE
WHERE email = 'owner@example.com';
```

The super administrator can assign limited support-admin access or full administrator access from the Permissions section. Support administrators can manage member status and invitations; full administrators can also access check-ins, the service directory, and the audit log. Sign out and back in after a role change; the API checks the current database role for every protected request.

## Production

Deploy the frontend as a static site and `nexi-backend` as a Node.js service. Configure `DATABASE_URL`, a random `JWT_SECRET` with at least 32 characters, `NODE_ENV=production`, and the exact HTTPS frontend origin in `FRONTEND_URL`. The production frontend and API must both use HTTPS for secure cookies. The current API default still points to the legacy Render host `https://nexi-6qk9.onrender.com/api`; configure `window.NALSAFE_API_BASE_URL` before `nalsafe-api.js` loads when the new NALSAFE API host is deployed.

Invitations are persisted and return a seven-day registration link for sharing; email delivery is not configured. Reminder time preferences persist, but no scheduled notification service exists. NALSAFE does not collect location, dispatch emergency alerts, or replace emergency services. The public service directory returns only listings administrators have verified.
