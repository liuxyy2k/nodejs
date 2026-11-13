// JavHeo (https://javheo.com) -> CatPawOpen spider
// 探查 (2026-11-13, VM curl iPhone UA 全链实测):
//   列表: 首页 80 条/页, 翻页 /page/N/ (p1/p2/p3 互不重叠); 分类页 /porn/<tag>/ 单页
//     50 条, 无翻页 (/?page=2 与 p1 完全相同、/page/2/ 与 /2 均 404, 不编造 p2)。
//   分类: 站内侧栏 Categories 全表 65 个 + /porn/ 索引页多 1 个 dickdrainers, 共 66;
//     顶级分类 18 个 (最新 + 17 个实测 50 条的标签分类, jav/japanese/japan、
//     school/schoolgirl 首 5 条互不重叠、不是重复分类, 不删任何标签); 每个顶级下挂
//     66 标签筛选卡片 (123AV/hohoj 形态, 不平铺)。
//   搜索: 站内搜索框 JS 跳 /porn/<slug>/ (空格转 -、去非 alnum、小写); /?s= 恒回
//     80 条随机内容 (同查询两次重叠 0、无意义查询也回 80 条), 不是搜索, 不用。
//     /porn/ssni-229/ 实测标题 "Ssni 229 Xxx Download Videos", 50 条均含 229, 搜索可用。
//   详情: /watch/<id>, 标题 <title> 去 " - Watch JAV..." 后缀; 封面 og:image
//     (i.mycdn.me getVideoPreview, 实测 200 image/jpeg)。
//   播放链 (全链实测通): 详情页 -> POST /hash-javheo {mix:"moviesiframe2", num:<id>}
//     -> iframe https://javheo-com.ibhan2.top/iframe/v1/<hash>/<b64>
//     -> 内含 /iframe/convert/v1/<hash>/<b64> (点击后才加载的第二层 iframe)
//     -> Artplayer quality[] 直给 OK.ru mp4 四档 360p/480p/720p/1080p (720P 为默认档);
//     四档 Range 实测全部 206 video/mp4 (Referer 不敏感, 无 UA 则 400, play 须带 UA)。
//     签名 URL 含 expires/srcIp, play() 每次现解现取, 不复用详情时地址。
//   播放全转圈定性 (2026-11-13): 直链本身没坏 (四档 curl 均 206), 正则没坏,
//     断在耗时: 详情已跑完整条 4 步链 (VM 实测 16-27s), play() 又把同一条链重跑
//     一遍 (上一轮 harness 实测 31-43s, hash POST 还曾两次超时 abort 致 720p 空 url),
//     再叠字幕搜索最多 6s, 点播总耗时超 App 等待 -> 一直转圈。修法: 详情解析结果
//     进内存缓存 (TTL 10 分钟, 签名有效期约 2 天), play() 命中缓存直接返回,
//     缓存未命中才重解 (hash POST 失败重试一次); 档位一律按分辨率降序 (1080p 第一位)。
//     缓存与字幕层同款模块级 Map, 依赖详情->点播同一蜘蛛实例 (字幕预热已依赖此点)。
// 字幕: 接 sextb.js 定版字幕芯 (Layer A), 详情页地址为键登记片名、后台预热,
//   play() 有命中才挂 subs。
import req from '../../util/req.js';

const KEY = 'py_javheo';
const NAME = '🌸JavHeo';
const HOST = 'https://javheo.com';
const IFRAME_HOST = 'https://javheo-com.ibhan2.top';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

// 顶级分类: 最新 + 17 个标签分类 (2026-11-13 各实测 /porn/<tag>/ 均 50 条)
const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'jav', type_name: 'JAV' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'fc2', type_name: 'FC2' },
  { type_id: 'japanese', type_name: '日本' },
  { type_id: 'asian', type_name: '亚洲' },
  { type_id: 'chinese', type_name: '中国' },
  { type_id: 'teen-porn', type_name: '少女' },
  { type_id: 'milf', type_name: '熟女' },
  { type_id: 'big-tits', type_name: '巨乳' },
  { type_id: 'schoolgirl', type_name: '校园女生' },
  { type_id: 'housewife', type_name: '人妻' },
  { type_id: 'massage', type_name: '按摩' },
  { type_id: 'lesbian', type_name: '女同' },
  { type_id: 'anal', type_name: '肛交' },
  { type_id: 'creampie', type_name: '中出' },
  { type_id: 'hentai', type_name: '动漫' },
  { type_id: 'heyzo', type_name: 'Heyzo' },
];

// 标签全表 (侧栏 Categories 65 个 + /porn/ 索引页 dickdrainers, 2026-11-13 实录)
const TAGS = [
  { n: 'anal', v: 'anal' },
  { n: 'asian', v: 'asian' },
  { n: 'asiansexdiary', v: 'asiansexdiary' },
  { n: 'bangbros', v: 'bangbros' },
  { n: 'bban', v: 'bban' },
  { n: 'bbw', v: 'bbw' },
  { n: 'bdsm', v: 'bdsm' },
  { n: 'big tits', v: 'big-tits' },
  { n: 'blacked', v: 'blacked' },
  { n: 'blackedraw', v: 'blackedraw' },
  { n: 'brazzers', v: 'brazzers' },
  { n: 'bukkake', v: 'bukkake' },
  { n: 'chinese', v: 'chinese' },
  { n: 'creampie', v: 'creampie' },
  { n: 'cumshot', v: 'cumshot' },
  { n: 'czech', v: 'czech' },
  { n: 'dasd', v: 'dasd' },
  { n: 'ddfnetwork', v: 'ddfnetwork' },
  { n: 'deepthroat', v: 'deepthroat' },
  { n: 'defloration', v: 'defloration' },
  { n: 'digital mosaic', v: 'digital-mosaic' },
  { n: 'digitalplayground', v: 'digitalplayground' },
  { n: 'dickdrainers', v: 'dickdrainers' },
  { n: 'ebony', v: 'ebony' },
  { n: 'family', v: 'family' },
  { n: 'fc2', v: 'fc2' },
  { n: 'gangbang', v: 'gangbang' },
  { n: 'girlsdoporn', v: 'girlsdoporn' },
  { n: 'group sex', v: 'group-sex' },
  { n: 'hentai', v: 'hentai' },
  { n: 'heyzo', v: 'heyzo' },
  { n: 'housewife', v: 'housewife' },
  { n: 'japan', v: 'japan' },
  { n: 'japanese', v: 'japanese' },
  { n: 'jav', v: 'jav' },
  { n: 'julesjordan', v: 'julesjordan' },
  { n: 'lesbian', v: 'lesbian' },
  { n: 'lisa ann', v: 'lisa-ann' },
  { n: 'married woman', v: 'married-woman' },
  { n: 'massage', v: 'massage' },
  { n: 'meyd', v: 'meyd' },
  { n: 'milf', v: 'milf' },
  { n: 'mom', v: 'mom' },
  { n: 'naughty america', v: 'naughty-america' },
  { n: 'niksindian', v: 'niksindian' },
  { n: 'nurse', v: 'nurse' },
  { n: 'office', v: 'office' },
  { n: 'pervmom', v: 'pervmom' },
  { n: 'pornstar', v: 'pornstar' },
  { n: 'pppd', v: 'pppd' },
  { n: 'public', v: 'public' },
  { n: 'school', v: 'school' },
  { n: 'schoolgirl', v: 'schoolgirl' },
  { n: 'squirt', v: 'squirt' },
  { n: 'ssis', v: 'ssis' },
  { n: 'ssni', v: 'ssni' },
  { n: 'stepmom', v: 'stepmom' },
  { n: 'stockings', v: 'stockings' },
  { n: 'teacher porn', v: 'teacher-porn' },
  { n: 'teen porn', v: 'teen-porn' },
  { n: 'thai', v: 'thai' },
  { n: 'tushy', v: 'tushy' },
  { n: 'uncensored', v: 'uncensored' },
  { n: 'vixen', v: 'vixen' },
  { n: 'wife', v: 'wife' },
  { n: 'woodmancastingx', v: 'woodmancastingx' },
];

// 筛选卡片: 每个顶级分类下挂全部 66 个标签 (子分类), 不平铺
const FILTERS = {};
for (const c of CLASSES) FILTERS[c.type_id] = [{ key: 'sub', name: '标签', value: TAGS }];

function t(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, d) => { const c = parseInt(d, 10); return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : m; })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { const c = parseInt(h, 16); return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : m; });
}

function cleanText(s) {
  return decodeHtml(t(String(s || '').replace(/<[^>]*>/g, ' ')));
}

async function getHtml(url, headers, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: Object.assign({ 'User-Agent': UA, 'Referer': HOST + '/' }, headers || {}),
      timeout: timeoutMs || 15000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

async function postForm(url, fields, headers, timeoutMs) {
  const body = Object.keys(fields || {}).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])).join('&');
  try {
    const r = await req.post(url, body, {
      headers: Object.assign({
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      }, headers || {}),
      timeout: timeoutMs || 15000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

// 列表解析: <a href="/watch/<id>"> 卡片, 内含 img 封面与标题文本
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]*href="\/watch\/([A-Za-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (!id || seen.has(id)) continue;
    const body = m[2] || '';
    const title = cleanText(body);
    if (!title) continue;
    const im = body.match(/<img[^>]+src="([^"]+)"/i);
    const cm = title.match(/([A-Za-z]{2,10}-?\d{3,8}[A-Za-z]?)/);
    seen.add(id);
    out.push({
      vod_id: HOST + '/watch/' + id,
      vod_name: title,
      vod_pic: im ? im[1] : '',
      vod_remarks: cm ? cm[1] : '',
    });
  }
  return out;
}

function normLabel(s) {
  let l = t(s).toLowerCase();
  if (/^\d+$/.test(l)) l += 'p';
  return l;
}

function resNum(label) {
  const m = String(label || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// 播放链解析缓存: 详情已跑过链, 点播直接复用, 不重跑 4 步 (见文件头定性)。
// TTL 10 分钟 (签名 URL 有效期约 2 天); 与字幕层同款模块级 Map。
const RESOLVE_TTL = 10 * 60 * 1000;
const resolveCache = new Map(); // watchId -> { ts, chain }

// 播放链现解: POST hash-javheo -> iframe v1 -> convert 页 -> Artplayer quality[]
// 返回 { qualities: [{ label, url }] (分辨率降序), defaultLabel, convertUrl }
async function resolvePlay(watchId, durl) {
  const empty = { qualities: [], defaultLabel: '', convertUrl: '' };
  if (!watchId) return empty;
  const cached = resolveCache.get(watchId);
  if (cached && Date.now() - cached.ts < RESOLVE_TTL && cached.chain.qualities.length) {
    return cached.chain;
  }
  // hash POST 曾在 VM 侧超时 abort 过一次 (上一轮 720p 空 url), 失败重试一次
  let embedHtml = '';
  for (let attempt = 0; attempt < 2 && !embedHtml; attempt++) {
    embedHtml = await postForm(HOST + '/hash-javheo',
      { mix: 'moviesiframe2', num: watchId }, { 'Referer': durl }, 15000);
  }
  if (!embedHtml) return empty;
  const im = embedHtml.match(/<iframe[^>]+src="(https?:\/\/javheo-com\.ibhan2\.top\/iframe\/v1\/[^"]+)"/i);
  if (!im) return empty;
  const iframeUrl = im[1];
  const v1Html = await getHtml(iframeUrl, { 'Referer': durl }, 15000);
  if (!v1Html) return empty;
  // convert 地址在 v1 页 JS 里是绝对地址 (src=\"https://javheo-com.ibhan2.top/iframe/convert/v1/...\"),
  // /iframe 前是域名不是引号, 不能要求引号紧贴 /iframe; 尾部 \" 的反斜杠也要排除
  const cm = v1Html.match(/https?:\/\/javheo-com\.ibhan2\.top(\/iframe\/convert\/v1\/[^"'\\\s]+)/i)
    || v1Html.match(/["'](\/iframe\/convert\/v1\/[^"'\\\s]+)["']/i);
  if (!cm) return empty;
  const convertUrl = IFRAME_HOST + cm[1];
  const convHtml = await getHtml(convertUrl, { 'Referer': iframeUrl }, 15000);
  if (!convHtml) return empty;
  const qualities = [];
  const re = /\{\s*(?:default:\s*true,\s*)?html:\s*'([^']+)'\s*,\s*url:\s*'([^']+)'/g;
  let qm;
  while ((qm = re.exec(convHtml)) !== null) {
    const label = normLabel(qm[1]);
    if (label && qm[2] && !qualities.some((q) => q.label === label)) {
      qualities.push({ label, url: qm[2] });
    }
  }
  const dm = convHtml.match(/default:\s*true,\s*html:\s*'([^']+)'/);
  const defaultLabel = dm ? normLabel(dm[1]) : (qualities.length ? qualities[qualities.length - 1].label : '');
  // 档位一律最高在前、依次递减 (只列 convert 页实给的档, 不编造)
  qualities.sort((a, b) => resNum(b.label) - resNum(a.label));
  const chain = { qualities, defaultLabel, convertUrl };
  if (qualities.length) {
    resolveCache.set(watchId, { ts: Date.now(), chain });
    if (resolveCache.size > 200) resolveCache.delete(resolveCache.keys().next().value);
  }
  return chain;
}

async function home() {
  const html = await getHtml(HOST + '/');
  return { class: CLASSES, filters: FILTERS, list: parseList(html).slice(0, 30) };
}

async function tagPage(tag, page) {
  // 标签分类页单页 50 条、无翻页: p>1 直接空
  if (page > 1) return { page, pagecount: 1, limit: 50, total: 50, list: [] };
  const html = await getHtml(HOST + '/porn/' + tag.v + '/');
  const list = parseList(html);
  return { page, pagecount: 1, limit: list.length || 50, total: list.length, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const extend = body.filters || body.extend || {};
  const sub = t(extend.sub || '');
  // 筛选卡片值本身定路径 (与当前顶级无关, av77/123AV 同款)
  const tag = TAGS.find((x) => x.v === sub);
  if (tag) return tagPage(tag, page);
  // 顶级标签分类: /porn/<tag>/ 单页
  const cat = CLASSES.find((c) => c.type_id === id && c.type_id !== 'latest');
  if (cat) {
    const ctag = TAGS.find((x) => x.v === cat.type_id);
    if (ctag) return tagPage(ctag, page);
  }
  const url = page <= 1 ? HOST + '/' : HOST + '/page/' + page + '/';
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 80,
    total: 999 * 80,
    list,
  };
}

// 搜索走站内搜索框同款: /porn/<slug>/ (空格转 -、去非 alnum、小写)
function slugifyQuery(wd) {
  let s = t(wd).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
  s = s.toLowerCase().replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const slug = slugifyQuery(wd);
  if (!slug) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  if (page > 1) return { page, pagecount: 1, limit: 50, total: 50, list: [] };
  const html = await getHtml(HOST + '/porn/' + slug + '/');
  const list = parseList(html);
  return { page, pagecount: 1, limit: list.length || 50, total: list.length, list };
}

function watchIdOf(durl) {
  const m = String(durl || '').match(/\/watch\/([A-Za-z0-9]+)/i);
  return m ? m[1] : '';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let durl = t(raw);
  if (!durl) return { list: [] };
  if (!/^https?:\/\//i.test(durl)) durl = HOST + durl;
  const watchId = watchIdOf(durl);
  const html = await getHtml(durl);
  if (!html) return { list: [] };

  let name = '';
  const tm = html.match(/<title>([^<]*)<\/title>/i);
  if (tm) {
    name = cleanText(tm[1]).replace(/\s*-\s*Watch JAV.*$/i, '').replace(/\s*-\s*JavHeo.*$/i, '').trim();
  }
  let pic = '';
  const ogm = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogm) pic = ogm[1];
  if (!pic) {
    const im = html.match(/<img[^>]+src="(https:\/\/cdn-img\.ibhan2\.top[^"]+)"/i);
    if (im) pic = im[1];
  }

  // 详情现解档位 (降序, 1080p 在前); 失败则留一条 正片 线, play() 里现解
  let lines = [];
  const chain = await resolvePlay(watchId, durl);
  if (chain.qualities.length) {
    lines = chain.qualities.map((q) => q.label + '$heo:' + watchId + ':' + q.label);
  }
  if (!lines.length) lines = ['正片$heo:' + watchId + ':auto'];

  const vod = {
    vod_id: durl,
    vod_name: name || watchId,
    vod_pic: pic,
    vod_play_from: NAME,
    vod_play_url: lines.join('#'),
  };
  if (name) subRegister(durl, vod);
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^heo:([A-Za-z0-9]+):(.+)$/);
  if (!m) return { parse: 0, url: '' };
  const watchId = m[1];
  const want = m[2];
  const durl = HOST + '/watch/' + watchId;

  // 现解 (签名 URL 含 expires/srcIp, 不复用详情时地址; 详情已解过则走缓存)
  const chain = await resolvePlay(watchId, durl);
  if (!chain.qualities.length) return { parse: 0, url: '' };
  let hit = null;
  if (want && want !== 'auto') hit = chain.qualities.filter((q) => q.label === want)[0];
  // 未点名档位 (正片线) 或档位失配时给最高档, 不给站方默认 720p
  if (!hit) hit = chain.qualities[0];
  const subsP = subSearchAll(subNormKey(durl)).catch(() => []);
  return subAttach({
    parse: 0,
    url: hit.url,
    header: { 'User-Agent': UA, 'Referer': chain.convertUrl || durl },
  }, subsP);
}

// ---------------- 字幕聚合 (Layer A 铺开, 2026-10-23) ----------------
// 与 bestjavporn 试点同一实现 (提交 9c339419, 用户真机确认
// MiraPlayer 可加载并选择字幕): 点播时按片名/番号并行搜迅雷看看
// oracle (首档; 「迅雷」与「迅雷看看」实为同一接口) + SubtitleCat
// (第二档), 合并排序 = 来源档位 -> 语言 (简中>繁中>双语>英文>
// 其他) -> 番号命中 -> 热度, 只收 .srt/.vtt/.ass/.ssa 直链, 上限
// 10 条, 以 TVBox 标准 subs:[{name,url,format}] 挂到 play 结果。
// 总预算 6s、单请求 4~5s、全程框架 req (NOFETCH 安全)、结果缓存
// 10 分钟 (空结果不缓存); 无命中时不带 subs 键, play 返回与接入
// 前逐字段一致。SubHD (下载被站方门控) 与射手 (源站 522) 不接入。
const SUB_UA = (typeof UA !== 'undefined' && UA) ? UA : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

function subCleanText(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// subHttp: 与试点 reqRaw 同语义 (状态码不抛错、仅 2xx 给正文、
// 文本恒等变换防自动 JSON 解析), 底层框架 req。
async function subHttp(url, headers, timeoutMs) {
  try {
    const r = await req.request({
      method: 'GET',
      url,
      headers: headers || {},
      timeout: timeoutMs || 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const text = typeof r.data === 'string' ? r.data : (r.data == null ? '' : String(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// play 入参归一: 个别 App 会把 "集名$播放id" 整段传回, 集名短且
// 不含 {/http 时剥掉前缀, 与 detail 登记的 episode id 对齐。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}

// detail 侧登记: 片名按 [detail 入参 id, vod_id, 每个 episode 的
// 播放 id] 多键写入 subNameCache, 并以首个 episode id 预热搜索。
function subRegister(detailIds, vod) {
  try {
    if (!vod || !vod.vod_name) return;
    const name = String(vod.vod_name);
    const keys = new Set();
    for (const i of (Array.isArray(detailIds) ? detailIds : [detailIds])) {
      if (i) keys.add(String(i));
    }
    if (vod.vod_id) keys.add(String(vod.vod_id));
    const eps = [];
    for (const grp of String(vod.vod_play_url || '').split('$$$')) {
      for (const seg of grp.split('#')) {
        const k = seg.indexOf('$');
        if (k >= 0) {
          const ep = seg.slice(k + 1);
          if (ep) { keys.add(ep); eps.push(ep); }
        }
      }
    }
    for (const k of keys) subCacheName(k, name);
    // v7: 预热键必须与 play() 的 subSearchAll 键一致（裸详情 URL）。
    // 旧版用 eps[0]（形如 F4$<durl>@F4），play 侧先剥 $ 前缀与 @hint
    // 再查，键永远对不上 → 预热白做，每次点播都重跑最多 6s 的字幕
    // 搜索，play() 在 App 超时内回不来。vod_id 即 play 侧的裸 durl。
    const warmKey = vod.vod_id ? String(vod.vod_id) : (eps[0] || '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}

// play 侧挂载: 仅当结果带非空 url 且字幕有命中时才加 subs 键。
async function subAttach(res, subsP) {
  try {
    const subs = await subsP;
    if (subs && subs.length && res && typeof res === 'object' && res.url) res.subs = subs;
  } catch (e) { /* 字幕挂载失败不影响播放结果 */ }
  return res;
}

// ---------------- 字幕聚合 (Layer A 重写, 2026-10-23) ----------------
// 按用户自有迅雷看看 REX 组件 (xunlei.subtitle) 的方法重写: 旧版把
// [番号, 全标题, 番号+标题] 多个键的召回合并成一池只排序不过滤,
// 全标题键的模糊召回灌进大量别片字幕 (实测 JUR-887 全标题键池
// 前排即 JUX-021 等别片), 且迅雷档位恒占满上限 10, SubtitleCat
// 永远挤不进来。新版三招 (与组件一致):
// (a) 键序逐个查、首个有结果的键即停 — 番号键命中的池小而准;
// (b) 命中后严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可)
//     或片名全文, 不含的全扔, 无回退 (组件原法的回退宽松名单
//     在冷门番号上会把邻近番号的模糊池整池放行, 实测有害已删;
//     乱码单字键亦实测能召回无关字幕, 同样靠严过滤挡下);
// (c) 组件打分: cid_match 100000、含番号 +25000, 再加 oracle 自
//     带 score / fingerprintScore / 下载量, 按名+址去重取 top。
// 槽位 (用户钦定): 迅雷 (键序 [番号, 紧凑番号]) > 迅雷看看
// (组件完整键序 [番号, 紧凑番号, 番号+标题, 紧凑番号+标题,
// 全标题]) > SubtitleCat; 两迅雷槽同走同一 oracle 接口、不管
// 重不重复, 合并按 URL 去重、同条归高档位。合并序 = 档位 ->
// 语言 (简中>繁中>双语>英文>日文>其他, 沿用 subLangOf 口径)
// -> 分数; 全局上限 10、单槽软上限 8 (SubtitleCat 留位)。
// 全程 subHttp (框架 req 主栈), 迅雷系逐请求超时 3s、键序串行
// 首中即停; 总预算 6s、失败全静默; 无结果时 play 返回对象不带
// subs 键, 与未接入前逐字段一致。SubHD (下载被站方门控) 与
// 射手 (源站 522) 仍不接入。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();   // durl -> 片名 (detail 时 best-effort 写入)
const subResultCache = new Map(); // durl -> {ts, subs}

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? subCleanText(slug.replace(/[-_]+/g, ' ')) : '';
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
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

// 搜索上下文: 片名、番号、紧凑番号、标题部分 (去番号与噪声词)
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

// 迅雷槽键序: 只番号两键 (锚定)
function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

// 迅雷看看槽键序: 组件完整键序 (番号、紧凑番号、番号+标题、
// 紧凑番号+标题、全标题), 逐个查、首中即停。
function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

// 严过滤的匹配文本 (组件口径: 片名 + 上下文, 全小写与去分隔符两形)
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

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)
function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  // 尾码优先 (2026-11-07)：SubtitleCat 文件形如 "<标题>-<语码>.srt"，尾码才是文件实际语言；标题里的"简体中文"是原字幕名，不能覆盖尾码。
  const tail = String(name || '').match(/[-_.]([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  if (tail) {
    const c = tail[1].toLowerCase();
    if (c === 'zh' || c === 'chs' || c === 'cn' || c === 'hans') return { tag: '简中', rank: 0 };
    if (c === 'cht' || c === 'tw' || c === 'hant') return { tag: '繁中', rank: 1 };
    if (c === 'en' || c === 'eng') return { tag: '英文', rank: 3 };
    if (c === 'ja' || c === 'jpn' || c === 'jp') return { tag: '日文', rank: 4 };
    if (/^(fr|fre|de|ger|es|spa|it|ita|pt|por|ru|rus|nl|dut|sv|swe|da|dan|fi|fin|no|nor|pl|pol|cs|cze|sk|slo|hu|hun|ro|rum|bg|bul|uk|ukr|el|gre|tr|tur|ar|ara|he|heb|hi|hin|id|ind|ms|may|vi|vie|th|tha|km|khm|ko|kor|ak|af|afr|sq|alb|eu|baq|ca|cat|gl|glg|cy|wel|ga|gle|gd|gla|br|bre|co|cos|eo|epo|et|est|lv|lav|lt|lit|mt|mlt|sl|slv|mk|mac|sr|srp|hr|hrv|bs|bos|am|amh|so|som|sw|swa|yo|yor|ig|ibo|ha|hau|zu|zul|xh|xho|st|sot|sn|sna|ka|geo|hy|arm|az|aze|kk|kaz|uz|uzb|mn|mon|ky|kir|tg|tgk|tk|tuk|ti|tir|fa|per|ur|urd|bn|ben|ta|tam|te|tel|ml|mal|mr|mar|pa|pan|gu|guj|kn|kan|as|asm|or|ori|sa|san|ne|nep|si|sin|my|bur|lo|lao)$/.test(c)) return { tag: '', rank: 5 };
  }
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

// 文本字幕格式判定: 文件名扩展名 > 条目 ext 字段 > url 后缀;
// 压缩包一律剔除 (与组件 getExt 口径一致, 只认 srt/vtt/ass/ssa)。
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

// 裸哈希名不可读: 显示名换成番号字幕 (匹配/过滤仍用原名)
function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

// oracle 单键查询 (同趟搜索内按键缓存, 两槽共用, 不重复发请求)
async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await subHttp('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
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

// oracle 条目归一 (组件 normalizeResult 的字段口径)
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

// 严过滤 (组件口径): 条目 name/langs/ext 须含番号 (原形或宽松
// 形) 或片名全文, 否则扔掉。片名分支必须守非空: 个别蜘蛛的
// 播放 id 与 detail 登记键对不上时片名缓存会落空 (title=''),
// 空串是任何字符串的子串, 不守就会全池放行 (bigbuttshub 实测
// 教训: 假番号 EMPTY-24 搜出的 Sherlock 剧集字幕整页漏入)。
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

// 组件打分 (scoreItem 的电影路径): cid_match 100000、含番号
// +25000、oracle 自带 score/fingerprintScore、下载量、时长/大小。
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

// 迅雷系槽位 (迅雷 tier 0 / 迅雷看看 tier 1): 键序逐个查、首个
// 有结果的键即停; 命中池只过严过滤、无任何回退 — 组件原法的
// 「过滤到空回退宽松名单」在冷门番号上实测有害 (oracle 对无精
// 确字幕的番号返回邻近番号的模糊池, 回退等于整池垃圾放行:
// MOGK-006 挂上 MOGK-004/002、FC2-PPV-4991508 挂上他人番号),
// 与「宁缺毋滥」冲突, 故删除 (与 REX 版相关性闸门口径一致)。
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

// SubtitleCat 槽 (tier 2): 沿用旧芯搜索/解析 (按番号键搜、逐页
// 取按语言分的直链), 同样过严过滤 (无回退)。
async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await subHttp('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 5000);
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
    const pr = await subHttp('https://subtitlecat.com/' + p, { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 4000);
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

// 合并: 档位 -> 语言 -> 分数; 按 URL 去重 (同条归先到高档位);
// 全局上限 10、单槽软上限 8 (给 SubtitleCat 留位)。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。
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

const subInflight = new Map(); // durl -> Promise<subs> (detail 预热与 play 共用同一趟)

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
      // 总预算 6s: 到点先用已入 bag 的部分合并返回; 后台源跑完
      // 后若凑出结果再迟填缓存 (慢出口下 detail 预热靠此命中)。
      // 空结果不缓存 (无字幕的片每次点播重查, 由在途去重兜底)。
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

// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。
function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}
export default {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}