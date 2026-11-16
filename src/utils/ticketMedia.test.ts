import { describe, expect, it } from 'vitest';
import { TICKET_MEDIA_ACCEPT, isHeic, preparePhoto, ticketMediaKind } from './ticketMedia';

const file = (name: string, type: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type });

describe('ticketMediaKind', () => {
  it('reads the browser type', () => {
    expect(ticketMediaKind(file('a.jpg', 'image/jpeg'))).toBe('photo');
    expect(ticketMediaKind(file('a.mov', 'video/quicktime'))).toBe('video');
  });

  it('falls back to the extension when the browser says nothing', () => {
    // Android pickers and the Telegram WebView leave the type empty.
    expect(ticketMediaKind(file('IMG_1.JPG', ''))).toBe('photo');
    expect(ticketMediaKind(file('clip.mp4', 'application/octet-stream'))).toBe('video');
  });

  it('refuses what the bot would refuse', () => {
    expect(ticketMediaKind(file('doc.pdf', 'application/pdf'))).toBeNull();
    expect(ticketMediaKind(file('x.svg', 'image/svg+xml'))).toBeNull();
    expect(ticketMediaKind(file('noext', ''))).toBeNull();
  });

  it('recognises HEIC to explain it', () => {
    expect(ticketMediaKind(file('IMG.HEIC', 'image/heic'))).toBeNull();
    expect(isHeic(file('IMG.HEIC', ''))).toBe(true);
    expect(isHeic(file('a.jpg', 'image/jpeg'))).toBe(false);
  });

  it('the picker offers both types and extensions', () => {
    expect(TICKET_MEDIA_ACCEPT).toContain('video/mp4');
    expect(TICKET_MEDIA_ACCEPT).toContain('.mov');
  });
});

describe('preparePhoto', () => {
  it('leaves a file it cannot decode as is', async () => {
    const original = file('a.png', 'image/png');
    expect(await preparePhoto(original)).toBe(original);
  });

  it('never touches a GIF', async () => {
    const gif = file('a.gif', 'image/gif', 11 * 1024 * 1024);
    expect(await preparePhoto(gif)).toBe(gif);
  });
});
