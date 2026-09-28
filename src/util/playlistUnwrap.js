import crypto from 'crypto';

function isDigitByte(b) {
  return b >= 0x30 && b <= 0x39;
}

function readAsciiInt(buf, off, len) {
  if (off + len > buf.length) return { ok: false };
  for (let i = off; i < off + len; i++) {
    if (!isDigitByte(buf[i])) return { ok: false };
  }
  const n = parseInt(buf.toString('utf8', off, off + len), 10);
  return { ok: Number.isFinite(n) && n >= 0, n };
}

function parseEnvelope(buf) {
  if (buf.length < 3) return null;
  const head = buf.toString('utf8', 0, Math.min(100, buf.length));
  if (head.trim().startsWith('#EXTM3U')) return null;

  for (let t = buf.length - 2; t < buf.length; t++) {
    if (!isDigitByte(buf[t])) return null;
  }
  const footerLen = parseInt(buf.toString('utf8', buf.length - 2, buf.length), 10);
  if (!Number.isFinite(footerLen) || footerLen <= 0) return null;

  const a = buf.length - 2;
  const s = a - footerLen;
  if (s < 0 || footerLen > buf.length / 2) return null;

  const footer = buf.subarray(s, a);
  const body = buf.subarray(0, s);
  let u = 0;
  if (footer.length < 2) return null;
  const type = String.fromCharCode(footer[u], footer[u + 1]);
  u += 2;
  if (!['AA', 'AB', 'AC', 'AD', 'AE', 'AF'].includes(type)) return null;

  const keyInfo = readAsciiInt(footer, u, 2);
  if (!keyInfo.ok) return null;
  u += 2;
  const key = keyInfo.n > 0 ? footer.subarray(u, u + keyInfo.n) : undefined;
  u += keyInfo.n;
  if (u > footer.length) return null;

  const ivInfo = readAsciiInt(footer, u, 2);
  if (!ivInfo.ok) return null;
  u += 2;
  const iv = ivInfo.n > 0 ? footer.subarray(u, u + ivInfo.n) : undefined;
  u += ivInfo.n;
  if (u !== footer.length) return null;

  return {
    type,
    key: key ? Buffer.from(key) : undefined,
    iv: iv ? Buffer.from(iv) : undefined,
    body: Buffer.from(body),
  };
}

function aesDecrypt(mode, data, key, iv) {
  const algo = `aes-128-${mode.toLowerCase()}`;
  const decipher = crypto.createDecipheriv(algo, key, iv || Buffer.alloc(16));
  if (mode === 'CFB' || mode === 'OFB') decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function decryptEnvelope(parsed) {
  const { type, key, iv, body } = parsed;
  switch (type) {
    case 'AA':
      return Buffer.from(body.toString('utf8').replace(/\s/g, ''), 'base64');
    case 'AB': {
      const out = Buffer.from(body);
      for (let i = 0; i < out.length; i++) out[i] ^= key[i % key.length];
      return out;
    }
    case 'AC':
      return aesDecrypt('ECB', body, key);
    case 'AD':
      return aesDecrypt('CBC', body, key, iv);
    case 'AE':
      return aesDecrypt('CFB', body, key, iv);
    case 'AF':
      return aesDecrypt('OFB', body, key, iv);
    default:
      throw new Error(`Unknown envelope type ${type}`);
  }
}

export function unwrapPlaylist(raw) {
  let buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || ''), 'utf8');
  let lastLen = -1;

  for (let i = 0; i < 6; i++) {
    if (buf.length === lastLen) break;
    lastLen = buf.length;

    const text = buf.toString('utf8');
    if (text.includes('#EXTM3U')) return text.replace(/\r\n/g, '\n');

    const env = parseEnvelope(buf);
    if (env) {
      buf = decryptEnvelope(env);
      continue;
    }

    const compact = text.trim();
    if (/^[A-Za-z0-9+/=\s]+$/.test(compact) && !compact.startsWith('#')) {
      buf = Buffer.from(compact.replace(/\s/g, ''), 'base64');
      continue;
    }
    break;
  }

  const text = buf.toString('utf8');
  return text.replace(/\r\n/g, '\n');
}

export function normalizePlaylistText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (raw.includes('#EXTM3U')) return raw.replace(/\r\n/g, '\n');
  return unwrapPlaylist(raw);
}
