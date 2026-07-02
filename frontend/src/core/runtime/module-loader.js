// module-loader.js
export class ModuleLoader {
  constructor(fs) {
    // fs tetap dipertahankan untuk kompatibilitas antarmuka (Dependency Injection), 
    // meskipun dynamic import() menangani network/file loading secara internal.
    this.fs = fs;
    this.cache = new Map();
  }

  async load(modulePath) {
    // 1. Cek Cache
    if (this.cache.has(modulePath)) {
      return this.cache.get(modulePath);
    }

    try {
      // 2. Gunakan dynamic import() bawaan ESModules alih-alih membaca string dan eval.
      // Ini memanfaatkan standar keamanan browser/engine JS, menghapus kerentanan Eksekusi Kode Sembarang (RCE).
      // Mengembalikan Module Namespace Object (berisi semua export).
      const module = await import(`/packages/${modulePath}.js`);
      
      // 3. Simpan di Cache
      this.cache.set(modulePath, module);
      return module;
    } catch (error) {
      throw new Error(`Module ${modulePath} failed to load: ${error.message}`);
    }
  }

  async loadFromFs(modulePath) {
    // 1. Cek Cache
    if (this.cache.has(modulePath)) {
      return this.cache.get(modulePath);
    }

    let objectUrl = null;
    try {
      // 2. Baca string code dari Virtual File System (localStorage)
      const code = await this.fs.read(`/packages/${modulePath}.js`);
      if (!code) {
        throw new Error(`Code not found in FS for module: ${modulePath}`);
      }

      // 3. Buat Blob dengan tipe MIME 'application/javascript'
      const blob = new Blob([code], { type: 'application/javascript' });
      
      // 4. Buat Object URL untuk Blob tersebut
      objectUrl = URL.createObjectURL(blob);
      
      // 5. Muat module dinamis melalui Object URL
      const module = await import(objectUrl);
      
      // 6. Simpan di Cache
      this.cache.set(modulePath, module);
      return module;
    } catch (error) {
      throw new Error(`Module ${modulePath} failed to load from FS: ${error.message}`);
    } finally {
      // 7. Bersihkan Object URL untuk mencegah memory leak
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }
}