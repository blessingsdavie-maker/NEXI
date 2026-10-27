# NALSAFE Backend

Node.js + Express + Neon PostgreSQL backend for the NALSAFE frontend.

## 1. Install

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` = Neon PostgreSQL connection string
- `JWT_SECRET` = long random secret
- `FRONTEND_URL` = exact URL where the NALSAFE frontend is hosted (for example `https://your-frontend.onrender.com`). Do not include `/api` here.

For local development, for example:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://...
JWT_SECRET=change-me-to-a-long-random-secret
FRONTEND_URL=http://localhost:4173
COOKIE_NAME=nalsafe_token
RESEND_API_KEY=re_...
EMAIL_FROM=NALSAFE <accounts@example.com>
```

Password recovery email requires a Resend API key and a verified sender address. Set
`RESEND_API_KEY` and `EMAIL_FROM` in the backend environment before enabling recovery.

## 3. Database schema

The server runs `db/schema.sql` before accepting requests. To initialize or inspect the schema manually, run that file in the Neon SQL Editor.

## 4. Start

```bash
npm start
```

Development mode:

```bash
npm run dev
```

## 5. Test database connectivity

Open:

`GET /health`

A healthy database returns:

```json
{
  "success": true,
  "message": "NALSAFE backend is connected to Neon PostgreSQL",
  "databaseTime": "..."
}
```

## Authentication API

The existing production API is still hosted at the legacy Render address `https://nexi-6qk9.onrender.com/api`; the NALSAFE frontend uses this address until a new NALSAFE API host is deployed. Keep this URL until the replacement is live, then update the frontend API base. These exact production endpoints are supported:

- `POST /api/signup`
- `POST /api/login`
- `POST /api/forgot-password`
- `POST /api/reset-password`
- `GET /api/me`
- `POST /api/logout`
- `PUT /api/users/email` (authenticated; requires the current password)

The backend also keeps `/signup`, `/login`, `/me`, `/logout` and `/api/auth/*` aliases for compatibility.

### Register

`POST /api/signup`

```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "AtLeast8Characters",
  "invite_token": "optional-token"
}
```

### Login

`POST /api/login`

```json
{
  "email": "jane@example.com",
  "password": "AtLeast8Characters"
}
```

### Current user

`GET /api/me`

The API supports authentication through the `nalsafe_token` HttpOnly cookie. It also accepts a bearer token through `Authorization: Bearer <token>` for frontend/API integrations.

### Logout

`POST /api/logout`

## Create the first admin

Register normally, then in Neon run the following with the designated owner's email. This sets the account as the one super administrator. The database allows only one super administrator; that owner can grant or revoke regular administrator access in the dashboard.

```sql
UPDATE users
SET role = 'admin', is_super_admin = TRUE
WHERE email = 'your-owner-email@example.com';
```

The schema adds the super-administrator flag and `support_admin` role automatically on startup. The owner can assign support administrators for member status and invitation work, or full administrators for all operational functions. Check-ins, directory management, and audit records are restricted to full administrators; only the designated super administrator can grant or revoke administrator roles. Sign out and back in after changing a role; the API checks current database roles on every protected request. Administrative changes are recorded in the audit log.

## Deployment on Render

Use:

- Build command: `npm install`
- Start command: `npm start`

Add `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and `NODE_ENV=production` as Render environment variables.
Also add `RESEND_API_KEY` and `EMAIL_FROM` to enable password reset emails.
