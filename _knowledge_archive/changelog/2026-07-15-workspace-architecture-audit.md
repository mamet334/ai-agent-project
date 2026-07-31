# 2026-07-15: Workspace Architecture Audit

**Status:** AUDIT COMPLETE (No Code Modified)
**Target:** Enforce Single Identity (Supabase Auth) & Strict 3-Workspace Limit (ws-lite, ws-assistant, ws-engineer)

## 1. Audit Metadata (`workspace.json`)
Berdasarkan inspeksi struktural, `workspace.json` berfungsi ganda merepresentasikan **AI Runtime Workspace** sekaligus **UI Desktop Workspace**. 

**Mengapa digabungkan?**
Sesuai dengan **UI Constitution (MUS - Metadata-Driven UI Specification)** dan filosofi **Tenant Isolation**, UI dalam ekosistem Mamet bukanlah antarmuka statis yang berdiri sendiri. UI adalah pantulan langsung (*direct reflection*) dari kapabilitas *Runtime*.
Penggabungan ini memastikan **Kedaulatan Tata Letak (Layout Sovereignty)** berada di luar *bundle* kompilasi React. Ini menjamin bahwa sebuah *Workspace* (seperti `ws-engineer`) tidak akan pernah me-render *widget* yang kapabilitasnya tidak diizinkan oleh sistem, sehingga mencegah kebocoran konteks (*context bleed*) antar profil pengguna.

**Dependency Tree Metadata:**
- `workspace.json` dibaca oleh `MetadataService.js` (Kernel Bootstrap).
- `workspaceId` digunakan oleh `WorkspaceManager.js` dan backend `routing_decider.ts`.
- `capabilities` digunakan oleh `NavigationService.js` dan `ConversationEngine.jsx` untuk kontrol fitur.
- `permissions` digunakan oleh `WorkspaceManager.js` untuk mengontrol batas memori (*Memory Boundary*).
- `default_layout` digunakan untuk me-render kisi UI dinamis di `AppShell.jsx` & `WorkbenchZone`.

## 2. Audit Konsep Legacy (ws-owner & ws-agent-forge)
Pemindaian menunjukkan sisa arsitektur legacy masih aktif di repositori:
1. **Frontend Components (React)**: `frontend/src/components/widgets/WorkspaceNavWidget.jsx` masih menggunakan `ws-owner` sebagai default dan filter eksplisit.
2. **Metadata Registry**: `frontend/public/metadata/workspace.json` masih mendefinisikan `"id": "ws-owner"` dan `"id": "ws-agent-forge"`.
3. **Dokumentasi**: Masih ada beberapa referensi *Owner Workspace* di konstitusi dan dokumen arsitektur historis.

## 3. Peta Ketergantungan (3 Workspace Resmi)
Identitas tunggal berasal dari Supabase Auth (`user_id`). `routing_decider.ts` menerima ID dan merutekan ke salah satu profil resmi:
1. **`ws-lite`**: Memuat `app:mametlite`, `cap:lite`, Read-Only Global Memory.
2. **`ws-assistant`**: Memuat `app:assistant`, `cap:core-apps`, Read/Write Global Memory.
3. **`ws-engineer`**: Memuat `app:engineer`, `cap:engineer`, Strict Isolated Memory.
*(Catatan: Aplikasi seperti Agent Forge, Memory, dan Settings berfungsi sebagai entitas Dashboard/Desktop App, BUKAN workspace AI mandiri).*

## 4. Risiko Kerusakan (*Breaking Risk*)
Menghapus blok `ws-owner` dari `workspace.json` secara instan akan merusak (Crash) komponen UI `WorkspaceNavWidget.jsx` ketika pengguna memuat `app:assistant` akibat adanya logika filter absolut `workspaces = workspaces.filter(w => w.id === 'ws-owner');`.

## 5. Rencana Migrasi Minimum Risk
**Fase 1: Code Refactor (Aman)**
- Edit `WorkspaceNavWidget.jsx`: Ubah default fallback, label nama, parameter tipe `OWNER`, dan logika filter menjadi `ws-assistant`.

**Fase 2: Metadata Registry Purge**
- Edit `workspace.json`: Hapus secara permanen definisi blok `ws-owner` dan `ws-agent-forge`.
- Pastikan blok `ws-assistant` (jika belum utuh) dimasukkan dengan izin `allow_global_memory: true`.
- Bersihkan `app:agent-forge` dari daftar `appToCapability` jika tidak digunakan lagi di level registry ini.

**Fase 3 & 4: Verifikasi & Dokumen**
- Pastikan logika `routing_decider.ts` yang memblokir workspace invalid sudah berjalan dan stabil (otomatis fallback ke `ws-assistant`).
- Amandemen referensi istilah *Owner Workspace* di dalam Konstitusi dan file arsitektur menjadi *Assistant Workspace*.
