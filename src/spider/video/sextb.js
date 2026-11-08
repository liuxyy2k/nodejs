import req from '../../util/req.js';

// SexTB (py_sextb)
// 站点: https://sextb.cc / https://sextb.net (JAV 在线站)
// 重要: .net 在部分国家被封锁，站点官方指定备用域名 sextb.cc（首页横幅原话
//       "Some countries have blocked our website, please use a backup domain name: SEXTB.CC")。
//       spider 做双域名 failover: .cc 优先、.net 回退，再失败走 jina reader 兜底。
//       两站结构完全一致。另有 Cloudflare WAF 拦机房 IP（25 字节 "Your request was blocked"）。
// 列表: / (最新) / /genre/{slug}/[/pg-N/]  tray-item 卡片
// 卡片: div.tray-item > a[href="/{code}"] > img.tray-item-thumbnail (封面取 data-src，src 是 default-cover 占位图)
// 详情: GET /{code}  filmId + 服务器列表 (button.btn-player.episode[data-source][data-id]，如 F4/SW/PM/DD/FL/US)
// 播放 (v4): 逐个 embed 宿主在蜘蛛侧解析直链 (parse:0)，嗅探只做最后兜底。
//       三轮全嗅探真机仍全灭（本站 embed 页在 MiraPlayer 嗅探里起不了播）。
//       线路按宿主分流（优先级 SW > PM > F4 > FL > DD > US > ST > PP）:
//         SW (hglink.to, StreamHG 系): 同代码在 trailerhg.xyz 有 XFS 明文页,
//           纯字符串解包取 links: hls3（无 token 的 master.txt）优先、
//           hls2（带 asn= 网络绑定 token）其次；填了 SEXTB_WORKER 则整链
//           走 Worker /v（铸 token 与拉流同出口）。
//         PM (playmate 系): POST /api/s {c,d:'web'} → sx 直链（无头要求，
//           JavGG 线已真机验证同协议可播）；vidara 系 POST /api/stream。
//         F4 (f4scdn/f4jav): 列表与分片强制 Origin: https://f4scdn.com，
//           播放器不透传 header，端内直链无解 —— 只能走 SEXTB_WORKER 的
//           /f4 全链代理（Worker 内 api/play 取 src + 注入 Origin 改写）。
//           未部署 Worker 时 F4 线路跳过（试其他线路，全灭再嗅探兜底）。
//         FL/DD/其他 XFS 系: 通用解包提取 m3u8/mp4 + 探活通过才返回。
//       每条线路解析都带探活（列表须 #EXTM3U、mp4 须 200/206），
//       探活不过当没解出，继续下一条，避免返回死链堵住后面的机会。
// 播放 (v5, 2026-10-20 晚): v4 真机仍全灭后重排 play 顺序与探活策略。
//       复查证据: 已部署 Worker 的 /f4、/v 全链从 VM 逐跳实测均通（F4
//       3 样本、SW 2 样本直到分片 0x47），所以问题不在链路本身，而在
//       v4 play 的真机执行结构: (1) 默认线路不是最先试，占 70% 的默认
//       F4 排在 SW/PM 两条借线（各含 ajax+探活）之后；(2) Worker 路径
//       被蜘蛛侧探活门控，一次往返抖动/超时即误杀已验通的线路（JavGG
//       的已验证形态是从不探活、直返 Worker 地址，且同机同账号真机
//       可播）；(3) SW 有逐视频死链——只有 hls3/hls2 的视频其 CDN 拦
//       CF 出口（实测 sgkx-010 的 /v 回 502: hls3/hls2 均 403），v4
//       对此无后备。v5: 默认线最先（F4→/f4 直返不探活；SW→/v 快速
//       探活 4s、失败去借 F4）；借线最多 2 条、F4 直返不探活；借来的
//       SW 在 Worker 不通时留蜘蛛内 hls3 直链作最后手段（手机住宅
//       出口可能过 hls3 的 ASN 门禁，不探活、交播放器试）；详情页无
//       播放器标记时换镜像再抓一次（防 DDoS 拦截页毒死整条链）。
// 播放 (v7, 2026-11-07): 上轮（蜘蛛 v6 + Worker v2）已部署仍全线转圈后
//       复查坐实的两处真机执行缺陷（链路本身已逐跳验通，见下）：
//       (1) 字幕预热键与点播键对不上：detail 预热用 eps[0]（形如
//       F4$<durl>@F4），play 侧先剥 $ 前缀与 @hint 再查，键永远
//       对不上 → 预热白做，每次点播都重跑最多 6s 的字幕搜索；
//       play() 在 App 超时内回不来，表现为一直转圈。v7 改用裸
//       详情 URL（vod_id）预热，与 play 侧键一致，共用同一趟。
//       (2) 探活全是 fetch-only：timedFetchBytes 只走原生 fetch，
//       而 App 蜘蛛运行时里全局 fetch 不存在（2026-10-22 JAVSB
//       诊断卡实证：fetch 通道在设备上 0-4ms 秒死）→ SW /v 探活、
//       通用 m3u8/mp4 探活在真机上永远失败，SW 线永不直返 /v、
//       FL/DD 等通用线永不返回直链，最终只剩 hls3 直链/嗅探兜底。
//       v7 探活改走框架 req，fetch 仅作有 fetch 环境的第二通道。
//       F4 默认线仍直返 Worker /f4、不探活；Worker v2 本体零改动。
// 播放 (v8, 2026-11-08): 站方改版导致 v7 全线仍转圈（实测坐实，见 REPORT）：
//       (1) 详情页 #sextb-player 里不再有 iframe（播放器改由 JS 经
//       POST /ajax/player 注入），extractDefaultEmbed 恒为空；(2) ajax
//       须带 pt（详情页 window.__pt，32 hex）+ 与该页同会话的
//       PHPSESSID Cookie，回包 {player_enc, next_pt, next_pk}，player
//       明文须用 __pk 做 XOR 解密；无 pt → E_TOK_LEN，无/错 Cookie →
//       E_SID，旧 pt 重用 → E_TOK_MISS；每次成功轮换 next_pt/next_pk。
//       v7 的 ajax 不带 pt，借线全灭、默认线为空 → play 恒回空地址。
//       v8：详情页同源抓取令牌+Cookie（一次 GET 的响应即令牌会话，
//       另起 GET 取 Cookie 会拿到另一会话、必 E_SID——实测坐实），
//       默认线走 ajax episode=0（站方 player_default 同款），借线
//       共用令牌链，失效时重取详情页换新令牌重试一次。Worker v2 与
//       播放地址形态（parse:0 + Worker 直返）一字未动——Worker 腿
//       已用新解密出的 embed 实测全链通（/f4→/p 1879 片→首分片纯 TS）。
//       另评估过的换思路方案：本地字节代理（24JAV/蘑菇 v2）解不了
//       令牌墙（仍须先拿到 embed）、Worker 侧全解（javcc/chaturbate
//       形态）须用户先部署 v3 且 CF 出口过站方 WAF 未验证、site-fetch
//       腿白名单无 sextb 且同样解不了令牌墙——均不及 v8 直接。
// 播放 (v9, 2026-11-08): v8 VM 全绿、真机仍全线转圈；用户两项鉴别已
//       排除 Worker 腿与站方在手机上的可达性（Safari 直开 Worker /f4
//       可播、.cc/.net 详情页都打得开），断点只剩蜘蛛侧。实测坐实：
//       令牌一次一用——任何一次 ajax（无 Cookie/错 Cookie/正确）都会
//       烧掉该 pt（无 Cookie 发一次再补正确 Cookie 即 E_TOK_MISS）。
//       故 v9 收紧会话配对：(1) 响应无 set-cookie 时清空旧会话，不让
//       上一页的 Cookie 配新令牌；(2) 显式 Cookie 只发与令牌同一响应
//       的那一份，否则不显式带、让 App 的共享 Cookie jar（若有）自己
//       处理——显式发错会话 Cookie 会覆盖 jar 的正确值并烧令牌；
//       (3) refreshTok 只认刷新响应的新会话，无新会话则删掉旧 Cookie
//       头，不拿旧 Cookie 撞新 pt；(4) play 取详情页改 getHtmlPlay：
//       每域名 10s、不走 jina（jina 页无 __pt/__pk、无播放器标记，
//       实测 35,966B 页内 __pt 0 次），直连双域名都失败即早回空。
//       Worker 侧全解（v4）另见 sextb-hls-worker-v4.js，未部署。
// 播放 (v10, 2026-11-08): v9 VM 全绿、真机仍转圈后坐实：App 既不回吐
//       响应头 set-cookie、也不给蜘蛛共享 Cookie jar，蜘蛛侧令牌流在
//       手机上无解（无 Cookie 的 ajax 恒 E_SID、且每次尝试都烧掉 pt）。
//       v4 已部署、/diag 回 ajax:"ok"（CF 出口 POST 腿通）、/resolve
//       真链已逐跳验通。v10 把令牌流整个搬到 Worker 侧：play() 只调
//       /resolve（传详情页地址 + 线路 ep），拿回 Worker 给的地址直接
//       出线；蜘蛛侧 pt/pk/XOR/ajax/Cookie、逐宿主直解、探活全部删除。
//       F4/SW 回 Worker 播放地址（parse:0）；其他宿主回原 embed +
//       sniff:true（parse:1 交播放器嗅探）。分类/列表/搜索/字幕芯未动。
// 实测根因 (2026-10-20 VM 验证): f4 CDN 的 playlist、子列表、每个分片
//       请求都必须带 Origin: https://f4scdn.com 才能 200（UA-only 403、
//       Referer 403）。其官方 api/play?ab=0 能拿签名 src，但 src 的列表与
//       分片同样查 Origin —— 这就是 v1/v2/v3 三轮真机全灭的最后一关。
// 修复史: v1 本地代理透传分片（App 本地桥传二进制失败）、v2 只代理列表
//       靠 play header 补 Origin（播放器不透传）、v3 全线嗅探（本站
//       embed 页嗅探起不了播），三轮真机均无法播放。v4 改逐宿主解析。
const KEY = 'py_sextb';
const NAME = '🌸SexTB';
const HOSTS = ['https://sextb.cc', 'https://sextb.net'];
const SITE = HOSTS[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

// SexTB 专用 HLS 代理 Worker 地址（sextb-hls-worker.js，用户手动部署到
// 自己的 Cloudflare 后填这里，如 https://sextb-hls.xxx.workers.dev）。
// 留空 = 未部署: F4 线路无法解析（站方 Origin 墙）、SW 走蜘蛛内解析。
const SEXTB_WORKER = 'https://sextb-hls.li768435813.workers.dev';

// 核心分类 + 精选题材 (2026-10-20 从 /genres 页实测存在，两域名通用)
const CATS = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'censored', type_name: '有码', slug: 'censored' },
  { type_id: 'uncensored', type_name: '无码', slug: 'uncensored-dc02d84q' },
  { type_id: 'amateur', type_name: '素人', slug: 'amateur-9yvovjqr' },
  { type_id: 'subtitle', type_name: '中文字幕', slug: 'subtitle' },
  { type_id: 'uncensored-leaked', type_name: '无码流出', slug: 'uncensored-leaked-8iodxgmu' },
  { type_id: 'reducing-mosaic', type_name: '减码', slug: 'reducing-mosaic-o16ol1qy' },
  { type_id: 'english-subtitle', type_name: '英字幕', slug: 'english-subtitle-8rpwhwew' },
  { type_id: 'digital-mosaic', type_name: '数码有码', slug: 'digital-mosaic-merf7vyh' },
  { type_id: 'minimal-mosaic', type_name: '低马赛克', slug: 'minimal-mosaic-csskw5dg' },
  { type_id: 'big-tits', type_name: '巨乳', slug: 'big-tits-hipx7w77' },
  { type_id: 'creampie', type_name: '中出', slug: 'creampie-dkel1ugw' },
  { type_id: 'blowjob', type_name: '口交', slug: 'blowjob-6w43evzo' },
  { type_id: 'school-girl', type_name: '学生', slug: 'school-girl-aze0q30d' },
  { type_id: 'milf', type_name: '熟女', slug: 'milf-k01m582n' },
  { type_id: 'mature-woman', type_name: '成熟女性', slug: 'mature-woman-pj7rh291' },
  { type_id: 'lesbian', type_name: '蕾丝', slug: 'lesbian-9akyznh5' },
  { type_id: 'nurse', type_name: '护士', slug: 'nurse-kor7sr6n' },
  { type_id: 'office-lady', type_name: 'OL', slug: 'office-lady-pjv31x9c' },
  { type_id: 'threesome', type_name: '3P4P', slug: 'threesome--foursome-3r7836if' },
  { type_id: 'cosplay', type_name: 'Cosplay', slug: 'cosplay-d5rzeneh' },
  { type_id: 'voyeur', type_name: '偷拍', slug: 'voyeur-9thq5fr5' },
  { type_id: 'massage', type_name: '按摩', slug: 'massage-0ypm730h' },
  { type_id: 'bondage', type_name: '捆绑', slug: 'bondage-wywuaggb' },
  { type_id: 'squirting', type_name: '潮吹', slug: 'squirting-1t5r5wb9' },
  { type_id: 'maid', type_name: '女仆', slug: 'maid-vkrzm0oo' },
  { type_id: 'teen', type_name: '少女', slug: 'teen-gk3kz0pk' },
  { type_id: 'fc2', type_name: 'FC2', slug: 'fc2' },
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

function clean(s) {
  return t(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

function fixUrl(u) {
  u = t(u);
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return SITE + u;
  if (/^https?:\/\//.test(u)) return u;
  return SITE + '/' + u;
}

// 判断返回内容是否为拦截/验证页 (Cloudflare WAF 拦截、托管挑战等)
// 注意: 正常页面 head 里也含 challenges.cloudflare.com 的 CF 注入脚本，不能用它判定，
// 只认拦截页特有的文案与标题
function isBlockedPage(html) {
  if (!html || typeof html !== 'string') return true;
  if (html.length < 500) return true;
  const head = html.slice(0, 3000);
  if (/Your request was blocked/i.test(head)) return true;
  if (/<title>[^<]*(Just a moment|Attention Required)/i.test(head)) return true;
  if (/Performing security verification/i.test(head)) return true;
  if (/Sorry, you have been blocked/i.test(head)) return true;
  return false;
}

// 把任意本站 URL 拆成 path，候选域名按 [原域名, .cc, .net] 排序
function hostOrder(url) {
  const order = [];
  const m = t(url).match(/^https?:\/\/([^/]+)/i);
  if (m) {
    const h = 'https://' + m[1].toLowerCase();
    if (HOSTS.includes(h)) order.push(h);
  }
  for (const h of HOSTS) if (!order.includes(h)) order.push(h);
  return order;
}

function pathOf(url) {
  const u = t(url);
  const m = u.match(/^https?:\/\/[^/]+(\/.*)$/i);
  if (m) return m[1];
  return u.startsWith('/') ? u : '/' + u;
}

// 带超时的原生 fetch 取文本
async function timedFetchText(url, headers, timeoutMs) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs || 25000);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch (e) {
    return '';
  } finally {
    clearTimeout(to);
  }
}

// 单次取页面 (req 通道 + fetch 通道)，命中拦截页视为失败
async function rawGet(url, headers, timeoutMs) {
  const to = timeoutMs || 25000;
  // 通道1: 框架 req
  try {
    const { data, status } = await req.get(url, { headers, timeout: to });
    if (status === 200 && typeof data === 'string' && !isBlockedPage(data)) {
      return data;
    }
  } catch (e) { /* 换通道2 */ }
  // 通道2: 原生 fetch
  const txt = await timedFetchText(url, headers, to);
  if (txt && !isBlockedPage(txt)) return txt;
  return '';
}

function pageHeaders(referer, extraHeaders) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document',
    'Referer': referer || REFERER,
    ...(extraHeaders || {}),
  };
}

// 兜底通道: jina reader 取原始 HTML (直连全失败时使用)
async function fetchViaJina(host, path) {
  const jinaUrl = 'https://r.jina.ai/' + host + path;
  const headers = {
    'User-Agent': UA,
    'x-respond-with': 'html',
  };
  try {
    const { data, status } = await req.get(jinaUrl, { headers, timeout: 40000 });
    if (status === 200 && typeof data === 'string' && !isBlockedPage(data)) {
      if (data.includes('tray-item') || data.length > 5000) return data;
    }
  } catch (e) { /* 换 fetch */ }
  const txt = await timedFetchText(jinaUrl, headers, 40000);
  if (txt && !isBlockedPage(txt) && txt.length > 5000) return txt;
  return '';
}

// 多域名 failover 取页面: 逐个域名直连，全失败再逐个域名走 jina 兜底
// 注意: 非本站 URL (如 f4scdn embed 页) 不做域名替换，直接原 URL 请求
async function getHtml(url, extraHeaders) {
  const m = t(url).match(/^https?:\/\/([^/]+)/i);
  const host = m ? m[1].toLowerCase() : '';
  if (!/sextb\.(net|cc)$/.test(host)) {
    return rawGet(url, pageHeaders(m ? 'https://' + host + '/' : REFERER, extraHeaders));
  }
  const path = pathOf(url);
  const hosts = hostOrder(url);
  for (const h of hosts) {
    const html = await rawGet(h + path, pageHeaders(h + '/', extraHeaders));
    if (html) return html;
  }
  for (const h of hosts) {
    const html = await fetchViaJina(h, path);
    if (html) return html;
  }
  return '';
}

// 解析视频卡片: div.tray-item > a[href="/{code}"] > img.tray-item-thumbnail
// 注意: 1) 站点懒加载，真实封面在 data-src，src 是 default-cover.jpg 占位图；
//       2) 卡片 class 带修饰时 (如 "tray-item tray-item-uncensored") 也要匹配，
//          但 tray-item-trailer 预告片块与 tray-item-* 子元素要排除；
//       3) href 域名兼容 .net/.cc。
function parseCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<div class="tray-item(?:\s[^"]*)?">\s*<a\s[^>]*href="(?:https?:\/\/sextb\.(?:net|cc))?(\/[a-z0-9][a-z0-9\-]{3,40})"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const win = html.slice(m.index, m.index + 2500);
    // 标题: img alt 属性
    let title = '';
    const altM = win.match(/<img[^>]+alt="([^"]+)"/);
    if (altM) title = clean(altM[1]);
    // 封面: 优先 data-src (懒加载真实地址)
    let pic = '';
    const dsM = win.match(/data-src="(https?:\/\/[^"]+)"/) || win.match(/data-src="(\/\/[^"]+)"/);
    if (dsM && !dsM[1].includes('default-cover')) pic = fixUrl(dsM[1]);
    if (!pic) {
      const srcM = win.match(/<img[^>]+src="(https?:\/\/[^"]+)"/) || win.match(/<img[^>]+src="(\/\/[^"]+)"/);
      if (srcM && !srcM[1].includes('default-cover')) pic = fixUrl(srcM[1]);
    }
    // 番号: div.tray-item-code
    let code = '';
    const cdM = win.match(/tray-item-code">([^<]+)</);
    if (cdM) code = clean(cdM[1]);
    out.push({
      vod_id: fixUrl(path),
      vod_name: title || code || path.replace(/^\//, ''),
      vod_pic: pic,
      vod_remarks: code,
    });
  }
  return out;
}

function parsePagecount(html) {
  const nums = [...html.matchAll(/\/pg-(\d+)/g)].map(x => parseInt(x[1], 10)).filter(n => n > 0 && n < 100000);
  return nums.length ? Math.max(...nums) : 1;
}

function catOf(tid) {
  return CATS.find(c => c.type_id === tid) || CATS[0];
}

function catUrl(cat, page) {
  if (cat.type_id === 'latest') {
    return page > 1 ? `${SITE}/pg-${page}` : SITE + '/';
  }
  const slug = cat.slug || cat.type_id;
  if (/^https?:\/\//.test(slug)) return slug;
  const base = slug.includes('/') ? `${SITE}/${slug}` : `${SITE}/genre/${slug}`;
  return page > 1 ? `${base}/pg-${page}` : base;
}

function buildList(url, page, limit) {
  limit = limit || 30;
  return getHtml(url).then(html => {
    if (!html) return { page, pagecount: page, limit, total: 0, list: [] };
    const list = parseCards(html);
    const pc = parsePagecount(html);
    return { page, pagecount: Math.max(pc, page), limit, total: list.length, list };
  });
}

async function init(reqIn) {
  return {};
}

async function home(reqIn) {
  const cls = CATS.map(c => ({ type_id: c.type_id, type_name: c.type_name }));
  const html = await getHtml(SITE + '/');
  const list = html ? parseCards(html).slice(0, 30) : [];
  return { class: cls, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = t(body.tid || body.id) || 'latest';
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const cat = catOf(tid);
  return buildList(catUrl(cat, page), page, 30);
}

// 从详情页提取 filmId 和服务器 (episode) 列表
function extractPlayerInfo(html) {
  let filmId = '';
  const fm = html.match(/filmId\s*=\s*["']?(\d+)/);
  if (fm) filmId = fm[1];
  const episodes = [];
  const re = /<button[^>]*class="[^"]*btn-player episode[^"]*"[^>]*data-source="(\d+)"[^>]*data-id="(\d+)"[^>]*>(?:<i[^>]*><\/i>)?\s*([A-Z0-9]+)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    episodes.push({ filmId: m[1], episode: m[2], name: m[3] });
  }
  return { filmId, episodes };
}

// 线路多集：详情页按钮已含 F4/SW/DD/FL/US 等线路名，按优先级出集
// （F4 > SW > PM > FL > DD > US > ST > PP，其余最后）；无按钮时回落正片。
// 集 id 形如 F4$<durl>@F4，play 剥离 @ 后缀作优先线路提示。
function lineEpisodes(html, durl) {
  const { episodes } = extractPlayerInfo(html);
  const ORDER = { F4: 0, SW: 1, PM: 2, FL: 3, DD: 4, US: 5, ST: 6, PP: 7 };
  const seen = new Set();
  const names = [];
  for (const ep of episodes) {
    const nm = t(ep.name).toUpperCase();
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    names.push(nm);
  }
  names.sort((a, b) => (ORDER[a] ?? 90) - (ORDER[b] ?? 90));
  if (!names.length) return `正片$${durl}`;
  return names.map(nm => `${nm}$${durl}@${nm}`).join('#');
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { list: [] };
  const durl = /^https?:\/\//.test(id) ? id : fixUrl(id);

  const html = await getHtml(durl);
  if (!html) return { list: [] };

  // 标题
  let name = '';
  const tm = html.match(/<title>([^<]*)<\/title>/);
  if (tm) name = clean(tm[1]).replace(/\s*-\s*SEXTB.*$/i, '').replace(/Free JAV.*$/i, '').trim();
  // 封面: 优先页面内的 webp poster (cdn001.imggle.net 公开 CDN，直读 200)，
  // 其次 video 标签 poster，再 og:image
  let pic = '';
  const wm = html.match(/data-src="(https?:\/\/cdn001\.imggle\.net\/webp\/poster[^"]+)"/);
  if (wm) pic = wm[1];
  if (!pic) {
    const vm = html.match(/<video[^>]+poster="(https?:\/\/[^"]+)"/);
    if (vm) pic = vm[1];
  }
  if (!pic) {
    const ogm = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (ogm) pic = ogm[1];
  }

  const vod = {
    vod_id: durl,
    vod_name: name || durl,
    vod_pic: fixUrl(pic),
    vod_remarks: '',
    vod_content: name,
    vod_play_from: 'SexTB',
    vod_play_url: lineEpisodes(html, durl),
  };
  subRegister(id, vod);
  return { list: [vod] };
}

// v10: play 只调 Worker /resolve（令牌流整个搬到 Worker 侧）。
// req 通道优先（App 蜘蛛运行时无全局 fetch），fetch 仅作第二通道。
// /resolve 回包：{ok:true, url, host:'f4'|'sw'|'other', line, sniff?}
//   F4/SW → Worker 播放地址；其他宿主 → 原 embed + sniff:true。
// 失败回包：{ok:false, error:'BAD_U'|'FETCH_FAIL'|'NO_PT'|'NO_LINE'|'NO_EMBED'|...}。
async function resolveViaWorker(durl, ep) {
  const u = SEXTB_WORKER + '/resolve?u=' + encodeURIComponent(durl) + '&ep=' + encodeURIComponent(ep || '0');
  const headers = { 'User-Agent': UA, 'Accept': 'application/json' };
  try {
    const { data, status } = await req.get(u, { headers, timeout: 10000 });
    if (status === 200 && data != null) {
      if (typeof data === 'string') {
        try { return JSON.parse(data); } catch (e) { return null; }
      }
      return data;
    }
  } catch (e) { /* 换 fetch 通道 */ }
  try {
    const txt = await timedFetchText(u, headers, 10000);
    if (txt) {
      try { return JSON.parse(txt); } catch (e) { return null; }
    }
  } catch (e) { /* fallthrough */ }
  return null;
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  // id 可能是 "正片$https://..." 形式，取 $ 后面的完整 URL
  if (id.includes('$')) id = id.split('$').pop().trim();
  // 线路多集的 @F4/@SW 后缀：先剥离作 /resolve 的 ep 参数，再算 durl
  let hint = '';
  const hm = id.match(/@([A-Za-z0-9]+)$/);
  if (hm) { hint = hm[1].toUpperCase(); id = id.slice(0, -hm[0].length); }
  const subsP = subSearchAll(subNormKey(id)).catch(() => []);
  if (/\.m3u8(\?|$)/i.test(id)) {
    return subAttach({ parse: 0, url: id, header: { 'User-Agent': UA } }, subsP);
  }
  const durl = /^https?:\/\//.test(id) ? id : fixUrl(id);
  const uaHead = { 'User-Agent': UA };

  // v10: 令牌流整个搬到 Worker 侧（/resolve）：蜘蛛只传详情页地址 +
  // 线路名，不再自己取详情页、不做 ajax、不碰 pt/pk/Cookie——App 不把
  // set-cookie 回吐给蜘蛛，蜘蛛侧令牌流在手机上无解（v8/v9 实测坐实）。
  // /resolve 在 Worker 侧完成：取详情页 → ajax → XOR 解密 → 按宿主出线。
  // F4/SW 回 Worker 播放地址（parse:0 直返）；其他宿主回原 embed +
  // sniff:true（parse:1 交播放器嗅探）。
  async function tryResolve(ep) {
    const r = await resolveViaWorker(durl, ep);
    if (!r || !r.ok || !r.url) return null;
    if (r.sniff) {
      return subAttach({ parse: 1, jx: 0, url: r.url, header: { 'User-Agent': UA, 'Referer': durl } }, subsP);
    }
    return subAttach({ parse: 0, url: r.url, header: uaHead }, subsP);
  }
  const ep0 = hint || '0';
  let out = await tryResolve(ep0);
  if (out) return out;
  // 指定线路解不出时回落默认线（ep=0）再试一次；已是默认线则不再重试
  // （同一调用必定同果；Worker 内部已在 E_TOK/E_SID 时重取重试过一次）。
  if (ep0 !== '0') {
    out = await tryResolve('0');
    if (out) return out;
  }
  return { parse: 0, url: '' };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 30, total: 0, list: [] };
  let url = SITE + '/search/' + encodeURIComponent(wd);
  if (page > 1) url += '/pg-' + page;
  return buildList(url, page, 30);
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
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}