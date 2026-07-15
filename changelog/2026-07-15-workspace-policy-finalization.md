# 2026-07-15: Finalisasi Policy Workspace (Phase 4)

**Status:** FINALIZED
**Target:** Standardisasi batas baca, tulis, dan hak akses *tools* untuk masing-masing *Workspace*.

Berdasarkan validasi Phase 3 (Ownership), *Workspace* murni berperan sebagai "Lensa" dan "Kebijakan" (Policy) terhadap kepemilikan memori tunggal dari `user_id`. Dokumen ini meresmikan matriks hak akses definitif untuk ketiga jenis *Workspace*.

## Matriks Kebijakan Mutlak

| Workspace | Hak Baca (Read) | Hak Tulis (Write) | Akses Tools |
| :--- | :--- | :--- | :--- |
| **`ws-lite`** | **Bebas (Esensial)** | **Terbatas (Limited)** | **Minimal** |
| **`ws-assistant`** | **Bebas (All)** | **Bebas (All)** | **Penuh (Full)** |
| **`ws-engineer`**| **Bebas (All)** | **Terbatas (Khusus Engineering)** | **Khusus Engineer** |

---

## 1. `ws-lite` (Mode Cepat & Hemat)
*   **Hak Baca (Read Scope: `essential`)**
    Boleh membaca nama pengguna, preferensi utama, dan fakta penting.
*   **Hak Tulis (Write Scope: `limited`)**
    Sangat selektif. TIDAK BOLEH menyimpan obrolan biasa (casual chats), *noise* kueri pencarian, ataupun proses debugging.
*   **Akses Tools (Tools Access: `minimal`)**
    Hanya akses alat dasar yang ringan dan cepat.

## 2. `ws-assistant` (Pusat Kendali Kesadaran)
*   **Hak Baca (Read Scope: `all`)**
    Membaca seluruh histori dan konteks kehidupan AI bersama pengguna.
*   **Hak Tulis (Write Scope: `all`)**
    Boleh menulis apapun. Bertindak sebagai pengumpul utama dari memori, obrolan, preferensi, dan penjaga *state* sentral.
*   **Akses Tools (Tools Access: `full`)**
    Memiliki akses ke semua *tools* umum (pencarian, navigasi, otomasi, dsb).

## 3. `ws-engineer` (Mode Kerja Terisolasi)
*   **Hak Baca (Read Scope: `all`)**
    Membutuhkan wawasan total terhadap profil *User*, sehingga diizinkan membaca keseluruhan memori.
*   **Hak Tulis (Write Scope: `engineering_only`)**
    DILARANG KERAS mencemari *Personal Memory* atau *Preference Memory*. Hak tulis murni dibatasi pada:
    *   *Engineering Memory* (keputusan arsitektur, bug)
    *   *Architecture Memory* (dokumen ADR, konstitusi)
    *   *Audit Memory* (log kegagalan build/tes)
*   **Akses Tools (Tools Access: `engineer_only`)**
    Terbatas pada manipulasi terminal, eksekusi shell, analisis *filesystem*, linting, dan manajemen kode.

---
**Catatan Implementasi:** Matriks di atas secara teknis telah diterapkan ke dalam metadata `workspace.json` dengan menggunakan properti `read_scope`, `write_scope`, dan `tools_access`. Mesin orkestrasi (Edge Functions) akan membaca nilai-nilai ini sebagai hukum tata negara saat memvalidasi pergerakan *agent* di masa depan.
