import axios from 'axios';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const site = 'https://www.av01.media';
const vid = 220625;

async function flareRaw(url) {
  const r = await axios.post(FLARE, { cmd: 'request.get', url, maxTimeout: 120000, headers: {
    Referer: `${site}/cn/video/${vid}`,
    Origin: site,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  }});
  return r.data.solution.response;
}

async function flareJson(url) {
  const body = await flareRaw(url);
  if (typeof body === 'string' && body.includes('#EXTM3U')) return { type: 'm3u8', body };
  const m = String(body).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try { return { type: 'json', body: JSON.parse(m ? m[1] : body) }; } catch { return { type: 'text', body: String(body).slice(0, 500) }; }
}

const geo = (await flareJson('https://files.iw01.xyz/edge/geo.js?json')).body;
const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const pl = (await flareJson(`${site}/api/v1/videos/${vid}/playlist?${q}`)).body;
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
const cdn720 = master.split('\n').find((l) => l.includes('sv2'));

const urls = [
  `${site}/api/v1/videos/${vid}/manifest/master.m3u8?hb=${encodeURIComponent(geo.access_token)}`,
  `${site}/api/v1/videos/${vid}/manifest/${encodeURIComponent(cdn720)}?access_token=${encodeURIComponent(geo.access_token)}`,
  `${site}/api/v1/videos/${vid}/manifest/${cdn720}&access_token=${encodeURIComponent(geo.access_token)}`,
];

for (const u of urls) {
  console.log('\n====', u.slice(0, 160), '====');
  const r = await flareJson(u);
  console.log(r.type, typeof r.body === 'string' ? r.body.slice(0, 300) : JSON.stringify(r.body).slice(0, 300));
}

// cdn-access token
const ca = (await flareJson(`${site}/api/v1/videos/${vid}/cdn-access?${q}`)).body;
console.log('\ncdn-access', ca);

const rel = new URL(cdn720).pathname.slice(1) + new URL(cdn720).search;
const u2 = `${site}/api/v1/videos/${vid}/manifest/${rel}&access_token=${encodeURIComponent(ca.access_token || geo.access_token)}`;
console.log('\n==== cdn-access manifest ====');
const r2 = await flareJson(u2);
console.log(r2.type, typeof r2.body === 'string' ? r2.body.slice(0, 300) : JSON.stringify(r2.body).slice(0, 300));
