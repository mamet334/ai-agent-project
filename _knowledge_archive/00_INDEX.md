# INDEX: Mamet OS Knowledge Archive

Folder ini berisi file-file yang sudah tidak digunakan lagi di production (dead code), tetapi disimpan sebagai "Pengetahuan Sejarah" agar Engineer Internal bisa belajar dari eksperimen masa lalu.

## 📂 Daftar Arsip:

| Folder / File | Deskripsi Singkat |
| :--- | :--- |
| `api/` | Endpoint backend memory versi lama (Node.js). |
| `changelog/` | Riwayat catatan perubahan (release notes) versi sebelumnya. |
| `graphify-out/` | Cache dan output dari analisis AST Graph (dependensi kode). |
| `handoff/` | Catatan handoff sesi antar AI (sudah usang). |
| `lib/` | Berbagai eksperimen mesin memori alternatif (behavior, semantic, chaos, dll). |
| `mametlite/` | Proyek sampingan bernama "Mamet Lite" (versi sederhana OS). |
| `scratch/` | Semua eksperimen kasar, patch draft, dan script testing sementara. |
| `scripts/` | Script utilitas sekali pakai untuk generate handoff. |
| `frontend_*.js/cjs` | File utilitas frontend yang sudah digantikan. |
| `*.sql` | Skrip setup database awal yang sudah tidak dipakai. |
| `*.py / *.ts` | Eksperimen Python dan TypeScript usang di root project. |
| `*.txt / *.md` | Dokumentasi dan roadmap eksperimen lama yang sudah diarsipkan. |

> **Instruksi untuk Engineer Internal:**  
> Jangan gunakan kode mentah dari folder ini sebagai referensi produksi. Bacalah file `00_INDEX.md` ini untuk memahami apa yang pernah dicoba. Jika ingin mempelajari *pola pikir* dari eksperimen, silakan baca isi filenya, tapi **JANGAN** menyalin (copy-paste) kodenya ke production saat ini!