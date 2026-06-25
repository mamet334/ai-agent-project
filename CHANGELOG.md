# Changelog

## Mamet AI v2.0.0 — Workspace Edition
**Release Date: 25 Juni 2026**

### Overview
Mamet AI v2.0.0 memperkenalkan Workspace Engine baru yang dirancang untuk penggunaan desktop intensif dengan pengalaman kerja yang lebih fleksibel dan produktif. Versi ini menggantikan pendekatan layout statis sebelumnya dengan workspace yang dapat disesuaikan oleh pengguna, menyerupai pengalaman penggunaan IDE modern.

### New Features

#### Resizable Sidebar
* Sidebar kiri dapat diubah ukurannya.
* Ukuran tersimpan otomatis pada browser.
* Mendukung reset melalui double-click.

#### Resizable Inspector
* Panel inspector kanan dapat diubah ukurannya.
* Lebih nyaman untuk Knowledge, Debug, dan Observability.

#### Resizable Composer
* Area penulisan prompt dapat diperbesar atau diperkecil sesuai kebutuhan.
* Mendukung prompt panjang dan workflow analisis kompleks.

#### Workspace Persistence
* Preferensi ukuran panel disimpan otomatis menggunakan localStorage.
* Workspace tetap konsisten setelah reload browser.

### Architecture Improvements

#### Flexbox Composer Migration
* Menghapus pendekatan overlay berbasis absolute positioning.
* Composer sekarang menjadi bagian dari struktur layout utama.
* Menghilangkan masalah overlap saat textarea bertambah tinggi.

#### Improved Layout Stability
* Stabil saat streaming respons panjang.
* Stabil saat resize panel.
* Stabil saat paste prompt besar.

### User Experience Improvements
* Workspace lebih lapang.
* Fokus membaca respons lebih nyaman.
* Penggunaan monitor desktop lebih optimal.
* Workflow riset dan observasi pasar menjadi lebih efisien.
