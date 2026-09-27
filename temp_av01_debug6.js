import axios from 'axios';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const site = 'https://www.av01.media';
const vid = 220625;

async function flare(url, headers = {}) {
  const r = await axios.post(FLARE, { cmd: 'request.get', url, maxTimeout: 120000, headers: {
    Referer: `${site}/cn/video/${vid}`,
    Origin: site,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: '*/*',
    ...headers,
  }});
  const body = r.data.solution.response;
  if (typeof body === 'string' && body.includes('#EXTM3U')) return body;
  const m = String(body).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try { return JSON.parse(m ? m[1] : body); } catch { return String(body).slice(0, 300); }
}

const geo = await flare('https://files.iw01.xyz/edge/geo.js?json');
console.log('geo comp?', geo.comp, 'is_hot in token?', geo.access_token?.slice(0, 20));

const urls = [
  `${site}/api/v1/videos/${vid}/manifest/master.m3u8?hb=${encodeURIComponent(geo.access_token)}`,
  `${site}/api/v1/videos/${vid}/manifest/master.m3u8?hb=${encodeURIComponent(geo.access_token)}&comp=true`,
  `${site}/api/v1/videos/${vid}/manifest/master.m3u8?access_token=${encodeURIComponent(geo.access_token)}`,
];
for (const u of urls) {
  const r = await flare(u);
  console.log('\n', u.includes('comp') ? 'comp' : u.includes('hb') ? 'hb' : 'access', typeof r === 'string' && r.includes('#EXTM3U') ? 'OK' : r);
}
