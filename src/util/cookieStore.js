import fs from 'fs';
import path from 'path';
import { CookieJar } from 'tough-cookie';

function cookieFilePath() {
  const base = process.env.NODE_PATH || '.';
  return path.join(base, 'cookie.json');
}

class CookieStore {
  constructor() {
    this.jar = new CookieJar();
    this.loaded = false;
    this.dirty = false;
    this.saveTimer = null;
    this.autoSaveEnabled = true;
    this.loadPromise = null;
    this.shutdownHooksAdded = false;
    this.addShutdownHooks();
  }

  addShutdownHooks() {
    if (this.shutdownHooksAdded) return;
    this.shutdownHooksAdded = true;
    const flush = () => {
      if (!this.dirty && !this.saveTimer) return;
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      try {
        const file = cookieFilePath();
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(this.jar.toJSON(), null, 2), 'utf8');
      } catch {}
    };
    process.on('beforeExit', flush);
    process.on('SIGINT', () => { flush(); process.exit(0); });
    process.on('SIGTERM', () => { flush(); process.exit(0); });
  }

  async load() {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const file = cookieFilePath();
        if (fs.existsSync(file)) {
          const raw = fs.readFileSync(file, 'utf8');
          const json = JSON.parse(raw);
          this.jar = json ? CookieJar.fromJSON(json) : new CookieJar();
        } else {
          this.jar = new CookieJar();
        }
        this.loaded = true;
      } catch {
        this.jar = new CookieJar();
        this.loaded = true;
      } finally {
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async save(immediate = false) {
    if (!this.autoSaveEnabled) {
      this.dirty = true;
      return;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const write = async () => {
      try {
        const file = cookieFilePath();
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(file, JSON.stringify(this.jar.toJSON(), null, 2), 'utf8');
        this.dirty = false;
      } catch {}
    };
    if (immediate) await write();
    else this.saveTimer = setTimeout(write, 1000);
  }

  setAutoSave(enabled) {
    this.autoSaveEnabled = enabled;
    if (enabled && this.dirty) this.save(true);
  }

  getJar() {
    return this.jar;
  }

  async getCookies(url) {
    return this.jar.getCookieString(url);
  }

  async setCookies(url, cookies) {
    if (!cookies?.length) return;
    for (const cookie of cookies) {
      try {
        await this.jar.setCookie(cookie, url);
      } catch {}
    }
  }

  async setCookieString(url, cookieStr) {
    if (!cookieStr?.trim()) return;
    for (const part of cookieStr.split(';')) {
      const kv = part.trim();
      if (!kv || !kv.includes('=')) continue;
      try {
        await this.jar.setCookie(kv, url);
      } catch {}
    }
  }

  clearCookies(domain) {
    const target = String(domain || '').replace(/^\./, '').toLowerCase();
    if (!target) return 0;
    const cookies = this.jar.toJSON().cookies || [];
    let removed = 0;
    for (const cookie of cookies) {
      if (String(cookie.domain || '').replace(/^\./, '').toLowerCase() !== target) continue;
      try {
        this.jar.store.removeCookie(cookie.domain, cookie.path || '/', cookie.key, () => {});
        removed++;
      } catch {}
    }
    if (removed > 0) this.save();
    return removed;
  }

  clearAllCookies() {
    const count = (this.jar.toJSON().cookies || []).length;
    if (count > 0) {
      this.jar.removeAllCookiesSync();
      this.save();
    }
    return count;
  }

  async listGrouped() {
    await this.load();
    const cookies = this.jar.toJSON().cookies || [];
    const map = new Map();
    for (const cookie of cookies) {
      const domain = cookie.domain || '(未知)';
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain).push({
        key: cookie.key,
        value: cookie.value == null ? '' : String(cookie.value),
        path: cookie.path || '/',
        expires: cookie.expires == null || cookie.expires === 'Infinity' ? null : Number(cookie.expires) || null,
        httpOnly: !!cookie.httpOnly,
        secure: !!cookie.secure,
      });
    }
    const domains = [];
    let total = 0;
    for (const [domain, list] of map) {
      total += list.length;
      domains.push({ domain, count: list.length, cookies: list });
    }
    domains.sort((a, b) => a.domain.localeCompare(b.domain));
    return { total, domains };
  }
}

const cookieStore = new CookieStore();
export default cookieStore;
