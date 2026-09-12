import fs from 'fs';

const s = fs.readFileSync('index.js', 'utf8');

function extractJsonAfter(key) {
  const i = s.indexOf(key + '=');
  if (i < 0) return null;
  const start = i + key.length + 1;
  const open = s[start];
  if (open !== '[' && open !== '{') return null;
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let j = start; j < s.length; j++) {
    const ch = s[j];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return Function(`return ${s.slice(start, j + 1)}`)();
    }
  }
  return null;
}

const defaults = {
  jableActors: extractJsonAfter('QH'),
  missavActors: extractJsonAfter('ZH'),
  searchModelIndex: extractJsonAfter('EH')?.model || [],
  searchModels: extractJsonAfter('_H')?.models || [],
};

fs.writeFileSync('src/website/admin/defaults.json', JSON.stringify(defaults, null, 2));
console.log('Wrote src/website/admin/defaults.json');
