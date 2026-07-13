# Execution Surface Inventory & Bypass Audit

Dokumen ini merupakan hasil audit komprehensif terhadap seluruh jalur eksekusi alat dan perintah di dalam arsitektur Mamet OS, sebagai fondasi implementasi `ToolDispatcher` (RFC-015 & GAP-NEW-019).

## 1. Daftar Jalur Eksekusi Saat Ini (Execution Surface)
Berikut adalah daftar seluruh *surface area* di mana eksekusi aktual (komputasi, modifikasi file, atau mutasi *state*) terjadi:

1.  **Event Bus Subagent Execution (`lib/event/subscribers/tool_subscriber.ts`):**
    *   **Mekanisme:** Mendengarkan `Tool.Requested`, melakukan validasi seadanya (timeout), lalu memanggil `plugin.execute(context)`.
    *   **Status Bypass:** ⚠️ **Tinggi**. Subagent berjalan secara otonom tanpa melalui `EngineeringLifecycleManager`.
2.  **Desktop Function Calling (`lib/stream_handler.ts`):**
    *   **Mekanisme:** Aliran SSE (*Server-Sent Events*) dari LLM diteruskan langsung ke klien (Svelte Desktop). Jika ada *tool call JSON*, klien yang akan mengeksekusi `write_to_file`, `grep_search`, dll.
    *   **Status Bypass:** ⚠️ **Kritis**. Backend sama sekali buta terhadap *Function Call* yang mungkin dihalusinasi oleh LLM, sehingga perlindungan fase gagal memblokir eksekusi di sisi klien.
3.  **Terminal Tag Injection (`lib/llm_orchestrator.ts`):**
    *   **Mekanisme:** Injeksi prompt `<terminal>...</terminal>` yang secara asinkron ditangkap dan dieksekusi oleh OS Desktop Shell (di luar *agent-process*).
    *   **Status Bypass:** ⚠️ **Kritis**. Dapat di-_bypass_ penuh jika LLM memutuskan menulis perintah `<terminal>rm -rf /</terminal>`.
4.  **External Code Execution API (`plugins/coder.ts`):**
    *   **Mekanisme:** Eksekusi kode secara remote melalui `fetch('https://emkc.org/api/v2/piston/execute')`.
    *   **Status Bypass:** ⚠️ **Sedang**. Meskipun berjalan di *sandbox* Piston, ini tetap merupakan mutasi *state* (penggunaan kuota/API) yang lolos dari *Budget Guard* pusat.
5.  **Capability Adapters (`lib/adapters/ai_adapter.ts` dll):**
    *   **Mekanisme:** Berinteraksi dengan API eksternal (Gemini, Groq).
    *   **Status Bypass:** ✅ **Rendah**. Adaptor adalah murni *driver* infrastruktur (I/O) dan tidak boleh memuat *policy logic*.

---

## 2. Final Threat Model & Bypass Matrix

| Vektor Serangan / Celah | Deskripsi | Status Saat Ini (As-Is) | Mitigasi dengan ToolDispatcher (To-Be) |
| :--- | :--- | :--- | :--- |
| **Desktop Tool Hallucination** | LLM merespons dengan format JSON untuk alat `replace_file_content` saat status masih `PROPOSAL`. | **Lolos**. Klien Desktop akan mengeksekusi karena *stream* diteruskan mentah. | **Terblokir**. *Stream_handler.ts* mem-_buffer_ stream, membaca *tool call*, mengirim ke `ToolDispatcher`, dan me-*replace* *chunk* dengan `DENY` jika tidak sah. |
| **Terminal Tag Injection** | LLM menyuntikkan perintah `<terminal>` destruktif yang tidak diotorisasi. | **Lolos**. Desktop mengeksekusinya secara absolut. | **Terblokir**. `ToolDispatcher` mencegat teks `<terminal>`, memasukkannya ke *Risk Gate*, dan menghapus tag tersebut jika gagal lolos. |
| **Rogue Subagent Execution** | Plugin (`file_analyzer` dsb) mengakses *Capability Adapter* langsung secara rekursif tanpa izin fase. | **Lolos**. `tool_subscriber.ts` memberikan `executeContext` secara bebas. | **Terblokir**. Plugin tidak lagi memiliki akses langsung; plugin mengembalikan *Intent* ke `ToolDispatcher` untuk dieksekusi. |
| **API Payload Manipulation** | Serangan *Man-in-the-Middle* (MitM) atau manipulasi UI (DevTools) untuk mengirim *request* palsu ke *backend*. | **Lolos/Parsial**. Tergantung verifikasi token Svelte. | **Terblokir**. `ToolDispatcher` memvalidasi `RuntimeContext` (*Backend Authoritative*), tidak memercayai klien. |

---

## 3. Daftar Integration Point Final (Hard Choke Points)
Untuk mengunci arsitektur secara absolut (*Zero Rogue Edits*), pengalihan jalur (*migration*) wajib dipasang secara bedah di tiga titik (*integration points*) ini HANYA:

1.  **`lib/streaming/stream_handler.ts` (Stream Interceptor):**
    Mencegat setiap *chunk* SSE yang mengalir ke Desktop. Titik integrasi untuk membendung **Desktop Function Calling** dan **Terminal Tags**.
2.  **`lib/event/subscribers/tool_subscriber.ts` (Subagent Bridge):**
    Mengganti `plugin.execute()` agar setiap eksekusi dibungkus dan divalidasi oleh `ToolDispatcher`.
3.  **`lib/orchestration/dispatcher/tool_dispatcher.ts` (Core Dispatcher - Komponen Baru):**
    Pusat otoritas (*Single Source of Truth*) yang mengikat:
    1.  `EngineeringLifecycleManager`
    2.  `Risk Gate`
    3.  `Budget Guard`
    4.  `Workspace Isolation`
    5.  `Capability Adapter`
    6.  `Final Execution`

Setiap permintaan yang masuk akan direspons melalui satu kontrak ketat: `ALLOW`, `ALLOW_WITH_LIMIT`, `DENY`, atau `REQUIRE_OWNER_APPROVAL`.

## Kesimpulan Audit
Sesuai hasil audit ini, **tidak ada** jalur eksekusi lain di luar yang terdaftar (tidak ada koneksi WebSocket (*live-socket* eksekusi) maupun jalur IPC langsung yang tersembunyi, semua melewati orkestrator *backend* `agent-process`). `ToolDispatcher` sudah lebih dari cukup untuk menjadi tembok pelindung tunggal (*Single Choke Point*).
