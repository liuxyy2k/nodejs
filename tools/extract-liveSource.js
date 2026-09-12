import fs from 'fs';
import pkg from 'js-beautify';

const beautify = pkg.js;
const s = fs.readFileSync('index.js', 'utf8');

const anchor = 'key:"liveSource"';
const pos = s.indexOf(anchor);
if (pos < 0) throw new Error('liveSource not found');

// find ny function (parse m3u8) - usually before yq module
const start = s.lastIndexOf('var vq=new Map', pos);
const end = s.indexOf('dt();', pos) + 5;
const chunk = s.slice(start > 0 ? start : pos - 8000, end + 200);
fs.writeFileSync('tools/extracted-liveSource.js', beautify(chunk, { indent_size: 2 }), 'utf8');
console.log('Wrote', start, end, 'len', end - start);
