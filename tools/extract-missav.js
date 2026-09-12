import fs from 'fs';
import pkg from 'js-beautify';

const beautify = pkg.js;
const s = fs.readFileSync('index.js', 'utf8');

const anchor = 'key:"missav"';
const pos = s.indexOf(anchor);
if (pos < 0) throw new Error('missav spider not found');

// Slice backward/forward around anchor
const start = pos - 12000;
const end = pos + 8000;
const chunk = s.slice(start, end);

// Find missav module object: pattern like `var XXX={meta:{key:"missav"`
const re = /var (\w+)=\{meta:\{key:"missav"/;
const m = chunk.match(re);
if (!m) {
  fs.writeFileSync('tools/extracted-missav-raw.js', beautify(chunk, { indent_size: 2 }), 'utf8');
  console.log('Could not isolate module, wrote raw slice', start, end);
  process.exit(1);
}

const varName = m[1];
const modStart = start + chunk.indexOf(`var ${varName}={meta:{key:"missav"`);

// Find end: `};dt();` or next spider `var YYY={meta:`
let modEnd = modStart;
const tail = s.slice(modStart, modStart + 20000);
const endMatch = tail.match(/\},api:async[^}]+\}\};(?:dt\(\);|var \w+=\{meta:)/);
if (endMatch) {
  modEnd = modStart + tail.indexOf(endMatch[0].replace(/var \w+=\{meta:$/, ''));
  if (endMatch[0].includes('dt();')) modEnd = modStart + tail.indexOf('};dt();') + 2;
  else modEnd = modStart + tail.indexOf('};var ') + 1;
} else {
  modEnd = modStart + 15000;
}

const mod = s.slice(modStart, modEnd);
const pretty = beautify(mod, { indent_size: 2, max_preserve_newlines: 2 });
fs.writeFileSync('tools/extracted-missav.js', pretty, 'utf8');
console.log('var', varName, 'at', modStart, '-', modEnd, 'len', modEnd - modStart);
