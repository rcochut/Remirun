# Remirun Local Dashboard

A simple local-only, read-only dashboard for the **Marathon prep** Google Sheet.

## What this V1 does

- Reads data from Google Sheets (`Data`, `Planning`, `Param` tabs).
- Exposes a local API endpoint at `/api/dashboard`.
- Displays a dark, premium-style running dashboard at `http://localhost:3000`.
- **No write-back**, no auth UI, no editing.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Add Google service account credentials to `.env`.
4. Share the Google Sheet with the service account email (Viewer).
5. Start app:
   ```bash
   npm start
   ```

## API

- `GET /api/dashboard`
  - profile (runner settings from `Param`)
  - planning (upcoming sessions and planned distances from `Planning`)
  - activity (recent runs from `Data`)

## Notes

- The source of truth remains the Google Sheet.
- This app intentionally focuses on display only.
