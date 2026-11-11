// 麻豆AI (https://madouai.xyz / https://2048ai.xyz) -> CatPawOpen spider
// Vue SPA + JSON API: 列表 /api/v1/videos, 搜索 /api/v1/videos/search, 详情 /api/v1/videos/{id}
// 播放走站方 m3u8 代理 /api/v1/m3u8/proxy?path= ; 封面走 /api/v1/image/proxy?path=
// 单档 (清单无多码率变体), 不编造清晰度
//
// 2026-11-11 实测结论 (见 madouai_audit):
// 1) spg/ 前缀的视频站方已死: m3u8 代理约半数回 502, 回 200 的分片也全是 403
//    (cdn 拒绝, 换 Referer/换 2048ai.xyz 代理/直连源站均 403; 站方前端 videoPlayback.js
//    用的就是同一代理地址, 故站方自己也播不了 spg/, 不是蜘蛛写法问题)。
//    其余 15 个前缀 (jpd/jpc/jpb/spf/jpe/jpg/spb/spc/spa/spe/bzc/mmc/mib/lfa/jh)
//    分片全部 200 可播。蜘蛛因此过滤掉 spg/ 条目 (列表/搜索不显示, 详情不给播放地址),
//    只剩可播的; AV-中文字幕 / AV-无码流出每页只剩约 7-8 条 (其余是死 spg/), 这是站方
//    片源死了, 不是分类空了。
// 2) 封面: 图片代理支持 size 参数 (X-Image-Size: original/small/thumbnail/medium)。
//    默认 original 是原图 (PNG 2-5MB, GIF 动图 9-16MB, 加载 3-13 秒, 手机上常超时空白)。
//    改要 size=medium (800x450 JPEG, 约 80-150KB), 封面加载大幅提速; 91大神与麻豆原创AI
//    的慢封面/空白封面即由此修好。
import req from '../../util/req.js';

const KEY = 'py_madouai';
const NAME = '💋麻豆AI';
const HOST = 'https://madouai.xyz';
const HOST2 = 'https://2048ai.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 最近更新(无 categoryId, 默认最新在前) + 23 个视频子分类 (GET /api/v1/categories?type=video 实测)
// 注意: 前端 3 个菜单组 (原创精选/国产视频/中文AV) 只是导航分组, API 不认 menuId 参数,
// 无法按菜单组取列表, 故不单列菜单组分类, 子分类本身已按 menuId 归属, 浏览子分类即可覆盖
const CLASSES = [
  { type_id: 'latest', type_name: '最近更新' },
  { type_id: 'cat:1', type_name: '国产自拍' },
  { type_id: 'cat:2', type_name: 'AV - 中文字幕' },
  { type_id: 'cat:8', type_name: 'AV - 无码流出' },
  { type_id: 'cat:21', type_name: '反差母狗' },
  { type_id: 'cat:27', type_name: '每日更新' },
  { type_id: 'cat:4', type_name: '探花大神' },
  { type_id: 'cat:7', type_name: '91大神' },
  { type_id: 'cat:10', type_name: '麻豆x性吧联合原创' },
  { type_id: 'cat:13', type_name: '清纯少女' },
  { type_id: 'cat:6', type_name: '麻豆原创AI' },
  { type_id: 'cat:20', type_name: '破解偷拍' },
  { type_id: 'cat:14', type_name: '重口调教' },
  { type_id: 'cat:19', type_name: '黑料吃瓜' },
  { type_id: 'cat:28', type_name: '世界杯专栏' },
  { type_id: 'cat:15', type_name: '直播大秀' },
  { type_id: 'cat:22', type_name: '白虎嫩妹' },
  { type_id: 'cat:9', type_name: '麻豆传媒' },
  { type_id: 'cat:16', type_name: '网红主播' },
  { type_id: 'cat:23', type_name: '家庭乱伦' },
  { type_id: 'cat:17', type_name: '媚黑母狗' },
  { type_id: 'cat:24', type_name: '熟女偷情' },
  { type_id: 'cat:18', type_name: '白虎少女' },
  { type_id: 'cat:25', type_name: '网黄原创' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/media/',
  };
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

/** JSON 取数: 先 req, 失败换备用域, 再失败走 fetch 兜底 (App 内无全局 fetch, 用 typeof 守卫) */
async function apiGet(path) {
  const hosts = [HOST, HOST2];
  for (const h of hosts) {
    try {
      const { data } = await req.get(h + path, { headers: headers(), timeout: 20000 });
      if (data == null) continue;
      if (typeof data === 'string') {
        try { return JSON.parse(data); } catch (e) { continue; }
      }
      return data;
    } catch (e) { /* try next host */ }
  }
  if (typeof fetch !== 'undefined') {
    for (const h of hosts) {
      try {
        const r = await fetch(h + path, { headers: headers() });
        if (!r || !r.ok) continue;
        return await r.json();
      } catch (e) { /* try next host */ }
    }
  }
  return null;
}

/** 封面地址: 列表 API 已给 /api/v1/image/proxy?path=... 直接拼主域;
    搜索 API 给裸路径 image/... 直接取会 404, 须包一层图片代理。
    一律加 size=medium (800x450 JPEG, 约 80-150KB): 默认 original 是原图
    (PNG 2-5MB、GIF 动图 9-16MB), 手机上加载极慢或超时空白。 */
function coverUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  let url;
  if (u.indexOf('/api/v1/image/proxy') === 0) url = HOST + u;
  else if (u.charAt(0) === '/') url = HOST + '/api/v1/image/proxy?path=' + encodeURIComponent(u.slice(1));
  else url = HOST + '/api/v1/image/proxy?path=' + encodeURIComponent(u);
  if (url.indexOf('size=') === -1) url += '&size=medium';
  return url;
}

/** spg/ 前缀的视频站方分片已死 (全 403, 约半数清单还 502), 播不了, 直接过滤 */
function isPlayable(videoUrl) {
  videoUrl = t(videoUrl);
  if (!videoUrl) return false;
  if (/^https?:\/\//i.test(videoUrl)) return true;
  return videoUrl.indexOf('spg/') !== 0;
}

/** 播放地址: .m3u8 相对路径走站方 m3u8 代理 (直接拼主域取回的是 SPA 空壳);
    .mp4 直接用原地址 */
function playUrl(videoUrl) {
  videoUrl = t(videoUrl);
  if (!videoUrl) return '';
  if (/^https?:\/\//i.test(videoUrl)) return videoUrl;
  if (/\.m3u8(\?|$)/i.test(videoUrl)) {
    return HOST + '/api/v1/m3u8/proxy?path=' + encodeURIComponent(videoUrl);
  }
  if (videoUrl.charAt(0) === '/') return HOST + videoUrl;
  return HOST + '/' + videoUrl;
}

function fmtDur(sec) {
  sec = parseInt(sec, 10);
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = (h > 0 ? String(m) : String(m));
  const ss = s < 10 ? '0' + s : String(s);
  if (h > 0) return h + ':' + (m < 10 ? '0' + m : m) + ':' + ss;
  return mm + ':' + ss;
}

function toVod(it) {
  if (!it || it.id == null) return null;
  if (!isPlayable(it.videoUrl)) return null; // spg/ 站方已死, 不显示 (点开也播不了)
  const dur = fmtDur(it.durationSec);
  const remarks = [dur, it.categoryName].filter(Boolean).join(' · ');
  return {
    vod_id: String(it.id),
    vod_name: t(it.title) || ('视频 ' + it.id),
    vod_pic: coverUrl(it.coverUrl),
    vod_remarks: remarks,
  };
}

function parseListData(json) {
  if (!json) return { items: [], total: 0, totalPages: 1 };
  const data = json.data || json;
  const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
  const total = parseInt(data.total, 10) || items.length;
  const totalPages = parseInt(data.totalPages, 10) || 1;
  return { items, total, totalPages };
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const size = 30;
  let path;
  if (id === 'latest' || id === '' || id === 'home') {
    path = '/api/v1/videos?page=' + page + '&size=' + size;
  } else if (id.indexOf('cat:') === 0) {
    path = '/api/v1/videos?categoryId=' + encodeURIComponent(id.slice(4)) + '&page=' + page + '&size=' + size;
  } else {
    // 兼容直接传数字分类 id
    path = '/api/v1/videos?categoryId=' + encodeURIComponent(id) + '&page=' + page + '&size=' + size;
  }
  const json = await apiGet(path);
  const { items, total, totalPages } = parseListData(json);
  const list = [];
  for (const it of items) {
    const v = toVod(it);
    if (v) list.push(v);
  }
  return {
    page,
    pagecount: totalPages,
    limit: list.length || size,
    total,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = String(raw || '').match(/(\d+)/)?.[1] || '';
  if (!vid) return { list: [] };

  const json = await apiGet('/api/v1/videos/' + vid);
  const it = json ? (json.data || json) : null;
  if (!it || it.id == null) return { list: [] };

  // spg/ 站方片源已死 (分片全 403): 不给播放地址, 避免点开无限转圈; 备注明示
  if (!isPlayable(it.videoUrl)) {
    return {
      list: [{
        vod_id: String(it.id),
        vod_name: t(it.title) || ('视频 ' + it.id),
        vod_pic: coverUrl(it.coverUrl),
        vod_content: t(it.description),
        vod_remarks: [fmtDur(it.durationSec), it.categoryName, '片源失效'].filter(Boolean).join(' · '),
        vod_play_from: NAME,
        vod_play_url: '',
      }],
    };
  }
  const url = playUrl(it.videoUrl);
  const eps = url ? ['播放$' + url] : [];
  // 字幕：播放地址无番号，必须按标题登记；后台预热（不 await）
  if (url) {
    const subTitle = t(it.title) || ('视频 ' + it.id);
    subCacheName(url, subTitle);
    subCacheName(String(it.id), subTitle);
    subWarm(url);
  }
  return {
    list: [{
      vod_id: String(it.id),
      vod_name: t(it.title) || ('视频 ' + it.id),
      vod_pic: coverUrl(it.coverUrl),
      vod_content: t(it.description),
      vod_remarks: [fmtDur(it.durationSec), it.categoryName].filter(Boolean).join(' · '),
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  // 字幕：detail 预热过则命中缓存/在途；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/media/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const size = 30;
  const json = await apiGet('/api/v1/videos/search?q=' + encodeURIComponent(wd) + '&page=' + page + '&size=' + size);
  const { items, total, totalPages } = parseListData(json);
  const list = [];
  for (const it of items) {
    const v = toVod(it);
    if (v) list.push(v);
  }
  return {
    page,
    pagecount: totalPages,
    limit: list.length || size,
    total,
    list,
  };
}

// ---------- 字幕聚合 companion helpers（core 本身不含，见 /tmp/sp_py_javtiful.js） ----------
// reqRaw：框架 req，2xx 才回 body，永不抛错；clean：去标签/空白（core 的 subSlugTitle 用到）。
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

async function reqRaw(url, headers, timeoutMs) {
  try {
    const r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof r.data === 'string' ? r.data : (r.data === null || r.data === undefined ? '' : JSON.stringify(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
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
    /\b[A-Z]{2,10}[- ]\d{2,8}[A-Z]?\b/,
    /\b[A-Z]{2,10}\d{2,8}[A-Z]?\b/,
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

export default {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}