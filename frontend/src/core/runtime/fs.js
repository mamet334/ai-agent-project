// fs.js
export class FileSystem {
  constructor() {
    // Prefix untuk mencegah bentrok dengan data aplikasi lain di localStorage
    this.prefix = 'mamet_fs:';
  }

  async read(path) {
    try {
      const data = localStorage.getItem(this.prefix + path);
      return data !== null ? data : null;
    } catch (error) {
      console.error(`[FileSystem] Failed to read ${path}:`, error);
      return null;
    }
  }

  async write(path, content) {
    try {
      // localStorage hanya mendukung string. Jika content bukan string,
      // akan dikonversi otomatis oleh browser, namun aman untuk file teks.
      localStorage.setItem(this.prefix + path, content);
      return true;
    } catch (error) {
      console.error(`[FileSystem] Failed to write ${path}:`, error);
      return false;
    }
  }

  async delete(path) {
    try {
      const key = this.prefix + path;
      if (localStorage.getItem(key) === null) {
        return false;
      }
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`[FileSystem] Failed to delete ${path}:`, error);
      return false;
    }
  }

  async list(dir) {
    try {
      const results = [];
      const searchPrefix = this.prefix + dir;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(searchPrefix)) {
          // Kembalikan path aslinya dengan menghapus prefix 'mamet_fs:'
          results.push(key.substring(this.prefix.length));
        }
      }
      
      return results;
    } catch (error) {
      console.error(`[FileSystem] Failed to list directory ${dir}:`, error);
      return [];
    }
  }
}