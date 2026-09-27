import axios from 'axios';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const site = 'https://www.av01.media';

async function flare(url) {
  const r = await axios.post(FLARE, { cmd: 'request.get', url, maxTimeout: 120000 });
  const body = r.data.solution.response;
  const m = String(body).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try { return JSON.parse(m ? m[1] : body); } catch { return body; }
}

const geo = await flare('https://files.iw01.xyz/edge/geo.js?json');
const q = `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;

for (const ep of ['hottest', 'latest']) {
  const data = await flare(`${site}/api/v1/videos/types/${ep}?page=1&limit=50`);
  const v0 = data.videos?.filter((v) => v.hls_layout === 0).slice(0, 3);
  console.log(ep, 'layout0 count', data.videos?.filter((v) => v.hls_layout === 0).length);
  for (const v of v0 || []) {
    const pl = await flare(`${site}/api/v1/videos/${v.id}/playlist?${q}`);
    console.log(' ', v.id, v.dvd_id, pl?.src ? 'pl ok' : pl);
  }
}
