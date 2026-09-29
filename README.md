# Nexi website prototype

This is a responsive, dependency-free front-end MVP built from the supplied Nexi proposal. It includes:

- a public landing page with responsive navigation and dark-theme preference
- separate user and admin dashboard prototypes with different role-specific workflows
- a local demo registration and sign-in flow that opens the user dashboard
- interactive family check-in and support-flow demos
- a filterable sample service finder
- accessible FAQ accordions
- an early-access form with local validation and browser-only persistence

## Run locally

Open `index.html` directly in a browser, or serve the folder locally:

```powershell
python -m http.server 4173 --directory .
```

Then visit `http://localhost:4173`.

The user sign-in and registration screen is `login.html`. The admin entry page is `admin.html`. The role dashboards are available at `user-dashboard.html` and `admin-dashboard.html`.

## Important prototype boundaries

The login, dashboards, support flow, service directory, and waitlist are interactive front-end demonstrations. The login flow stores a salted password hash in local browser storage, but it is **not secure production authentication** and provides no server-side authentication or authorization. These pages do not send messages or invitations, contact emergency services, save data remotely, process payments, or expose real service listings. Demo state is stored in the current browser only.

Before a production launch, connect the waitlist to a consented server-side endpoint, then implement authentication, groups/permissions, notifications, audit trails, data deletion/export, and carefully moderated safety workflows. Do not treat the secret-emoji concept as authentication.
