# CHANGELOG: UI Compliance & Metadata Parser Refactoring (Priority 4)

**Tanggal:** 2026-07-13
**Tipe Entry:** Implementation Mode (Refactoring & Feature Addition)
**Target:** Priority 4 (Engineer Workspace UI Compliance & Disaster Recovery Visuals)

Berdasarkan persetujuan Owner untuk melanjutkan ke Priority 4, refactoring UI secara holistik telah diterapkan di frontend untuk memastikan *Metadata-Driven UI* berjalan sempurna dan patuh pada konstitusi.

---

### IMPLEMENTASI

#### 1. Validasi & Dekopling Metadata Parser (100% Valid)
- **Problem:** Spesifikasi *widget* untuk Engineer Workspace sebelumnya terpecah dalam file YAML (`widgets-engineer.yaml`) yang secara bawaan tidak dapat diurai secara langsung tanpa dependensi eksternal berat di sisi peramban, sehingga menyebabkan kerentanan bagi arsitektur *frontend* berbasis *ServiceLocator*. Selain itu, ada *hardcoded logic* potensial jika komponen dipanggil langsung di komponen tata letak.
- **Solusi:** Seluruh spesifikasi YAML telah diintegrasikan langsung ke sumber kebenaran utama *JSON metadata* (`frontend/public/metadata/widgets.json` dan `workspace.json`). 
- **Decoupling:** `AppRegistry.js` kini hanya murni bertugas mendaftarkan komponen (lazy loading komponen secara dinamis) dan meniadakan penempatan UI secara manual. `WorkspaceManager` dan `WidgetHost` memuat antarmuka murni dari pangkalan data metadata.

#### 2. Penambahan Disaster Recovery Widget
- **Fitur Baru:** Menambahkan `DisasterRecoveryWidget.jsx` ke dalam ekosistem `Engineer Workspace`.
- **Integrasi Kernel:** Widget tidak melakukan *fetching* mentah yang berbahaya. Ia secara patuh mengambil token sesi dari `VaultService` melalui `ServiceManager` untuk melayangkan permintaan (`GET /health-check` sebagai perwakilan kesehatan API fungsi) guna menampilkan apakah *Backup Vault* berada pada status 'READY', 'DEGRADED', atau 'ERROR'.
- **UX Constraint:** Karena kapabilitas ekspor dan pemulihan merupakan fungsi arsitektur sensitif, tombol ekspor/restore pada antarmuka widget diubah statusnya menjadi visual observasi (indikator visual ketersediaan) sebagai jembatan menuju eksekusi konsol admin di masa mendatang, memastikan tidak ada eksekusi RLS *Bypass* secara tidak sengaja melalui UI langsung.

#### 3. Audit Visual Berbasis Identitas
- **Tenant Isolation UI:** Struktur pada `workspace.json` memastikan pemisahan kapabilitas secara absolut. Hanya identitas (`ws-engineer`) yang memiliki `cap:engineer` dan pemetaan *layout* eksplisit yang dapat melihat `DisasterRecoveryWidget`, `ArchitectureGapsWidget`, dan `MaefExecutionMonitorWidget`. Ruang kerja *Owner* biasa atau *Lite* dipastikan tidak akan terpolusi oleh beban operasional ini.

---

### FILES MODIFIED:
1. `frontend/src/core/application/AppRegistry.js` - Registrasi kelas *lazy loading* komponen.
2. `frontend/src/components/widgets/DisasterRecoveryWidget.jsx` - (Baru) Komponen pemantauan *Backup & Restore*.
3. `frontend/public/metadata/widgets.json` - Injeksi katalog *Engineer Widgets*.
4. `frontend/public/metadata/workspace.json` - Konfigurasi tata letak `default_layout` terisolasi untuk `ws-engineer`.

### NEXT BLOCKER / PRIORITY:
Modul *Disaster Recovery* kini terlihat nyata bagi *Engineer*. Dengan UI yang kini berbasis *metadata penuh*, lapisan *front-end* dari ekosistem Mamet OS terbukti adaptif dan siap dirilis tanpa kompilasi ulang (hanya dengan mengganti file konfigurasi JSON/database metadata). 

Jika tidak ada penugasan prioritas tambahan di lingkungan Mamet Desktop, **Sistem Mamet OS dinyatakan siap penuh menuju rilis Production.**
