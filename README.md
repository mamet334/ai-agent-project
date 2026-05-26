# 🤖 AI Agent - Multi-Tool Integration Platform

Aplikasi AI Agent dengan integrasi tools, berjalan di web & API backend.

## 📋 Quick Start

### 1. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend (tab/terminal baru)
cd backend
npm install
```

### 2. Setup Environment

```bash
# Copy .env di backend folder
cp .env.example .env

# Edit .env dan masukkan API key Anda
# ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 3. Run Project

```bash
# Terminal 1 - Frontend
cd frontend
npm run dev
# Buka http://localhost:5173

# Terminal 2 - Backend
cd backend
npm start
# Server running di http://localhost:3000
```

## 📁 Folder Structure

```
ai-agent-complete/
├── frontend/                 # React App
│   ├── src/
│   │   ├── components/
│   │   │   └── AIAgent.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/                  # Node.js Server
│   ├── server.js
│   ├── tools-config.js
│   ├── package.json
│   └── .env.example
│
└── docs/                     # Documentation
    └── ARCHITECTURE.md
```

## 🛠️ Tools Available

- Web Search
- Code Executor
- API Caller
- Slack Integration
- Database Queries
- Email Sender
- File System
- Custom APIs

## 📚 Documentation

- `README.md` - Project overview
- `QUICK-START-GUIDE.md` - Detailed setup
- `docs/ARCHITECTURE.md` - Technical details

## 🚀 Next Steps

1. Run `npm install` di frontend & backend
2. Setup `.env` dengan API keys
3. Start frontend & backend
4. Open browser & test

## 💡 Tips

- Buka project di Claude Desktop untuk bantuan
- Gunakan Claude Code untuk development
- Check docs untuk detil lebih lanjut

Happy Coding! 🎉
