import fs from 'fs';

const s = fs.readFileSync('index.js', 'utf8');

const titles = [...new Set([...s.matchAll(/<title>([^<]+)<\/title>/g)].map(m => m[1]))];
console.log('=== Page titles ===');
titles.forEach(t => console.log(t));

const getRoutes = [...new Set([...s.matchAll(/\.get\("(\/website[^"]*)/g)].map(m => m[1]))];
const postRoutes = [...new Set([...s.matchAll(/\.post\("(\/website[^"]*)/g)].map(m => m[1]))];
const putRoutes = [...new Set([...s.matchAll(/\.put\("(\/website[^"]*)/g)].map(m => m[1]))];
const delRoutes = [...new Set([...s.matchAll(/\.delete\("(\/website[^"]*)/g)].map(m => m[1]))];

console.log('\n=== GET routes ===');
getRoutes.forEach(r => console.log(r));
console.log('\n=== POST routes ===');
postRoutes.forEach(r => console.log(r));
console.log('\n=== PUT routes ===');
putRoutes.forEach(r => console.log(r));
console.log('\n=== DELETE routes ===');
delRoutes.forEach(r => console.log(r));

// Find HTML template variable assignments near line 739
const idx = s.indexOf('var RH,CH=');
console.log('\n=== HTML block start at ===', idx);
if (idx > 0) {
  console.log(s.slice(idx, idx + 200));
}
