# 💬 Instant Messenger — Прототип

Fullstack приложение за реалновременен чат, изградено с:
- **Frontend**: React 18 + Vite + Socket.io-client
- **Backend**: Node.js + Express + Socket.io
- **База данни**: SQLite (чрез better-sqlite3)
- **Автентикация**: JWT + bcrypt

---

## 📁 Структура на проекта

```
instant-messenger/
│
├── backend/                         # Node.js сървър
│   ├── server.js                    ← Входна точка (Express + Socket.io)
│   ├── package.json
│   └── src/
│       ├── db/
│       │   ├── database.js          ← Инициализация и схема на SQLite
│       │   └── seed.js              ← Начални тестови данни
│       ├── middleware/
│       │   └── auth.js              ← JWT проверка
│       ├── routes/
│       │   ├── auth.js              ← POST /register, POST /login, GET /me
│       │   ├── channels.js          ← GET/POST/DELETE /channels
│       │   └── messages.js          ← GET /messages/:id, GET /search
│       └── socket/
│           └── handlers.js          ← channel:join, message:send, typing
│
└── frontend/                        # React приложение
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx                 ← React DOM root
        ├── App.jsx                  ← Routing: Login ↔ Chat
        ├── index.css                ← Глобални стилове
        ├── context/
        │   ├── AuthContext.jsx      ← user, token, login(), logout()
        │   └── SocketContext.jsx    ← Socket.io връзка и методи
        ├── hooks/
        │   └── useApi.js            ← useChannels, useMessages, useSearch
        ├── pages/
        │   ├── LoginPage.jsx        ← Форма за вход / регистрация
        │   └── ChatPage.jsx         ← Главна страница на чата
        └── components/
            ├── Sidebar.jsx          ← Канали + потребители (ляв панел)
            ├── ChatArea.jsx         ← Списък с съобщения
            ├── MessageInput.jsx     ← Поле за въвеждане
            └── SearchModal.jsx      ← Модален прозорец за търсене
```

---

## 🚀 Стартиране

### 1. Бекенд

```bash
cd backend
npm install
npm run seed        # Създава базата данни с тестови данни
npm run dev         # Стартира на http://localhost:4000
```

### 2. Фронтенд

```bash
cd frontend
npm install
npm run dev         # Стартира на http://localhost:5173
```

### 3. Отвори http://localhost:5173

**Демо акаунти** (парола: `password123`):
| Email | Потребител |
|-------|-----------|
| alice@demo.com | alice |
| bob@demo.com | bob |
| charlie@demo.com | charlie |
| diana@demo.com | diana |

---

## 🔌 API Endpoints

| Метод | URL | Описание | Auth |
|-------|-----|----------|------|
| POST | /api/auth/register | Регистрация | ❌ |
| POST | /api/auth/login | Вход | ❌ |
| GET | /api/auth/me | Текущ потребител | ✅ |
| GET | /api/auth/users | Всички потребители | ✅ |
| GET | /api/channels | Списък с канали | ✅ |
| POST | /api/channels | Нов канал | ✅ |
| DELETE | /api/channels/:id | Изтрий канал | ✅ |
| GET | /api/messages/:channelId | История | ✅ |
| GET | /api/messages/:channelId/search?q= | Търсене | ✅ |

---

## ⚡ Socket.io Events

| Event | Посока | Описание |
|-------|--------|----------|
| `channel:join` | C → S | Влизане в канал |
| `message:send` | C → S | Изпращане на съобщение |
| `message:new` | S → C | Ново съобщение |
| `typing:start` | C → S | Започва писане |
| `typing:stop` | C → S | Спира писане |
| `typing:update` | S → C | Обновяване на typing indicator |
| `users:online` | S → C | Обновен списък с онлайн потребители |

---

## 💡 Какво може да се добави

- [ ] Private съобщения между потребители
- [ ] Emoji реакции към съобщения  
- [ ] File upload в канали
- [ ] Push notifications
- [ ] User status (online/away/busy)
- [ ] Message threading (replies)
- [ ] Read receipts
- [ ] Pagination с infinite scroll
- [ ] Dark/Light тема
- [ ] Mobile responsive дизайн
