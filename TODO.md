# TODO: Fix PostgREST 42703 di Dashboard

## Steps
- [x] 1. Analisis error dari network log user (3 query gagal)
- [x] 2. Scan seluruh `frontend/src/` untuk kolom bermasalah
- [x] 3. Edit HomeDashboard.jsx:
  - [x] 3a. `user_memories`: hapus `causal_links`, `metadata` → pakai `id, summary, created_at, memory_hits`
  - [x] 3b. `documents`: hapus `metadata` → pakai `id, title, created_at`
  - [x] 3c. `service_heartbeat`: sudah benar (pakai `status, last_heartbeat_at`)
  - [x] 3d. Fix missing comma setelah `.limit(500)` (syntax error)
- [x] 4. Cek file lain di frontend — tidak ada yang pakai kolom bermasalah
- [ ] 5. **User action**: git add, commit, push, hard refresh browser

