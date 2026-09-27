import req from './src/util/req.js';
import { config } from './src/spider/video/config.js';

const site = 'https://www.av01.media';
const cdnHost = 'https://customers.iw01.xyz';
const CF = config.CF_API;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const vid = 220625;
const referer = `${site}/cn/video/${vid}`;

async function direct(url) {
  try {
    const r = await req.get(url, { headers: { 'User-Agent': UA, Referer: referer, Origin: site }, timeout: 30000, validateStatus: () => true, responseType: 'text' });
    return { ok: r.status === 200, status: r.status, sample: String(r.data).slice(0, 120), err: null };
  } catch (e) {
    return { ok: false, err: e.code || e.message };
  }
}

async function cf(url) {
  try {
    const r = await req.post(CF, { url, referer }, { timeout: 90000, validateStatus: () => true, responseType: 'text' });
    const s = String(r.data || '');
    return { ok: r.status === 200, status: r.status, m3u8: s.includes('#EXTM3U'), sample: s.slice(0, 120), err: null };
  } catch (e) {
    return { ok: false, err: e.code || e.message };
  }
}

async function j(url) {
  const r = await direct(url);
  if (r.ok) {
    try { return JSON.parse(r.sample.startsWith('{') ? r.sample : String((await req.get(url, { headers: { 'User-Agent': UA }, timeout: 30000, validateStatus: () => true })).data)); } catch {}
  }
  const c = await cf(url);
  try { return JSON.parse(c.sample); } catch { return null; }
}

console.log('1 geo direct', await direct('https://files.iw01.xyz/edge/geo.js?json'));
console.log('1 geo cf   ', await cf('https://files.iw01.xyz/edge/geo.js?json'));

const geo = await j('https://files.iw01.xyz/edge/geo.js?json');
console.log('geo parsed', geo?.ip, !!geo?.token_v2);
if (!geo?.token_v2) process.exit(1);

const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const pl = await j(`${site}/api/v1/videos/${vid}/playlist?${q}`);
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
const cdn360 = master.split('\n').find((l) => l.includes('sv1'));
console.log('\n2 playlist ok, cdn line', cdn360?.slice(0, 90));

console.log('\n3 cdn direct', await direct(cdn360));
console.log('3 cdn cf    ', await cf(cdn360));

const ca = await j(`${site}/api/v1/videos/${vid}/cdn-access?${q}`);
const manifest = `${cdnHost}/api/v1/videos/${vid}/manifest/${cdn360.trim()}&access_token=${encodeURIComponent(ca.access_token)}`;
console.log('\n4 manifest direct', await direct(manifest));
console.log('4 manifest cf    ', await cf(manifest));
