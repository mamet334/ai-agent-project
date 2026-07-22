Catatan Perjalanan Teknis Mamet Ecosystem – Dari Awal Hingga Selesai
(Dokumen ini merangkum seluruh proses debugging, refactoring, dan perbaikan arsitektur yang dilakukan pada aplikasi Mamet OS, dimulai dari analisis kode hingga sistem berfungsi penuh dengan OpenRouter.)

1. Analisis Awal & Pemetaan Arsitektur
Proyek dimulai dengan memeriksa package.json, main.cjs, dan airdropEngine.cjs. Ditemukan bahwa aplikasi adalah Electron + React dengan backend berbasis Supabase Edge Function (Deno). Arsitektur inti terdiri dari Kernel MAEF (Kernel.js) yang mengatur service manager, BrainService, VaultService, dan ConversationEngine.jsx sebagai antarmuka chat. Alur data: user chat → ConversationEngine.jsx → fetch ke Supabase Edge Function agent-process → request_pipeline.ts → core_engine.ts → LLM eksternal.

2. Masalah Identitas & Rename Repositori
Awalnya repositori bernama ai-agent-project dan URL Vercel ai-agent-project-2a9h.vercel.app. Ini menyebabkan AI Tools (Cursor/Windsurf) menganggap proyek sebagai "AI Agent". Dilakukan rename:

· GitHub: ai-agent-project → mamet-os.
· Vercel: Project name diubah menjadi mamet-ecosystem dan mamet-ecosystem-backend.
· Folder lokal diganti menjadi mamet os ecosystem.
· Koneksi Git di Vercel diputus dan ditautkan ulang ke repositori baru.
· Domain baru: mamet-ecosystem.vercel.app dan mamet-ecosystem-backend.vercel.app.

3. Debugging OpenRouter & Hard Gate Gemini
Di request_pipeline.ts, terdapat hard gate if (!GEMINI_API_KEY) throw... yang memaksa backend harus memiliki key Gemini, padahal user ingin menggunakan OpenRouter. Solusi: hapus hard gate, sederhanakan rctx.keys hanya berisi openRouter, dan gunakan header x-byok-openrouter untuk menerima API key dari frontend.

4. Migrasi RAG ke Backend & Perbaikan Prompt AI
Awalnya RAG (retrieval) dilakukan di frontend via MemoryService dan dikirim sebagai globalMemory ke backend. Ini tidak efisien dan melanggar MAEF. Dipindahkan ke backend:

· Di request_pipeline.ts, tambahkan logic vector search menggunakan generateEmbeddingThroughAdapter() dan supabase.rpc('match_memories', ...).
· Prompt AI diperbarui dengan sistem 3 status: [STATUS: VERIFIED], [STATUS: HYPOTHESIS], [STATUS: INSUFFICIENT] sesuai Konstitusi MAEF.

5. Dashboard Activity Cluster & Refactoring
HomeDashboard.jsx (1300 baris) dipecah menjadi:

· hooks/useDashboardData.js – logika data dan pembuatan graph.
· components/dashboard/ActivityGraph.jsx – ForceGraph2D.
· components/dashboard/NodeInspector.jsx – panel detail node.
· components/dashboard/ObservabilityPanel.jsx – panel observability.
· HomeDashboard.jsx menjadi orchestrator (~140 baris).
· Ditambahkan pipeline nodes dinamis (supabase, auth, realtime, dll.) dan safeLink() untuk mencegah error node not found.

6. Perbaikan RLS & CORS
Tabel user_memories, documents, service_heartbeat mengembalikan error 400 karena RLS tidak mengizinkan user authenticated. Dijalankan policy FOR SELECT USING (auth.role() = 'authenticated').
CORS error pada fungsi ping diperbaiki dengan membuat file supabase/functions/ping/index.ts yang mengembalikan header CORS, lalu dideploy dengan supabase functions deploy ping --no-verify-jwt.

7. Perbaikan Crash Saat Drag Node
Error Cannot create property 'vx' on string 'subcat-agent-engineer' disebabkan oleh link yang mengacu ke node yang belum dibuat. Diperbaiki dengan arsitektur 3-fase:

· Fase 1: Kumpulkan semua ID subcluster.
· Fase 2: Push semua node (termasuk dynamic subclusters) sebelum link.
· Fase 3: Push semua link dengan safeLink().
· getNodeColor dan linkColor diberi fallback warna.

8. UI Settings – Provider Custom
Dropdown provider hardcode diganti dengan input teks bebas di Settings.jsx. Devin melakukan refactor: dropdown → <input type="text" /> dengan placeholder dan datalist opsional. Logika penyimpanan tetap melalui BrainService dan VaultService.

9. Backend Dinamis untuk Provider
request_pipeline.ts diubah agar membaca parsed.provider dari payload, bukan header hardcode. rctx.keys menjadi objek dinamis [provider]: apiKey. Fallback ke OpenRouter jika key tidak ditemukan. llm_orchestrator.ts dimodifikasi untuk hanya menggunakan satu adapter tanpa cascade.

10. Deploy Edge Function & Perbaikan OpenRouter
Ternyata Edge Function agent-process belum dideploy. Dijalankan supabase functions deploy agent-process --no-verify-jwt. Setelah deploy, muncul error mapping key openrouter vs openRouter. Diperbaiki di request_pipeline.ts. Juga, model meta-llama/llama-3.1-8b-instruct:free sudah dihapus OpenRouter, sehingga diubah ke meta-llama/llama-3.1-8b-instruct. Semua perubahan dideploy ulang dan dicommit ke GitHub (fix(openrouter): update llama-3.1 model slug...).

11. Pengujian Akhir
Setelah semua perbaikan, Test Connection di Settings berhasil (status 200). Chat dapat mengirim request ke OpenRouter, AI merespons, dan dashboard Activity Cluster menampilkan data real-time.

12. Kesimpulan
Mamet Ecosystem kini memiliki:

· DNS bersih (mamet-ecosystem.vercel.app).
· OpenRouter sebagai provider utama dengan dukungan provider custom.
· RAG backend yang efisien dan hemat token.
· Dashboard interaktif dan stabil.
· Arsitektur sesuai MAEF (Kernel-first, Vendor Independence, Knowledge First).
· Semua error kritis (RLS, CORS, drag crash, fallback cascade) telah diperbaiki.

Sistem siap digunakan dan dikembangkan lebih lanjut