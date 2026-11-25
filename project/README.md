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

## Namecheap cPanel deployment

The `black-coffee-namecheap-cpanel.zip` archive contains the production client
build and Node.js API. It does not contain `node_modules`, the local database,
uploaded photos, or `.env`.

1. In cPanel, create an app in **Setup Node.js App**. Choose Node.js 24 if it is
   available on your server, set the mode to **Production**, use a domain or
   subdomain root as the application URL, and set `server.js` as the startup
   file.
2. Upload the ZIP and extract its contents directly into the application root
   so `server.js`, `package.json`, and `client/dist` are at the expected paths.
3. Add `NODE_ENV=production` in the app's environment variables. Do not set
   `PORT`; cPanel supplies it.
4. Install production dependencies in the app environment with
   `npm install --omit=dev`, then restart the app.
5. Ensure the application root is writable. The app creates `database.db` and
   `uploads` there. Enable HTTPS before printing cards so QR scans open the
   deployed site.

The QR scan page makes each guest's name and email public to anyone with that
guest's QR URL. The archive starts with an empty database; migrate existing
guest data and photos separately only if you intend to move them to production.

Namecheap's [Node.js App guide](https://www.namecheap.com/support/knowledgebase/article.aspx/10047/2182/how-to-work-with-nodejs-app/)
documents the cPanel application setup. The available Node.js versions can
vary by server.
