import fs from 'fs';
import pkg from 'js-beautify';
const beautify = pkg.js;

const s = fs.readFileSync('index.js', 'utf8');

const slices = [
  ['cookie-jar', s.indexOf('clearCookies(') - 500, 8000],
  ['m3u8-accel', s.indexOf('function Vn(') - 200, 120000],
  ['monitor', s.indexOf('function iH(') - 200, 15000],
  ['m3u8-gateway', s.indexOf('registerM3u8Gateway') - 500, 80000],
];

for (const [name, start, len] of slices) {
  if (start < 0) {
    console.log('skip', name);
    continue;
  }
  const chunk = s.slice(start, start + len);
  fs.writeFileSync(`tools/extracted-${name}.js`, beautify(chunk, { indent_size: 2 }), 'utf8');
  console.log('Wrote', name, 'from', start);
}
