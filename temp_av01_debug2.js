import axios from 'axios';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const site = 'https://www.av01.media';
const vid = 220625;
const referer = `${site}/cn/video/${vid}`;

async function flare(url) {
  const r = await axios.post(FLARE, { cmd: 'request.get', url, maxTimeout: 120000 });
  const body = r.data.solution.response;
  if (typeof body === 'string' && body.includes('#EXTM3U')) return body;
  const m = String(body).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try { return JSON.parse(m ? m[1] : body); } catch { return body; }
}

const geo = await flare('https://files.iw01.xyz/edge/geo.js?json');
console.log('geo', geo.ip, !!geo.access_token);

const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
const pl = await flare(`${site}/api/v1/videos/${vid}/playlist?${q}`);
const master = Buffer.from(pl.src.split('base64,')[1], 'base64').toString('utf8');
console.log('master lines', master.split('\n').filter((l) => l.startsWith('http')).length);

// website rewrite: full line as manifest path
function rewriteLine(vid, line, token) {
  const x = line.trim();
  if (!x || x.startsWith('#')) return line;
  const I = x.includes('?') ? '&' : '?';
  return `${site}/api/v1/videos/${vid}/manifest/${x}${I}access_token=${encodeURIComponent(token)}`;
}

const cdn720 = master.split('\n').find((l) => l.includes('sv2'));
console.log('\ncdn line:', cdn720?.slice(0, 120));

const tests = [
  `${site}/api/v1/videos/${vid}/manifest/master.m3u8?hb=${encodeURIComponent(geo.access_token)}`,
  rewriteLine(vid, cdn720, geo.access_token),
  (() => {
    const u = new URL(cdn720);
    const rel = u.pathname.slice(1) + u.search;
    return `${site}/api/v1/videos/${vid}/manifest/${rel}&access_token=${encodeURIComponent(geo.access_token)}`;
  })(),
];

for (const u of tests) {
  const r = await flare(u);
  const ok = typeof r === 'string' && r.includes('#EXTM3U');
  console.log('\n', ok ? 'OK' : 'FAIL', u.slice(0, 150));
  if (ok) {
    console.log(r.slice(0, 400));
    const seg = r.split('\n').find((l) => l.trim() && !l.startsWith('#'));
    console.log('first media', seg?.slice(0, 120));
  } else {
    console.log(String(r).slice(0, 150));
  }
}

// rewritten master
const rewritten = master.split('\n').map((l) => {
  const t = l.trim();
  if (t.startsWith('#') || !t) return l;
  return rewriteLine(vid, t, geo.access_token);
}).join('\n');
console.log('\n=== rewritten master sample ===');
console.log(rewritten.slice(0, 500));
