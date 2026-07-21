# TODO: Fix PostgREST 42703 di Dashboard

## Steps
- [x] 1. Analisis error dari network log user (3 query gagal)
- [x] 2. Scan seluruh `frontend/src/` untuk kolom bermasalah
- [x] 3. Edit HomeDashboard.jsx:
  - [x] 3a. `user_memories`: hilangkan `causal_links`, **tapi pertahankan `metadata`** → `id, summary, created_at, memory_hits, metadata`
  - [x] 3b. `documents`: hilangkan `metadata` → `id, title, created_at`
  - [x] 3c. `service_heartbeat`: sudah benar `status, last_heartbeat_at` (tanpa `last_seen`)
  - [x] 3d. Fix missing comma (syntax error yang bikin 500)
- [x] 4. Cek file lain — tidak ada yang pakai kolom bermasalah
- [ ] 5. **User action**: git add, commit, push, hard refresh browser
