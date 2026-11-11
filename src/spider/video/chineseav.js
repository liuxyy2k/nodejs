// ChineseAV (https://chineseav.net) -> CatPawOpen spider
// WordPress 7.1.4 + KingTube 主题的中文 AV tube 站
// 列表: article.thumb-block, 详情页 iframe src 即直链 m3u8 (t27.cdn2020.com)
// 封面与视频均无 Referer 门禁, 可直链; m3u8 单档, 只出一条播放线
import req from '../../util/req.js';

const KEY = 'py_chineseav';
const NAME = '🌸ChineseAV';
const HOST = 'https://chineseav.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 66 个顶级平铺分类 (传媒/厂牌名, 无子分类), 首页最新放第一位
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '3xchina-net', type_name: '3XCHINA' },
  { type_id: 'absolute-media', type_name: 'Absolute Media' },
  { type_id: 'aishen-media', type_name: '爱神传媒' },
  { type_id: 'angel-pictures', type_name: 'Angel Pictures' },
  { type_id: 'asian-hot-media', type_name: 'Asian Hot Media' },
  { type_id: 'av-emperor-media', type_name: 'AV帝王传媒' },
  { type_id: 'banana-video-media', type_name: '香蕉视频传媒' },
  { type_id: 'bronze-film', type_name: 'Bronze Film' },
  { type_id: 'candy-heart-vlog', type_name: '糖心Vlog' },
  { type_id: 'cat-claw-video', type_name: '猫爪视频' },
  { type_id: 'changzhi-media', type_name: '常知传媒' },
  { type_id: 'chinese-porn', type_name: '国产' },
  { type_id: 'crazy-video-media', type_name: '疯狂视频传媒' },
  { type_id: 'doll-sister', type_name: '娃娃姐妹' },
  { type_id: 'domestic-av', type_name: '国产AV' },
  { type_id: 'douyin-media', type_name: '抖音传媒' },
  { type_id: 'drama', type_name: '剧情' },
  { type_id: 'eagle-av', type_name: '鹰眼AV' },
  { type_id: 'ed-mosaic', type_name: 'ED马赛克' },
  { type_id: 'edison-media', type_name: '爱迪生传媒' },
  { type_id: 'elephant-media', type_name: '大象传媒' },
  { type_id: 'eros-media', type_name: 'Eros Media' },
  { type_id: 'fang-lang-media', type_name: '放浪传媒' },
  { type_id: 'guanxi-media', type_name: '关系传媒' },
  { type_id: 'hot-pepper-original', type_name: '辣椒原创' },
  { type_id: 'idol-media', type_name: '偶像传媒' },
  { type_id: 'jelly-media', type_name: '果冻传媒' },
  { type_id: 'jingdong-pictures', type_name: '京东影业' },
  { type_id: 'julu-entertainment-media', type_name: '巨鹿娱乐传媒' },
  { type_id: 'juxiang-entertainment-media', type_name: '聚香娱乐传媒' },
  { type_id: 'korean-adult-films', type_name: '韩国成人' },
  { type_id: 'lmg-film-industry-media', type_name: 'LMG影业传媒' },
  { type_id: 'madou-media', type_name: '麻豆传媒' },
  { type_id: 'maini-media', type_name: '麦尼传媒' },
  { type_id: 'mama-media', type_name: '妈妈传媒' },
  { type_id: 'meat-media', type_name: '肉传媒' },
  { type_id: 'mg-film-industry-media', type_name: 'MG影业传媒' },
  { type_id: 'micro-circle', type_name: '微圈' },
  { type_id: 'millennium-media', type_name: '千年传媒' },
  { type_id: 'mr-rabbit', type_name: '兔子先生' },
  { type_id: 'multi-p', type_name: 'Multi-P' },
  { type_id: 'omi-international-media', type_name: 'Omi国际传媒' },
  { type_id: 'peach-video-media', type_name: '蜜桃视频传媒' },
  { type_id: 'porn-story', type_name: '情色故事' },
  { type_id: 'pussy-hunter', type_name: '猎艳' },
  { type_id: 'red-light-video', type_name: '红灯视频' },
  { type_id: 'rou-video', type_name: '肉视频' },
  { type_id: 'royal-chinese', type_name: '皇家华人' },
  { type_id: 'sa-international-media', type_name: 'SA国际传媒' },
  { type_id: 'sex-control', type_name: '性控' },
  { type_id: 'shaking-yin-media', type_name: '抖阴传媒' },
  { type_id: 'starry-sky-unlimited-media', type_name: '星空无限传媒' },
  { type_id: 'start-media-sex-vision-media', type_name: '星视传媒' },
  { type_id: 'sugar-heart-vlog', type_name: '糖心Vlog' },
  { type_id: 'sweet-heart-vlog', type_name: '甜心Vlog' },
  { type_id: 'three-wolf-media', type_name: '三狼传媒' },
  { type_id: 'tianmei-media', type_name: '天美传媒' },
  { type_id: 'timi-media', type_name: '蒂米传媒' },
  { type_id: 'utopia-media', type_name: '乌托邦传媒' },
  { type_id: 'venus', type_name: '维纳斯' },
  { type_id: 'victorias-secret-media', type_name: '维密传媒' },
  { type_id: 'watanabe-media', type_name: '渡边传媒' },
  { type_id: 'wechat-media', type_name: '微信传媒' },
  { type_id: 'wemiquan-media', type_name: '微密圈传媒' },
  { type_id: 'xingba-media', type_name: '星吧传媒' },
  { type_id: 'xingkong-unlimited-media', type_name: '星空无限传媒' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

async function getHtml(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    if (data) return String(data);
  } catch (e) {}
  // fetch 兜底 (App 内无全局 fetch 时 typeof 守卫跳过)
  try {
    if (typeof fetch === 'undefined') return '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 22000);
    const r = await fetch(url, { headers: headers(), signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return '';
    return String(await r.text() || '');
  } catch (e) {
    return '';
  }
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } });
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') {
    return page <= 1 ? HOST + '/' : HOST + '/page/' + page + '/';
  }
  const path = HOST + '/category/' + cat + '/';
  return page > 1 ? path + 'page/' + page + '/' : path;
}

function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<article[^>]+class="[^"]*thumb-block[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    const am = body.match(/<a[^>]+href=["'](https?:\/\/chineseav\.net\/[^"']+\/)["'][^>]*title=["']([^"']+)["']/i)
      || body.match(/<a[^>]+title=["']([^"']+)["'][^>]+href=["'](https?:\/\/chineseav\.net\/[^"']+\/)["']/i);
    let href = '', title = '';
    if (am) {
      if (/^https?:\/\//i.test(am[1])) { href = am[1]; title = am[2]; }
      else { title = am[1]; href = am[2]; }
    } else {
      const hm = body.match(/<a[^>]+href=["'](https?:\/\/chineseav\.net\/[^"']+\/)["']/i);
      if (hm) href = hm[1];
    }
    if (!href) continue;
    if (seen.has(href)) continue;
    // 只保留视频详情链接, 排除分类/标签/演员等归档页
    if (/\/category\/|\/tag\/|\/actor\/|\/actors\/|\/tags\//i.test(href)) continue;
    seen.add(href);

    let im = body.match(/<img[^>]+class=["'][^"']*video-main-thumb[^"']*["'][^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)
      || body.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]+class=["'][^"']*video-main-thumb[^"']*["']/i)
      || body.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
    const cover = im ? absUrl(im[1]) : '';

    if (!title) {
      const tm = body.match(/<h[123][^>]*>\s*<a[^>]*>([^<]{2,200})<\/a>/i)
        || body.match(/alt=["']([^"']{2,200})["']/i);
      if (tm) title = tm[1];
    }
    title = decodeHtml(title);
    if (!title) title = href.replace(HOST, '').replace(/\//g, '');

    let remarks = '';
    const dm = body.match(/<span[^>]*class=["'][^"']*duration[^"']*["'][^>]*>([^<]+)<\/span>/i)
      || body.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/);
    if (dm) remarks = t(dm[1]);

    out.push({
      vod_id: href,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: remarks,
    });
  }
  return out;
}

function extractPlay(html) {
  const seen = new Set();
  const sources = [];
  function add(url) {
    url = t(url);
    if (!url || seen.has(url)) return;
    if (!/^https?:\/\//i.test(url)) return;
    if (!/\.m3u8/i.test(url)) return;
    seen.add(url);
    sources.push(url);
  }
  // 详情页 iframe src 即直链 m3u8
  const ims = html.match(/<iframe[^>]+src=["']([^"']+\.m3u8[^"']*)["']/gi) || [];
  for (const tag of ims) {
    const um = tag.match(/src=["']([^"']+)["']/i);
    if (um) add(um[1].replace(/&amp;/g, '&'));
  }
  // 兜底: 页内任意 .m3u8
  if (!sources.length) {
    const m3 = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi) || [];
    for (const u of m3) add(u.replace(/&amp;/g, '&'));
  }
  return sources;
}

function extractTitle(html, fallback) {
  let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m) return decodeHtml(m[1]).replace(/\s*[-|–]\s*CHINESEAV.*$/i, '').trim();
  m = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1]).replace(/\s*[-|–].*$/, '').trim();
  return fallback || '';
}

function extractCover(html) {
  let m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (m) return absUrl(m[1]);
  return '';
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
  const id = String(body.id || 'home');
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 20,
    total: 999 * 20,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let url = t(raw);
  if (!url) return { list: [] };
  if (!/^https?:\/\//i.test(url)) url = absUrl(url);
  const html = await getHtml(url);
  if (!html) return { list: [] };

  const name = extractTitle(html, url);
  let content = '';
  const dm = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
  if (dm) content = decodeHtml(dm[1]);
  const pic = extractCover(html);
  const sources = extractPlay(html);
  // 单档: 只出一条播放线
  const playUrl = sources.length ? '播放$' + sources[0] : '';
  // 字幕：按播放地址与详情地址登记片名，后台预热（不 await）
  if (sources.length) {
    subCacheName(sources[0], name);
    subCacheName(url, name);
    subWarm(sources[0]);
  }
  return {
    list: [{
      vod_id: url,
      vod_name: name || url,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: playUrl,
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
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/?s=' + encodeURIComponent(wd);
  if (page > 1) url = HOST + '/page/' + page + '/?s=' + encodeURIComponent(wd);
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 20,
    total: 999 * 20,
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