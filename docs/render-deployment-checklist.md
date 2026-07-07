# Render Deployment Checklist

Use this checklist to take Life Timeline Tracker from local development to a first live public deployment on Render.

## 1. Push The Project

- Put this project in a GitHub repository.
- Make sure these files are included:
  - `render.yaml`
  - `package.json`
  - `package-lock.json`
  - `.env.example`

## 2. Create The Render Service

- Log in to Render.
- Click `New +`.
- Choose `Blueprint` if you want Render to read `render.yaml`.
- Connect the GitHub repository.
- Confirm the service name is `life-timeline-tracker` or rename it if you want.

## 3. Confirm Persistent Storage

This app needs persistent storage because it uses:

- SQLite for the database
- local file storage for uploads
- local outbox storage if email preview mode is used

Render disk settings should match:

- mount path: `/opt/render/project-data`
- disk size: `1 GB` or more

## 4. Set Production Environment Variables

Required:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `APP_BASE_URL=https://your-service-name.onrender.com`
- `DB_PATH=/opt/render/project-data/app.sqlite`
- `UPLOAD_DIR=/opt/render/project-data/uploads`
- `EMAIL_OUTBOX_DIR=/opt/render/project-data/email-outbox`

Recommended:

- `SESSION_MAX_AGE_SECONDS=604800`
- `EMAIL_VERIFICATION_TTL_HOURS=24`
- `AUTH_RATE_LIMIT_WINDOW_MS=60000`
- `AUTH_RATE_LIMIT_MAX=30`
- `MAX_UPLOAD_BYTES=2097152`

Email for live use:

- `EMAIL_MODE=smtp`
- `EMAIL_FROM=your-real-sender@example.com`
- `SMTP_HOST=your-smtp-host`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=your-smtp-user`
- `SMTP_PASS=your-smtp-password`

## 5. Deploy

- Start the deploy in Render.
- Wait until the deploy finishes.
- Open the live site URL.

## 6. Smoke Test After Deploy

Run these in order:

1. Open `/health`
2. Open the homepage
3. Sign up with a real email
4. Verify email
5. Log in
6. Create a record
7. Upload a document
8. Refresh the page and confirm the session still works
9. Log out and log back in

## 7. Before Sharing Publicly

- Confirm reset emails are delivered from SMTP
- Confirm verification emails are delivered from SMTP
- Confirm uploads still work after a fresh deploy
- Confirm `APP_BASE_URL` matches the final public URL
- Confirm cookies are secure in production

## 8. To Show On Google Later

Deployment alone does not make it appear in Google search immediately.

After the site is live, the next steps are:

- add a real custom domain
- add basic SEO metadata
- add a sitemap
- register the site in Google Search Console
- request indexing
