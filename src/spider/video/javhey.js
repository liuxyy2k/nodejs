import req from '../../util/req.js';

// JavHey https://javhey.com/ —— 印尼语 JAV 字幕站（标题/别名均含番号，如 JUL-788、SONE-054）
// 列表：首页卡片 <a href="/video/<id>/<slug>"><img src alt></a>，封面为 javmod.com/javorb.com 直链，无加密
// 分类：/category/<id>/<slug>/，翻页 /category/<id>/<slug>/page=N；首页翻页 /videos/paling-baru/page=N
// 详情：隐藏 input#links 为 base64 编码的 embed 列表（",,," 分隔，12 个 Server）；Server 1 为 javsubindo（页内 var src 直出 m3u8 相对路径）
// 播放：vidhide 系 embed（含 embedwish/vidhidepre/morencius/hgplaycdn）为 Dean Edwards packer 混淆，解包后 links.hls3（.txt 主清单，VM 实测 200 + #EXTM3U + 分片清单可取）
//       > links.hls2（.m3u8 主清单，VM 侧因出口 IP 被 CDN 回 403，设备侧未证实）> links.hls4（embed  host 相对路径 master.m3u8，同上 403 未证实）；
//       单码率（实测 embedwish 852x480 一档；vidhide 档位标签 720p），不编假多档；各 Server 画质可能不同，故按 Server 分开展示
// 搜索：站内搜索表单 action="/search"，但实测 /search?q=<任意词>（含无意义词）均原样返回首页 72 项，未做过滤——故 search 直接返回空列表，绝不假装有结果
// 字幕：与模板同一套 Layer A（见下 sub core，逐字复制，仅 subSlugTitle 保持原样；番号取自标题/slug，JUL-788 类均可命中），按条目接（仅含番号的条目接芯）
const HOST = 'https://javhey.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// 分类：全部取自站内 /categories 实测（id/slug/名均原文）；中文名为用户点名近义项的诚实映射，见 NOTES.md
// 无码流出/无码破解/减码类：Uncensored(76)/Decensored(31)/Sensor Dihapus(222，印尼语“去码”)为站内真实存在的去码类；
// “减码/减少马赛克”无完全对应分类，不硬凑（Digital mosaic 只是马赛克类型，不是减码，故只作普通分类列出，不冒充减码）
const CATS = [
  { v: '76/uncensored', n: '无码流出' },
  { v: '31/decensored', n: '无码破解' },
  { v: '222/sensor-dihapus', n: '去码' },
  { v: '1/big-tits', n: '巨乳' },
  { v: '219/toket-gede', n: '巨乳 (印尼)' },
  { v: '15/super-milk', n: '爆乳' },
  { v: '50/beautiful-breasts', n: '美乳' },
  { v: '48/busty-fetish', n: '巨乳癖' },
  { v: '20/big-butt', n: '大屁股' },
  { v: '231/pantat-besar', n: '大屁股 (印尼)' },
  { v: '41/ass-fetish', n: '臀部癖' },
  { v: '2/censored', n: '有码' },
  { v: '4/digital-mosaic', n: '数码马赛克' },
  { v: '3/creampie', n: '中出' },
  { v: '11/mature-woman', n: '熟女' },
  { v: '10/incest', n: '乱伦' },
  { v: '9/housewife', n: '人妻' },
  { v: '24/aunt', n: '阿姨' },
  { v: '59/female-teacher', n: '女教师' },
  { v: '42/schoolgirl', n: '女学生' },
  { v: '33/blowjob', n: '口交' },
  { v: '14/slut', n: '淫荡' },
  { v: '127/cosplay', n: 'Cosplay' },
  { v: '152/lesbian', n: '女同' },
  { v: '67/bdsm', n: 'BDSM' },
  { v: '5/high-vision', n: '高清' },
];

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
      headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 字幕芯取数原语（与模板一致）：统一回 {status, body}
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

// 首页/分类卡片：<a href="/video/<id>/<slug>"><img src alt></a>；alt 含 "JAV Subtitle Indonesia - <番号> <印尼语标题>"
function parseCards(html, host) {
  const byUrl = new Map();
  const re = /<a[^>]+href=["'](\/video\/\d+\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const vUrl = m[1].trim();
    const inner = m[2];
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: vUrl, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    const imgM = inner.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgM && !it.vod_pic) it.vod_pic = normUrl(absUrl(imgM[1].trim(), host));
    const altM = inner.match(/alt=["']([^"']+)["']/i);
    const txt = cleanLabel(altM ? altM[1] : inner);
    if (txt && !it.vod_name) it.vod_name = txt.replace(/^JAV Subtitle Indonesia\s*-\s*/i, '');
    // alt 常被标题内的双引号截断成 bare 番号（如 "ATID-710"）：此时用 URL slug 补全标题
    if (!it.vod_name || /^[A-Z0-9]{2,10}-\d{2,8}$/i.test(it.vod_name)) {
      const slug = (vUrl.split('/')[3] || '').replace(/^[a-z0-9]{2,10}-\d{2,8}-/i, '').replace(/-/g, ' ').trim();
      if (slug) it.vod_name = (it.vod_name ? it.vod_name + ' ' : '') + slug;
    }
    if (!it.vod_name) it.vod_name = '精彩视频';
  }
  return [...byUrl.values()].filter((it) => it.vod_pic || it.vod_name);
}

// ---- embed 解析 ----
// vidhide 系 packer 解包：eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(...)}('...',a,c,'...'.split('|')))
function unpackVidhide(html) {
  const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\('([\s\S]*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/);
  if (!m) return '';
  const p = m[1];
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const k = m[4].split('|');
  if (!a || !c || !k.length) return '';
  const out = p.replace(/\b[0-9a-zA-Z]+\b/g, (w) => {
    const n = parseInt(w, a);
    if (isNaN(n) || n >= c || !k[n]) return w;
    return k[n];
  });
  // 解包文本里引号常带反斜杠转义（qualityLabels\':{\"616\":\"720p\"}），先还原再提取
  return out.replace(/\\(['"])/g, '$1');
}

function embedHostLabel(embedUrl) {
  try {
    const h = new URL(embedUrl).hostname.replace(/^www\./, '');
    const map = { 'javsubindo.world': 'JavSubIndo', 'embedwish.com': 'EmbedWish', 'vidhidepre.com': 'VidHide', 'morencius.com': 'Morencius', 'hgplaycdn.com': 'HgPlay', 'dood.li': 'Dood', 'dropload.io': 'Dropload', 'mixdrop.to': 'MixDrop', 'bestx.stream': 'BestX', 'd000d.com': 'D000D' };
    return map[h] || h;
  } catch (e) { return 'Server'; }
}

// 解析单个 embed 页，返回直链候选 [{url, label}]（label 仅当解包给出 qualityLabels 时才有，绝不编造）
async function resolveEmbed(embedUrl, referer) {
  const out = [];
  const push = (url, label) => {
    url = normUrl(String(url || '').trim());
    if (!url || !/^https?:\/\//.test(url)) return;
    if (!out.some((o) => o.url === url)) out.push({ url, label: label || '' });
  };
  const r = await reqRaw(embedUrl, { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, 12000);
  if (r.status !== 200 || !r.body) return out;
  const html = r.body;
  const base = embedUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1');
  // JavSubIndo：页内 var src = "/s/<ts>/<hash>/<id>/index.m3u8"
  const srcM = html.match(/var\s+src\s*=\s*"([^"]*index\.m3u8[^"]*)"/);
  if (srcM) push(absUrl(srcM[1].replace(/\\/g, ''), base), '');
  // vidhide 系：解包后 links.hls3 > hls2 > hls4
  const unpacked = unpackVidhide(html);
  if (unpacked) {
    const qM = unpacked.match(/qualityLabels['"]?\s*:\s*\{[^}]*"([^"]+)"\s*:\s*"([^"]+)"/);
    const qLabel = qM ? qM[2] : '';
    const hls3 = unpacked.match(/"hls3"\s*:\s*"([^"]+)"/);
    const hls2 = unpacked.match(/"hls2"\s*:\s*"([^"]+)"/);
    const hls4 = unpacked.match(/"hls4"\s*:\s*"([^"]+)"/);
    if (hls3) push(hls3[1].replace(/\\/g, ''), qLabel);
    if (hls2) push(hls2[1].replace(/\\/g, ''), qLabel);
    if (hls4) push(absUrl(hls4[1].replace(/\\/g, ''), base), qLabel);
  }
  // 通用兜底：页内直出的 m3u8/mp4（dood 系为 Turnstile 验证墙，不在此硬解，见 NOTES）
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/g)) {
    if (!/\.js|\.css/.test(m[0])) push(m[0], '');
  }
  return out;
}

// 详情页隐藏 input#links：base64 -> embed URL 列表（",,," 分隔）
function extractEmbeds(html) {
  const m = String(html || '').match(/id=["']links["'][^>]*value=["']([^"']+)["']/);
  if (!m) return [];
  let dec = '';
  try {
    if (typeof Buffer !== 'undefined') dec = Buffer.from(m[1], 'base64').toString('utf-8');
    else dec = decodeURIComponent(escape(atob(m[1])));
  } catch (e) { return []; }
  return dec.split(',,,').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
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
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
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

async function home() {
  const classes = [{ type_id: 'home', type_name: '最新视频' }, { type_id: 'most', type_name: '最多观看' }];
  for (const c of CATS) classes.push({ type_id: 'cat:' + c.v, type_name: c.n });
  let list = [];
  try { list = parseCards(await getHtml('/'), HOST).slice(0, 24); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (zoneId === 'home' || !zoneId) {
    const html = await getHtml(page === 1 ? '/' : ('/videos/paling-baru/page=' + page));
    const list = parseCards(html, HOST);
    const next = html.includes('/videos/paling-baru/page=' + (page + 1));
    return { page, pagecount: next ? page + 1 : page, list };
  }
  if (zoneId === 'most') {
    const html = await getHtml(page === 1 ? '/videos/paling-dilihat' : ('/videos/paling-dilihat/page=' + page));
    const list = parseCards(html, HOST);
    const next = html.includes('/videos/paling-dilihat/page=' + (page + 1));
    return { page, pagecount: next ? page + 1 : page, list };
  }
  const cat = zoneId.startsWith('cat:') ? zoneId.slice(4) : zoneId;
  // 注意：分类页 p1 必须无尾斜杠（带尾斜杠站方回 404）；翻页形如 /category/<id>/<slug>/page=N
  const path = page === 1 ? ('/category/' + cat) : ('/category/' + cat + '/page=' + page);
  const html = await getHtml(path);
  const list = parseCards(html, HOST);
  const next = html.includes('/category/' + cat + '/page=' + (page + 1));
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search() {
  // 站内搜索未做过滤（任意查询均返回首页），返回空列表，不伪造结果
  return { list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  if (!html) return { list: [] };
  const h1M = html.match(/<h1\s+class=["']product_title["']>([\s\S]*?)<\/h1>/i);
  let mainTitle = '精彩视频';
  if (h1M) mainTitle = cleanLabel(h1M[1]).replace(/^JAV Subtitle Indonesia\s*-\s*/i, '').trim() || '精彩视频';
  subCacheName(durl, mainTitle);
  // 封面：详情区第一张非 loader 图（alt 即标题）
  let posterPic = '';
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = m[0].includes('AjaxLoader') ? '' : m[1].trim();
    if (src && /^https?:\/\//.test(src) || src.startsWith('//')) { posterPic = normUrl(absUrl(src, HOST)); break; }
  }
  const embeds = extractEmbeds(html);
  const options = [];
  if (embeds.length) {
    // 并行解析前 6 个 embed（Server 1-6），超时各自 12s；每 Server 首选直链，vidhide 系另附 .m3u8 候选
    const jobs = embeds.slice(0, 6).map(async (emb) => {
      const label = embedHostLabel(emb);
      const streams = await resolveEmbed(emb, durl).catch(() => []);
      return { label, emb, streams };
    });
    const settled = await Promise.allSettled(jobs);
    for (const s of settled) {
      if (s.status !== 'fulfilled' || !s.value) continue;
      const { label, emb, streams } = s.value;
      if (streams.length) {
        // .txt 主清单先验活（VM 侧能取到 #EXTM3U 的排前面；验活失败不删选项，只排后，设备侧网络与 VM 不同）
        for (const st of streams.slice(0, 2)) {
          let rank = st.url.includes('.txt') ? 1 : 2;
          if (st.url.includes('.txt')) {
            try {
              const vr = await reqRaw(st.url, { 'User-Agent': UA, 'Referer': durl }, 8000);
              if (vr.status === 200 && vr.body.includes('#EXTM3U')) rank = 0;
            } catch (e) { /* 保持 rank 1 */ }
          }
          const nm = label + (st.label ? '·' + st.label : '');
          options.push({ name: nm, id: durl + '@@' + st.url, rank });
        }
      } else {
        // 该 Server 本次未解出直链：保留懒解析选项，play() 时再解一次
        options.push({ name: label, id: durl + '@@EMBED:' + emb, rank: 3 });
      }
    }
    // 若全部 Server 都未解出直链，仍保留懒解析选项（play 时逐个重解），不返回空播单
    if (!options.length) {
      for (const emb of embeds.slice(0, 6)) options.push({ name: embedHostLabel(emb), id: durl + '@@EMBED:' + emb, rank: 3 });
    }
    // 排序：已验活 .txt > 未验活 .txt > .m3u8 > 懒解析（同 rank 保持 Server 顺序）
    options.sort((a, b) => (a.rank - b.rank));
  }
  const playUrl = options.map((o) => o.name + '$' + o.id).join('#');
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: 'HD',
      vod_content: 'JavHey',
      vod_play_from: 'JavHey',
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
  // 懒解析：detail 未能预解时，play 时重取详情、逐个 Server 解直链
  if (target.startsWith('EMBED:')) {
    const emb0 = target.slice(6);
    let resolved = '';
    try {
      const html = await getHtml(durl.replace(HOST, ''));
      const embeds = extractEmbeds(html);
      const ordered = [emb0, ...embeds.filter((e) => e !== emb0)];
      for (const emb of ordered.slice(0, 6)) {
        const streams = await resolveEmbed(emb, durl).catch(() => []);
        if (streams.length) { resolved = streams[0].url; break; }
      }
    } catch (e) { /* 落入兜底 */ }
    target = resolved || emb0;
  }
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default {
    meta: { key: 'py_javhey', name: '🌸JavHey', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}