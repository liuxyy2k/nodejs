import axios from 'axios';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const site = 'https://www.av01.media';
const CDN = 'https://customers.iw01.xyz';
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
  if (typeof body === 'string' && body.includes('#EXTM3U')) return { type: 'm3u8', body };
  const m = String(body).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try { return { type: 'json', body: JSON.parse(m ? m[1] : body) }; } catch { return { type: 'text', body: String(body).slice(0, 300) }; }
}

const geo = (await flare('https://files.iw01.xyz/edge/geo.js?json')).body;
const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const pl = (await flare(`${site}/api/v1/videos/${vid}/playlist?${q}`)).body;
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
const cdn720 = master.split('\n').find((l) => l.includes('sv2'));
console.log('cdn720', cdn720.slice(0, 100));

const ca = (await flare(`${site}/api/v1/videos/${vid}/cdn-access?${q}`)).body;
const spa = ca.access_token || geo.access_token;
console.log('spa token from', ca.access_token ? 'cdn-access' : 'geo');

function buildManifest(cdnLine, token) {
  const x = cdnLine.trim();
  const I = x.includes('?') ? '&' : '?';
  return `${CDN}/api/v1/videos/${vid}/manifest/${x}${I}access_token=${encodeURIComponent(token)}`;
}

const tests = [
  buildManifest(cdn720, spa),
  `${CDN}/api/v1/videos/${vid}/manifest/master.m3u8?hb=${encodeURIComponent(spa)}`,
];
for (const u of tests) {
  const r = await flare(u);
  console.log('\n', r.type, u.slice(0, 130));
  console.log(r.type === 'm3u8' ? r.body.slice(0, 350) : JSON.stringify(r.body).slice(0, 200));
}
