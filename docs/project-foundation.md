# Project Foundation

## Product Name

Life Timeline Tracker

## Problem

People often need to prove parts of their life history for jobs, immigration, education, certifications, and personal administration. That information is usually scattered across email, cloud folders, resumes, spreadsheets, and memory. This creates stress, missed deadlines, and incomplete records.

## Target Users

- International students managing education and visa milestones
- Professionals tracking work history and verification documents
- Job seekers maintaining project and certification evidence
- Freelancers and founders organizing business and personal milestones

## Why Users Would Choose This Product

- One place to store structured life events
- Searchable records instead of scattered documents
- Reminder support for expiring items
- Cleaner verification summary for interviews, onboarding, and immigration workflows

## Core Value Proposition

Store your full life timeline in one organized system so you can quickly retrieve proof, history, and deadlines whenever needed.

## Business Direction

Possible monetization paths for later stages:

- Free personal tier with limited records
- Paid premium tier for unlimited records and advanced exports
- Family plan for shared household record management
- Professional tier for consultants helping clients manage compliance or documentation

## MVP Definition

The current MVP should let one user:

- Create an account
- Log in securely
- Add structured timeline records
- Attach document references
- Search and filter records
- Track reminders
- View a summary report

## Must-Have Features

- User registration
- Login and logout
- Personal dashboard
- Timeline record CRUD
- Category and subtype organization
- Search and filters
- Reminder tracking
- Basic reporting
- Protected API access per user

## Good-to-Have Features

- File uploads instead of document links
- Email reminders
- Password reset
- Email verification
- Export to PDF
- Admin dashboard
- Multi-device sync
- Role-based access
- OCR/document scanning

## Key Screens

- Landing page
- Sign up
- Login
- Dashboard
- Add/edit record form
- Timeline list
- Reports view
- Empty states
- Error states

## User Journey

1. User lands on the homepage and understands the product value.
2. User creates an account or logs in.
3. User loads sample data or creates their first real record.
4. User explores dashboard stats and reminders.
5. User searches or filters records when specific proof is needed.
6. User opens the report view to summarize readiness.

## Current Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js
- Data store: JSON file
- Authentication: cookie-based session tracking

## Production Upgrade Path

### Phase 1

- Clean repo structure
- Add `package.json`
- Improve form and API validation
- Add `.env` support
- Add tests

### Phase 2

- Move to Express.js
- Move from `db.json` to PostgreSQL or MongoDB
- Add persistent session store
- Add file upload support

### Phase 3

- Add email flows, exports, alerts, and cloud deployment
- Add monitoring, backups, and CI/CD
- Harden security and rate limiting

## Immediate Priorities

1. Standardize project setup and documentation.
2. Verify current auth and record flows work end to end.
3. Decide whether to keep the plain JavaScript stack or migrate to React/Next.js later.
4. Add missing security and testing before any public launch.
