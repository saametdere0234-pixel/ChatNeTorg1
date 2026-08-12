# Vercel publishing

ChatNet's Vite frontend can be published on Vercel from the repository root.

## Vercel project settings

- Framework preset: **Vite**
- Root directory: repository root
- Build command: `pnpm --filter @workspace/chatnet run build`
- Output directory: `artifacts/chatnet/dist/public`
- Install command: `pnpm install --frozen-lockfile`

The included `vercel.json` supplies these settings and the SPA fallback for
`/auth` and `/chat`.

## API and realtime server

The Express API and Socket.io server need a persistent Node host. Vercel's
static hosting does not keep a WebSocket server running. Set the Vercel
environment variable below to the public origin of that API server:

```text
VITE_API_URL=https://your-api-server.example.com
```

Use the origin only; do not append `/api`. The frontend already sends requests
to `/api/...` and opens Socket.io at `/api/socket.io`.

The API server must have `DATABASE_URL` and `SESSION_SECRET` configured, and
its public origin must allow requests from the Vercel domain.