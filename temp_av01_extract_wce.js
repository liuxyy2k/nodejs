import fs from 'fs';
const js = fs.readFileSync('temp_av01_bundle.js.txt', 'utf8');
const start = js.indexOf('function wce(');
console.log(js.slice(start, start + 2500));
