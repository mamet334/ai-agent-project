# 2026-07-23 — Activity Graph Visibility & Orphan Node Enhancement

## Ringkasan
Memperbaiki bug visualisasi pada komponen `ActivityGraph` di mana garis penghubung antar node (khususnya untuk *data nodes* seperti memori dan dokumen) tidak terlihat atau sangat pudar pada latar belakang *dark mode*. Selain itu, memberikan efek visualisasi khusus (Pulsing Neon White) pada titik-titik Orphan agar lebih mudah dikenali oleh pengguna.

## Detail Perubahan

### 1) Fix Link Visibility
- Mengubah warna garis *default* (`linkColor`) dari putih dengan opasitas 15% menjadi 35% agar lebih terlihat (`rgba(255,255,255,0.35)`).
- Menambahkan logika pembacaan warna garis (`link.color`) yang sebelumnya diabaikan oleh komponen.
- Menambahkan ketebalan garis standar (`linkWidth`) menjadi `1.5` piksel.

### 2) Orphan Nodes Neon White Pulsing
- Mengubah render kustom menggunakan `nodeCanvasObject` pada titik Orphan (data yang memiliki `relations === 0`).
- Mengimplementasikan perhitungan `Math.sin(Date.now() / 200)` untuk memberikan efek berkedip/berdenyut (*pulse/blink*) di atas kanvas `ForceGraph2D`.
- Menggunakan skema warna putih terang (*Neon White*) beserta pendaran (*glow effect*) agar menonjol dari titik lainnya.

### 3) Legend UI Update
- Menyelaraskan teks deskripsi legenda "Orphan" pada antarmuka *dashboard*.
- Mengubah warna indikator bulat pada legenda "Orphan" dari `bg-[#ef4444]` (merah) menjadi warna putih yang memancarkan pendaran cahaya (`bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]`).

## Target File
- `frontend/src/components/dashboard/ActivityGraph.jsx`
