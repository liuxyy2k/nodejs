import axios from 'axios';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const site = 'https://www.av01.media';

async function flare(url, headers = {}) {
  const r = await axios.post(FLARE, { cmd: 'request.get', url, maxTimeout: 120000, headers });
  const body = r.data.solution.response;
  if (typeof body === 'string' && body.includes('#EXTM3U')) return body;
  const m = String(body).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try { return JSON.parse(m ? m[1] : body); } catch { return body; }
}

const hdr = {
  Referer: `${site}/cn/video/220625`,
  Origin: site,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

const geo = await flare('https://files.iw01.xyz/edge/geo.js?json');
const vid = 220625;
const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const pl = await flare(`${site}/api/v1/videos/${vid}/playlist?${q}`);
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
const cdn720 = master.split('\n').find((l) => l.includes('sv2'));
console.log('try direct CDN with referer');
const cdn = await flare(cdn720, hdr);
console.log(typeof cdn === 'string' && cdn.includes('#EXTM3U') ? 'CDN OK' : String(cdn).slice(0, 200));

// try v2 video
const latest = await flare(`${site}/api/v1/videos/types/latest?page=1&limit=30`);
const v2 = latest.videos?.find((v) => v.hls_layout === 0);
console.log('\nv2 video', v2?.id, v2?.dvd_id, v2?.storage_base);
if (v2) {
  const pl2 = await flare(`${site}/api/v1/videos/${v2.id}/playlist?${q}`);
  console.log('v2 playlist', pl2?.src ? 'ok' : pl2);
  if (pl2?.src) {
    const m2 = Buffer.from(pl2.src.split('base64,')[1], 'base64').toString('utf8');
    console.log('v2 master', m2.slice(0, 400));
    const line = m2.split('\n').find((l) => l.startsWith('http'));
    if (line) {
      const man = `${site}/api/v1/videos/${v2.id}/manifest/${line}&access_token=${encodeURIComponent(geo.access_token)}`;
      const man2 = `${site}/api/v1/videos/${v2.id}/manifest/v2${v2.storage_base}/master.m3u8?access_token=${encodeURIComponent(geo.access_token)}`;
      for (const u of [man, man2]) {
        const r = await flare(u, hdr);
        console.log('\n', u.slice(0, 130));
        console.log(typeof r === 'string' && r.includes('#EXTM3U') ? r.slice(0, 250) : JSON.stringify(r).slice(0, 150));
      }
    }
  }
}
