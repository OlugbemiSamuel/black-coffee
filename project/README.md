# Black Coffee Guest Registration

## Local development

Requires Node.js 22.9 or newer.

1. Copy `.env.example` to `.env` if `.env` does not already exist.
2. Install dependencies with `npm install` and `npm --prefix client install`.
3. Run `npm run dev` from the project root.

The command starts the API on port 3000 and Vite on port 5173. Open
`http://localhost:5173/` for guest registration or
`http://localhost:5173/admin` for the admin panel.

If an older API process is already using port 3000, stop it before starting the
development command so the updated API routes can load.
