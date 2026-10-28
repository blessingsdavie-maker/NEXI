NALSAFE — MEMBER INVITATIONS + CHAT
===================================

Included files
--------------
server.js
routes/social.js
user-dashboard.html
portal-live.js
nalsafe-social-schema.sql

What the feature adds
---------------------
- A floating Chat & invite panel on the member dashboard.
- A unique public username on each member account (3–24 letters, numbers,
  or underscores; case-insensitive uniqueness).
- Exact username lookup without revealing account email addresses.
- Invite-to-circle requests with accept/decline actions and 7-day expiry.
- Accepted member-to-member connections.
- Direct messages stored in PostgreSQL, restricted to accepted connections.
- Conversation previews, unread counts, and periodic dashboard refresh.
- An invite-by-email form that reuses the existing POST /api/circle/invitations
  endpoint; when the existing endpoint returns a share link, users can copy it
  or share it on WhatsApp.

Deployment steps
----------------
1. Back up the current backend and frontend files before replacing them.
2. In the backend repository, replace server.js with this server.js.
3. Create routes/social.js and paste in the included file. Make sure the
   existing routes folder is used (alongside auth.js and users.js).
4. In the frontend deployment, replace user-dashboard.html and portal-live.js
   with the included versions. Keep portal.css and nalsafe-api.js in place.
5. Confirm the backend package already contains express, cors, cookie-parser,
   pg, jsonwebtoken and dotenv. If jsonwebtoken or pg is missing, install it
   in the backend project before deploying.
6. Confirm DATABASE_URL and JWT_SECRET are configured in Render. Set FRONTEND_URL
   to the exact Vercel frontend origin (for example, https://your-site.vercel.app),
   not a page path and not the backend API URL.
7. Deploy the backend and frontend. The backend calls initializeSchema() first,
   then creates the social username column and tables if they do not exist.
   These CREATE/ALTER statements are idempotent. No existing users or password
   data are deleted. You can inspect/run nalsafe-social-schema.sql in Neon as an
   optional manual preparation step; it is not required if startup completes.

First test
----------
1. Sign in as member A and open Chat & invite.
2. Set a username such as member_a.
3. Sign in as member B, set a different username, then return to member A.
4. Search the exact member B username and choose Invite to circle.
5. Sign in as member B, open Invitations and accept.
6. Return to member A and open Chats. Send a message. Sign in as B and verify
   the message appears and can be answered.
7. In Invitations, enter a name and email for an unregistered person. Confirm
   the configured mail service sends the email, or copy/share the invitation
   link if the existing invite endpoint reports email delivery is unavailable.

Important integration note
-------------------------
The shared source set did not include db.js or routes/users.js. To avoid
modifying an unknown existing check-in schema, this implementation stores
accepted username-based connections in nalsafe_social_connections and layers
those connections into the dashboard's member list. The direct-message and
invitation workflows use the new tables. Full integration with the existing
circle membership records and check-in visibility still needs to be aligned
with your actual db.js and routes/users.js. Until that integration is done,
do not assume these new social connections automatically receive all the
check-in permissions or circle-level notifications managed by the existing
user routes.

The chat uses short-interval polling rather than WebSockets. It is a first
working version; for a large commercial launch, consider a real-time messaging
transport, rate limits, abuse reporting/blocking, and a formal message-retention
policy before opening it to a large user base.
