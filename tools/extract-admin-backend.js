import fs from 'fs';
import pkg from 'js-beautify';
const beautify = pkg.js;

const s = fs.readFileSync('index.js', 'utf8');
const start = s.indexOf('var nU={};za(nU,{default:()=>rU})');
if (start < 0) {
  console.error('module start not found');
  process.exit(1);
}

// grab a large chunk after module marker; rU should be nearby
const chunk = s.slice(start, start + 250000);
const pretty = beautify(chunk, { indent_size: 2, max_preserve_newlines: 2 });
fs.writeFileSync('tools/admin-backend.pretty.js', pretty, 'utf8');

// find route registrations
const routes = [...pretty.matchAll(/\.(get|post|put|delete)\("([^"]+)"/g)].map(m => `${m[1].toUpperCase()} ${m[2]}`);
const uniq = [...new Set(routes)];
console.log('Routes found:', uniq.length);
uniq.forEach(r => console.log(r));
