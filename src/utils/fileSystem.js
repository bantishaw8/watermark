import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export class FileSystem {
  static async ensureDirectory(dirPath) {
    if (!existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  static async cleanDirectory(dirPath) {
    if (existsSync(dirPath)) {
      const files = await fs.readdir(dirPath);
      await Promise.all(
        files.map(file => fs.unlink(path.join(dirPath, file)))
      );
    }
  }

  static async removeDirectory(dirPath) {
    if (existsSync(dirPath)) {
      await fs.rm(dirPath, { recursive: true, force: true });
    }
  }

  static async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  static async getFileSizeMB(filePath) {
    const size = await this.getFileSize(filePath);
    return (size / (1024 * 1024)).toFixed(2);
  }

  static getExtension(filePath) {
    return path.extname(filePath).toLowerCase();
  }

  static getBasename(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  static async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
