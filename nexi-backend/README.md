# Nexi Backend

Node.js + Express + Neon PostgreSQL backend for the Nexi frontend.

## 1. Install

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` = Neon PostgreSQL connection string
- `JWT_SECRET` = long random secret
- `FRONTEND_URL` = exact URL where the Nexi frontend is hosted (for example `https://your-frontend.onrender.com`). Do not include `/api` here.

For local development, for example:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://...
JWT_SECRET=change-me-to-a-long-random-secret
FRONTEND_URL=http://localhost:3000
COOKIE_NAME=nexi_token
```

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
  "message": "Nexi backend is connected to Neon PostgreSQL",
  "databaseTime": "..."
}
```

## Authentication API

The Nexi frontend currently uses `https://nexi-6qk9.onrender.com/api` as its production API base, so these exact production endpoints are supported:

- `POST /api/signup`
- `POST /api/login`
- `GET /api/me`
- `POST /api/logout`

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

The API supports authentication through the `nexi_token` HttpOnly cookie. It also accepts a bearer token through `Authorization: Bearer <token>` for frontend/API integrations.

### Logout

`POST /api/logout`

## Create the first admin

Register normally, then in Neon run:

```sql
UPDATE users
SET role = 'admin'
WHERE email = 'your-admin-email@example.com';
```

Admin dashboard endpoints are protected by the administrator role and are available under `/api/admin`: `/overview`, `/members`, `/members/:id/status`, `/invitations`, `/checkins`, and `/directory`.

## Deployment on Render

Use:

- Build command: `npm install`
- Start command: `npm start`

Add `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and `NODE_ENV=production` as Render environment variables.
