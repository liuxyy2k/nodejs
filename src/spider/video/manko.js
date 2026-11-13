// Manko (https://manko.fun) -> CatPawOpen spider
// 站点：JAV 在线站（JavClick 系 App 壳），站内 API 在 healertanker.com，
//   备用 host alpharomeo.shop（window.ip2，Bt() 回退腿；VM 实测通）。
// API（2026-11-13 VM 实测通）：
//   列表/搜索：GET https://healertanker.com/swx/movie/search?page=N&size=24
//     &can_manko=true[&most_popular=true|&top_rated=true|&subtitle_link=true]
//     [&genre=<体裁名>|&country=<厂商名>|&keyword=<词>]，回包
//     {"data":"<xn 编码>","total":N}，data 为自定义 base91 变体编码（xn，
//     字母表见下，原样抄自 /dist/build.js，Buffer 解码）；home total
//     292800、popular 31613、Big Tits 体裁 5057、字幕 32571；
//     p1/p2 各 24 条无重叠。注意：category= 参数是死路（恒 total 0），
//     体裁过滤必须用 genre=、厂商过滤用 country=（/filter/:type/:name
//     的 ma() 构造法实测坐实）。
//   体裁表：GET /common/list-genre -> data 为明文数组 115 个；
//   厂商表：GET /common/country-list -> data 明文数组 1000 个（按站内
//     热度排序，卡片只取前 40，均逐个实测有量）。
//   随机：GET /swx/movie/random-list?page=N&size=24（同 xn 编码）。
//   详情：GET /swx/movie/detail/<_id> -> xn 解码后含 wasabi_url_1、
//     wasabi_embed_url、missav_video（surrit /720p/video.m3u8）、
//     upload18_player、mmtv_embed（10 部抽样：embed/missav/upload18
//     均为 10/10，mmtv 2/10）。
//   播放：站方 App 用 wasabi_embed_url（iframe 播放器，server1）为主线；
//     播放器 JS 取 https://<embed host>/stream?id=<code> -> {media:
//     {stream:<wasabi m3u8>, vtt}}；蜘蛛同款取 /stream 得直链 m3u8。
//     断点坐实（2026-11-13 VM 实测，4 部 + 抽样 3 部）：wasabi 播单
//     host（strongcalmforce 等）是 Cloudflare 前置、按 Referer 放行——
//     Referer=embed host origin（sadie-shop.site）时 master/变体/首分片
//     全 200，Referer=manko.fun 或无 Referer 时全 403。旧代码 play()
//     一律传 Referer: manko.fun，手机端同样会被 403——这就是“所有内容
//     都无法播放”的主因（不是 VM 出口问题）。修法：wasabi 腿的
//     /stream 取链与 m3u8 返回头一律用 embed host origin 作 Referer。
//     master 实测单变体 1280x720（7 部全是 BANDWIDTH=2816000，
//     RESOLUTION=1280x720），故只出单档 720p，不编 1080p。
//     MissAV 腿：surrit 全档位 VM 侧一律 CF 403（连数据里给定的 720p
//     也 403；jina 中转同样 403），VM 无法逐档核实，故只出两档：
//     自动（playlist.m3u8 主播单，与仓内 missav.js 同款构造，播放器
//     自选最高可用档）+ 数据档（详情原给的 /1080p|720p|480p|360p/
//     video.m3u8，逐部不同、标签按实测档位动态标，不写死 720p）；
//     1080/480/360 不硬编（存在性 VM 侧无法证实）。MissAV 腿不带 Referer 头
//     （与仓内 missav.js 一致：它裸返 m3u8 且用户真机确认可播）。
//     7MMTV 腿（mmtv_m3u8，最新 24 部里 6 部有）：播单本身 200、
//     分片须带 Referer: https://7mmtv.sx/ 才放行（manko.fun 必 404；
//     2026-11-13 实测：6af5278f 首分片 7mmtv Referer 下 200/386KB，
//     manko Referer 下 404）；部分条目分片已过期（SNOS-389 与
//     5ff450… 两条目播单 200 但分片 404，任一 Referer 皆然），
//     故 detail 里先验活（播单 200 + 首分片 200 才出线，验不出
//     则保留），play 返回头用 7mmtv.sx。
//     Upload18 腿：站方本身部分视频已无（upload18.org/play/index/
//     <番号> 302 到 /404.html，标题 Page not found；SNOS-389 正常
//     200），不是蜘蛛取错地址；detail 里先验活（5s 超时，验不出
//     则保留），死的直接不出线。
//   详情出线：Manko 720p（/stream 直链）+ MissAV 自动/数据档 +
//     7MMTV（验活才出）+ Upload18（验活才出，播放器页 parse:1 嗅探）。
// 分类呈现（用户 2026-11-13 01:59 定）：顶级分类 + 筛选卡片（123AV 款），
//   子分类不平铺：最新 / 无码流出 / 无码破解 / 巨乳 / 大屁股 / 屁股 /
//   中出 / 人妻 / 素人 / 最受欢迎 / 最高评分 / 有字幕 / 随机 /
//   体裁（卡片）/ 厂商（卡片）。8 个热门体裁顶级化（2026-11-13 实测
//   total：无码流出 192、无码破解 2746、巨乳 64092、大屁股 8587、
//   屁股 10314、中出 88822、人妻 28277、素人 54906）。
// 分类呈现（用户 2026-11-13 01:59 定）：顶级分类 + 筛选卡片（123AV 款），
//   子分类不平铺：最新 / 最受欢迎 / 最高评分 / 有字幕 / 随机 /
//   体裁（卡片）/ 厂商（卡片）。
// 字幕：JAV 站、标题带番号，接 sextb.js 字幕块（整块照抄，见文件尾）：
//   detail 里 subRegister 登记 + subWarm 预热（键为 manko:<_id>），
//   play 里 subSearchAll(同键) 并行、有命中才挂 subs。
import req from '../../util/req.js';

const KEY = 'py_manko';
const NAME = '🌸Manko';
const API_HOSTS = ['https://healertanker.com', 'https://alpharomeo.shop'];
const SITE = 'https://manko.fun';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

// 体裁卡片：/common/list-genre 明文表 115 个，逐个实测 p1 后保留 103 个
// （12 个 0 条已剔除，2026-11-13 复查 11 个仍 0 条，No underwear 仅 2 条
// 仍剔除：Chroma Key、Hairy、Hobby, Culture、Itching、
// Male Adventure、No underwear、Pampering、Psychological thriller、
// R-15、Suspense、Ultra-Huge Tit、Variety Show）。
const GENRE_CARDS = [
{ n: "69", v: "69" },
  { n: "3D", v: "3D" },
  { n: "3p, 4p", v: "3p, 4p" },
  { n: "4HR+", v: "4HR+" },
  { n: "4K", v: "4K" },
  { n: "Action", v: "Action" },
  { n: "Adult Movie", v: "Adult Movie" },
  { n: "Amateur", v: "Amateur" },
  { n: "Anus", v: "Anus" },
  { n: "BBW", v: "BBW" },
  { n: "Beautiful foot", v: "Beautiful foot" },
  { n: "Beautiful Girl Movie", v: "Beautiful Girl Movie" },
  { n: "Best, Omnibus", v: "Best, Omnibus" },
  { n: "Big cock", v: "Big cock" },
  { n: "Big Tits", v: "Big Tits" },
  { n: "Blow", v: "Blow" },
  { n: "Breast Milk", v: "Breast Milk" },
  { n: "Breasts", v: "Breasts" },
  { n: "Butt", v: "Butt" },
  { n: "Classic", v: "Classic" },
  { n: "Close Up", v: "Close Up" },
  { n: "Co-act", v: "Co-act" },
  { n: "Coprophagy", v: "Coprophagy" },
  { n: "Cowgirl", v: "Cowgirl" },
  { n: "Creampie", v: "Creampie" },
  { n: "Cum", v: "Cum" },
  { n: "Cunnilingus", v: "Cunnilingus" },
  { n: "dating", v: "dating" },
  { n: "Debut Production", v: "Debut Production" },
  { n: "Deep Throating", v: "Deep Throating" },
  { n: "Defecation", v: "Defecation" },
  { n: "Digital Mosaic", v: "Digital Mosaic" },
  { n: "Dirty Words", v: "Dirty Words" },
  { n: "Documentary", v: "Documentary" },
  { n: "Doggy style", v: "Doggy style" },
  { n: "Drama", v: "Drama" },
  { n: "Facesitting", v: "Facesitting" },
  { n: "Facials", v: "Facials" },
  { n: "Fan Appreciation", v: "Fan Appreciation" },
  { n: "FFM", v: "FFM" },
  { n: "Fighting Action", v: "Fighting Action" },
  { n: "Finger Fuck", v: "Finger Fuck" },
  { n: "Fisting", v: "Fisting" },
  { n: "Fit two holes", v: "Fit two holes" },
  { n: "Footjob", v: "Footjob" },
  { n: "For Women", v: "For Women" },
  { n: "Gravure", v: "Gravure" },
  { n: "Handjob", v: "Handjob" },
  { n: "HD DVD", v: "HD DVD" },
  { n: "Historical Play", v: "Historical Play" },
  { n: "Horror", v: "Horror" },
  { n: "How To", v: "How To" },
  { n: "Huge Butt", v: "Huge Butt" },
  { n: "Image Video", v: "Image Video" },
  { n: "Independents", v: "Independents" },
  { n: "Interview", v: "Interview" },
  { n: "Kiss", v: "Kiss" },
  { n: "Lolita", v: "Lolita" },
  { n: "Love", v: "Love" },
  { n: "Massage", v: "Massage" },
  { n: "Masturbation", v: "Masturbation" },
  { n: "Mature Woman", v: "Mature Woman" },
  { n: "Mini", v: "Mini" },
  { n: "MMF", v: "MMF" },
  { n: "MMFF", v: "MMFF" },
  { n: "Multiple Story", v: "Multiple Story" },
  { n: "Muscle", v: "Muscle" },
  { n: "No bra", v: "No bra" },
  { n: "Omnibus", v: "Omnibus" },
  { n: "Original Collaboration", v: "Original Collaboration" },
  { n: "Over 16 hours", v: "Over 16 hours" },
  { n: "Oversea Import", v: "Oversea Import" },
  { n: "Parody", v: "Parody" },
  { n: "Piss Drinking", v: "Piss Drinking" },
  { n: "POV", v: "POV" },
  { n: "Pregnant Woman", v: "Pregnant Woman" },
  { n: "Promiscuity", v: "Promiscuity" },
  { n: "Reprinted Edition", v: "Reprinted Edition" },
  { n: "Risky Mosaic", v: "Risky Mosaic" },
  { n: "Roll your eyes", v: "Roll your eyes" },
  { n: "Sensuality", v: "Sensuality" },
  { n: "SF", v: "SF" },
  { n: "Shave", v: "Shave" },
  { n: "Shaved", v: "Shaved" },
  { n: "Simulation", v: "Simulation" },
  { n: "Slender", v: "Slender" },
  { n: "Solowork", v: "Solowork" },
  { n: "Spanking", v: "Spanking" },
  { n: "Special Effects", v: "Special Effects" },
  { n: "Squirting", v: "Squirting" },
  { n: "Subjectivity", v: "Subjectivity" },
  { n: "Tall", v: "Tall" },
  { n: "Tits", v: "Tits" },
  { n: "Titty Fuck", v: "Titty Fuck" },
  { n: "Touch Typing", v: "Touch Typing" },
  { n: "Transsexual", v: "Transsexual" },
  { n: "Uncensored Crack", v: "Uncensored Crack" },
  { n: "Uncensored Leak", v: "Uncensored Leak" },
  { n: "Urination", v: "Urination" },
  { n: "US/EU Porn", v: "US/EU Porn" },
  { n: "User Submission", v: "User Submission" },
  { n: "VR", v: "VR" },
  { n: "Yoga·Fitness", v: "Yoga·Fitness" }
];

// 厂商卡片：/common/country-list 前 40（站内热度序，逐个实测有量后保留）。
const MAKER_CARDS = [
  { n: "S1 NO.1 STYLE", v: "S1 NO.1 STYLE" },
  { n: "MOODYZ", v: "MOODYZ" },
  { n: "IDEA POCKET", v: "IDEA POCKET" },
  { n: "マドンナ(Madonna)", v: "マドンナ(Madonna)" },
  { n: "PRESTIGE,プレステージ", v: "PRESTIGE,プレステージ" },
  { n: "SOD Create", v: "SOD Create" },
  { n: "センタービレッジ", v: "センタービレッジ" },
  { n: "クリスタル映像", v: "クリスタル映像" },
  { n: "FALENO", v: "FALENO" },
  { n: "ルビー", v: "ルビー" },
  { n: "桃太郎映像出版", v: "桃太郎映像出版" },
  { n: "シロウトTV", v: "シロウトTV" },
  { n: "アリスJAPAN", v: "アリスJAPAN" },
  { n: "STAR PARADISE", v: "STAR PARADISE" },
  { n: "Glory Quest", v: "Glory Quest" },
  { n: "タカラ映像", v: "タカラ映像" },
  { n: "Attackers", v: "Attackers" },
  { n: "h.m.p", v: "h.m.p" },
  { n: "ワンズファクトリー", v: "ワンズファクトリー" },
  { n: "パラダイステレビ", v: "パラダイステレビ" },
  { n: "GIGA", v: "GIGA" },
  { n: "ビッグモーカル", v: "ビッグモーカル" },
  { n: "ワープエンタテインメント", v: "ワープエンタテインメント" },
  { n: "なでしこ", v: "なでしこ" },
  { n: "アイエナジー", v: "アイエナジー" },
  { n: "VENUS", v: "VENUS" },
  { n: "ナチュラルハイ", v: "ナチュラルハイ" },
  { n: "ディープス", v: "ディープス" },
  { n: "映天", v: "映天" },
  { n: "Hunter", v: "Hunter" },
  { n: "ナンパTV", v: "ナンパTV" },
  { n: "TMA", v: "TMA" },
  { n: "NEXT GROUP", v: "NEXT GROUP" },
  { n: "オルスタックピクチャーズ", v: "オルスタックピクチャーズ" },
  { n: "ジャネス", v: "ジャネス" },
  { n: "S級素人", v: "S級素人" },
  { n: "プレステージプレミアム(PRESTIGE PREMIUM)", v: "プレステージプレミアム(PRESTIGE PREMIUM)" },
  { n: "マキシング", v: "マキシング" },
  { n: "マックスエー", v: "マックスエー" },
  { n: "セレブの友", v: "セレブの友" }
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

// 顶级化的热门体裁（用户 2026-11-13 点名：顶级分类太少，多加无码流出 /
// 大屁股 / 巨乳一类；total 见文件头注释，均为站内实测有量）。
const TOP_GENRES = [
  { id: 'g_uncleak', name: '无码流出', genre: 'Uncensored Leak' },
  { id: 'g_unccrack', name: '无码破解', genre: 'Uncensored Crack' },
  { id: 'g_bigtits', name: '巨乳', genre: 'Big Tits' },
  { id: 'g_hugebutt', name: '大屁股', genre: 'Huge Butt' },
  { id: 'g_butt', name: '屁股', genre: 'Butt' },
  { id: 'g_creampie', name: '中出', genre: 'Creampie' },
  { id: 'g_mature', name: '人妻', genre: 'Mature Woman' },
  { id: 'g_amateur', name: '素人', genre: 'Amateur' },
];
const TOP_GENRE_MAP = {};
for (const g of TOP_GENRES) TOP_GENRE_MAP[g.id] = g.genre;

// xn 解码（原样抄自 manko.fun /dist/build.js 的 xn 函数；
// vn 即 Buffer；字母表 91 字符的 base91 变体）。
function xn(e) {
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
  const t0 = '' + (e || '');
  const n = t0.length;
  const r = [];
  let a = 0, i = 0, o = -1;
  for (let s = 0; s < n; s++) {
    const l = ALPH.indexOf(t0[s]);
    if (l === -1) continue;
    if (o < 0) o = l;
    else {
      a |= (o += 91 * l) << i;
      i += (8191 & o) > 88 ? 13 : 14;
      do { r.push(255 & a); a >>= 8; i -= 8; } while (i > 7);
      o = -1;
    }
  }
  if (o > -1) r.push(255 & (a | (o << i)));
  return Buffer.from(r).toString('utf-8');
}

async function apiRaw(path) {
  for (const host of API_HOSTS) {
    try {
      const r = await req.get(host + path, {
        headers: { 'User-Agent': UA, 'Referer': SITE + '/', 'Accept': 'application/json,*/*' },
        timeout: 20000,
        responseType: 'text',
        transformResponse: [(d) => d],
      });
      const data = r && r.data;
      const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
      if (txt) {
        try { return JSON.parse(txt); } catch (e) { /* 非 JSON（如拦截页），换备用 host */ }
      }
    } catch (e) { /* 换备用 host */ }
  }
  return null;
}

// search 系接口：解 data、带 total；失败回 null。
async function apiSearch(path) {
  const j = await apiRaw(path);
  if (!j || typeof j.data !== 'string') return null;
  let arr = [];
  try { arr = JSON.parse(xn(j.data)); } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  return { items: arr, total: Number(j.total) || 0 };
}

async function apiDetail(id) {
  const j = await apiRaw('/swx/movie/detail/' + encodeURIComponent(id));
  if (!j || typeof j.data !== 'string') return null;
  try {
    const d = JSON.parse(xn(j.data));
    return d && typeof d === 'object' ? d : null;
  } catch (e) { return null; }
}

function itemToVod(it) {
  if (!it || !it._id) return null;
  const title = t(it.title) || t((it.title_display_name || [])[0] && it.title_display_name[0].title) || it._id;
  const remarks = [t(it.share_date), it.rating ? ('\u2605' + it.rating) : ''].filter(Boolean).join(' ');
  return {
    vod_id: String(it._id),
    vod_name: title,
    vod_pic: t(it.thumbnail_image) || t(it.wide_thumbnail) || '',
    vod_remarks: remarks,
  };
}

function searchUrl(page, extra) {
  return '/swx/movie/search?page=' + page + '&size=' + PAGE_SIZE + '&can_manko=true' + (extra || '');
}

async function init() {
  return {};
}

async function home() {
  const classes = [{ type_id: 'new', type_name: '最新' }];
  for (const g of TOP_GENRES) classes.push({ type_id: g.id, type_name: g.name });
  classes.push(
    { type_id: 'popular', type_name: '最受欢迎' },
    { type_id: 'top_rated', type_name: '最高评分' },
    { type_id: 'subtitle', type_name: '有字幕' },
    { type_id: 'random', type_name: '随机' },
    { type_id: 'genres', type_name: '体裁' },
    { type_id: 'makers', type_name: '厂商' },
  );
  return {
    class: classes,
    filters: {
      genres: [{ key: 'sub', name: '体裁', value: GENRE_CARDS }],
      makers: [{ key: 'sub', name: '厂商', value: MAKER_CARDS }],
    },
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'new');
  const extend = body.filters || body.extend || {};
  const sub = String(extend.sub || '');
  let path = '';
  if (id === 'new') path = searchUrl(page, '');
  else if (TOP_GENRE_MAP[id]) path = searchUrl(page, '&genre=' + encodeURIComponent(TOP_GENRE_MAP[id]));
  else if (id === 'popular') path = searchUrl(page, '&most_popular=true');
  else if (id === 'top_rated') path = searchUrl(page, '&top_rated=true');
  else if (id === 'subtitle') path = searchUrl(page, '&subtitle_link=true');
  else if (id === 'random') path = '/swx/movie/random-list?page=' + page + '&size=' + PAGE_SIZE;
  else if (id === 'genres') path = searchUrl(page, '&genre=' + encodeURIComponent(sub || GENRE_CARDS[0].v));
  else if (id === 'makers') path = searchUrl(page, '&country=' + encodeURIComponent(sub || MAKER_CARDS[0].v));
  else return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const res = await apiSearch(path);
  if (!res) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const list = res.items.map(itemToVod).filter(Boolean);
  const pagecount = res.total > 0
    ? Math.max(1, Math.ceil(res.total / PAGE_SIZE))
    : (list.length < PAGE_SIZE ? page : page + 1);
  return { page, pagecount, limit: list.length || PAGE_SIZE, total: res.total, list };
}

function titleOf(d, fallback) {
  const names = Array.isArray(d.title_display_name) ? d.title_display_name : [];
  const en = names.filter((x) => x && x.language === 'en')[0];
  const any = names[0];
  return t(d.title) || t(en && en.title) || t(any && any.title) || fallback || '';
}

function overviewOf(d) {
  const arr = Array.isArray(d.discription) ? d.discription : [];
  const zh = arr.filter((x) => x && x.language === 'zh')[0];
  const en = arr.filter((x) => x && x.language === 'en')[0];
  return t(zh && zh.overview) || t(en && en.overview) || t(arr[0] && arr[0].overview);
}

// embed 播放器 /stream 取直链：wasabi_embed_url 形如
// https://<host>/e/<code>?poster=... -> GET https://<host>/stream?id=<code>
// 关键：/stream 与后续 m3u8 都按 Referer 放行，Referer 必须是 embed host
// origin（实测：sadie-shop.site 作 Referer 时 200，manko.fun/无 Referer
// 时 CF 403）；/stream 本身对 manko.fun Referer 也通，但统一用 embed
// origin 最贴近站方播放器行为。
async function resolveWasabiStream(embedUrl) {
  if (!embedUrl) return { stream: '', embedOrigin: '' };
  const m = String(embedUrl).match(/^(https?:\/\/[^\/]+)\/e\/([A-Za-z0-9]+)/);
  if (!m) return { stream: '', embedOrigin: '' };
  const embedOrigin = m[1];
  const streamApi = m[1] + '/stream?id=' + m[2];
  try {
    const r = await req.get(streamApi, {
      headers: { 'User-Agent': UA, 'Referer': embedOrigin + '/' },
      timeout: 15000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    if (!txt) return { stream: '', embedOrigin };
    const j = JSON.parse(txt);
    return { stream: t(j && j.media && j.media.stream), embedOrigin };
  } catch (e) {
    return { stream: '', embedOrigin };
  }
}

// 7MMTV 播单验活：播单 200 且含 #EXTM3U、首分片 200 才算活；
// 其余情况（超时/异常/播单非 200/无清单标记）一律按活处理，
// 不因本站抖动藏线。分片须带 Referer: https://7mmtv.sx/。
async function mmtvAlive(m3u8Url) {
  try {
    const r = await req.get(m3u8Url, {
      headers: { 'User-Agent': UA, 'Referer': 'https://7mmtv.sx/' },
      timeout: 5000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const txt = typeof r.data === 'string' ? r.data : '';
    if (r.status !== 200 || txt.indexOf('#EXTM3U') < 0) return true;
    const seg = txt.split('\n').map((s) => s.trim()).find((s) => /^https?:/.test(s) && !/\.m3u8/i.test(s));
    if (!seg) return true;
    const sr = await req.get(seg, {
      headers: { 'User-Agent': UA, 'Referer': 'https://7mmtv.sx/' },
      timeout: 5000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    return sr.status === 200;
  } catch (e) {
    return true;
  }
}

// Upload18 播放器页验活：站方本身部分视频已下架（302 到 /404.html，
// 标题 Page not found）；活页标题是番号。5s 超时，验不出（超时/异常/
// 非 200 非 404）一律按活处理，不因本站抖动藏线。
async function u18Alive(playerUrl) {
  try {
    const r = await req.get(playerUrl, {
      headers: { 'User-Agent': UA, 'Referer': SITE + '/' },
      timeout: 5000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const txt = typeof r.data === 'string' ? r.data : '';
    if (txt.indexOf('<title>Page not found</title>') >= 0) return false;
    if (r.status === 200 && txt) return true;
    return true; // 非 404 的异常状态不断言死，保留线
  } catch (e) {
    return true;
  }
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let id = t(raw);
  if (id.indexOf('manko:') === 0) id = id.slice(6);
  if (!id) return { list: [] };
  const d = await apiDetail(id);
  if (!d) return { list: [] };
  const name = titleOf(d, id);
  const pic = t(d.cover_image) || '';
  const from = [];
  const urls = [];
  // 分组 1：Manko 720p（/stream 直链；master 实测单变体 1280x720，
  // 无 embed 时退 wasabi_url_1 直链，同用 embed host Referer）。
  if (d.wasabi_embed_url || d.wasabi_url_1) {
    from.push(NAME);
    urls.push('720p$manko:' + id + ':wasabi');
  }
  // 分组 2：MissAV 自动 + 数据档。档位取自详情数据原给的地址
  // （/1080p/、/720p/ 等逐部不同，写死 720p 会标错——MUDR-405
  // 数据里就是 1080p）；自动是同 uuid 的 playlist.m3u8 主播单
  // （仓内 missav.js 同款构造），播放器自选最高可用档；
  // 其他档不硬编（VM 侧 surrit 全档位皆 CF 403，逐档存在性无法证实）。
  if (d.missav_video) {
    from.push('MissAV');
    const mv = t(d.missav_video);
    const resM = mv.match(/\/(1080p|720p|480p|360p)\/video\.m3u8$/i);
    const resLabel = resM ? resM[1] : '720p';
    const auto = resM ? mv.replace(/\/\d+p\/video\.m3u8$/i, '/playlist.m3u8') : '';
    urls.push((auto ? '自动$manko:' + id + ':missav-auto' : '') + (auto ? '#' : '') + resLabel + '$manko:' + id + ':missav');
  }
  // 分组 3：7MMTV（mmtv_m3u8 直链；分片须带 7mmtv.sx Referer，
  // 部分条目分片已过期，先验活，死的直接不出线，验不出则保留）。
  if (d.mmtv_m3u8) {
    if (await mmtvAlive(t(d.mmtv_m3u8))) {
      from.push('7MMTV');
      urls.push('播放$manko:' + id + ':mmtv');
    }
  }
  // 分组 4：Upload18（播放器页，parse:1 嗅探线；站方已下架的先验活，
  // 死的直接不出线，验不出则保留）。
  if (Array.isArray(d.upload18_player) && d.upload18_player[0]) {
    if (await u18Alive(t(d.upload18_player[0]))) {
      from.push('Upload18');
      urls.push('播放$manko:' + id + ':u18');
    }
  }
  const vod = {
    vod_id: 'manko:' + id,
    vod_name: name || id,
    vod_pic: pic,
    vod_content: overviewOf(d),
    vod_remarks: d.video_duration ? (Math.floor(Number(d.video_duration) || 0) + '分钟') : '',
    vod_play_from: from.join('$$$'),
    vod_play_url: urls.join('$$$'),
  };
  // 字幕：标题带番号才登记+预热（键 manko:<_id>，与 play 同键）。
  if (name && subExtractCode(name)) {
    try { subRegister([id], vod); } catch (e) { /* 登记失败不影响详情 */ }
  }
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^manko:([^:]+):(wasabi|missav|missav-auto|mmtv|u18)$/);
  if (!m) {
    // 裸 m3u8 直链直接返。
    if (/\.m3u8(\?|$)/i.test(id)) {
      return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': SITE + '/' } };
    }
    return { parse: 0, url: '' };
  }
  const vid = m[1];
  const leg = m[2];
  const subKey = 'manko:' + vid;
  const subsP = subSearchAll(subKey).catch(() => []);
  const d = await apiDetail(vid);
  if (!d) return { parse: 0, url: '' };
  if (leg === 'wasabi') {
    // Referer 必须是 embed host origin（见文件头：manko.fun 必 403）。
    const res = await resolveWasabiStream(d.wasabi_embed_url);
    let stream = res.stream;
    if (!stream) stream = t(d.wasabi_url_1);
    if (!stream) return { parse: 0, url: '' };
    const ref = res.embedOrigin ? res.embedOrigin + '/' : SITE + '/';
    return subAttach({ parse: 0, url: stream, header: { 'User-Agent': UA, 'Referer': ref } }, subsP);
  }
  if (leg === 'missav' || leg === 'missav-auto') {
    // 不带 Referer 头（与仓内 missav.js 一致：裸返 m3u8，真机可播）。
    const mv = t(d.missav_video);
    if (!mv) return { parse: 0, url: '' };
    let u = mv;
    if (leg === 'missav-auto') {
      if (!/\/\d+p\/video\.m3u8$/i.test(mv)) return { parse: 0, url: '' };
      u = mv.replace(/\/\d+p\/video\.m3u8$/i, '/playlist.m3u8');
    }
    return subAttach({ parse: 0, url: u }, subsP);
  }
  if (leg === 'mmtv') {
    const u = t(d.mmtv_m3u8);
    if (!u) return { parse: 0, url: '' };
    // 分片只认 Referer: https://7mmtv.sx/（见文件头）。
    return subAttach({ parse: 0, url: u, header: { 'User-Agent': UA, 'Referer': 'https://7mmtv.sx/' } }, subsP);
  }
  // u18：Upload18 播放器页，交播放器嗅探。
  const u = Array.isArray(d.upload18_player) ? t(d.upload18_player[0]) : '';
  if (!u) return { parse: 0, url: '' };
  return subAttach({ parse: 1, url: u, header: { 'User-Agent': UA, 'Referer': SITE + '/' } }, subsP);
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const res = await apiSearch(searchUrl(page, '&keyword=' + encodeURIComponent(wd)));
  if (!res) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const list = res.items.map(itemToVod).filter(Boolean);
  const pagecount = res.total > 0
    ? Math.max(1, Math.ceil(res.total / PAGE_SIZE))
    : (list.length < PAGE_SIZE ? page : page + 1);
  return { page, pagecount, limit: list.length || PAGE_SIZE, total: res.total, list };
}

// ---------------- 字幕聚合 ----------------
// 整块照抄 catverify-1101/nodejs/src/spider/video/sextb.js
// （SUB_UA 起至 subWarm 止，2026-11-02 Layer A 定版；尾码优先 subLangOf、
// snake_case fingerprint_score、时长显示、名字+时长去重、全局上限 10、
// 单槽软上限 8、总预算 6 秒）。
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
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}