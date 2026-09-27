import axios from 'axios';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const site = 'https://www.av01.media';
const cdnHost = 'https://customers.iw01.xyz';
const vid = 220625;

async function flare(url) {
  const r = await axios.post(FLARE, {
    cmd: 'request.get',
    url,
    maxTimeout: 120000,
    headers: {
      Referer: `${site}/cn/video/${vid}`,
      Origin: site,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });
  const body = r.data.solution.response;
  if (typeof body === 'string' && body.includes('#EXTM3U')) return body;
  const m = String(body).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try { return JSON.parse(m ? m[1] : body); } catch { return String(body).slice(0, 200); }
}

const geo = await flare('https://files.iw01.xyz/edge/geo.js?json');
const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const ca = await flare(`${site}/api/v1/videos/${vid}/cdn-access?${q}`);
const spa = ca.access_token;
const pl = await flare(`${site}/api/v1/videos/${vid}/playlist?${q}`);
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
const cdn720 = master.split('\n').find((l) => l.includes('sv2'));
const manifest = `${cdnHost}/api/v1/videos/${vid}/manifest/${cdn720.trim()}&access_token=${encodeURIComponent(spa)}`;
console.log('manifest url len', manifest.length);
const m3u8 = await flare(manifest);
console.log('variant', typeof m3u8 === 'string' && m3u8.includes('#EXTM3U') ? 'OK' : 'FAIL');
if (typeof m3u8 === 'string' && m3u8.includes('#EXTM3U')) {
  console.log(m3u8.slice(0, 400));
  const segLine = m3u8.split('\n').find((l) => l.trim() && !l.startsWith('#'));
  console.log('seg line', segLine?.slice(0, 120));
}
