// Minimal WebSocket endpoint for the mock: /cabinet/ws, like the real bot.
// Text frames only, no extensions — enough for the cabinet's notification
// channel (src/providers/WebSocketProvider.tsx). No dependencies.

import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();

function frame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function sendJson(socket, obj) {
  if (!socket.destroyed) socket.write(frame(0x1, JSON.stringify(obj)));
}

/** Sends a message to every connected cabinet; returns how many got it. */
export function broadcast(obj) {
  for (const socket of clients) sendJson(socket, obj);
  return clients.size;
}

export const wsClientCount = () => clients.size;

/** Parses complete client frames out of `buf`; returns the unconsumed tail. */
function readFrames(socket, buf) {
  while (buf.length >= 2) {
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) break;
    const mask = masked ? buf.subarray(offset, offset + 4) : null;
    const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    buf = buf.subarray(offset + maskLen + len);

    if (opcode === 0x8) {
      socket.end(frame(0x8, payload.subarray(0, 2)));
      clients.delete(socket);
      return Buffer.alloc(0);
    }
    if (opcode === 0x9) socket.write(frame(0xa, payload));
    if (opcode === 0x1) {
      try {
        if (JSON.parse(payload.toString('utf8'))?.type === 'ping') {
          sendJson(socket, { type: 'pong' });
        }
      } catch {
        // ignore malformed client messages
      }
    }
  }
  return buf;
}

export function attachWs(server) {
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://localhost');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname.replace(/\/+$/, '') !== '/cabinet/ws' || !key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    clients.add(socket);
    console.log(`WS   connected (${clients.size} open)`);
    sendJson(socket, { type: 'connected' });

    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = readFrames(socket, Buffer.concat([pending, chunk]));
    });
    const drop = () => {
      if (clients.delete(socket)) console.log(`WS   closed (${clients.size} open)`);
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });
}
