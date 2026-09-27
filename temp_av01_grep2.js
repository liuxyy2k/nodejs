import fs from 'fs';
const js = fs.readFileSync('temp_av01_bundle.js.txt', 'utf8');
for (const k of ['wce=', 'function wce', 'is_hot', 'getMasterManifestText', 'playlist?', 'Oe.current']) {
  const i = js.indexOf(k);
  if (i >= 0) console.log('\n---', k, '---\n', js.slice(Math.max(0, i - 50), i + 400));
}
