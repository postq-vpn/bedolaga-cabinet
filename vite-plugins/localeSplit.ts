import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Serves each locale as two modules so regular visitors don't download the
 * admin panel's strings (≈60% of every locale file):
 *
 *   virtual:locale/ru/base   — everything except `admin`
 *   virtual:locale/ru/admin  — only `admin` (loaded once the user is an admin)
 *
 * A few `admin.*` subtrees are used outside the admin panel (the «Админка» nav
 * link, the public info pages) and stay in `base`. The JSON files themselves
 * are untouched — translators still edit one file per language.
 */
const PREFIX = 'virtual:locale/';
const RESOLVED = '\0locale-split:';
const KEEP_IN_BASE = ['nav', 'infoPages'];

export function localeSplit(localesDir: string): Plugin {
  return {
    name: 'locale-split',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith(PREFIX)) return RESOLVED + id.slice(PREFIX.length);
      return null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return null;
      const [lang, part] = id.slice(RESOLVED.length).split('/');
      const file = path.join(localesDir, `${lang}.json`);
      this.addWatchFile(file);
      const all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const admin = (all.admin ?? {}) as Record<string, unknown>;
      let out: Record<string, unknown>;
      if (part === 'admin') {
        out = {
          admin: Object.fromEntries(
            Object.entries(admin).filter(([k]) => !KEEP_IN_BASE.includes(k)),
          ),
        };
      } else {
        const { admin: _drop, ...rest } = all;
        out = {
          ...rest,
          admin: Object.fromEntries(
            Object.entries(admin).filter(([k]) => KEEP_IN_BASE.includes(k)),
          ),
        };
      }
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(out))});`;
    },
  };
}
