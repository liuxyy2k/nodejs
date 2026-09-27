import axios from 'axios';

const REMOTE = 'http://43.143.23.150:3001/proxy';
const site = 'https://www.av01.media';
const cdnHost = 'https://customers.iw01.xyz';
const vid = 220625;

async function proxyFetch(url, referer) {
  try {
    const r = await axios.post(REMOTE, { url, referer, key: 'mira123' }, { timeout: 120000, validateStatus: () => true, responseType: 'text' });
    return { status: r.status, body: String(r.data || ''), err: null };
  } catch (e) {
    return { status: 0, body: '', err: e.message };
  }
}

async function j(url, referer = site) {
  const r = await proxyFetch(url, referer);
  try { return JSON.parse(r.body); } catch { return r.body; }
}

console.log('geo');
const geo = await j('https://files.iw01.xyz/edge/geo.js?json');
console.log(geo?.ip, !!geo?.access_token);

const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const ca = await j(`${site}/api/v1/videos/${vid}/cdn-access?${q}`, `${site}/cn/video/${vid}`);
const pl = await j(`${site}/api/v1/videos/${vid}/playlist?${q}`, `${site}/cn/video/${vid}`);
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
const cdn720 = master.split('\n').find((l) => l.includes('sv2'));
const manifest = `${cdnHost}/api/v1/videos/${vid}/manifest/${cdn720.trim()}&access_token=${encodeURIComponent(ca.access_token)}`;
console.log('\nmanifest via remote proxy');
const m = await proxyFetch(manifest, `${site}/cn/video/${vid}`);
console.log('status', m.status, m.err, m.body.includes('#EXTM3U') ? 'M3U8 OK' : m.body.slice(0, 150));
