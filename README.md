# TruckMatch API (Express Backend)

Authentication and MongoDB backend, separate from Next.js.

## Setup

1. Create `backend/.env` (copy from project root `.env` or `.env.example`):
   - `MONGO_URI` – MongoDB connection string
   - `JWT_SECRET` – secret for JWT signing
   - `PORT` – API port (default 4000)

2. Install dependencies:
   ```bash
   cd backend && npm install
   ```

3. Run:
   ```bash
   npm run dev
   ```

## Endpoints

- `POST /auth/login` – login
- `POST /auth/register` – register
- `POST /auth/refresh` – refresh token
- `GET /auth/me` – current user
- `POST /auth/logout` – logout
- `GET /auth/db-check` – verify MongoDB (http://localhost:4000/auth/db-check)

## Running both apps

1. Terminal 1: `npm run dev` (Next.js on 3000)
2. Terminal 2: `cd backend && npm run dev` (API on 4000)

Next.js proxies `/api/auth/*` to the Express backend.
