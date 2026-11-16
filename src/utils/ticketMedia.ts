/**
 * Preparing a support attachment before upload. The bot stages every file in
 * Telegram (send_photo / send_video), so Telegram's limits apply: a photo up to
 * 10 MB and width + height up to 10 000 px; files the bot can read back — up to
 * 20 MB.
 */

export type TicketMediaKind = 'photo' | 'video';

/** The upload limit on the server (Bot API getFile reads files up to 20 MB). */
export const TICKET_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

const BY_MIME: Record<string, TicketMediaKind> = {
  'image/jpeg': 'photo',
  'image/jpg': 'photo',
  'image/png': 'photo',
  'image/gif': 'photo',
  'image/webp': 'photo',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'video/x-m4v': 'video',
};

const BY_EXT: Record<string, TicketMediaKind> = {
  jpg: 'photo',
  jpeg: 'photo',
  png: 'photo',
  gif: 'photo',
  webp: 'photo',
  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',
};

/** What the file picker should offer. */
export const TICKET_MEDIA_ACCEPT = [
  ...Object.keys(BY_MIME),
  ...Object.keys(BY_EXT).map((ext) => `.${ext}`),
].join(',');

/**
 * Photo or video, or null when the file can't be sent. The type comes from
 * the browser, or from the extension when it says nothing (Android pickers
 * and the Telegram WebView sometimes leave `file.type` empty).
 */
export function ticketMediaKind(file: File): TicketMediaKind | null {
  const mime = (file.type || '').toLowerCase();
  if (BY_MIME[mime]) return BY_MIME[mime];
  if (mime && mime !== 'application/octet-stream') return null;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXT[ext] ?? null;
}

/** HEIC/HEIF: browsers outside Safari can't show it, Telegram won't take it as a photo. */
export function isHeic(file: File): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_MAX_SIDES = 10_000;
const TARGET_LONG_SIDE = 4096;

async function decode(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

/**
 * A photo Telegram would refuse (over 10 MB, or width + height over 10 000)
 * is re-encoded as JPEG with the long side at 4096 px. Long screenshots are
 * left alone — shrinking them would make the text unreadable; the server sends
 * those as a file instead. Anything that can't be decoded goes as is.
 */
export async function preparePhoto(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;
  const bitmap = await decode(file);
  if (!bitmap) return file;
  const { width, height } = bitmap;
  const tooBig = file.size > PHOTO_MAX_BYTES * 0.95;
  const tooWide = width + height > PHOTO_MAX_SIDES;
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  if (!(tooBig || (tooWide && ratio <= 4))) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, TARGET_LONG_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.88),
  );
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
}
