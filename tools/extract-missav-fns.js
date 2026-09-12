import fs from 'fs';
import pkg from 'js-beautify';

const beautify = pkg.js;
const s = fs.readFileSync('index.js', 'utf8');

const fns = ['bxe', 'hxe', 'gxe', 'vxe', 'yxe'];
const positions = [];

for (const fn of fns) {
  const patterns = [
    `async function ${fn}(`,
    `function ${fn}(`,
    `var ${fn}=async`,
    `,${fn}=async`,
    `${fn}=async function`,
  ];
  let found = -1;
  for (const p of patterns) {
    const i = s.indexOf(p);
    if (i >= 0) {
      found = i;
      break;
    }
  }
  positions.push({ fn, found });
  console.log(fn, found >= 0 ? found : 'NOT FOUND');
}

// Also find helper: getSite, request for missav - search near first fn
const anchor = positions.find((p) => p.found >= 0)?.found ?? -1;
if (anchor < 0) process.exit(1);

const start = Math.max(0, anchor - 3000);
const end = Math.min(s.length, anchor + 25000);
const chunk = s.slice(start, end);
fs.writeFileSync('tools/extracted-missav-fns.js', beautify(chunk, { indent_size: 2 }), 'utf8');
console.log('Wrote slice', start, end);
