import req from '../../util/req.js';

// JaSex https://jasex.st — English JAV site, no login wall for browsing/playback.
// Listing: /censored, /uncensored, /engsub, /amateur, /genre/<slug>, pagination <base>/page-N (28 cards/page).
// Cards: <a class="poster-card" href="/<slug>"> with direct pics.jasex.st poster, title + code meta.
// Detail: player servers VIP/DST/SHG/LLV/STP as data-server buttons with episode ids.
// Playback: servers resolve in page order (VIP first) via /api/episodes/<id>/player embed URLs.
// - VIP (vid-snap-player): /api/playlist-token/<uuid> gives signed token t; stream is /v/<t>
//   (302 to a signed single-rendition 1080p HLS master; variant segments are .png-disguised .ts).
// - LLV (luluvid): packed jwplayer setup unpacks to a direct master m3u8 (AES-128, .ts segments).
// - SHG (javv): packed links{hls3,hls4}; hls3 master.txt chain verified (720p, .woff2-disguised .ts).
// - DST is DoodStream behind a Turnstile captcha (skipped, never bypassed); STP streamtape not
//   attempted (direct stream unverified). Each server is single-rendition — no fabricated tiers;
//   the play option label names the server and its verified rendition. Subtitles per item with
//   a 番号 (JaSex items carry a code in the detail facts and in the slug, so most items qualify).
const HOST = 'https://jasex.st';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const VIDSNAP = 'https://vid-snap-player.com';

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

function cleanLabel(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\r\n\t]+/g, ' ').replace(/[$#]/g, '').trim();
}

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
  return s;
}

async function getHtml(path, referer) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

async function getJson(url, referer) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'application/json' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return null;
    if (r.data && typeof r.data === 'object') return r.data;
    if (typeof r.data === 'string' && r.data.trim()) {
      try { return JSON.parse(r.data); } catch (e) { return null; }
    }
    return null;
  } catch (e) { return null; }
}

// 字幕芯取数原语（与 py_mogu 一致）：统一回 {status, body}
async function reqRaw(url, headers, timeoutMs) {
  try {
    let r;
    if (typeof req === 'function') {
      r = await req({ method: 'GET', url, headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5 });
    } else {
      r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
    }
    const body = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    return { status: r.status || 0, body, headers: r.headers || {}, err: null };
  } catch (e) {
    return { status: 0, body: '', headers: {}, err: e };
  }
}

// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();
const subResultCache = new Map();

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  // JaSex: detail URL is /<slug> (e.g. /fns-267, /fc2ppv-5001073, /carib-110426-001).
  // Keep hyphens intact so subExtractCode can match CODE-NNN patterns.
  const path = String(durl || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
  const slug = path.split('/').filter(Boolean).pop() || '';
  return slug ? clean(slug) : '';
}

function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b[A-Z]{2,10}-\d{2,8}[A-Z]?\b/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) return m[0].replace(/\s+/g, '-').replace(/-+/g, '-');
  }
  return '';
}

function subCtx(durl) {
  const title = (subNameCache.get(durl) || subSlugTitle(durl) || '').trim();
  const code = subExtractCode(title) || subExtractCode(String(durl || ''));
  const compact = code ? code.replace(/[-_ ]/g, '') : '';
  let titlePart = '';
  if (code && title) {
    titlePart = title
      .replace(new RegExp(code.replace(/[-_]/g, '[-_ ]?'), 'i'), ' ')
      .replace(/\b(UNCENSORED|LEAK|OTHER|COMPLETE|FULL|HDR|WEB|BLURAY|BDRIP|WEBDL|REMUX|X264|X265|10BIT|8BIT|HEVC|AVC)\b/gi, ' ')
      .replace(/\b(?:EP|E|S|SEASON)\s*\d{1,3}\b/gi, ' ')
      .replace(/^[\s\-_:]+|[\s\-_:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (titlePart === code || titlePart === compact) titlePart = '';
  }
  return { title, code, compact, titlePart };
}

function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

function subMatchOf(durl, ctx) {
  const text = ((ctx.title || '') + ' ' + String(durl || '')).trim().toLowerCase();
  const title = (ctx.title || '').toLowerCase();
  return {
    text,
    loose: text.replace(/[-_\s.]/g, ''),
    title,
    titleLoose: title.replace(/[-_\s.]/g, ''),
  };
}

function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

function subFmtOf(name, ext, url) {
  const hay = (String(name || '') + ' ' + String(url || '')).toLowerCase();
  if (/\.(zip|rar|7z)(\?|#|$)/.test(hay)) return '';
  const fromName = String(name || '').toLowerCase().match(/\.(srt|vtt|ass|ssa)$/);
  if (fromName) return fromName[1];
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (/^(srt|vtt|ass|ssa)$/.test(e)) return e;
  const fromUrl = String(url || '').match(SUB_TEXT_RE);
  if (fromUrl) return fromUrl[1].toLowerCase();
  return '';
}

function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await reqRaw('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
      { 'User-Agent': 'ForwardWidgets/1.0.2', Accept: '*/*' }, 3000);
    if (r.status !== 200 || !r.body) return [];
    let j;
    try { j = JSON.parse(r.body); } catch (e) { return []; }
    if (!j || Number(j.code) !== 0 || !Array.isArray(j.data)) return [];
    return j.data;
  })();
  ocache.set(key, p);
  return p;
}

function subNormItem(it) {
  const name = String(it.name || it.Name || it.title || it.Title || it.filename || it.FileName || '字幕');
  const langs = Array.isArray(it.languages) ? it.languages.join(',')
    : (Array.isArray(it.Languages) ? it.Languages.join(',') : String(it.langs || it.Langs || it.language || ''));
  return {
    name,
    langs,
    ext: String(it.ext || it.Ext || it.format || it.Format || ''),
    url: String(it.url || it.Url || ''),
    cid: Boolean(it.cid_match ?? it.CidMatch),
    down: Number(it.down_count || it.DownCount || it.downloads || it.Downloads || 0) || 0,
    score: Number(it.score || it.Score || 0) || 0,
    fp: Number(it.fingerprintf_score || it.fingerprint_score || it.FingerprintScore || it.fingerprintfScore || 0) || 0,
    duration: Number(it.duration || it.Duration || 0) || 0,
    size: Number(it.file_size || it.FileSize || it.size || it.Size || 0) || 0,
  };
}

function subRelevant(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  if (ctx.code) {
    if (text.includes(ctx.code.toLowerCase())) return true;
    if (ctx.compact && loose.includes(ctx.compact.toLowerCase())) return true;
  }
  if (!match.text) return false;
  return text.includes(match.text) || loose.includes(match.loose)
    || (match.title ? (text.includes(match.title) || loose.includes(match.titleLoose)) : false)
    || match.text.includes(text);
}

function subScoreItem(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  let s = (it.cid ? 100000 : 0) + it.down / 10000;
  if (ctx.code && (text.includes(ctx.code.toLowerCase()) || (ctx.compact && loose.includes(ctx.compact.toLowerCase())))) s += 25000;
  s += Math.max(0, it.score) + Math.max(0, it.fp);
  if (it.duration > 0) s += 50;
  if (it.size > 0) s += Math.min(it.size / 1024 / 1024, 20);
  if (match.title && (text.includes(match.title) || loose.includes(match.titleLoose))) s += 1000;
  if (ctx.code) s += 500;
  if (text.includes('sub') || text.includes('subtitle') || text.includes('字幕')) s += 300;
  return s;
}

async function subSlotOracle(keys, src, tier, ctx, match, ocache, bag) {
  let pool = null;
  for (const k of keys) {
    const list = await subOracle(k, ocache);
    if (list && list.length) { pool = list; break; }
  }
  if (!pool) return;
  const items = [];
  for (const raw of pool) {
    if (!raw) continue;
    const it = subNormItem(raw);
    if (!it.url) continue;
    const fmt = subFmtOf(it.name, it.ext, it.url);
    if (!fmt) continue;
    items.push({ name: it.name, langs: it.langs, ext: it.ext, url: it.url, fmt, norm: it });
  }
  if (!items.length) return;
  const finalItems = items.filter((it) => subRelevant(it, ctx, match));
  for (const it of finalItems) {
    const lang = subLangOf(it.name, it.langs);
    bag.push({ src, tier, name: subDispName(it.name, ctx.code), url: it.url, fmt: it.fmt, lang: lang.tag, langRank: lang.rank, score: subScoreItem(it.norm, ctx, match), dur: it.norm.duration });
  }
}

async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await reqRaw('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 5000);
  if (r.status !== 200 || !r.body) return;
  const pages = [];
  const seen = new Set();
  for (const m of r.body.matchAll(/href="(subs\/\d+\/[^"]+\.html)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    pages.push(m[1]);
    if (pages.length >= 3) break;
  }
  await Promise.all(pages.map(async (p) => {
    const pr = await reqRaw('https://subtitlecat.com/' + p, { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 4000);
    if (pr.status !== 200 || !pr.body) return;
    for (const m of pr.body.matchAll(/href="(\/subs\/\d+\/[^"]+\.(?:srt|vtt|ass))"/gi)) {
      let nm = m[1].split('/').pop() || '字幕';
      try { nm = decodeURIComponent(nm); } catch (e) { /* 保持原样 */ }
      if (!subRelevant({ name: nm, langs: '', ext: '' }, ctx, match)) continue;
      const lang = subLangOf(nm, '');
      const fmt = (nm.match(/\.(srt|vtt|ass)$/i) || [])[1].toLowerCase();
      bag.push({ src: 'SubtitleCat', tier: 2, name: nm, url: 'https://subtitlecat.com' + m[1], fmt, lang: lang.tag, langRank: lang.rank, score: 0 });
    }
  }));
}

function subDurSec(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  return s > 0 ? s : 0;
}
function subDurStr(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}
function subMerge(items) {
  const sorted = items.slice().sort((a, b) =>
    (a.tier - b.tier) || (a.langRank - b.langRank) || (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
  const seenUrl = new Set();
  const seenName = new Set();
  const perTier = {};
  const out = [];
  for (const it of sorted) {
    if (out.length >= 10) break;
    if (seenUrl.has(it.url)) continue;
    const nameKey = (it.lang || '') + '|' + it.name.toLowerCase().replace(/\.(srt|vtt|ass|ssa)$/i, '') + '|' + (subDurSec(it.dur) || 'nodur');
    if (seenName.has(nameKey)) continue;
    if ((perTier[it.tier] || 0) >= 8) continue;
    seenUrl.add(it.url);
    seenName.add(nameKey);
    perTier[it.tier] = (perTier[it.tier] || 0) + 1;
    const cleanName = it.name.replace(/\.(srt|vtt|ass|ssa)$/i, '').slice(0, 60);
    const dur = subDurStr(it.dur);
    out.push({ name: it.src + '·' + (it.lang ? it.lang + '·' : '') + cleanName + (dur ? '·' + dur : ''), url: it.url, format: it.fmt });
  }
  return out;
}

const subInflight = new Map();

async function subSearchAll(durl) {
  const hit = subResultCache.get(durl);
  if (hit && Date.now() - hit.ts < SUB_TTL) return hit.subs;
  if (subInflight.has(durl)) return subInflight.get(durl);
  const p = (async () => {
    const ctx = subCtx(durl);
    let subs = [];
    if (ctx.code || ctx.title) {
      const match = subMatchOf(durl, ctx);
      const bag = [];
      const ocache = new Map();
      const jobs = [
        subSlotOracle(subKeysX(ctx), '迅雷', 0, ctx, match, ocache, bag),
        subSlotOracle(subKeysXL(ctx), '迅雷看看', 1, ctx, match, ocache, bag),
        subFromSubtitleCat(ctx, match, bag),
      ].map((jp) => Promise.resolve(jp).catch(() => {}));
      const all = Promise.allSettled(jobs);
      await Promise.race([all, new Promise((r) => setTimeout(r, 6000))]);
      subs = subMerge(bag);
      if (subs.length) {
        subResultCache.set(durl, { ts: Date.now(), subs });
        if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
      } else {
        all.then(() => {
          const late = subMerge(bag);
          if (late.length) {
            subResultCache.set(durl, { ts: Date.now(), subs: late });
            if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
          }
        }).catch(() => {});
      }
    }
    return subs;
  })();
  subInflight.set(durl, p);
  try { return await p; } finally { subInflight.delete(durl); }
}

function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}

const GENRES = [{"v": "solowork", "n": "Solowork"}, {"v": "creampie", "n": "Creampie"}, {"v": "big-tits", "n": "Big Tits"}, {"v": "married-woman", "n": "Married Woman"}, {"v": "blowjob", "n": "Blowjob"}, {"v": "slender", "n": "Slender"}, {"v": "beautiful-girl", "n": "Beautiful Girl"}, {"v": "slut", "n": "Slut"}, {"v": "amateur", "n": "Amateur"}, {"v": "mature-woman", "n": "Mature Woman"}, {"v": "cuckold", "n": "Cuckold"}, {"v": "pov", "n": "POV"}, {"v": "pretty-tits", "n": "Pretty Tits"}, {"v": "drama", "n": "Drama"}, {"v": "squirting", "n": "Squirting"}, {"v": "digital-mosaic", "n": "Digital Mosaic"}, {"v": "nasty-hardcore", "n": "Nasty, Hardcore"}, {"v": "3p-4p", "n": "3P, 4P"}, {"v": "hi-def", "n": "Hi-Def"}, {"v": "acme-orgasm", "n": "Acme · Orgasm"}, {"v": "cowgirl", "n": "Cowgirl"}, {"v": "kiss", "n": "Kiss"}, {"v": "titty-fuck", "n": "Titty Fuck"}, {"v": "school-girls", "n": "School Girls"}, {"v": "pantyhose", "n": "Pantyhose"}, {"v": "facials", "n": "Facials"}, {"v": "older-sister", "n": "Older Sister"}, {"v": "handjob", "n": "Handjob"}, {"v": "deep-throating", "n": "Deep Throating"}, {"v": "uniform", "n": "Uniform"}, {"v": "ol", "n": "OL"}, {"v": "paipan", "n": "Paipan"}, {"v": "promiscuity", "n": "Promiscuity"}, {"v": "4k", "n": "4K"}, {"v": "affair", "n": "Affair"}, {"v": "debut-production", "n": "Debut Production"}, {"v": "sweet-ass", "n": "Sweet Ass"}, {"v": "abuse", "n": "Abuse"}, {"v": "cosplay", "n": "Cosplay"}, {"v": "huge-butt", "n": "Huge Butt"}, {"v": "other-fetish", "n": "Other Fetish"}, {"v": "risky-mosaic", "n": "Risky Mosaic"}, {"v": "humiliation", "n": "Humiliation"}, {"v": "cunnilingus", "n": "Cunnilingus"}, {"v": "anal", "n": "Anal"}, {"v": "female-teacher", "n": "Female Teacher"}, {"v": "relatives", "n": "Relatives"}, {"v": "urination", "n": "Urination"}, {"v": "subjectivity", "n": "Subjectivity"}, {"v": "documentary", "n": "Documentary"}, {"v": "masturbation", "n": "Masturbation"}, {"v": "butt", "n": "Butt"}, {"v": "dirty-words", "n": "Dirty Words"}, {"v": "lesbian", "n": "Lesbian"}, {"v": "tall", "n": "Tall"}, {"v": "bukkake", "n": "Bukkake"}, {"v": "cum", "n": "Cum"}, {"v": "planning", "n": "Planning"}, {"v": "entertainer", "n": "Entertainer"}, {"v": "fair-skin", "n": "Fair Skin"}, {"v": "leg-fetish", "n": "Leg Fetish"}, {"v": "submissive-woman", "n": "Submissive Woman"}, {"v": "footjob", "n": "Footjob"}, {"v": "sister", "n": "Sister"}, {"v": "toy", "n": "Toy"}, {"v": "lotion", "n": "Lotion"}, {"v": "bareback", "n": "Bareback"}, {"v": "female-college-student", "n": "Female College Student"}, {"v": "submissive-men", "n": "Submissive Men"}, {"v": "huge-cock", "n": "Huge Cock"}, {"v": "back", "n": "Back"}, {"v": "restraint", "n": "Restraint"}, {"v": "gal", "n": "Gal"}, {"v": "hot-spring", "n": "Hot Spring"}, {"v": "school-swimsuit", "n": "School Swimsuit"}, {"v": "various-professions", "n": "Various Professions"}, {"v": "voyeur", "n": "Voyeur"}, {"v": "close-up", "n": "Close Up"}, {"v": "nurse", "n": "Nurse"}, {"v": "prostitutes", "n": "Prostitutes"}, {"v": "sexy-legs", "n": "Sexy Legs"}, {"v": "virgin-man", "n": "Virgin Man"}, {"v": "black-hair", "n": "Black Hair"}, {"v": "nampa", "n": "Nampa"}, {"v": "shibari", "n": "Shibari"}, {"v": "69", "n": "69"}, {"v": "sm", "n": "SM"}, {"v": "sweat", "n": "Sweat"}, {"v": "best-omnibus", "n": "Best, Omnibus"}, {"v": "girl", "n": "Girl"}, {"v": "lesbian-kiss", "n": "Lesbian Kiss"}, {"v": "massage", "n": "Massage"}, {"v": "rape", "n": "Rape"}, {"v": "beauty-shop", "n": "Beauty Shop"}, {"v": "drug", "n": "Drug"}, {"v": "vibe", "n": "Vibe"}, {"v": "av-idol", "n": "AV Idol"}, {"v": "busty-fetish", "n": "Busty Fetish"}, {"v": "conceived", "n": "Conceived"}, {"v": "cross-dressing", "n": "Cross Dressing"}, {"v": "cum-in-mouth", "n": "Cum-in-Mouth"}, {"v": "threesome-foursome", "n": "Threesome / Foursome"}, {"v": "tits", "n": "Tits"}, {"v": "transsexual", "n": "Transsexual"}, {"v": "lingerie", "n": "Lingerie"}, {"v": "long-boots", "n": "Long Boots"}, {"v": "mother", "n": "Mother"}, {"v": "subordinates-colleagues", "n": "Subordinates / Colleagues"}, {"v": "training", "n": "Training"}, {"v": "anal-sex-ts", "n": "Anal Sex (TS)"}, {"v": "bbw", "n": "BBW"}, {"v": "clumsy-and-absent-minded", "n": "Clumsy And Absent-minded"}, {"v": "gangbang", "n": "Gangbang"}, {"v": "school-stuff", "n": "School Stuff"}, {"v": "cheating-wife", "n": "Cheating Wife"}, {"v": "female-investigator", "n": "Female Investigator"}, {"v": "image-video", "n": "Image Video"}, {"v": "kimono-mourning", "n": "Kimono, Mourning"}, {"v": "maid", "n": "Maid"}, {"v": "model", "n": "Model"}, {"v": "nymphomaniac", "n": "Nymphomaniac"}, {"v": "stepmother", "n": "Stepmother"}, {"v": "ultra-huge-tits", "n": "Ultra-Huge Tits"}, {"v": "childhood-friend", "n": "Childhood Friend"}, {"v": "date", "n": "Date"}, {"v": "electric-massager", "n": "Electric Massager"}, {"v": "female-boss", "n": "Female Boss"}, {"v": "finger-fuck", "n": "Finger Fuck"}, {"v": "masturbation-support", "n": "Masturbation Support"}, {"v": "original-collaboration", "n": "Original Collaboration"}, {"v": "outdoors", "n": "Outdoors"}, {"v": "prank", "n": "Prank"}, {"v": "school-uniform", "n": "School Uniform"}, {"v": "secretary", "n": "Secretary"}, {"v": "swimwear", "n": "Swimwear"}, {"v": "underwear", "n": "Underwear"}, {"v": "bitch", "n": "Bitch"}, {"v": "cheating-being-cheated-on-ntr", "n": "Cheating/Being Cheated On/NTR"}, {"v": "enema", "n": "Enema"}, {"v": "evil", "n": "Evil"}, {"v": "facesitting", "n": "Facesitting"}, {"v": "mini", "n": "Mini"}, {"v": "piss-drinking", "n": "Piss Drinking"}, {"v": "bath", "n": "Bath"}, {"v": "bride-young-wife", "n": "Bride, Young Wife"}, {"v": "business-attire", "n": "Business Attire"}, {"v": "cervix", "n": "Cervix"}, {"v": "delusion", "n": "Delusion"}, {"v": "elder-male", "n": "Elder Male"}, {"v": "erotic-wear", "n": "Erotic Wear"}, {"v": "harlem", "n": "Harlem"}, {"v": "impromptu-sex", "n": "Impromptu Sex"}, {"v": "insult", "n": "Insult"}, {"v": "milf", "n": "Milf"}, {"v": "sunburn", "n": "Sunburn"}, {"v": "actress-best", "n": "Actress Best"}, {"v": "anal-sex", "n": "Anal Sex"}, {"v": "athlete", "n": "Athlete"}, {"v": "aunt", "n": "Aunt"}, {"v": "car-sex", "n": "Car Sex"}, {"v": "fan-appreciation", "n": "Fan Appreciation"}, {"v": "fisting", "n": "Fisting"}, {"v": "glasses", "n": "Glasses"}, {"v": "how-to", "n": "How To"}, {"v": "idols-and-entertainers", "n": "Idols And Entertainers"}, {"v": "married-women-housewives", "n": "Married Women/housewives"}, {"v": "no-bra", "n": "No Bra"}, {"v": "sailor-suit", "n": "Sailor Suit"}, {"v": "stewardess", "n": "Stewardess"}, {"v": "widow", "n": "Widow"}, {"v": "adopted-daughter", "n": "Adopted Daughter"}, {"v": "ai-generated-works", "n": "AI-Generated Works"}, {"v": "bloomers", "n": "Bloomers"}, {"v": "celebrity", "n": "Celebrity"}, {"v": "club-activities-manager", "n": "Club Activities / Manager"}, {"v": "confinement", "n": "Confinement"}, {"v": "daydreamers", "n": "Daydreamers"}, {"v": "fantasy", "n": "Fantasy"}, {"v": "gag-comedy", "n": "Gag · Comedy"}, {"v": "hard-sex", "n": "Hard Sex"}, {"v": "hypnosis", "n": "Hypnosis"}, {"v": "landlady-hostess", "n": "Landlady, Hostess"}, {"v": "male-squirting", "n": "Male Squirting"}, {"v": "molester", "n": "Molester"}, {"v": "multiple-story", "n": "Multiple Story"}, {"v": "muscle", "n": "Muscle"}, {"v": "naked-apron", "n": "Naked Apron"}, {"v": "premature-ejaculation", "n": "Premature Ejaculation"}, {"v": "race-queen", "n": "Race Queen"}, {"v": "shotacon", "n": "Shotacon"}, {"v": "tsundere", "n": "Tsundere"}, {"v": "30-s", "n": "30's"}, {"v": "blu-ray", "n": "Blu-ray"}, {"v": "breast-milk", "n": "Breast Milk"}, {"v": "bunny-girl", "n": "Bunny Girl"}, {"v": "couple", "n": "Couple"}, {"v": "cusco", "n": "Cusco"}, {"v": "dildo", "n": "Dildo"}, {"v": "emmanuel", "n": "Emmanuel"}, {"v": "experience-confession", "n": "Experience Confession"}, {"v": "flexible", "n": "Flexible"}, {"v": "high-quality-vr", "n": "High-Quality VR"}, {"v": "knee-socks", "n": "Knee Socks"}, {"v": "leotard", "n": "Leotard"}, {"v": "love", "n": "Love"}, {"v": "mini-skirt", "n": "Mini Skirt"}, {"v": "object-insertion", "n": "Object Insertion"}, {"v": "outdoors-exposure", "n": "Outdoors/Exposure"}, {"v": "pantyhose-and-tights", "n": "Pantyhose And Tights"}, {"v": "reversed-role", "n": "Reversed Role"}, {"v": "sexy", "n": "Sexy"}, {"v": "small-breasts-flat-chested", "n": "Small Breasts / Flat-chested"}, {"v": "soapland", "n": "Soapland"}, {"v": "spanking", "n": "Spanking"}, {"v": "time-stop", "n": "Time Stop"}, {"v": "vomit", "n": "Vomit"}, {"v": "voyeurism-and-peeping", "n": "Voyeurism And Peeping"}, {"v": "white-actress", "n": "White Actress"}, {"v": "yoga", "n": "Yoga"}, {"v": "20-s", "n": "20's"}, {"v": "40-s", "n": "40's"}, {"v": "50-s", "n": "50's"}, {"v": "8kvr", "n": "8KVR"}, {"v": "anchorwoman", "n": "Anchorwoman"}, {"v": "av-open-2015-actress-dept", "n": "AV OPEN 2015 Actress Dept."}, {"v": "bondage", "n": "Bondage"}, {"v": "candle", "n": "Candle"}, {"v": "dance", "n": "Dance"}, {"v": "dead-drunk", "n": "Dead Drunk"}, {"v": "defecation", "n": "Defecation"}, {"v": "egg-vibrator", "n": "Egg Vibrator"}, {"v": "female-doctor", "n": "Female Doctor"}, {"v": "granny", "n": "Granny"}, {"v": "hospital-clinic", "n": "Hospital / Clinic"}, {"v": "instructor", "n": "Instructor"}, {"v": "kimono", "n": "Kimono"}, {"v": "loli", "n": "Loli"}, {"v": "look-alike", "n": "Look-alike"}, {"v": "miss", "n": "Miss"}, {"v": "mistress", "n": "Mistress"}, {"v": "naive", "n": "Naive"}, {"v": "otaku", "n": "Otaku"}, {"v": "post", "n": "Post"}, {"v": "receptionist", "n": "Receptionist"}, {"v": "reluctant", "n": "Reluctant"}, {"v": "sex-conversion-feminized", "n": "Sex Conversion / Feminized"}, {"v": "shave", "n": "Shave"}, {"v": "torture", "n": "Torture"}, {"v": "travel", "n": "Travel"}, {"v": "tutor", "n": "Tutor"}, {"v": "vr", "n": "VR"}, {"v": "vr-exclusive", "n": "VR Exclusive"}, {"v": "young-wife", "n": "Young Wife"}];

const MAIN_CLASSES = [
  { type_id: 'home', type_name: '最新推荐' },
  { type_id: 'censored', type_name: '有码' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'engsub', type_name: '英字' },
  { type_id: 'amateur', type_name: '素人' },
  // User-requested near-matches that genuinely exist on this site:
  { type_id: 'genre/big-tits', type_name: '巨乳 Big Tits' },
  { type_id: 'genre/huge-butt', type_name: '大屁股 Huge Butt' },
  { type_id: 'genre/sweet-ass', type_name: '好屁股 Sweet Ass' },
  { type_id: 'genre/digital-mosaic', type_name: '数码马赛克 Digital Mosaic' },
  { type_id: 'genre/risky-mosaic', type_name: '风险马赛克 Risky Mosaic' },
  { type_id: 'genre_zone', type_name: '题材全部' },
];

function parseCards(html) {
  const byUrl = new Map();
  const re = /<a class="poster-card" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const href = m[1].trim();
    const inner = m[2];
    if (!href || href.startsWith('/genre/') || href.startsWith('/genres')) continue;
    const vUrl = href.startsWith('http') ? href : HOST + href;
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: href, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    const imgM = inner.match(/<img[^>]+src="([^"]+)"/i);
    if (imgM && !it.vod_pic) {
      let pic = imgM[1].trim();
      if (pic.includes('logo')) {
        const fb = inner.match(/data-fallback="([^"]+)"/i);
        if (fb) pic = fb[1].trim();
      }
      if (pic) it.vod_pic = normUrl(pic.startsWith('http') ? pic : absUrl(pic, HOST));
    }
    const tM = inner.match(/poster-card__title">([^<]+)</);
    if (tM && !it.vod_name) it.vod_name = cleanLabel(tM[1]);
    const cM = inner.match(/poster-card__meta">([^<]+)</);
    if (cM && !it.vod_remarks) it.vod_remarks = cleanLabel(cM[1]);
  }
  const out = [];
  for (const it of byUrl.values()) {
    if (it.vod_pic || it.vod_name) {
      if (!it.vod_name) it.vod_name = 'JaSex';
      out.push(it);
    }
  }
  return out;
}

function parseServers(html) {
  const servers = [];
  const re = /<button[^>]*data-server="(\d+)"[^>]*data-episode="(\d+)"[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const name = cleanLabel(m[3]).replace(/\s+/g, ' ').trim();
    if (m[2]) servers.push({ server: m[1], episode: m[2], name: name || ('Server ' + m[1]) });
  }
  // VIP first, then the rest in page order.
  servers.sort((a, b) => (a.name === 'VIP' ? -1 : b.name === 'VIP' ? 1 : 0));
  return servers;
}

// Dean Edwards packer unpack (used by the LLV/SHG filehost embeds, whose jwplayer
// setup is packed). Pure string work, no eval: the packed payload is decoded by
// dictionary substitution, then the stream URL is read out of the decoded setup.
function unpackPacked(html) {
  const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)/);
  if (!m) return '';
  const packed = m[1];
  const radix = parseInt(m[2], 10);
  const count = parseInt(m[3], 10);
  const dict = m[4].split('|');
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const baseN = (n, b) => {
    if (n === 0) return '0';
    let out = '';
    while (n > 0) { out = chars[n % b] + out; n = Math.floor(n / b); }
    return out;
  };
  let out = packed;
  for (let cc = count - 1; cc >= 0; cc--) {
    const word = dict[cc];
    if (!word) continue;
    const re = new RegExp('\\b' + baseN(cc, radix) + '\\b', 'g');
    out = out.replace(re, () => word);
  }
  return out;
}

function embedOrigin(embed) {
  try {
    const u = new URL(embed);
    return u.protocol + '//' + u.host;
  } catch (e) { return ''; }
}

// Resolve one embed URL to { url, embed, label } or null.
// - vid-snap-player (VIP): signed token API, single 1080p rendition.
// - luluvid (LLV, LuluStream clone): packed jwplayer setup, sources[0].file master m3u8.
// - javv (SHG, StreamHG clone): packed links{hls3,hls4,hls2}; hls3 preferred (hls4 path
//   403'd on re-fetch in live checks, hls2 403'd outright) — both verified 720p masters.
// - playmogo/DoodStream (DST): Turnstile captcha wall — skipped, never bypassed.
// - streamtape (STP) and anything else: not attempted (direct stream unverified).
async function resolveEmbed(embed, durl, serverName) {
  if (!embed) return null;
  if (embed.includes('vid-snap-player.com/embed/')) {
    const uuid = embed.split('/').filter(Boolean).pop().split('?')[0];
    if (!uuid) return null;
    const tj = await getJson(VIDSNAP + '/api/playlist-token/' + encodeURIComponent(uuid), embed);
    const token = tj && tj.t ? String(tj.t) : '';
    if (token) return { url: VIDSNAP + '/v/' + token, embed, label: (serverName || 'VIP') + '·1080p' };
    return null;
  }
  if (embed.includes('playmogo.com') || embed.includes('dood')) return null; // captcha wall
  if (!embed.includes('luluvid.xyz') && !embed.includes('javv.xyz')) return null;
  const page = await getHtml(embed, durl);
  if (!page) return null;
  // The packed payload keeps its string quotes backslash-escaped (\"); normalize
  // before pattern matching, otherwise the SHG links values never match.
  const setup = unpackPacked(page).replace(/\\"/g, '"').replace(/\\\//g, '/');
  if (!setup) return null;
  // SHG links pattern first (hls3 stable, hls4 fallback; hls2 excluded — 403 live).
  const linksM = setup.match(/links\s*=\s*\{([^}]*)\}/);
  if (linksM) {
    const getLink = (key) => {
      // Keys are quoted in the object literal ("hls3":"..."), allow the quote.
      const lm = linksM[1].match(new RegExp(key + '"?\\s*:\\s*"([^"]+)"'));
      return lm ? lm[1].replace(/\\\//g, '/') : '';
    };
    for (const key of ['hls3', 'hls4']) {
      let link = getLink(key);
      if (!link) continue;
      if (link.startsWith('/')) link = embedOrigin(embed) + link;
      if (link.includes('m3u8') || link.includes('master.txt')) {
        return { url: link, embed, label: (serverName || 'SHG') + '·720p' };
      }
    }
  }
  // LLV pattern: sources:[{file:"...master.m3u8..."}]
  const fileM = setup.match(/file:\s*"([^"]+\.m3u8[^"]*)"/);
  if (fileM) {
    const link = fileM[1].replace(/\\\//g, '/');
    return { url: link.startsWith('/') ? embedOrigin(embed) + link : link, embed, label: (serverName || 'LLV') + '·Original' };
  }
  return null;
}

async function resolveFromServers(servers, durl) {
  for (const sv of servers) {
    const pj = await getJson(HOST + '/api/episodes/' + encodeURIComponent(sv.episode) + '/player', durl);
    const embed = pj && pj.data && pj.data.embed_url ? String(pj.data.embed_url) : '';
    if (!embed) continue;
    const res = await resolveEmbed(embed, durl, sv.name);
    if (res) return res;
  }
  return null;
}

// Returns { url, embed, label } or null. The embed URL matters as Referer: the vid-snap
// /v/<token> endpoint answers 403 when the request carries Referer https://jasex.st/
// (verified live), but 200 with the embed page as Referer (or none) — the browser player
// runs inside the embed iframe, so its requests carry the embed Referer. Play therefore
// sends the embed Referer, never the jasex.st Referer, for the stream URL.
async function resolveStream(durl) {
  const html = await getHtml(durl);
  if (!html) return null;
  return resolveFromServers(parseServers(html), durl);
}

async function home() {
  const classes = MAIN_CLASSES.slice();
  const filters = {
    genre_zone: [{ key: 'sub', name: '题材', value: GENRES.map((g) => ({ n: g.n, v: g.v })) }],
  };
  let list = [];
  try { list = parseCards(await getHtml('/')).slice(0, 28); } catch (e) { list = []; }
  return { class: classes, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  let base = '/';
  if (zoneId === 'home' || !zoneId) {
    base = '/';
  } else if (zoneId === 'genre_zone') {
    const slug = String(extend.sub || '').trim();
    if (!slug) return { page: 1, pagecount: 1, list: [] };
    base = '/genre/' + slug;
  } else if (zoneId.startsWith('genre/')) {
    base = '/' + zoneId;
  } else if (['censored', 'uncensored', 'engsub', 'amateur'].includes(zoneId)) {
    base = '/' + zoneId;
  } else {
    base = '/' + zoneId;
  }
  if (base === '/') {
    const html = await getHtml('/');
    return { page: 1, pagecount: 1, list: parseCards(html) };
  }
  const path = page === 1 ? base : base + '/page-' + page;
  const html = await getHtml(path);
  const list = parseCards(html);
  const next = html.includes(base + '/page-' + (page + 1)) || html.includes('rel="next"');
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/search?q=' + encodeURIComponent(kw));
  return { page: 1, pagecount: 1, list: parseCards(html) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + (rawId.startsWith('/') ? rawId : '/' + rawId);
  const html = await getHtml(rawId.startsWith('http') ? rawId : rawId);
  if (!html) return { list: [] };
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = 'JaSex';
  if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*[·\-]\s*Jasex\s*$/i, '').trim() || 'JaSex';
  const codeM = html.match(/<dt>Code<\/dt>\s*<dd>([^<]+)<\/dd>/i);
  const code = codeM ? cleanLabel(codeM[1]) : '';
  subCacheName(durl, (code ? code + ' ' : '') + mainTitle);
  let posterPic = '';
  const stillM = html.match(/player__still"[\s\S]{0,600}?<img[^>]+src="([^"]+)"/i);
  if (stillM) posterPic = normUrl(stillM[1].trim());
  if (!posterPic) {
    const pm = html.match(/https:\/\/pics\.jasex\.st\/posters\/[^\s"'<>]+/);
    if (pm) posterPic = pm[0];
  }
  const servers = parseServers(html);
  const stream = await resolveFromServers(servers, durl);
  const playUrl = stream ? stream.url : '';
  const playLabel = stream ? stream.label : 'JaSex';
  const playEmbed = stream ? stream.embed : '';
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: code || 'HD',
      vod_content: code ? ('番号：' + code) : 'JaSex',
      vod_play_from: 'JaSex',
      vod_play_url: playUrl ? (playLabel + '$' + durl + '@@' + playUrl + '@@' + playEmbed) : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let target = id;
  let storedEmbed = '';
  const parts = id.split('@@');
  if (parts.length >= 2) { durl = parts[0]; target = parts[1]; storedEmbed = parts[2] || ''; }
  // Re-resolve at play time: signed tokens/paths are time-limited, so a detail-time
  // URL may have expired by the time the user presses play. Fall back to the
  // stored target only if the fresh resolve fails.
  let fresh = null;
  if (durl) {
    try { fresh = await resolveStream(durl); } catch (e) { fresh = null; }
  }
  const url = fresh ? fresh.url : target;
  if (!url) return { parse: 0, url: '' };
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  // Header set must mirror the embed-page request headers: the LLV/SHG signed stream
  // URLs are bound to that request's header fingerprint (verified live: same token
  // returns 200 with the exact embed-request headers, 403 with other combos).
  // VIP tolerates the same set (302 to its signed playlist), so one uniform header.
  const result = { parse: 0, url, header: { 'User-Agent': UA, 'Referer': (fresh && fresh.embed) || storedEmbed || VIDSNAP + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default {
    meta: { key: 'py_jasex', name: '🌸JaSex', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}