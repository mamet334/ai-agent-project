# scratch/

**STATUS: NON-PRODUCTION — Bukan bagian dari production codebase.**

---

Folder ini berisi file-file eksperimen, debugging, dan pengujian satu kali yang digunakan selama proses pengembangan Mamet AI.

## Aturan

Berdasarkan MAEF v2 §6 (Repository Principle):

- File di folder ini **BUKAN production code**
- File di folder ini **tidak boleh di-import** oleh modul production mana pun
- File di folder ini **boleh dihapus** kapan saja tanpa mempengaruhi sistem
- File di folder ini **tidak perlu** melewati proses review formal

## Kapan Menggunakan Folder Ini

Gunakan folder ini untuk:

- Script debugging one-off (cek DB, cek API, trace request)
- Mock/simulation untuk testing lokal
- SQL query eksperimental sebelum dijadikan migration resmi
- Patch script sementara yang belum dimasukkan ke modul production

## Kapan Harus Dipindahkan ke Production

Jika sebuah file di folder ini:

- Digunakan lebih dari sekali
- Diperlukan oleh lebih dari satu developer
- Menjadi bagian dari workflow yang berulang

Maka file tersebut harus **dipindahkan ke lokasi yang tepat** dan melewati proses formal (ADR / Task / Review).

## Status

| Isi | Jumlah file | Keterangan |
|---|---|---|
| Script debugging | ~40 file | JS/MJS untuk cek DB, API, stream |
| SQL eksperimental | ~10 file | ALTER TABLE, RLS, verify queries |
| Test acceptance | ~8 file | TS acceptance test satu kali |
| Patch script | ~10 file | Patch experiments |
| Lain-lain | ~18 file | Mock, simulate, trace |

---

*Ditetapkan: 2026-06-29 | Constitution Review Wave 1 — TASK-NEW-009 | Gap: GAP-NEW-013*
