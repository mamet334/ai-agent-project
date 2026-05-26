# 🚀 AI Agent - Quick Start Guide

Setup & jalankan AI Agent dalam 5 menit!

## ✅ Prerequisites

- Node.js >= 16 (download dari nodejs.org)
- npm (included dengan Node.js)
- API key dari Anthropic (free di console.anthropic.com)

---

## 📋 Step-by-Step Setup

### Step 1: Extract ZIP ke Folder

```bash
# Extract ai-agent-complete.zip
# Buka folder ai-agent-complete di terminal
cd ai-agent-complete
```

### Step 2: Install Frontend Dependencies

```bash
cd frontend
npm install
```

**Tunggu sampai selesai** (mungkin 2-3 menit)

### Step 3: Install Backend Dependencies

```bash
# Terminal baru / tab baru
cd backend
npm install
```

**Tunggu sampai selesai**

### Step 4: Setup Environment Variables

```bash
# Di folder backend/
# File .env sudah ada, cukup edit:

# Buka .env dengan editor (VS Code, Notepad, dll)
# Cari: ANTHROPIC_API_KEY=your_api_key_here
# Ganti dengan API key Anda dari console.anthropic.com
```

**Cara dapat API key gratis:**
1. Buka https://console.anthropic.com
2. Sign up (gratis)
3. Buat API key (gratis)
4. Copy-paste ke .env

### Step 5: Run Frontend

```bash
# Di folder frontend/
npm run dev
```

Harusnya terlihat:
```
  ➜  Local:   http://localhost:5173/
```

✅ Buka browser ke http://localhost:5173

### Step 6: Run Backend (Terminal Baru)

```bash
# Di folder backend/
npm start
```

Harusnya terlihat:
```
╔═══════════════════════════════════════╗
║  🤖 AI Agent Backend Started!         ║
║  Server: http://localhost:3000        ║
╚═══════════════════════════════════════╝
```

---

## 🎉 Selesai!

Sekarang Anda punya:
- ✅ Frontend running di http://localhost:5173
- ✅ Backend running di http://localhost:3000
- ✅ AI Agent siap digunakan!

---

## 🆘 Troubleshooting

### "npm: command not found"
```bash
# Install Node.js dari: https://nodejs.org
# Restart terminal setelah install
```

### "Port 3000 already in use"
```bash
# Buka backend/.env
# Ubah PORT=3000 menjadi PORT=3001
# Edit CORS_ORIGIN jika perlu
```

### "Cannot find module"
```bash
# Di folder yang error (frontend atau backend):
npm install
# Atau:
npm install --legacy-peer-deps
```

### "API Key error"
```bash
# Pastikan di backend/.env:
ANTHROPIC_API_KEY=sk-ant-xxxxx
# (ganti xxxxx dengan key real)
```

---

## 📁 Folder Structure

```
ai-agent-complete/
├── frontend/        → npm run dev → http://localhost:5173
├── backend/         → npm start → http://localhost:3000
├── docs/            → Documentation
└── README.md        → Project overview
```

---

## 🚀 Development Mode

Untuk auto-reload saat edit code:

```bash
# Di frontend/ (ganti npm run dev dengan:)
npm install -D vite
npm run dev

# Di backend/ (ganti npm start dengan:)
npm install -D nodemon
npm run dev
```

---

## 📚 Next Steps

1. ✅ Setup selesai
2. 📖 Baca `/docs/ARCHITECTURE.md` untuk detil teknis
3. 🛠️ Customize tools di `backend/tools-config.js`
4. 💻 Edit `frontend/src/components/AIAgent.jsx` untuk UI
5. 🚀 Deploy ke production

---

## 🎯 API Endpoints

- `GET /api/health` - Check server status
- `GET /api/tools` - Daftar tools tersedia
- `POST /api/agent/process` - Process message dengan agent

---

## 💡 Tips

- Buka project di Claude Desktop untuk bantuan code
- Gunakan Claude Code extension untuk debugging
- Check console.anthropic.com untuk API usage

---

Happy Coding! 🎉
