import fs from 'fs';
const js = fs.readFileSync('temp_av01_bundle.js.txt', 'utf8');
const keys = ['addCompParameter', 'M1=', 'function M1', 'manifest/', 'hls_layout===1', 'hls_layout==1', 'fmp4/', 'remotePlaybackLoader', 'getMasterManifest'];
for (const k of keys) {
  let i = 0, n = 0;
  while ((i = js.indexOf(k, i)) !== -1 && n < 2) {
    console.log('\n---', k, '---');
    console.log(js.slice(Math.max(0, i - 100), i + 200));
    i += k.length; n++;
  }
}
