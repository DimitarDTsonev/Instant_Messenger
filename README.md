# Instant Messenger

A fullstack real-time chat application built with TypeScript, React, Node.js, Express, Socket.io, and SQLite.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript, React 18, Vite, Socket.io-client |
| Backend | TypeScript, Node.js, Express, Socket.io |
| Database | SQLite via better-sqlite3 |
| Auth | JWT, bcrypt |
| Deployment | GitHub Pages (frontend), Render (backend) |

---

## Project Structure

```
instant-messenger/
|
|-- .github/
|   `-- workflows/
|       |-- ci.yml               CI: runs all tests on every push/PR
|       `-- deploy.yml           CD: deploys frontend to GitHub Pages, triggers Render backend deploy
|
|-- backend/
|   |-- server.ts                Entry point - Express app + Socket.io + middleware wiring
|   |-- jest.config.ts           Jest configuration for backend tests
|   |-- tsconfig.json            TypeScript compiler settings for backend build
|   |-- package.json
|   |-- .env.example             Template for required environment variables
|   |-- messenger.db             SQLite database file (auto-created on first run)
|   `-- src/
|       |-- db/
|       |   |-- database.ts      Database initialisation, schema migrations, getDb()
|       |   `-- seed.ts          Seeds demo channels and a guest user for development
|       |-- middleware/
|       |   |-- auth.ts          JWT verification middleware + signToken helper
|       |   `-- security.ts      IP ban, login-fail tracking, socket rate limiting, security event logging
|       |-- routes/
|       |   |-- auth.ts          POST /register, POST /login, GET /me, GET /users
|       |   |-- channels.ts      GET/POST/DELETE /channels, invite-link generation
|       |   |-- messages.ts      GET /messages/:channelId, GET /messages/search, POST /pin
|       |   |-- dm.ts            GET /dm/conversations, GET /dm/:partnerId, message history
|       |   |-- invites.ts       GET /invite/:code - resolves an invite link to a channel
|       |   |-- upload.ts        POST /upload - multipart file upload, serves /uploads/*
|       |   `-- admin.ts         GET /security-logs, POST /ban/:userId, POST /unban/:userId
|       |-- socket/
|       |   `-- handlers.ts      All Socket.io event handlers (channels, DMs, typing, reactions, pins)
|       `-- test-utils/
|           |-- createTestApp.ts Express app factory used by integration tests
|           `-- createTestDb.ts  In-memory SQLite factory + clearDb() for test isolation
|
|-- frontend/
|   |-- index.html               Vite HTML shell
|   |-- vite.config.ts           Vite config - base path, Vitest and coverage settings
|   |-- tsconfig.json            TypeScript settings for React/Vite
|   |-- package.json
|   |-- .env.example             Template for VITE_API_URL and VITE_SOCKET_URL
|   |-- .env.development         Local dev values
|   `-- src/
|       |-- main.tsx             React DOM root
|       |-- App.tsx              Top-level routing: Login / Chat / Invite
|       |-- index.css            Global dark-theme styles, mobile responsive rules, touch sheet styles
|       |-- config.ts            Reads VITE_* env vars and exports API_BASE, SOCKET_URL
|       |-- context/
|       |   |-- AuthContext.tsx  user, token, login(), logout() - persisted in localStorage
|       |   `-- SocketContext.tsx Socket.io connection, all emit helpers, real-time state
|       |-- hooks/
|       |   `-- useApi.ts        useChannels, useMessages, useDm, useSearch - REST data fetching
|       |-- pages/
|       |   |-- LoginPage.tsx    Login and registration forms
|       |   |-- ChatPage.tsx     Main chat layout - sidebar + topbar + chat area
|       |   `-- InvitePage.tsx   Handles /invite/:code links
|       |-- components/
|       |   |-- Sidebar.tsx      Channel list, DM list, online users, user profile
|       |   |-- ChatArea.tsx     Message list with grouping, reactions, file preview, touch sheet
|       |   |-- MessageInput.tsx Text input, file upload, reply bar, typing events
|       |   |-- MarkdownRenderer.tsx Inline markdown: bold, italic, code, links, mentions
|       |   |-- PinnedBanner.tsx Pinned message banner at top of channel view
|       |   |-- SearchModal.tsx  Full-text message search modal
|       |   |-- UserSearchModal.tsx User search + DM / profile actions
|       |   |-- ChannelSettingsModal.tsx Channel rename, invite link, member management
|       |   `-- UserProfileModal.tsx View any user's profile, avatar, role badge
|       `-- __tests__/           Vitest test suite mirroring the src/ folder structure
|
|-- uploads/                     Uploaded files served by the backend (auto-created)
|-- render.yaml                  Render.com service definition for the backend
`-- README.md
```

---

## Running Locally

### Prerequisites

- Node.js 22 or newer
- npm 9 or newer

---

### 1. Clone the repository

```bash
git clone https://github.com/DimitarDTsonev/Instant_Messenger.git
cd Instant_Messenger
```

---

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Open `.env` and fill in the values:

```
PORT=4000
JWT_SECRET=any-long-random-string-you-choose
FRONTEND_URL=http://localhost:5173
```

Seed the database with demo data (optional but recommended for first run):

```bash
npm run seed
```

Start the backend development server:

```bash
npm run dev
```

The backend runs on `http://localhost:4000`.

---

### 3. Set up the frontend

Open a second terminal tab:

```bash
cd frontend
npm install
```

Create a `.env.development` file from the template:

```bash
cp .env.example .env.development
```

Open `.env.development` and fill in the values:

```
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

Start the frontend development server:

```bash
npm run dev
```

The frontend runs on `http://localhost:5173`.

---

### 4. Open the app

Go to `http://localhost:5173` in your browser.

Register a new account, or log in with the seeded demo account:

| Email | Password |
|---|---|
| alice@demo.com | password123 |

---

### Running the tests

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm test
```

With coverage reports:

```bash
# backend
cd backend && npm run test:coverage

# frontend
cd frontend && npm run coverage
```

---

## Using the Live Site

The application is deployed and accessible without any local setup.

**Frontend:** `https://dimitardtsonev.github.io/Instant_Messenger/`

**Backend:** Hosted on Render's free tier. If the page appears unresponsive on first load, wait 20-30 seconds for the server to wake up. Render free instances spin down after 15 minutes of inactivity and take a moment to restart.

---

### Creating an account

1. Go to the frontend URL above.
2. Click the **Register** tab.
3. Enter a username, email, and password.
4. You are logged in automatically after registering.

---

### Channels

- The left sidebar lists all available channels.
- Click any channel to open it.
- Use the **+** button at the top of the channel list to create a new channel.
- Inside a channel, click the settings icon (top-right) to rename it, generate an invite link, or manage members.
- On mobile, tap the hamburger button (top-left) to open the sidebar.

---

### Direct Messages

- Click any username in the sidebar or use the user search icon to start a DM.
- Unread DM counts appear next to each conversation.

---

### Messages

- Type in the input bar at the bottom and press **Enter** to send.
- Use **Shift + Enter** for a new line.
- Markdown is supported: `**bold**`, `*italic*`, `` `code` ``, `~~strikethrough~~`, `[text](url)`.
- Attach a file using the paperclip button. Images preview inline; other files show a download card.
- Click any image or file attachment to open a full-screen preview.

---

### Message Actions (desktop)

Hover over any message to reveal the action toolbar:

| Button | Action |
|---|---|
| React | Opens an emoji picker to add or remove a reaction |
| Reply | Quotes the message in your next send |
| Pin | Pins the message to the top banner (admin or channel creator only) |
| Edit | Edit your own message inline |
| Delete | Delete your own message (asks for confirmation) |

---

### Message Actions (mobile)

Hold any message for half a second to open the action sheet from the bottom of the screen. The same actions are available: React, Reply, Pin, Edit, Delete.

---

### Invite Links

Inside channel settings, generate an invite link and share it. Anyone with the link can join that channel directly, even if they do not have an account yet.

---

## API Reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | No | Create a new account |
| POST | /api/auth/login | No | Log in, receive JWT |
| GET | /api/auth/me | Yes | Current user info |
| GET | /api/auth/users | Yes | All registered users |

### Channels

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/channels | Yes | List all channels |
| POST | /api/channels | Yes | Create a channel |
| DELETE | /api/channels/:id | Yes | Delete a channel (admin or creator) |
| POST | /api/channels/:id/invite | Yes | Generate an invite link |

### Messages

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/messages/:channelId | Yes | Paginated message history |
| GET | /api/messages/search?q= | Yes | Full-text message search |
| POST | /api/messages/:id/pin | Yes | Pin or unpin a message |

### Direct Messages

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/dm/conversations | Yes | All DM conversations for the current user |
| GET | /api/dm/:partnerId | Yes | Message history with a specific user |

### Uploads

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/upload | Yes | Upload a file (max 10 MB) |
| GET | /uploads/:filename | No | Serve an uploaded file |

### Invites

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/invite/:code | No | Resolve an invite code to channel info |
| POST | /api/invite/:code/join | Yes | Join the channel via invite code |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/admin/security-logs | Admin | List security events |
| POST | /api/admin/ban/:userId | Admin | Ban a user account |
| POST | /api/admin/unban/:userId | Admin | Unban a user account |

---

## Socket.io Events

| Event | Direction | Description |
|---|---|---|
| `channel:join` | Client to Server | Join a channel room |
| `message:send` | Client to Server | Send a channel message |
| `message:new` | Server to Client | New message broadcast |
| `message:edited` | Server to Client | Message was edited |
| `message:deleted` | Server to Client | Message was deleted |
| `message:reaction` | Server to Client | Reaction added or removed |
| `dm:send` | Client to Server | Send a direct message |
| `dm:new` | Server to Client | New DM received |
| `dm:edited` | Server to Client | DM was edited |
| `dm:deleted` | Server to Client | DM was deleted |
| `typing:start` | Client to Server | User started typing |
| `typing:stop` | Client to Server | User stopped typing |
| `typing:update` | Server to Client | Typing indicator state for a room |
| `users:online` | Server to Client | Updated list of online user IDs |
| `message:pinned` | Server to Client | Message was pinned or unpinned |
