#!/usr/bin/env node
// Local mock of the Bedolaga bot's cabinet API, for clicking through the
// cabinet without a real backend. Listens on :8080, where the Vite dev proxy
// sends /api (prefix stripped) and /health.
//
//   npm run mock        — this server
//   npm run dev         — the cabinet, in another terminal
//
// Sign in with any email/password («Войти по почте»). The user is an admin, so
// the postq design switch applies. State (balance, autopay, devices…) lives in
// memory and resets on restart. Requests with no handler answer 404 and are
// logged as "MISS", so gaps are easy to spot.

import http from 'node:http';
import { routes } from './routes.mjs';

const PORT = Number(process.env.MOCK_PORT || 8080);
const DELAY_MS = Number(process.env.MOCK_DELAY_MS || 150);

function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = req.headers['content-type'] || '';
      if (!raw) return resolve({});
      if (type.includes('application/json')) {
        try {
          return resolve(JSON.parse(raw));
        } catch {
          return resolve({});
        }
      }
      resolve({ raw });
    });
  });
}

function match(method, pathname) {
  for (const [key, handler] of routes) {
    const [m, pattern] = key.split(' ');
    if (m !== method && m !== '*') continue;
    const names = [];
    const re = new RegExp(
      `^${pattern.replace(/:([a-zA-Z_]+)/g, (_, n) => {
        names.push(n);
        return '([^/]+)';
      })}/?$`,
    );
    const hit = pathname.match(re);
    if (!hit) continue;
    const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(hit[i + 1])]));
    return { handler, params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const found = match(req.method, url.pathname);
  const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
  if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));

  if (!found) {
    console.log(`MISS ${req.method} ${url.pathname}${url.search}`);
    return send(res, 404, { detail: 'Not mocked' });
  }
  try {
    const out = await found.handler({
      params: found.params,
      query: Object.fromEntries(url.searchParams),
      body,
      headers: req.headers,
    });
    // Fake payment provider pages: plain HTML and redirects back to the cabinet.
    if (out?.__redirect) {
      res.writeHead(302, { location: out.__redirect, 'cache-control': 'no-store' });
      return res.end();
    }
    if (out?.__html !== undefined) {
      res.writeHead(out.__status ?? 200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      return res.end(out.__html);
    }
    const status = out?.__status ?? 200;
    const payload = out?.__status ? out.body : out;
    if (process.env.MOCK_VERBOSE) console.log(`${status} ${req.method} ${url.pathname}`);
    send(res, status, payload ?? { success: true });
  } catch (err) {
    console.error(`ERR  ${req.method} ${url.pathname}`, err);
    send(res, 500, { detail: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Mock cabinet backend on http://localhost:${PORT} (${routes.size} routes)`);
});
