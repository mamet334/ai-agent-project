# ARCHITECTURE ANALYSIS: GAP-009 (Tight Coupling in Execution Phase Dispatcher)

## 1. Analisis Arsitektur
Modul `lib/orchestration/handlers/execution_handler.ts` bertanggung jawab tidak hanya merencanakan eksekusi (planning), namun juga secara paksa mengimpor `getPluginByName`, membungkusnya dalam logika isolasi `AbortController`, menghitung *timeout*, dan menahan pengecualian (exceptions).
Hal ini melanggar *Single Responsibility Principle* dan memicu *Tight Coupling*, karena *Orchestrator* dipaksa berurusan dengan mekanisme pengaman (*sandbox*) setiap plugin. Ini juga merupakan pelanggaran desain terhadap amanat *Event-Driven Architecture* (ADR-011) di mana komponen seharusnya berkomunikasi secara buta melalui rentetan event (Loose Coupling).

## 2. Proposal Desain
Kita akan mengubah pola eksekusi *sub-agent* menjadi mekanisme murni *Event-Driven Scatter-Gather*:
1. **Pemisah Tugas (Decoupling)**: `execution_handler.ts` akan dilucuti dari seluruh impor *registry* plugin dan logika *timeout/Mamet Healer*. Tugasnya hanya memancarkan event `Tool.Requested` dengan *payload* instruksi dan ID unik.
2. **Worker Asinkron (Tool Subscriber)**: Kita akan mendelegasikan eksekusi *sandbox* ke *event subscriber* mandiri (`lib/event/subscribers/tool_subscriber.ts`). *Worker* ini akan mendengarkan sinyal `Tool.Requested`, memuat plugin secara dinamis, mengelola penguncian *timeout*, dan membalas dengan `Tool.Completed` saat tuntas.
3. **Promise Bridge**: Di dalam *execution handler*, kita akan menampung array *Promise* yang beresonansi dengan sinyal balasan `Tool.Completed` via *Event Bus*.

## 3. Rencana Implementasi
- **Step 1**: Menambahkan tipe event `Tool.Requested` dan `Tool.Completed` di `lib/event/event_bus.ts`.
- **Step 2**: Membuat `lib/event/subscribers/tool_subscriber.ts` yang berisi pemindahan seluruh logika komputasi berat (*Timeout Race, Plugin Fetching, AbortController*) dari *execution handler*.
- **Step 3**: Mendaftarkan `tool_subscriber.ts` ke dalam `lib/event/subscribers/registry.ts`.
- **Step 4**: Merombak iterasi eksekusi di dalam `execution_handler.ts` menjadi sangat tipis: hanya sekadar memancarkan sinyal, mendengarkan balikan sesuai *executionId*, dan merangkum hasilnya ke dalam konteks akumulasi.

## 4. Rencana Verifikasi
- Melakukan verifikasi alur kerja asinkron melalui kompilator TypeScript (`tsc`) untuk menghindari benturan deklarasi *state*.
- Memastikan durasi respons dan keandalan antrean *sub-agent* tetap persis sama sebelum modifikasi (tidak ada fitur yang dihapus, hanya memindahkan tulang punggung arsitektur).

=================================================
OWNER APPROVAL
=================================================
Saya akan **MENUNGGU** persetujuan Anda sebelum mulai merombak alur eksekusi alat (tool dispatcher) ini.
Apakah rencana penambalan *GAP-009* disetujui?
