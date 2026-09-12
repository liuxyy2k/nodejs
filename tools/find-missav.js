import fs from 'fs';

const s = fs.readFileSync('index.js', 'utf8');
const needles = [
  'nineyu', 'surrit', 'dm515', 'missavSite', '/missavCookie',
  'key:"missav"', 'MissAV', 'cn/actresses', 'playlist.m3u8',
  'text-secondary', '🔥MissAV', 'missav.ws', 'missav.live',
  'gap-4.gap-y-8', 'vod_play_from',
];
for (const n of needles) {
  const i = s.indexOf(n);
  console.log(n, i >= 0 ? i : 'NOT FOUND');
}
