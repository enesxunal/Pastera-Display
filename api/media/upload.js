const Busboy = require('busboy');
const { put } = require('@vercel/blob');
const path = require('path');
const { setCors, handleOptions } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { getSupabase, err } = require('../_lib/supabase');

const ALLOWED = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4'];

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let fileBuffer = null;
    let filename = 'upload';
    let mimeType = 'application/octet-stream';

    busboy.on('file', (name, stream, info) => {
      filename = info.filename || filename;
      mimeType = info.mimeType || mimeType;
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('finish', () => {
      if (!fileBuffer) return reject(new Error('Dosya seçilmedi'));
      resolve({ buffer: fileBuffer, filename, mimeType });
    });
    busboy.on('error', reject);

    if (req.body && Buffer.isBuffer(req.body)) {
      busboy.end(req.body);
    } else if (typeof req.pipe === 'function') {
      req.pipe(busboy);
    } else {
      reject(new Error('Dosya okunamadı'));
    }
  });
}

module.exports = requireAuth(async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });

  try {
    const { buffer, filename, mimeType } = await parseUpload(req);
    if (!ALLOWED.includes(mimeType)) {
      return res.status(400).json({ error: 'Sadece JPG, PNG ve MP4' });
    }

    const mediaType = mimeType.startsWith('video/') ? 'video' : 'image';
    const ext = path.extname(filename) || (mediaType === 'video' ? '.mp4' : '.jpg');
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: 'Blob bağlı değil' });

    const blob = await put(`media/${storedName}`, buffer, {
      access: 'public',
      token,
      contentType: mimeType,
    });

    const { data, error } = await getSupabase()
      .from('media')
      .insert({
        filename: storedName,
        original_name: filename,
        mime_type: mimeType,
        media_type: mediaType,
        url: blob.url,
        file_size: buffer.length,
      })
      .select()
      .single();

    err(error);
    return res.status(201).json(data);
  } catch (e) {
    console.error('Upload:', e);
    return res.status(400).json({ error: e.message || 'Yüklenemedi' });
  }
});
