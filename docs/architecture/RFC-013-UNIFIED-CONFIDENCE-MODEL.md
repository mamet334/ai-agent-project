# RFC-013: Unified Confidence Model

## 1. Latar Belakang & Architecture Gap
Penambahan kolom `confidence_score` ke dalam tabel `verification_runs` (sebagai solusi dari GAP-NEW-008) ditunda karena ketiadaan definisi arsitektural yang jelas. Tanpa definisi, terdapat risiko **Semantic Ambiguity** (ketidakjelasan makna skor), **Schema Drift** (penyalahgunaan kolom di masa depan), dan utang teknis. 

Mamet OS membutuhkan model *Confidence* yang terpadu (*Unified Confidence Model*) yang memisahkan antara keyakinan data, keyakinan penalaran, dan keyakinan audit.

## 2. Confidence Domain
Confidence di dalam ekosistem Mamet dibagi menjadi 3 (tiga) domain terpisah yang tidak boleh dicampuradukkan:

1. **Retrieval Confidence (Memory/RAG)**
   - *Makna:* Seberapa relevan dan valid suatu kepingan data (node) terhadap kueri.
   - *Fokus:* Vektor, Recency, Frequency.

2. **Evidence Confidence (Contextual Readiness)**
   - *Makna:* Seberapa yakin sistem (Backend) bahwa konteks yang telah dikumpulkan *cukup, valid, dan tidak berkonflik* untuk diberikan kepada LLM.
   - *Fokus:* Kuantitas bukti, ketiadaan konflik, kebaruan versi (Version Status).

3. **Reasoning Confidence (LLM Generation)**
   - *Makna:* Seberapa yakin AI (LLM) terhadap kesimpulan atau jawaban yang ia hasilkan sendiri.

Karena target integrasi kita adalah `verification_runs` (yang memverifikasi kelayakan jalannya suatu orkestrasi), maka domain yang direpresentasikan oleh `confidence_score` di tabel tersebut secara resmi didefinisikan sebagai **Evidence Confidence**.

## 3. Spesifikasi Arsitektur: Evidence Confidence

*   **Domain:** Evidence Confidence.
*   **Owner Component:** `ConfidenceEngine` (`lib/verification/confidence_engine.ts`). Komponen ini adalah satu-satunya *Source of Truth* yang berhak menghitung dan mengeluarkan skor ini.
*   **Calculation Method:** Deterministik berbasis aturan (Rule-based).
    *   *Base:* 50
    *   *Evidence Bonus:* +8 per sumber valid (maksimal +40)
    *   *Conflict Penalty:* -15 per konflik terbuka (*active conflict*)
    *   *Version Status:* +10 (jika semua terkini), -15 (jika ada data usang)
    *   *Engineer Penalty:* -20 (jika masuk mode Engineer tanpa referensi arsitektur)
*   **Update Policy:** *Immutable Snapshot*. Dihitung tepat **satu kali** per siklus *request* pada fase *Pre-Inference* (sebelum memanggil LLM). Nilai yang disimpan ke database bersifat permanen sebagai bukti log audit.
*   **Decay Policy:** **Tidak ada peluruhan (Zero Decay).** Karena skor ini bertindak sebagai bukti audit dari sebuah insiden masa lalu, nilainya tidak boleh menyusut tergerus waktu. (Peluruhan/decay hanya berlaku pada *Retrieval Confidence* di modul Memori, bukan pada *Evidence Confidence*).
*   **Allowed Range:** Bilangan bulat (Integer) dari **0 hingga 100**.

## 4. Resolusi Schema
Berdasarkan RFC ini, migrasi database untuk GAP-NEW-008 kelak akan dieksekusi dengan definisi yang ketat:
```sql
ALTER TABLE verification_audit_logs 
ADD COLUMN confidence_score SMALLINT 
CHECK (confidence_score >= 0 AND confidence_score <= 100);
```
Kolom ini secara eksplisit didokumentasikan sebagai *Evidence Confidence Score* milik `ConfidenceEngine`.

**Implementation Note:**
*RFC-013 originally referenced `verification_runs`. Actual implementation uses `verification_audit_logs` as the canonical audit store. The RFC semantic intent remains unchanged.*

---
**Status:** DRAFT (Menunggu Persetujuan Owner)
**Tanggal:** 2026-07-11
