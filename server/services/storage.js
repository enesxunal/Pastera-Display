const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');
const config = require('../config');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

/**
 * Yerel uploads klasörünü oluştur
 */
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Dosya tipini belirle (görsel veya video)
 */
function getMediaType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

/**
 * İzin verilen dosya tipleri
 */
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'video/mp4',
];

/**
 * Dosyayı kaydet - yerelde diske, Vercel'de Blob'a
 */
async function saveFile(file) {
  const mediaType = getMediaType(file.mimetype);
  if (!mediaType) {
    throw new Error('Desteklenmeyen dosya tipi. Sadece JPG, PNG ve MP4.');
  }
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    throw new Error('Desteklenmeyen dosya tipi. Sadece JPG, PNG ve MP4.');
  }

  const ext = path.extname(file.originalname) || (mediaType === 'video' ? '.mp4' : '.jpg');
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  // Vercel Blob (üretim)
  if (config.blobToken) {
    const blob = await put(`media/${filename}`, file.buffer, {
      access: 'public',
      token: config.blobToken,
      contentType: file.mimetype,
    });
    return {
      filename,
      url: blob.url,
      mediaType,
      fileSize: file.size,
    };
  }

  // Yerel disk
  ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, file.buffer);
  return {
    filename,
    url: `/uploads/${filename}`,
    mediaType,
    fileSize: file.size,
  };
}

/**
 * Medyayı sil
 */
async function deleteFile(filename, url) {
  if (config.blobToken && url && url.includes('blob.vercel-storage.com')) {
    // Blob silme opsiyonel - Vercel Blob delete API
    try {
      const { del } = require('@vercel/blob');
      await del(url, { token: config.blobToken });
    } catch (e) {
      console.warn('Blob silinemedi:', e.message);
    }
    return;
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  UPLOAD_DIR,
  ensureUploadDir,
  getMediaType,
  ALLOWED_MIMES,
  saveFile,
  deleteFile,
};
