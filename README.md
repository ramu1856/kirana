# Life Timeline Tracker

Life Timeline Tracker is a lightweight web application for storing important personal history in one place. Users can create an account, verify their email, log in, save timeline records, attach document references, track reminders, and generate a simple readiness report.

## What Is In This Repo

- `index.html` - main UI
- `style.css` - visual styling
- `script.js` - frontend logic and API calls
- `server.js` - Node.js HTTP server and API routes
- `data/app.sqlite` - local SQLite database created at runtime
- `db.json` - legacy JSON data source used for one-time import
- `docs/project-foundation.md` - product direction and launch plan

## Current Features

- Account sign up, login, logout
- Email verification for new accounts
- Password reset with time-limited reset tokens
- Password reset link generation with local email outbox fallback
- Local document upload support for timeline records
- Uploaded document preview links and file removal for managed uploads
- Separate records for each user
- Timeline record create, edit, delete
- Search and filtering
- Reminder summary
- Report summary view
- Demo data loading and reset

## Run Locally

### Requirements

- Node.js 18 or newer

### Start

```bash
npm start
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

### Run Tests

```bash
npm test
```

The test suite uses Node's built-in test runner and starts the server against an isolated temporary database.

### Health Check

Use this endpoint after deployment:

```bash
GET /health
```

It returns a small JSON response when the app is up.

### Optional Configuration

Create a local `.env` in your shell environment or set these before starting:

- `HOST` - server host, default `127.0.0.1`
- `PORT` - server port, default `4173`
- `DB_PATH` - SQLite file path, default `./data/app.sqlite`
- `LEGACY_DB_PATH` - optional JSON import source, default `./db.json`
- `UPLOAD_DIR` - local upload directory, default `./uploads`
- `MAX_UPLOAD_BYTES` - per-file upload limit in bytes, default `2097152`
- `APP_BASE_URL` - public app URL used in reset links, default `http://127.0.0.1:4173`
- `EMAIL_MODE` - email delivery mode, default `dev-log`
- `EMAIL_OUTBOX_DIR` - local folder for saved email previews, default `./data/email-outbox`
- `EMAIL_FROM` - sender address for outgoing emails
- `SMTP_HOST` - SMTP server host when `EMAIL_MODE=smtp`
- `SMTP_PORT` - SMTP server port when `EMAIL_MODE=smtp`
- `SMTP_SECURE` - set to `true` for implicit TLS, defaults to `true` on port `465`
- `SMTP_USER` - SMTP username when authentication is required
- `SMTP_PASS` - SMTP password when authentication is required
- `EMAIL_VERIFICATION_TTL_HOURS` - verification link lifetime in hours, default `24`
- `AUTH_RATE_LIMIT_WINDOW_MS` - auth rate-limit window in milliseconds, default `60000`
- `AUTH_RATE_LIMIT_MAX` - maximum auth requests per client per auth route in each window, default `30`
- `SESSION_MAX_AGE_SECONDS` - session lifetime, default `604800`
- `NODE_ENV` - set to `production` to mark cookies as `Secure`

## Deploy To Render

This repo now includes [render.yaml](./render.yaml) for a first production deploy with persistent storage for SQLite and uploads.

Use the full step-by-step checklist here:

- [Render Deployment Checklist](./docs/render-deployment-checklist.md)

### What Render Needs

- A web service using `node server.js`
- A persistent disk mounted at `/opt/render/project-data`
- Environment variables for app URL and email delivery

### Important Production Variables

- `NODE_ENV=production`
- `APP_BASE_URL=https://your-domain.onrender.com`
- `DB_PATH=/opt/render/project-data/app.sqlite`
- `UPLOAD_DIR=/opt/render/project-data/uploads`
- `EMAIL_OUTBOX_DIR=/opt/render/project-data/email-outbox`
- `EMAIL_MODE=smtp` for real email delivery
- `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_SECURE`

### First Live Check

After deploy:

1. Open `/health`
2. Create an account
3. Verify email flow works
4. Login and create a record
5. Upload a document

### Google / SEO Prep

This repo now includes:

- `robots.txt`
- `sitemap.xml`
- `site.webmanifest`
- base Open Graph and Twitter metadata in `index.html`

Before public launch, replace `https://your-app.onrender.com` inside `sitemap.xml` and `robots.txt` with the final live domain.

## Current Architecture

- Frontend: plain HTML, CSS, JavaScript
- Backend: Node.js built-in `http` module
- Storage: SQLite-backed store module in `lib/sqlite-store.js`
- Auth: SQLite-backed session storage with email verification gating and CSRF protection on authenticated writes

## Backend Structure

- `server.js` handles routing, validation, auth, and HTTP responses
- `lib/sqlite-store.js` isolates persistence operations behind a storage interface
- `lib/sqlite-store.js` now also stores persistent user sessions and per-session CSRF tokens
- `lib/migrations.js` applies schema changes in versioned steps
- `services/auth-service.js` contains signup, login, email verification, and password reset logic
- `services/email-service.js` provides email delivery with a local outbox fallback
- `services/email-service.js` provides `dev-log`, `disabled`, and SMTP-backed email delivery modes
- `services/record-service.js` contains record validation and record workflows
- `services/upload-service.js` stores uploaded documents in local user folders
- `services/upload-service.js` stores and deletes uploaded documents in local user folders
- `tests/api.test.js` verifies auth and record API flows end to end

## Notes

- This is currently a prototype architecture meant for local use and early validation.
- Sessions now persist across server restarts and still expire automatically based on `SESSION_MAX_AGE_SECONDS`.
- Data is now stored locally in SQLite, and the app can import legacy JSON data from `db.json` on first run.
- In non-production mode, email verification and password reset responses still include raw tokens so local development stays usable even when SMTP is not configured.
- Basic request validation and security response headers are now in place, but this is still not a full production security model.
- Auth endpoints now have per-client, per-route rate limiting for signup, login, verification, and password reset flows.
- Authenticated write routes now require a session-bound CSRF token via the `X-CSRF-Token` header.
- The repo now includes deployment-ready health checks and Render hosting config for a first public release.
- The repo now includes basic SEO/indexing assets for post-deploy Google setup.

## Suggested Next Build Steps

1. Move configuration into environment variables.
2. Add validation helpers and stronger error handling.
3. Add schema migrations and prepare for a hosted production database.
4. Add password reset and email verification.
5. Add tests for API and record workflows.
6. Prepare deployment and monitoring.
