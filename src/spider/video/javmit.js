import req from '../../util/req.js';

// JavMit https://javmit.com/zh-CN/ —— WordPress（rawx-theme）站，番号即 slug：/zh-CN/<slug>/（如 npjs-268、erofv-391-uncensored）
// 列表：首页 /zh-CN/、最新 /zh-CN/video/、分类 /zh-CN/category/<slug>/、无码 /zh-CN/uncensored/<slug>/、标签 /zh-CN/tag/<slug>/，翻页 /page/<n>/
// 详情：<video data-default-src> 为 AUTO 母带 + .rawx-quality-btn（AUTO/1080P/480P）多档直出，s3/s4 子域因片而异、一律从详情页现取
// 封面：wp-content/uploads 直链，无加密；字幕按条目接（本站标题均以番号开头，几乎全量接芯）
const HOST = 'https://javmit.com';
const BASE = HOST + '/zh-CN';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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

async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('http')) { /* absolute */ }
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 字幕芯取数原语（与 py_siguaspw 一致）：统一回 {status, body}
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

function extractPic(inner) {
  for (const attr of ['data-original', 'data-src', 'src']) {
    const m = inner.match(new RegExp(attr + "=['\"]([^'\"]+)['\"]", 'i'));
    if (m) {
      const cand = m[1].trim();
      if (cand && !['loading.jpg', 'loading.png', 'placeholder', 'default', 'data:image'].some((b) => cand.toLowerCase().includes(b))) return cand;
    }
  }
  return '';
}

// 本站卡片是“图链 + 标题链”两个 <a> 共用同一 /zh-CN/<slug>/，按 URL 合并图、标题与时长
// 只收带封面 <img> 的图链（排除顶部 trending 跑马灯、标签、演员等纯文字链，否则各分类都会混入同一批跑马灯条目）
function parseCards(html, host) {
  const byUrl = new Map();
  const re = /<a[^>]+href=["'](https?:\/\/javmit\.com\/zh-CN\/[a-z0-9][a-z0-9\-]*\/|(?:\/zh-CN\/[a-z0-9][a-z0-9\-]*\/))["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const href = m[1].trim();
    const slug = href.split('/').filter(Boolean).pop();
    if (!slug || ['video', 'categories', 'tags', 'actors', 'channels', 'favorites', 'uncensored'].includes(slug)) continue;
    const vUrl = '/zh-CN/' + slug + '/';
    const inner = m[2];
    if (!/<img[^>]+class="[^"]*(vc-thumb-img|lv-thumb-img|hq-thumb-img|hero-bg-img)[^"]*"/i.test(inner)) continue;
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: vUrl, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    const pic = extractPic(inner);
    if (pic && !it.vod_pic) it.vod_pic = normUrl(pic.startsWith('http') ? pic : absUrl(pic, host));
    const altM = inner.match(/alt=["']([^"']+)["']/i);
    if (altM && !it.vod_name) it.vod_name = cleanLabel(altM[1]);
    const h3M = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (h3M) it.vod_name = cleanLabel(h3M[1]);
    const durM = inner.match(/vc-dur[^>]*>([^<]+)<\//i);
    if (durM && !it.vod_remarks) it.vod_remarks = cleanLabel(durM[1]);
    const txt = cleanLabel(inner);
    if (txt && txt.length > 2 && !it.vod_name && !/^\d+$/.test(txt)) it.vod_name = txt;
  }
  const out = [];
  for (const it of byUrl.values()) {
    if (it.vod_pic || it.vod_name) {
      if (!it.vod_name) it.vod_name = '精彩视频';
      // 标题尾巴“[下载和在线观看]”是站方固定后缀，去掉
      it.vod_name = it.vod_name.replace(/\s*\[下载和在线观看\]\s*$/i, '').trim() || it.vod_name;
      out.push(it);
    }
  }
  return out;
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
  const slug = (String(durl || '').match(/\/zh-CN\/([^/]+)\//) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
}

function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\b\d{0,2}[A-Z]{2,10}[- ]?\d{4,8}[- ]\d{2,3}\b/,
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b\d{1,2}[A-Z]{2,10}[- ]?\d{4,8}(?:[-_]\d{2})?\b/,
    /\b[A-Z]{2,12}[- ]?\d{2,8}(?:[- ]\d{2,8})?\b/,
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




// 分类：全部取自 2026-11-04 实测的站方分类页（115 个 cat-card，名 + 计数均实测）与标签页
// type_id 编码：category/<slug>、uncensored/<slug 或空>、tag/<slug>、video（最新）
// 用户点名近义项映射（均有真实内容，计数为分类页/标签页实测）：
//   无码流出 -> uncensored/uncensored-leak（站名“未删减版泄露”，1777 条）
//   无码 -> uncensored（站名“未经审查”，5548 条）
//   减码 -> tag/no-mosaic（站名“没有马赛克”；“减少马赛克”无专属分类，此为最接近的真实等价项）
//   巨乳 -> category/big-breast-fetish（站名“巨乳癖”，220 条；另有大山雀/大胸单列）
//   大屁股 -> category/big-butt（站名与此完全一致，763 条；另有巨臀单列）
// “无码破解”无专属分类（站方只有“无码流出”系：uncensored-leak / leakage / leak），故不单列、不硬凑。
const CLASSES = [
  { type_id: 'video', type_name: '最新' },
  { type_id: 'category/subtitles', type_name: '中文字幕' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'uncensored/uncensored-leak', type_name: '无码流出' },
  { type_id: 'tag/no-mosaic', type_name: '减码' },
  { type_id: 'category/big-breast-fetish', type_name: '巨乳' },
  { type_id: 'category/big-tits', type_name: '大山雀' },
  { type_id: 'category/big-breasts', type_name: '大胸' },
  { type_id: 'category/big-butt', type_name: '大屁股' },
  { type_id: 'category/huge-butt', type_name: '巨臀' },
  { type_id: 'category/boobs-fetish', type_name: '乳房恋物癖' },
  { type_id: 'category/titty-fuck', type_name: '乳交' },
  { type_id: 'category/schoolgirls', type_name: '女学生' },
  { type_id: 'category/uniform', type_name: '制服' },
  { type_id: 'category/cosplay', type_name: '角色扮演' },
  { type_id: 'category/married', type_name: '已婚' },
  { type_id: 'category/amateur', type_name: '业余' },
  { type_id: 'category/3p', type_name: '3P' },
  { type_id: 'category/outdoors', type_name: '户外活动' },
  { type_id: 'category/voyeur', type_name: '偷窥者' },
  { type_id: 'category/mature-woman', type_name: '成熟女性' },
  { type_id: 'category/slender', type_name: '纤细' },
  { type_id: 'category/beautiful-girl', type_name: '漂亮女孩' },
  { type_id: 'uncensored/fc2', type_name: 'FC2' },
  { type_id: 'uncensored/caribbeancom', type_name: '加勒比通讯社' },
  { type_id: 'uncensored/heyzo', type_name: 'HEYZO' },
  { type_id: 'uncensored/1pondo', type_name: '1PONDO' },
  { type_id: 'uncensored/10musume', type_name: '10MUSUME' },
  { type_id: 'uncensored/tokyohot', type_name: '东京热' },
];

function listUrlFor(typeId, page) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const suffix = p > 1 ? ('page/' + p + '/') : '';
  if (typeId === 'video') return '/zh-CN/video/' + suffix;
  return '/zh-CN/' + typeId + '/' + suffix;
}

async function home() {
  const classes = [{ type_id: 'home', type_name: '首页推荐' }, ...CLASSES];
  let list = [];
  try { list = parseCards(await getHtml('/zh-CN/'), HOST).slice(0, 20); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const typeId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (typeId === 'home' || !typeId) {
    const html = await getHtml('/zh-CN/');
    return { page: 1, pagecount: 1, list: parseCards(html, HOST) };
  }
  const html = await getHtml(listUrlFor(typeId, page));
  const list = parseCards(html, HOST);
  return { page, pagecount: list.length ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  // WordPress 原生搜索：/?s=<kw>，翻页 /page/<n>/?s=<kw>
  const path = page > 1 ? ('/zh-CN/page/' + page + '/?s=' + encodeURIComponent(kw)) : ('/zh-CN/?s=' + encodeURIComponent(kw));
  const html = await getHtml(path);
  const list = parseCards(html, HOST);
  return { page, pagecount: list.length ? page + 1 : page, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let mainTitle = h1M ? cleanLabel(h1M[1]) : '';
  if (!mainTitle) {
    const tM = html.match(/<title>(.*?)<\/title>/i);
    mainTitle = tM ? cleanLabel(tM[1]).replace(/\s*-\s*JAVMIT\s*$/i, '') : '精彩视频';
  }
  mainTitle = mainTitle.replace(/\s*\[下载和在线观看\]\s*$/i, '').trim() || '精彩视频';
  subCacheName(durl, mainTitle);
  let posterPic = '';
  const posterM = html.match(/<video[^>]+poster=["']([^"']+)["']/i);
  if (posterM) posterPic = normUrl(posterM[1].trim());
  if (!posterPic) {
    const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogM && ogM[1].includes('/uploads/')) posterPic = normUrl(ogM[1].trim());
  }
  // 多档：详情页 .rawx-quality-btn（AUTO/1080P/480P），按 1080P > AUTO > 480P 排序；只有母带时单档
  const quals = [];
  const seenQ = new Set();
  for (const m of html.matchAll(/class=["'][^"']*rawx-quality-btn[^"']*["'][^>]*data-src=["']([^"']+)["'][^>]*data-label=["']([^"']+)["']/gi)) {
    const src = normUrl(m[1].trim());
    const label = String(m[2] || '').trim().toUpperCase();
    if (!src || seenQ.has(src)) continue;
    seenQ.add(src);
    quals.push({ label: label || 'AUTO', src });
  }
  if (!quals.length) {
    const dM = html.match(/data-default-src=["']([^"']+)["']/i);
    if (dM) quals.push({ label: 'AUTO', src: normUrl(dM[1].trim()) });
  }
  if (!quals.length) {
    const ogvM = html.match(/property=["']og:video["'][^>]+content=["']([^"']+)["']/i);
    if (ogvM) quals.push({ label: 'AUTO', src: normUrl(ogvM[1].trim()) });
  }
  const rank = (l) => (l === '1080P' ? 0 : l === 'AUTO' ? 1 : l === '720P' ? 2 : l === '480P' ? 3 : 4);
  quals.sort((a, b) => rank(a.label) - rank(b.label));
  const playUrl = quals.map((q) => q.label + '$' + durl + '@@' + q.src).join('#');
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: quals.length > 1 ? '多档' : 'HD',
      vod_content: 'JavMit',
      vod_play_from: 'JavMit',
      vod_play_url: playUrl,
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
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  if (!target) return { parse: 0, url: '' };
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  // 注意：s3/s4 播单无 Referer 时回 403（VM 实测），故 Referer 必须带详情页地址
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': durl || (BASE + '/') } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_javmit', name: '🌸JavMit', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}