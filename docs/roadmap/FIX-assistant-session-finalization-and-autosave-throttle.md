# Implementation Plan: Assistant Session Finalization & Auto-Save Throttling

Perbaikan pemanggilan redundan `finalizeAssistantSession()` (5x per chat) dan pencegahan race condition pada `MemoryGovernorService`.

**Status:** ✅ Selesai & Tervalidasi (Confirmed Desktop + Unit Test — 2026-09-03)  
**Tipe:** Architecture Decoupling & Concurrency Hardening  
**Target:** `frontend/src/core/runtime/services/AssistantService.js` & `frontend/src/components/workbench/ConversationEngine.jsx`

---

## 1. Latar Belakang & Gejala

Pada pengujian live runtime, tercatat log:
`[AssistantService] Sesi Assistant difinalisasi: {status: 'NO_MEMORIES', ...}`
tercetak **5 kali dari 1 kali interaksi chat**.  
Jika pada sesi tersebut terdapat data memori aktif (`user_memories` $> 0$), pemanggilan 5x beruntun ini memicu 5x LLM verifikasi memori dan update database secara konkuren yang beresiko memicu **Race Condition** pada penulisan memori.

---

## 2. Akar Masalah (Root Cause)

1. **Architectural Misplacement:**  
   `finalizeAssistantSession()` dipanggil di dalam `saveChatToDB()`. `saveChatToDB()` adalah helper persistensi draft pesan berkala (*intermediate auto-save*), sedangkan `finalizeAssistantSession()` adalah *end-of-turn integrity check*.
2. **React State & Debounce Cascading:**  
   `useEffect` auto-save di `ConversationEngine.jsx` memiliki dependency `[messages, currentChatId, osState]`. Setiap perubahan state pesan, update `currentChatId` dari callback insert, dan re-render objek `osState` memicu timer auto-save berulang (hingga 5x dalam 1 putaran chat).

---

## 3. Rencana Perubahan Kode

### A. Core Runtime (`AssistantService.js`)
* **Hapus** `finalizeAssistantSession()` dari dalam `saveChatToDB()` (baris 1000–1005).
* **Pindahkan** pemanggilan `finalizeAssistantSession()` ke titik akhir `_handleResponseStream()` (baris 913–916) setelah event `onDone` selesai dipicu.

### B. Frontend UI (`ConversationEngine.jsx`)
* Tambahkan `lastSavedKeyRef` dan proteksi `!isLoading` pada `useEffect` auto-save (baris 127–146).
* Hilangkan `osState` dari dependency array auto-save agar tidak terpicu oleh re-render context luar.

---

## 4. Rencana Pengujian

1. **Kasus Memori Kosong (`NO_MEMORIES`):** Pastikan log finalisasi hanya muncul tepat **1 kali**.
2. **Kasus Memori Aktif (`user_memories` ada):** Pastikan `verifyMemorySummary()` dieksekusi tepat **1 kali** tanpa konkurensi/race condition.
