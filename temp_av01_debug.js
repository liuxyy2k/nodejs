import req from './src/util/req.js';
import { config } from './src/spider/video/config.js';

const site = 'https://www.av01.media';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SERVER = config.SERVER_API;

async function direct(url, referer = site) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, Referer: referer, Origin: site, Accept: '*/*' },
      timeout: 45000,
      validateStatus: () => true,
      responseType: 'text',
    });
    return { ok: true, status: r.status, body: String(r.data || ''), via: 'direct' };
  } catch (e) {
    return { ok: false, err: e.message, via: 'direct' };
  }
}

async function proxy(url, referer = site) {
  try {
    const r = await req.post(SERVER, { url, referer, key: 'mira123' }, {
      timeout: 90000,
      validateStatus: () => true,
      responseType: 'text',
      headers: { 'Content-Type': 'application/json' },
    });
    return { ok: r.status === 200, status: r.status, body: String(r.data || ''), via: 'server' };
  } catch (e) {
    return { ok: false, err: e.message, via: 'server' };
  }
}

async function fetchAny(url, referer) {
  const d = await direct(url, referer);
  if (d.ok && d.status === 200) return d;
  return proxy(url, referer);
}

function j(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const vid = 220625;
const referer = `${site}/cn/video/${vid}`;

console.log('=== 1. geo ===');
let geoR = await fetchAny('https://files.iw01.xyz/edge/geo.js?json');
console.log(geoR.via, geoR.status || geoR.err, (geoR.body || '').slice(0, 120));
const geo = j(geoR.body);
console.log('geo fields', geo ? { ip: geo.ip, token_v2: !!geo.token_v2, access_token: !!geo.access_token } : 'FAIL');

if (!geo?.token_v2) process.exit(1);

console.log('\n=== 2. playlist ===');
const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const plR = await fetchAny(`${site}/api/v1/videos/${vid}/playlist?${q}`, referer);
console.log(plR.via, plR.status || plR.err);
const pl = j(plR.body);
if (!pl?.src) { console.log('playlist fail', plR.body?.slice(0, 200)); process.exit(1); }
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
const cdn720 = master.split('\n').find((l) => l.includes('sv2'));
console.log('cdn720', cdn720?.slice(0, 100));

console.log('\n=== 3. manifest variants ===');
const rel = new URL(cdn720).pathname.slice(1) + new URL(cdn720).search;
const tests = [
  `${site}/api/v1/videos/${vid}/manifest/master.m3u8?hb=${encodeURIComponent(geo.access_token)}`,
  `${site}/api/v1/videos/${vid}/manifest/${rel}&access_token=${encodeURIComponent(geo.access_token)}`,
  `${site}/api/v1/videos/${vid}/manifest/${rel.split('?')[0]}?access_token=${encodeURIComponent(geo.access_token)}`,
];
for (const u of tests) {
  const r = await fetchAny(u, referer);
  const m3u8 = r.body?.includes('#EXTM3U');
  console.log('\n', m3u8 ? 'OK' : 'FAIL', r.via, r.status || r.err);
  console.log('url', u.slice(0, 140));
  console.log((r.body || r.err || '').slice(0, 250));
}
