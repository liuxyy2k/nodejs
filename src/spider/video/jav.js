// JavMove (https://javmove.com) -> CatPawOpen spider
// 探查 (2026-11-13, VM curl iPhone UA 全链实测):
//   顶级: 最新 (首页 / , 24 条/页, 翻页 /?page=N, p8 仍有 12 条新内容, 页数不止
//     导航栏显示的 7 页, 故用 999 形态)、新发布 (/release 单页 10 条, 无翻页)、
//     即将上映 (/upcoming 单页 13 条, 无翻页)。
//   2026-11-13 用户反馈顶级分类太少: 站内导航只有 / /release /upcoming /genres
//     /makers, 无更多站方顶级栏; /genres 索引实录 361 个题材, 其中无 "无码流出"
//     标签 (grep leak 全站 0 命中), 最接近的是 JAV Uncensored
//     (genres/javuncensored/jav-uncensored)。故把用户点名的无码流出/巨乳/
//     大屁股 + 人气前列 5 个题材 (中出/人妻/熟女/单体作品/素人) 提为顶级分类,
//     各页 p1/p2 均 12 条、0 重叠 (curl 串行实测); 40 题材 + 20 制作商筛选卡片保留,
//     12 个曾报 0 的制作商串行复核全是 200/12 条 (并行尾段 stall 误报, 一个不删)。
//   子分类走顶级 + filters 筛选卡片 (123AV 形态): 题材 361 个、制作商 947 个,
//     全量既无法逐个验、App 里也没法翻, 只取 /genres 与 /makers 索引页顺序 (人气序)
//     前 40 题材 + 前 20 制作商; 题材页与制作商页翻页均为 ?page=N
//     (big-tits p1/p2 各 12 条、0 重叠)。卡片: article > a[href="/movie/<id>/<slug>"],
//     内含 img.movie-image (ie2.javmove.com/media) 与标题文本 (番号开头, 如 CAWB-006);
//     每卡有两个锚点 (图 + 标题), 解析须按 movie id 去重。
//   搜索: GET /search?q= , 翻页 &page=N (CAWB-006 首条即命中, 每页 12 条)。
//   详情: /movie/<id>/<slug>, 标题 <title> 去 " | JAVMove" 后缀; 无 og:image,
//     封面取首张截图 (.splide__slide img, ie2.javmove.com/media)。
//     播放: 详情页 <video id="video-player" data-id="<token>">, GET /watch?token=<token>
//     (无 Referer 也 200) 回纯文本直链 mp4 (如 https://bnsjnqwxlob.cfd/vs/....mp4),
//     Range 实测 206 video/mp4 (带/不带 Referer 均通)。格式区 .video-format
//     (本批两部详情均只 FullHD 一组); 每组内分 part, part 链接 ?type=<TYPE>&p=<N>,
//     各 part 各有自己的 data-id (p1/p2 已验不同 token)。详情按 格式·P<part> 出线,
//     play() 按 part 地址现取 data-id 再调 /watch, 不复用详情时 token。
//     注意播放器另有 MSE + /decryptor.wasm + /api/session-ticket 加密分支,
//     只在 /watch 不回直链 http(s) 地址时走, 本批 /watch 均回直链, 不走该分支。
//   2026-11-13 第二轮真机反馈 (R2, 全部三项在 VM 侧复现并坐实):
//   - 封面 1/12: 站方用 lazysizes, 每页只有第 1 张卡是 eager (img.movie-image
//     src=真地址), 第 2-12 张全是 lazyload: src=1×1 透明占位 data-URI,
//     真地址在 data-srcset 里 (上一轮 parseList 只取 src=, 故 11/12 条的
//     vod_pic 是 data:image/png;base64,... 占位, App 永远显示灰块; 上一轮
//     "VM 20/20" 只验了 pic 非空、没验是不是 data: URI, 结论作废)。
//     修法: pickImg() 优先 data-srcset/data-src/data-original/srcset,
//     拒收一切 data: URI, 只收 http(s) 真地址; 详情海报同理取首个
//     data-srcset (详情页共 13 个 data-srcset: 海报 1 + 相关卡 12, 首个即海报)。
//   - 筛选卡片重复两行: 每类下两张卡共用 key 'sub' (题材 + 制作商)。
//     av123 所谓"同款"是误读 —— av123 是每类只挂一张 'sub' 卡 (genres/
//     actresses/makers/series 各自一类一卡); 两张卡共用一个 key 时 extend
//     只能存一个值 (选制作商会冲掉题材, 反之亦然), App 按 key 解析时两行
//     显示同一组选项。修法: 两张卡改不同 key ('genre'/'maker'),
//     category() 同时认 genre/maker 与旧 sub (兼容旧版 App 已存的筛选态)。
//   - 播放全死: /watch 本身没坏 (带 Referer 63 字节直链, mp4 Range 带/不带
//     Referer 均 206, 直链 1.79GB 真 mp4), 死因是 play() 太慢: part 页
//     TTFB 12s + /watch 3s + 字幕并行搜索搅局, harness 实测 24-66s,
//     远超 App 侧点播等待, 且站方现更慢 (首页 522、题材页 21.5s、
//     /release 25s 超时)。修法三件套: (a) detail() 把当前 part (active
//     按钮) 的 data-id 嵌进该集播放 id, play() 快径单次 /watch 直取直链
//     (~3s, token 实测 8 分钟仍有效、约 20 分钟失效, 失效即回落); (b) 字幕改缓存只读 ——
//     play() 只挂 detail() 预热已入缓存的命中, 不再现搜、不再等 6s、
//     不再并发冲站方; (c) Worker 腿 javmove-fetch /resolve (整链代取 +
//     10 分钟缓存, 见 JAVMOVE_WORKER), token 失效时先走 Worker 再直连。
//     Worker 只做解析 (取页 + /watch), 不代理 mp4 字节 (直链本身通,
//     1.8GB 走免费 Worker 既无必要也扛不住)。
// 字幕: 接 sextb.js 定版字幕芯 (Layer A), 详情页地址为键登记片名、后台预热,
//   play() 只挂缓存命中 (无命中不现搜, 播放优先)。
import req from '../../util/req.js';

const KEY = 'py_javmove';
const NAME = '🌸JavMove';
const HOST = 'https://javmove.com';
// 整链代取 Worker (用户部署, 见同目录 javmove-fetch-worker-v1.js):
//   /resolve?mid=&slug=&type=&p= 取 part 页 -> data-id -> /watch 回直链 JSON,
//   10 分钟缓存。未部署/失败/超时时 play() 自动回落直连, 不阻塞播放。
//   部署名须与此一致 (https://javmove-fetch.li768435813.workers.dev),
//   改名部署时只改这一行。
const JAVMOVE_WORKER = 'https://javmove-fetch.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'release', type_name: '新发布' },
  { type_id: 'upcoming', type_name: '即将上映' },
  // 用户点名补的顶级题材 (2026-11-13, 各页 p1/p2 均 12 条、0 重叠, curl 串行实测)。
  // 站内无 "无码流出" 标签, 用 JAV Uncensored 页承接 (全站 grep leak 0 命中)。
  { type_id: 'g-uncensored', type_name: '无码流出' },
  { type_id: 'g-bigtits', type_name: '巨乳' },
  { type_id: 'g-hugebutt', type_name: '大屁股' },
  { type_id: 'g-creampie', type_name: '中出' },
  { type_id: 'g-married', type_name: '人妻' },
  { type_id: 'g-mature', type_name: '熟女' },
  { type_id: 'g-solowork', type_name: '单体作品' },
  { type_id: 'g-amateur', type_name: '素人' },
];

// 顶级题材 type_id -> 站内题材页 (与 GENRES 前 40 里的同一地址, 非平铺新增)
const GENRE_TOP = {
  'g-uncensored': 'genres/javuncensored/jav-uncensored',
  'g-bigtits': 'genres/BJiygps/big-tits',
  'g-hugebutt': 'genres/BmfzJNE/huge-butt',
  'g-creampie': 'genres/GVWkCw/creampie',
  'g-married': 'genres/BcEqYww/married-woman',
  'g-mature': 'genres/DFiQTPU/mature-woman',
  'g-solowork': 'genres/QxHGjE/solowork',
  'g-amateur': 'genres/BHCJmMg/amateur',
};

// 题材前 40 (/genres 索引页人气序, 2026-11-13 实录; 全站 361 个, 只取前 40)
const GENRES = [
  { n: 'Solowork', v: 'genres/QxHGjE/solowork' },
  { n: 'Creampie', v: 'genres/GVWkCw/creampie' },
  { n: 'Big Tits', v: 'genres/BJiygps/big-tits' },
  { n: 'Married Woman', v: 'genres/BcEqYww/married-woman' },
  { n: 'Mature Woman', v: 'genres/DFiQTPU/mature-woman' },
  { n: 'Beautiful Girl', v: 'genres/Ljbfjc/beautiful-girl' },
  { n: '4HR+', v: 'genres/ogWFog/4hr' },
  { n: 'Slut', v: 'genres/BMPngcQ/slut' },
  { n: 'Amateur', v: 'genres/BHCJmMg/amateur' },
  { n: 'Blow', v: 'genres/CHihjPU/blow' },
  { n: '3P, 4P', v: 'genres/BxHaNJc/3p-4p' },
  { n: 'Cuckold', v: 'genres/DSqPmNM/cuckold' },
  { n: 'Digital Mosaic', v: 'genres/IdoowAI/digital-mosaic' },
  { n: 'Slender', v: 'genres/CaENosY/slender' },
  { n: 'Squirting', v: 'genres/HShdVAg/squirting' },
  { n: 'School Girls', v: 'genres/CMwMXEY/school-girls' },
  { n: 'Nasty, Hardcore', v: 'genres/HVOSKBU/nasty-hardcore' },
  { n: 'Drama', v: 'genres/GUieHFE/drama' },
  { n: 'JAV Uncensored', v: 'genres/javuncensored/jav-uncensored' },
  { n: 'Incest', v: 'genres/ttzyfU/incest' },
  { n: 'Titty Fuck', v: 'genres/EYjtJGI/titty-fuck' },
  { n: 'Breasts', v: 'genres/FhKPzbk/breasts' },
  { n: 'Planning', v: 'genres/BelfNeY/planning' },
  { n: 'Cowgirl', v: 'genres/BrtnXsw/cowgirl' },
  { n: 'POV', v: 'genres/BZXvyLU/pov' },
  { n: 'Documentary', v: 'genres/waovUA/documentary' },
  { n: 'Huge Butt', v: 'genres/BmfzJNE/huge-butt' },
  { n: 'Facials', v: 'genres/HyKxxsQ/facials' },
  { n: 'Abuse', v: 'genres/EGOOyiw/abuse' },
  { n: 'Affair', v: 'genres/BWrHCvk/affair' },
  { n: 'Best, Omnibus', v: 'genres/glzpZM/best-omnibus' },
  { n: 'Older Sister', v: 'genres/BUKLrxc/older-sister' },
  { n: 'Voyeur', v: 'genres/jSorDs/voyeur' },
  { n: 'Humiliation', v: 'genres/DVXHZsY/humiliation' },
  { n: 'Other Fetish', v: 'genres/DlLttTU/other-fetish' },
  { n: 'Debut Production', v: 'genres/IgVddgQ/debut-production' },
  { n: 'Nampa', v: 'genres/BEVUiDU/nampa' },
  { n: 'OL', v: 'genres/BBofqrM/ol' },
  { n: 'Deep Throating', v: 'genres/BualDEg/deep-throating' },
  { n: 'Masturbation', v: 'genres/zHowlU/masturbation' },
];

// 制作商前 20 (/makers 索引页人气序, 2026-11-13 实录; 全站 947 个, 只取前 20)
const MAKERS = [
  { n: 'Prestige', v: 'maker/DNvUFlk/prestige' },
  { n: 'K.M.Produce', v: 'maker/BKBprXE/k-m-produce' },
  { n: 'SOD Create', v: 'maker/BsMlzCg/sod-create' },
  { n: 'MOODYZ', v: 'maker/CFUmAoI/moodyz' },
  { n: 'Madonna', v: 'maker/BUdRNZs/madonna' },
  { n: 'S1 NO.1 STYLE', v: 'maker/BMieoew/s1-no-1-style' },
  { n: 'Attackers', v: 'maker/BcXxOyY/attackers' },
  { n: 'IDEA POCKET', v: 'maker/CkydMyo/idea-pocket' },
  { n: 'Hunter', v: 'maker/BXKOZGQ/hunter' },
  { n: 'Glory Quest', v: 'maker/JzpYHfE/glory-quest' },
  { n: 'Center Village', v: 'maker/FPHToDU/center-village' },
  { n: 'Venus', v: 'maker/DVpmCKw/venus' },
  { n: 'Takara Eizou', v: 'maker/JRfNqRc/takara-eizou' },
  { n: 'Serebu No Tomo', v: 'maker/HiomwhM/serebu-no-tomo' },
  { n: 'Planet Plus', v: 'maker/DLOfVHk/planet-plus' },
  { n: 'Honnaka', v: 'maker/BmzFtSw/honnaka' },
  { n: 'Fitch', v: 'maker/ELucNvk/fitch' },
  { n: 'Das !', v: 'maker/HauUhiY/das' },
  { n: 'Deeps', v: 'maker/KSKweZU/deeps' },
  { n: 'BIGMORKAL', v: 'maker/GSUAIJU/bigmorkal' },
];

// 两张筛选卡必须用不同 key (R2: 共用 'sub' 时两行显示同一组选项, 且
// extend 只能存一个值、互冲。av123 每类只挂一张卡, 不是两张共用 key)
const FILTERS = {};
for (const c of CLASSES) {
  FILTERS[c.type_id] = [
    { key: 'genre', name: '题材', value: GENRES },
    { key: 'maker', name: '制作商', value: MAKERS },
  ];
}

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

// 封面取法 (R2 坐实): 站方用 lazysizes, 只有每页第 1 张卡是 eager
// (src=真地址), 其余全是 src=1×1 透明占位 data-URI、真地址在
// data-srcset 里。只取 src= 会让 11/12 条封面永远是占位灰块。
// 顺序: data-srcset > data-src/data-original > srcset > src,
// 一律只收 http(s), data: URI 与相对地址一律拒收。
function attrVal(tag, name) {
  const m = String(tag || '').match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'))
    || String(tag || '').match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : '';
}
function pickImg(tag) {
  if (!tag) return '';
  const s = String(tag);
  const fromSet = attrVal(s, 'data-srcset') || attrVal(s, 'srcset');
  if (fromSet) {
    const u = fromSet.split(/[\s,]+/).filter(Boolean)[0] || '';
    if (/^https?:\/\//i.test(u)) return u;
  }
  for (const n of ['data-src', 'data-original']) {
    const u = attrVal(s, n);
    if (/^https?:\/\//i.test(u)) return u;
  }
  const src = attrVal(s, 'src');
  if (/^https?:\/\//i.test(src)) return src;
  return '';
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

// 列表解析: <a href="/movie/<id>/<slug>"> 卡片 (每卡图、标题两个锚点, 按 id 去重)
function parseList(html) {
  const out = [];
  const byId = new Map();
  if (!html) return out;
  const re = /<a[^>]*href="(\/movie\/([A-Za-z0-9]+)\/([^"]*))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    const mid = m[2];
    const slug = m[3];
    const body = m[4] || '';
    if (!mid || !slug) continue;
    // 只收卡片锚点: 含 img 或标题文本 (排除导航/相关区空锚);
    // 封面走 pickImg() (data-srcset 优先, 占位 data-URI 拒收)
    const imTag = body.match(/<img[^>]*>/i);
    const pic = pickImg(imTag ? imTag[0] : '');
    const text = cleanText(body);
    if (!imTag && !text) continue;
    let item = byId.get(mid);
    if (!item) {
      item = { vod_id: HOST + path, vod_name: '', vod_pic: '', vod_remarks: '' };
      byId.set(mid, item);
      out.push(item);
    }
    if (pic && !item.vod_pic) item.vod_pic = pic;
    if (text && (!item.vod_name || text.length > item.vod_name.length)) item.vod_name = text;
  }
  for (const item of out) {
    if (!item.vod_name) continue;
    const cm = item.vod_name.match(/^([A-Za-z]{2,10}-\d{2,8})/);
    if (cm) item.vod_remarks = cm[1].toUpperCase();
  }
  return out.filter((x) => x.vod_name);
}

function parsePagecount(html) {
  if (!html) return 1;
  const nums = [...html.matchAll(/[?&]page=(\d+)/g)].map((x) => parseInt(x[1], 10)).filter((n) => n > 0 && n < 100000);
  return nums.length ? Math.max(...nums) : 1;
}

async function home() {
  // 站方现慢 (题材页 21.5s、首页曾 522), 单次 25s 不重试
  const html = await getHtml(HOST + '/', null, 25000);
  return { class: CLASSES, filters: FILTERS, list: parseList(html).slice(0, 30) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = t(body.tid || body.id) || 'latest';
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  // R2: 两张卡分 key (genre/maker); 旧 'sub' 仅作兼容 (旧版 App 已存筛选态)
  const sub = t(extend.genre || extend.maker || extend.sub || '');
  let url;
  let single = false;
  if (sub && (sub.startsWith('genres/') || sub.startsWith('maker/'))) {
    url = HOST + '/' + sub;
    if (page > 1) url += '?page=' + page;
  } else if (GENRE_TOP[tid]) {
    // 顶级题材: 直接走题材页, 翻页 ?page=N (p1/p2 各 12 条、0 重叠已验)
    url = HOST + '/' + GENRE_TOP[tid];
    if (page > 1) url += '?page=' + page;
  } else if (tid === 'release') {
    url = HOST + '/release';
    single = true;
  } else if (tid === 'upcoming') {
    url = HOST + '/upcoming';
    single = true;
  } else {
    url = page <= 1 ? HOST + '/' : HOST + '/?page=' + page;
  }
  if (single && page > 1) return { page, pagecount: 1, limit: 20, total: 20, list: [] };
  const html = await getHtml(url, null, 25000);
  const list = parseList(html);
  const pc = single ? 1 : Math.max(parsePagecount(html), page);
  return {
    page,
    pagecount: single ? 1 : pc,
    limit: list.length || 24,
    total: list.length,
    list,
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/search?q=' + encodeURIComponent(wd);
  if (page > 1) url += '&page=' + page;
  const html = await getHtml(url, null, 25000);
  const list = parseList(html);
  const pc = Math.max(parsePagecount(html), page);
  return {
    page,
    pagecount: pc,
    limit: list.length || 12,
    total: list.length,
    list,
  };
}

function movieOf(durl) {
  const m = String(durl || '').match(/\/movie\/([A-Za-z0-9]+)\/([^/?#]+)/i);
  return m ? { id: m[1], slug: m[2] } : { id: '', slug: '' };
}

// 详情页格式区: <h3 class="video-format-header">FullHD</h3> + 其后 part 按钮
// (href="#" 为当前 part, 否则 ?type=<TYPE>&p=<N>); 每组每 part 出一线。
// token: 详情页 <video data-id> 只属于当前 part —— 页内唯一带
// video-source-active 类的按钮就是它, 只有那一行嵌 token (其他 part
// 各有自己的 token, 嵌错会播错片); 无按钮时默认单 part 也嵌 token。
function parseFormats(html, mv, token) {
  const lines = [];
  if (!html) return lines;
  const tok = token ? ':' + token : '';
  const heads = [...html.matchAll(/video-format-header[^>]*>\s*([^<]+?)\s*<\/h3>/g)];
  for (let i = 0; i < heads.length; i++) {
    const fmt = t(heads[i][1]);
    if (!fmt) continue;
    const type = fmt.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const segStart = heads[i].index + heads[i][0].length;
    const segEnd = (i + 1 < heads.length) ? heads[i + 1].index : Math.min(html.length, segStart + 4000);
    const seg = html.slice(segStart, segEnd);
    // 组内规范 type 取自兄弟链接的 ?type= (站方实值, 如 FULLHD_UPDATED);
    // '#' 按钮 (当前 part) 无 href 参数时用它, 不再用标题剥出来的臆测值
    // (旧版 "FullHD (Fixed)" 剥出 FULLHDFIXED, 站方从未用过该值; 实测站方
    // 忽略未知 type 回默认 part, 与 FULLHD_UPDATED 回同一 mp4, 但仍以实值为准)。
    const typeInSeg = seg.match(/[?&]type=([A-Za-z0-9_-]+)/i);
    const canonType = typeInSeg ? typeInSeg[1].toUpperCase() : type;
    const bre = /<a[^>]*video-source-btn[^>]*>([^<]*)<\/a>/g;
    let bm;
    let hasBtn = false;
    while ((bm = bre.exec(seg)) !== null) {
      hasBtn = true;
      const tag = bm[0] || '';
      const href = attrVal(tag, 'href');
      const part = t(bm[1]) || '1';
      const isActive = /video-source-active/.test(tag);
      let ptype = canonType;
      let pnum = part;
      const qm = href.match(/[?&]type=([^&]+)&p=(\d+)/i);
      if (qm) { ptype = qm[1].toUpperCase(); pnum = qm[2]; }
      lines.push(fmt + '·P' + pnum + '$move:' + mv.id + ':' + mv.slug + ':' + ptype + ':' + pnum + (isActive ? tok : ''));
    }
    if (!hasBtn) lines.push(fmt + '·P1$move:' + mv.id + ':' + mv.slug + ':' + canonType + ':1' + tok);
  }
  return lines;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let durl = t(raw);
  if (!durl) return { list: [] };
  if (!/^https?:\/\//i.test(durl)) durl = HOST + durl;
  const mv = movieOf(durl);
  const html = await getHtml(durl, null, 25000);
  if (!html) return { list: [] };

  let name = '';
  const tm = html.match(/<title>([^<]*)<\/title>/i);
  if (tm) name = cleanText(tm[1]).replace(/\s*\|\s*JAVMove\s*$/i, '').trim();
  // 海报: 首个 data-srcset (详情页 13 个 data-srcset 里第 1 个即海报,
  // 其余 12 个是相关卡); 退路为首张截图 (splide, 真 src)。
  let pic = '';
  const pm = html.match(/data-srcset\s*=\s*"([^"]+)"/i);
  if (pm) {
    const u = pm[1].split(/[\s,]+/).filter(Boolean)[0] || '';
    if (/^https?:\/\//i.test(u)) pic = u;
  }
  if (!pic) {
    const sm = html.match(/<li class="splide__slide">[\s\S]{0,600}?<img[^>]*>/i);
    if (sm) pic = pickImg(sm[0]);
  }
  // 当前 part 的 data-id (页内唯一, 归属 active 按钮的 part)
  const dm0 = html.match(/data-id="([^"]+)"/);
  const token = dm0 ? dm0[1] : '';

  let lines = parseFormats(html, mv, token);
  if (!lines.length) lines = ['正片$move:' + mv.id + ':' + mv.slug + '::1' + (token ? ':' + token : '')];

  const vod = {
    vod_id: durl,
    vod_name: name || mv.slug,
    vod_pic: pic,
    vod_play_from: NAME,
    vod_play_url: lines.join('#'),
  };
  if (name) subRegister(durl, vod);
  return { list: [vod] };
}

// /watch 直取 (必须带 Referer, 任意值都行; 不带则 200 但正文仅 "re")。
// 成功回 http(s) 直链, 否则回 ''。
async function watchByToken(token, referer) {
  try {
    const txt = await getHtml(HOST + '/watch?token=' + encodeURIComponent(token), { 'Referer': referer }, 10000);
    const url = t(txt);
    return /^https?:\/\//i.test(url) ? url : '';
  } catch (e) {
    return '';
  }
}

// Worker 整链代取: /resolve 在 Worker 内做 part 页 -> data-id -> /watch,
// 回 {ok, url} JSON (10 分钟缓存)。未部署/失败/超时回 '', 不阻塞直连回落。
async function watchByWorker(mid, slug, type, part) {
  if (!JAVMOVE_WORKER) return '';
  try {
    const u = JAVMOVE_WORKER + '/resolve?mid=' + encodeURIComponent(mid)
      + '&slug=' + encodeURIComponent(slug)
      + '&type=' + encodeURIComponent(type || '')
      + '&p=' + encodeURIComponent(part || '1');
    const r = await req.get(u, { timeout: 8000, responseType: 'text', transformResponse: [(d) => d] });
    const j = JSON.parse(typeof r.data === 'string' ? r.data : '');
    if (j && j.ok && /^https?:\/\//i.test(j.url || '')) return j.url;
    return '';
  } catch (e) {
    return '';
  }
}

// play 收尾: 只挂 detail() 预热已入缓存的字幕命中 (R2: 不再现搜、不再等
// 6s、不再并发冲站方; 无缓存命中即无字幕返回, 播放优先)。
function playFinish(url, durl) {
  const res = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  try {
    const hit = subResultCache.get(durl);
    if (hit && Date.now() - hit.ts < SUB_TTL && hit.subs && hit.subs.length) res.subs = hit.subs;
  } catch (e) { /* 缓存读取失败不影响播放 */ }
  return res;
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  // 播放 id: move:<mid>:<slug>:<type>:<part>[:<token>]
  // token 仅在 detail() 时当前 (active) part 的那一行里有。
  // 注意 token 字符集不止 [A-Za-z0-9_-] (实测有 "~VWGLFyn"、"~4O6kjvJ"),
  // 不用正则收尾、用 split 取第 6 段及之后全部 (token 内即使含 ':' 也不炸)。
  const parts = id.split(':');
  if (parts.length < 5 || parts[0] !== 'move') return { parse: 0, url: '' };
  const mid = parts[1] || '';
  const slug = parts[2] || '';
  const type = parts[3] || '';
  const part = parts[4] || '';
  const token = parts.length > 5 ? parts.slice(5).join(':') : '';
  if (!mid || !slug || !/^\d+$/.test(part)) return { parse: 0, url: '' };
  const durl = HOST + '/movie/' + mid + '/' + slug;
  const partUrl = type ? durl + '?type=' + type + '&p=' + part : durl;
  // (1) 快径: detail 时嵌的 token, 单次 /watch 直取直链 (~3s)。
  //     token 每次加载轮换、但同一 token 至少数分钟有效; 失效即回落。
  if (token) {
    const u = await watchByToken(token, durl);
    if (u) return playFinish(u, durl);
  }
  // (2) Worker 整链代取 (已部署时)。
  const wu = await watchByWorker(mid, slug, type, part);
  if (wu) return playFinish(wu, durl);
  // (3) 直连: 按 part 地址现取 data-id (各 part token 不同), 再调 /watch。
  const html = await getHtml(partUrl, null, 15000);
  if (!html) return { parse: 0, url: '' };
  const dm = html.match(/data-id="([^"]+)"/);
  if (!dm) return { parse: 0, url: '' };
  const url = await watchByToken(dm[1], partUrl);
  if (!url) return { parse: 0, url: '' };
  return playFinish(url, durl);
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
    // v7: 预热键必须与 playFinish() 的缓存查找键一致（裸详情 URL）。
    // 旧版用 eps[0]（形如 F4$<durl>@F4），play 侧先剥 $ 前缀与 @hint
    // 再查，键永远对不上 → 预热白做。vod_id 即 play 侧的裸 durl。
    const warmKey = vod.vod_id ? String(vod.vod_id) : (eps[0] || '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}

// (play 侧字幕挂载已改为 playFinish() 的缓存只读, 不再现搜。)

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