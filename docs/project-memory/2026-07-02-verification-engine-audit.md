# Audit Report: Kesalahan Konfigurasi Verification Engine

**Konteks:** Seluruh obrolan (termasuk percakapan santai dengan Assistant) gagal dengan pesan "Verification Failed".
**Kesimpulan Singkat:** Ini BUKAN halusinasi AI. Ini adalah cacat arsitektur (Logic Flaw) di mana aturan ketat mode *Engineer* dipaksakan ke mode *Assistant/Owner*.

## 1. Analisis `VerificationEngine.ts` (Backend)
Mesin verifikasi memiliki beberapa aturan (*checks*) yang berstatus **Hard Fail** (langsung menghentikan respons jika tidak terpenuhi). Dua yang paling bermasalah untuk chat biasa adalah:
- **CHECK 002 (SOURCE_TRACE_EXISTS):** Mengevaluasi variabel `sourceTrace`. Jika kosong atau bukan *string*, skor langsung anjlok ke 0 (Gagal Total).
- **CHECK 003 (SOURCE_TRACE_FORMAT):** Mewajibkan `sourceTrace` mengandung format regex `/[A-Z]{3}-\d{4}/` (seperti `ADR-0001` atau `MEM-0050`).

**Fakta:** AI yang menjawab obrolan sehari-hari (misal: "Siapa nama saya?") tidak akan pernah menyertakan tag kode seperti `[ADR-0001]`. Akibatnya, jawaban apa pun yang bernada santai **pasti gagal** dalam verifikasi ini.

## 2. Analisis `synthesis_handler.ts` (Backend)
Di file ini, mekanisme pemblokiran (*Hard Gate*) tidak membedakan jenis obrolan.
```typescript
if (isChatBiasa || !maef.shouldExecutePhase('ORCHESTRATION')) {
    ...
    const vReport = VerificationEngine.verify(vContext);

    if (vReport.decision === "FAIL") {
        console.warn(`[HARD GATE] BLOCKED.`);
        return { mode: 'DIRECT', aiResponse: { message: "Verification Failed" } };
    }
}
```
**Temuan Fatal:** 
Pemanggilan `VerificationEngine.verify()` berada **di dalam blok `isChatBiasa`**. Artinya, MametLite atau Assistant Mode yang murni sekadar *chit-chat* tetap dipaksa memberikan dokumen ADR/Trace ID, tanpa adanya rute *bypass* atau *soft-fail*.

## 3. Analisis Endpoint Payload (`ConversationEngine.jsx` & `index.ts`)
Di `ConversationEngine.jsx`, sistem UI mengirimkan properti:
```json
{
  "mode": "OWNER",
  "stream": false,
  "auditMode": "FULL"
}
```
Meskipun modenya adalah `"OWNER"` (bukan ENGINEER), Edge Function tetap menelan payload tersebut tanpa mematikan sakelar verifikasinya. Jika `stream: true`, verifikasi ini akan di-_bypass_ (karena langsung dikirim per-*chunk*), tetapi karena RAG mensyaratkan `stream: false`, jalur maut verifikasi sinkron pun tereksekusi.

---

## 4. Rekomendasi Perbaikan Konkret

Berdasarkan audit di atas, krisis penolakan AI ini bisa diselesaikan dengan melonggarkan cek konstitusi pada mode non-teknis. Berikut dua opsi perbaikannya:

**Opsi 1: Bypass di Tingkat Handler (Paling Mudah)**
Ubah file `synthesis_handler.ts` agar *Hard Gate* hanya aktif jika berada dalam mode `ENGINEER` atau mode berisiko tinggi.
```typescript
// Di synthesis_handler.ts:
const vReport = VerificationEngine.verify(vContext);

// Hard Gate HANYA aktif jika bukan chat biasa, atau jika mode-nya ENGINEER
if (vReport.decision === "FAIL" && !isChatBiasa && ctx.request.mode === 'ENGINEER') {
    return { mode: 'DIRECT', aiResponse: { message: "Verification Failed" } };
}
```

**Opsi 2: Pelonggaran Konteks di Verification Engine (Paling Bersih secara Arsitektur)**
Suntikkan toleransi ke `VerificationEngine.verify(context)`. Jika obrolannya ringan, tidak wajib menyertakan Trace ID.
```typescript
// Di synthesis_handler.ts, tambahkan penanda:
const vContext = {
    responseText: replyWithoutTrace,
    sourceTrace: sourceTrace,
    requireTrace: ctx.request.mode === 'ENGINEER', // <-- Flag baru
    // ...
};

// Di verification_engine.ts, ubah Check 002 & 003:
if (context.requireTrace && (!context.sourceTrace || !traceFormatRegex.test(context.sourceTrace))) {
    check002.status = "FAIL";
    // ...
} else {
    check002.status = "PASS";
}
```
