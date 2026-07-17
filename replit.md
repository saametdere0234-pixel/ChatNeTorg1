# ChatNet

A real-time anonymous chat platform. Users register with a username and password, but appear in chat only as randomly assigned anonymous labels (e.g. `Anon#3847`). Features general server-wide chat and private friend DMs via 8-digit tokens.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/chatnet run dev` — run the frontend (port 18700)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.io 4 (real-time chat, typing indicators, seen receipts)
- Frontend: React + Vite, Tailwind CSS, Zustand, socket.io-client
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT tokens (stored in localStorage as `chatnet_token`), bcryptjs for password hashing
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB schema (users, messages, friendships, direct_messages)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/socket.ts` — Socket.io event handlers
- `artifacts/chatnet/src/store/` — Zustand stores (auth, socket)
- `artifacts/chatnet/src/hooks/` — React hooks (auth context, socket events)
- `artifacts/chatnet/src/pages/` — auth.tsx, chat.tsx, index.tsx

## Architecture decisions

- **Full anonymity**: usernames only used for login; `anonLabel` (Anon#XXXX) is used everywhere in chat
- **Friend tokens**: 8-digit format `xx.xx.xx.xx` (e.g. `12.34.56.78`), generated on register, unique per user
- **JWT auth**: token stored in localStorage, injected via `setAuthTokenGetter` from api-client-react
- **Socket.io path**: `/api/socket.io` (listed in artifact.toml paths alongside `/api` for proxy routing)
- **DM rooms**: deterministic room name `dm:<sortedUserIds>` so both users join the same room

## Product

- Register/login with @username + password
- All users anonymous in chat (Anon#XXXX labels only)
- General chat: server-wide public room
- Friends: add by 8-digit token (`xx.xx.xx.xx`), DM each friend
- Real-time: typing indicators, seen receipts, unread badges

## User preferences

_Populate as you build._

## Gotchas

- After OpenAPI spec changes, always run codegen before building
- Socket.io path `/api/socket.io` must be listed in API server's `artifact.toml` `paths` array
- JSX text containing literal `>` must be escaped as `{'>'}` 
- The `use-socket-events.ts` hook imports from `../store/use-socket` (not `./use-socket`)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
