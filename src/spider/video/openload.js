// OpenLoad (https://openload.mov) -> CatPawOpen spider
// WordPress 聚合站：汇总视频分享站（StreamHG / VidHide / Streamtape / DoodStream 等）的 embed。
// 分类：7 个 WP 分类（最新 / モザイク除去 / アダルトビデオ / 無修正 / 素人AV / 素人投稿 / VR）
//   + 急上昇 / 人気 两个榜单页（单页、无分页）。
// 列表：HTML 卡片 <a href=".../op-<id>/"><div class="post-list-image"><img src 封面 alt 标题>；
//   分页 /page/N/；标签筛选 /tag/<slug>/page/N/（站内前 40 热门标签，WP tags 接口按 count 取）。
// 搜索：/?s= 被站方 CF 拦（VM 与桌面 UA 均 403），改走 WP REST /wp-json/wp/v2/posts?search=；
//   REST 无封面字段，逐条取详情页 div.history 的 data-thumb 补（并行、失败留空）。
// 详情：packed JS（Dean Edwards）里是各集各线路的 iframe；自研纯 JS 解包器（无 eval，
//   8 个实采样本与 eval 输出逐字节一致）；集数/线路标签从 #episode / #server 读，embed 按定义顺序配对。
// 播放：详情时现解每条 embed（3 并发、单条 20s 上限），死线（404/删片）直接丢弃，只留能播的行；
//   StreamHG 系（iplayerhls / callistanise / minochinos / streamhide / likessb / sbstream）
//   取 links.hls2 签名 master（实测单档：iplayerhls 720p、callistanise 1080p；IP 绑定、同 IP 直取
//   master 200 / variant 200 / 分片 Range 206 首字节 0x47、无 KEY、Referer 非必需）；
//   streamtape 取 robotlink 拼 get_video（token 绑定 IP；VM 侧 get_video 常回站方 500，
//   偶尔 302 到 tapecontent 直链 MP4——play() 点播时跟 302 拿最终直链交给播放器）；
//   vsembed 走站内下载 API（/api/download/tiers 取真实档位，/api/download/get 302 到直链 MP4，
//   token 同样绑 IP，点播时现取现跟）；dood / javstream 等解不出直链的回 parse:1 走站内嵌页嗅探；
//   asianclub.tv（已停放）、vidoza.net（embed 404）、streamsb.net（embed 跳广告停放页）
//   三个死线路在详情直接滤掉。
// 2026-11-15 v2（SIM-082 三线同死坐实）：VS/EV 的 hls2 签名 master 与 ST 的 get_video
//   token 都绑 IP，详情时铸好的直链到点播时再交播放器——中间隔的时间 + 出口 IP 可能
//   已变，地址就死了。修法（JavTubs 同款）：detail() 只把 embed 写进 play id（直链仅
//   作兜底附带），play() 点播时对点的那条线重新现解（单线 20s 上限），拿新鲜直链
//   parse:0 交播放器；现解失败回详情时旧地址让播放器再试一次，旧地址也没有回
//   parse:1 站内嗅探。
// 2026-11-15 v3（SIM-082 真机：EV 能播，ST/VS 仍失败）：ST 在 play() 点播时现解 get_video 后
//   跟 302 拿 tapecontent 直链 MP4（播放器不再碰站方常 500 的 get_video）；VS 原是 JS SPA 空壳解不出，
//   现走站内下载 API——详情时 /api/download/tiers 取真实档位（1080p/720p/540p）出三集，点播时
//   /api/download/get?s=<id>&t=<档位> 跟 302 拿直链 MP4；标签筛选卡片由前 40 扩到前 60（WP tags
//   接口按 count 取，41–60 名逐个验过列表 p1 非空）。新顶级分类没有：WP categories 仅 7 个且已全在，
//   iv（イメージビデオ）count=0 不收。
// 字幕：接定版字幕芯（Layer A），有番号一律接。
import req from '../../util/req.js';

const KEY = 'py_openload';
const NAME = '🌸OpenLoad';
const HOST = 'https://openload.mov';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function headers(referer) {
  return {
    'User-Agent': UA,
    'Referer': referer || (HOST + '/'),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function escHtml(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// 顶级分类（WP categories 接口实测，2026-11-15；iv 分类 0 部不收）
const CLASSES = [
  { type_id: 'latest', type_name: '最新', path: '' },
  { type_id: 'mosaic', type_name: 'モザイク除去', path: '/%e3%83%a2%e3%82%b6%e3%82%a4%e3%82%af%e9%99%a4%e5%8e%bb' },
  { type_id: 'av', type_name: 'アダルトビデオ', path: '/av' },
  { type_id: 'uncensored', type_name: '無修正', path: '/uncensored' },
  { type_id: 'amav', type_name: '素人AV', path: '/amav' },
  { type_id: 'amateur', type_name: '素人投稿', path: '/amateur' },
  { type_id: 'vr', type_name: 'VR', path: '/vr' },
  { type_id: 'soaring', type_name: '急上昇', path: '/soaring' },
  { type_id: 'popularity', type_name: '人気', path: '/popularity' },
];
const PATH_BY_ID = {};
for (const c of CLASSES) PATH_BY_ID[c.type_id] = c.path;

// 标签筛选卡片（WP tags 接口前 60，2026-11-15 实测；榜单页不挂）
const TAG_FILTER = [
  { n: '全部', v: '' },
  { n: '単体作品', v: '%e5%8d%98%e4%bd%93%e4%bd%9c%e5%93%81' },
  { n: '中出し', v: '%e4%b8%ad%e5%87%ba%e3%81%97' },
  { n: '巨乳', v: '%e5%b7%a8%e4%b9%b3' },
  { n: 'モザイク', v: '%e3%83%a2%e3%82%b6%e3%82%a4%e3%82%af' },
  { n: '有修正', v: '%e6%9c%89%e4%bf%ae%e6%ad%a3' },
  { n: '美少女', v: '%e7%be%8e%e5%b0%91%e5%a5%b3' },
  { n: '素人動画', v: '%e7%b4%a0%e4%ba%ba%e5%8b%95%e7%94%bb' },
  { n: 'FC2PPV', v: 'fc2ppv' },
  { n: '熟女', v: '%e7%86%9f%e5%a5%b3' },
  { n: '素人', v: '%e7%b4%a0%e4%ba%ba' },
  { n: '人妻・主婦', v: '%e4%ba%ba%e5%a6%bb%e3%83%bb%e4%b8%bb%e5%a9%a6' },
  { n: 'スレンダー', v: '%e3%82%b9%e3%83%ac%e3%83%b3%e3%83%80%e3%83%bc' },
  { n: '痴女', v: '%e7%97%b4%e5%a5%b3' },
  { n: 'フェラ', v: '%e3%83%95%e3%82%a7%e3%83%a9' },
  { n: '美乳', v: '%e7%be%8e%e4%b9%b3' },
  { n: '潮吹き', v: '%e6%bd%ae%e5%90%b9%e3%81%8d' },
  { n: '人妻', v: '%e4%ba%ba%e5%a6%bb' },
  { n: 'ハメ撮り', v: '%e3%83%8f%e3%83%a1%e6%92%ae%e3%82%8a' },
  { n: '無修正', v: '%e7%84%a1%e4%bf%ae%e6%ad%a3' },
  { n: 'パイズリ', v: '%e3%83%91%e3%82%a4%e3%82%ba%e3%83%aa' },
  { n: '騎乗位', v: '%e9%a8%8e%e4%b9%97%e4%bd%8d' },
  { n: '女子校生', v: '%e5%a5%b3%e5%ad%90%e6%a0%a1%e7%94%9f' },
  { n: '3P・4P', v: '3p%e3%83%bb4p' },
  { n: 'デジモ', v: '%e3%83%87%e3%82%b8%e3%83%a2' },
  { n: '寝取り・寝取られ・NTR', v: '%e5%af%9d%e5%8f%96%e3%82%8a%e3%83%bb%e5%af%9d%e5%8f%96%e3%82%89%e3%82%8c%e3%83%bbntr' },
  { n: '顔射', v: '%e9%a1%94%e5%b0%84' },
  { n: 'パイパン', v: '%e3%83%91%e3%82%a4%e3%82%ba%e3%83%91%e3%83%b3' },
  { n: '4時間以上作品', v: '4%e6%99%82%e9%96%93%e4%bb%a5%e4%b8%8a%e4%bd%9c%e5%93%81' },
  { n: 'お姉さん', v: '%e3%81%8a%e5%a7%89%e3%81%95%e3%82%93' },
  { n: '淫乱・ハード系', v: '%e6%b7%ab%e4%b9%b1%e3%83%bb%e3%83%8f%e3%83%bc%e3%83%89%e7%b3%bb' },
  { n: '企画', v: '%e4%bc%81%e7%94%bb' },
  { n: 'ドラマ', v: '%e3%83%89%e3%83%a9%e3%83%9e' },
  { n: 'オナニー', v: '%e3%82%aa%e3%83%8a%e3%83%8b%e3%83%bc' },
  { n: '不倫', v: '%e4%b8%8d%e5%80%ab' },
  { n: 'ナンパ', v: '%e3%83%8a%e3%83%b3%e3%83%91' },
  { n: '手コキ', v: '%e6%89%8b%e3%82%b3%e3%82%ad' },
  { n: 'コスプレ', v: '%e3%82%b3%e3%82%b9%e3%83%97%e3%83%ac' },
  { n: '制服', v: '%e5%88%b6%e6%9c%8d' },
  { n: '巨尻', v: '%e5%b7%a8%e5%b0%bb' },
  { n: 'イラマチオ', v: '%e3%82%a4%e3%83%a9%e3%83%9e%e3%83%81%e3%82%aa' },
  { n: '美尻', v: '%e7%be%8e%e5%b0%bb' },
  { n: '女子大生', v: '%e5%a5%b3%e5%ad%90%e5%a4%a7%e7%94%9f' },
  { n: 'マドンナ', v: '%e3%83%9e%e3%83%89%e3%83%b3%e3%83%8a' },
  { n: 'キス・接吻', v: '%e3%82%ad%e3%82%b9%e3%83%bb%e6%8e%a5%e5%90%bb' },
  { n: '妄想族', v: '%e5%a6%84%e6%83%b3%e6%97%8f' },
  { n: '羞恥', v: '%e7%be%9e%e6%81%a5' },
  { n: 'デビュー作品', v: '%e3%83%87%e3%83%93%e3%83%a5%e3%83%bc%e4%bd%9c%e5%93%81' },
  { n: 'ぶっかけ', v: '%e3%81%b6%e3%81%a3%e3%81%8b%e3%81%91' },
  { n: 'OL', v: 'ol' },
  { n: 'ムーディーズ', v: '%e3%83%a0%e3%83%bc%e3%83%87%e3%82%a3%e3%83%bc%e3%82%ba' },
  { n: 'クンニ', v: '%e3%82%af%e3%83%b3%e3%83%8b' },
  { n: '乱交', v: '%e4%b9%b1%e4%ba%a4' },
  { n: 'ドキュメンタリー', v: '%e3%83%89%e3%82%ad%e3%83%a5%e3%83%a1%e3%83%b3%e3%82%bf%e3%83%aa%e3%83%bc' },
  { n: 'ギャル', v: '%e3%82%ae%e3%83%a3%e3%83%ab' },
  { n: '4K', v: '4k' },
  { n: 'SODクリエイト', v: 'sod%e3%82%af%e3%83%aa%e3%82%a8%e3%82%a4%e3%83%88' },
  { n: '淫語', v: '%e6%b7%ab%e8%aa%9e' },
  { n: 'ケイ・エム・プロデュース', v: '%e3%82%b1%e3%82%a4%e3%83%bb%e3%82%a8%e3%83%a0%e3%83%bb%e3%83%97%e3%83%ad%e3%83%87%e3%83%a5%e3%83%bc%e3%82%b9' },
  { n: 'おもちゃ', v: '%e3%81%8a%e3%82%82%e3%81%a1%e3%82%83' },
  { n: 'アナル', v: '%e3%82%a2%e3%83%8a%e3%83%ab' },
];

function filtersFor(id) {
  if (id === 'soaring' || id === 'popularity') return {};
  return { tag: [{ key: 'tag', name: '標籤', value: TAG_FILTER }] };
}

async function getHtml(url, referer) {
  const opts = { headers: headers(referer), timeout: 15000, validateStatus: () => true };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await req.get(url, opts);
      if (r && r.status === 200 && r.data) return String(r.data);
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers: headers(referer) });
        if (r && r.ok) return await r.text();
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return '';
}

async function getHtmlOnce(url, referer) {
  try {
    const r = await req.get(url, { headers: headers(referer), timeout: 12000, validateStatus: () => true });
    if (!r) return { status: 0, body: '' };
    return { status: r.status || 0, body: r.data ? String(r.data) : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// 带状态码的重试取数（embed 解析与 REST 搜索共用）：
// VM 实测 axios 对 openload.mov 间歇 aborted / socket hang up（5lxtv 同款毛病），
// 故 axios 与原生 fetch 交替重试；404 一旦出现即认定死线（确定性，不重试）。
async function fetchEmbed(url, referer) {
  let lastStatus = 0;
  let lastBody = '';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await req.get(url, { headers: headers(referer), timeout: 8000, validateStatus: () => true });
      if (r) {
        lastStatus = r.status || 0;
        if (r.status === 404) return { status: 404, body: '' };
        if (r.status === 200 && r.data) return { status: 200, body: String(r.data) };
        lastBody = r.data ? String(r.data) : '';
      }
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers: headers(referer) });
        lastStatus = r.status || 0;
        if (r.status === 404) return { status: 404, body: '' };
        if (r.ok) return { status: 200, body: await r.text() };
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return { status: lastStatus, body: lastBody };
}

// REST 搜索重试取数（同款 axios 间歇断线），回 { posts, totalPages }
async function getRest(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': HOST + '/' },
        timeout: 8000, transformResponse: [(d) => d], validateStatus: () => true,
      });
      if (r && r.status === 200 && r.data) {
        let posts = null;
        try { posts = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch (e) {}
        if (posts) {
          const tp = r.headers && (r.headers['x-wp-totalpages'] || r.headers['X-WP-TotalPages']);
          return { posts, totalPages: tp ? (parseInt(tp, 10) || 1) : 1 };
        }
      }
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': HOST + '/' } });
        if (r && r.ok) {
          const txt = await r.text();
          let posts = null;
          try { posts = JSON.parse(txt); } catch (e) {}
          if (posts) {
            const tp = r.headers.get('x-wp-totalpages');
            return { posts, totalPages: tp ? (parseInt(tp, 10) || 1) : 1 };
          }
        }
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return { posts: null, totalPages: 1 };
}

async function getJson(url, referer) {
  const html = await getHtml(url, referer);
  if (!html) return null;
  try { return JSON.parse(html); } catch (e) { return null; }
}

// ---------- Dean Edwards packer 纯 JS 解包器（无 eval） ----------
// 站内详情页与 StreamHG 系 embed 页都用 eval(function(p,a,c,k,e,d){...}) 混淆；
// 两种变体都支持：详情页的 d 字典单遍替换、embed 页的按下标倒序替换。
// 8 个实采样本与 node eval 输出逐字节一致（unpacker_test.mjs，2026-11-15）。
function jsUnescape(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c === '\\' && i + 1 < s.length) {
      const n = s.charAt(i + 1);
      if (n === "'") { out += "'"; i += 2; }
      else if (n === '\\') { out += '\\'; i += 2; }
      else if (n === 'n') { out += '\n'; i += 2; }
      else if (n === 'r') { out += '\r'; i += 2; }
      else if (n === 't') { out += '\t'; i += 2; }
      else if (n === 'x' && i + 3 < s.length) { out += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16)); i += 4; }
      else if (n === 'u' && i + 5 < s.length) { out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 6; }
      else { out += n; i += 2; }
    } else { out += c; i++; }
  }
  return out;
}

function olUnpack(packed) {
  if (!packed) return '';
  const m = packed.match(/\}\('((?:\\'|[^'])*)',(\d+),(\d+),'((?:\\'|[^'])*)'\.split\('\|'\)(?:,0,\{\})?\)\)/);
  if (!m) return '';
  const payload = jsUnescape(m[1]);
  const base = parseInt(m[2], 10);
  const count = parseInt(m[3], 10);
  const keys = m[4].split('|');
  const enc = (x) => (x < base ? '' : enc(parseInt(x / base))) + ((x = x % base) > 35 ? String.fromCharCode(x + 29) : x.toString(36));
  if (packed.indexOf('d[e(c)]=k[c]') >= 0) {
    const d = {};
    for (let i = 0; i < count; i++) d[enc(i)] = keys[i] || enc(i);
    return payload.replace(/\b\w+\b/g, (w) => (d[w] !== undefined ? d[w] : w));
  }
  let p = payload;
  for (let c = count - 1; c >= 0; c--) {
    if (keys[c]) p = p.replace(new RegExp('\\b' + c.toString(base) + '\\b', 'g'), keys[c]);
  }
  return p;
}

// 从 packed 脚本里找出所有 eval(...) 混淆块，逐个解包，取含 iframe 的那块
function unpackDetailEmbeds(html) {
  const re = /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)(?:,0,\{\})?\)\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const up = olUnpack(m[0]);
    if (up && up.indexOf('<iframe') >= 0) {
      const out = [];
      const ire = /<iframe[^>]*src="([^"]+)"/g;
      let im;
      while ((im = ire.exec(up)) !== null) out.push(im[1]);
      if (out.length) return out;
    }
  }
  return [];
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
}

// 2026-11-15 实测死线路：asianclub.tv 已停放（域名出售页），vidoza.net embed 404；
// 2026-11-15 补：streamsb.net embed 跳 ww1 停放/广告页（GDPR CMP 脚本，无播放器），同判死线。
const DEAD_HOSTS = ['asianclub.tv', 'vidoza.net', 'streamsb.net'];
function isDeadEmbed(url) {
  const h = hostOf(url);
  return DEAD_HOSTS.indexOf(h) >= 0;
}

// StreamHG 系 JWPlayer 混淆页：iplayerhls / callistanise（minochinos 301 跳转至此）/
// streamhide / likessb / sbstream 同款结构，解不出时回嗅探
function isHgHost(h) {
  return h === 'iplayerhls.com' || h === 'callistanise.com' || h === 'minochinos.com' ||
    h === 'streamhide.to' || h === 'likessb.com' || h === 'sbstream.net';
}
function isStreamtape(h) {
  return h === 'streamtape.com';
}

// HLS 全链探活（2026-11-17 修：op-1042218 HG 线 master 死链致播放器转圈后失败）：
// master 须 200 + #EXTM3U 开头；若为 master 播单（含 #EXT-X-STREAM-INF），再探第一条
// variant（相对地址按 master 解析），同样 200 + #EXTM3U 才算活。媒体播单（含 #EXTINF）
// 无 variant，直接算活。单次 6s 上限，axios 与原生 fetch 各试一次，绝不抛错。
async function probeHlsText(url, referer) {
  try {
    const r = await req.get(url, { headers: headers(referer), timeout: 6000, transformResponse: [(d) => d], validateStatus: () => true });
    if (r && r.status === 200 && r.data) {
      const s = String(r.data);
      if (s.indexOf('#EXTM3U') === 0) return s;
    }
  } catch (e) {}
  // 原生 fetch 无超时，须用 Promise.race 兜底 6s，否则死链会挂住、被 resolveAll 的 20s
  // 超时截成 sniff（op-1042218 HG master 的 fetch 曾挂 60s 才回 504）。
  try {
    if (typeof fetch === 'function') {
      const r = await Promise.race([
        (async () => {
          const res = await fetch(url, { headers: headers(referer) });
          if (!res || !res.ok) return null;
          const t = await res.text();
          return (t && t.indexOf('#EXTM3U') === 0) ? t : null;
        })(),
        new Promise((res) => setTimeout(() => res(null), 6000)),
      ]);
      if (r) return r;
    }
  } catch (e) {}
  return '';
}
function firstVariantUri(masterText, masterUrl) {
  const lines = String(masterText || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (ln.indexOf('#EXT-X-STREAM-INF') === 0) {
      for (let j = i + 1; j < lines.length; j++) {
        const u = lines[j].trim();
        if (!u) continue;
        if (u.charAt(0) === '#') break;
        try { return new URL(u, masterUrl).toString(); } catch (e) { return u; }
      }
      return '';
    }
  }
  return '';
}
async function probeHlsChain(masterUrl, referer) {
  const m = await probeHlsText(masterUrl, referer);
  if (!m) return false;
  if (m.indexOf('#EXTINF') >= 0) return true;
  const v = firstVariantUri(m, masterUrl);
  if (!v) return true;
  const vt = await probeHlsText(v, referer);
  return !!vt;
}

async function resolveHg(embed) {
  const f = await fetchEmbed(embed, embed);
  if (f.status === 404) return 'DEAD';
  const html = f.body;
  if (!html) return '';
  // 删片页回 200 + 文字（"File is no longer available as it expired or has been deleted."）
  if (/no longer available|has been deleted|file not found|video not found|this video (has been )?deleted/i.test(html)) return 'DEAD';
  const re = /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)(?:,0,\{\})?\)\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const up = olUnpack(m[0]);
    if (!up || up.indexOf('hls2') < 0) continue;
    const hls2 = (up.match(/"hls2"\s*:\s*"([^"]+)"/) || [])[1] || '';
    const hls3 = (up.match(/"hls3"\s*:\s*"([^"]+)"/) || [])[1] || '';
    const hls4 = (up.match(/"hls4"\s*:\s*"([^"]+)"/) || [])[1] || '';
    // hls2 为签名 master（VM 裸取 200），首选；hls4 相对路径且 VM 403，放最后。
    // 2026-11-17 修：解出的 master 须先探活（master + variant 全链），死链直接判 DEAD，
    // 不把死地址交给播放器（op-1042218 HG 线 master 超时/504，播放器转圈后“加载视频失败”）。
    if (hls2) {
      if (await probeHlsChain(hls2, embed)) return hls2;
      return 'DEAD';
    }
    if (hls3) {
      if (await probeHlsChain(hls3, embed)) return hls3;
      return 'DEAD';
    }
    if (hls4) {
      let u = hls4;
      try { u = new URL(hls4, embed).toString(); } catch (e) {}
      if (await probeHlsChain(u, embed)) return u;
      return 'DEAD';
    }
  }
  return '';
}

async function resolveStreamtape(embed) {
  const f = await fetchEmbed(embed, embed);
  if (f.status === 404) return 'DEAD';
  const html = f.body;
  if (!html) return '';
  if (/no longer available|has been deleted|file not found|video not found|this video (has been )?deleted/i.test(html)) return 'DEAD';
  const m = html.match(/get_video\?id=([^']*)'\s*\+\s*\('([^']*)'\)((?:\.substring\(\d+\))*)?/);
  if (m) {
    let tail = m[2];
    const subs = (m[3] || '').match(/substring\((\d+)\)/g) || [];
    for (const s of subs) {
      const n = parseInt((s.match(/(\d+)/) || [])[1] || '0', 10) || 0;
      tail = tail.substring(n);
    }
    return 'https://streamtape.com/get_video?id=' + m[1] + tail;
  }
  // 2026-11-15 修：token/ip 的字符集必须排除 '<'——embed 页 #ideoolink 里 token 后紧跟 </div>，
  // 旧正则 [^"'\s&] 会把 </div> 吃进 token，拼出的 get_video 带脏 token，站方必拒。
  const m2 = html.match(/get_video\?id=([A-Za-z0-9]+)&expires=(\d+)&ip=([^"'\s&<>]+)&token=([^"'\s&<>]+)/);
  if (m2) return 'https://streamtape.com/get_video?id=' + m2[1] + '&expires=' + m2[2] + '&ip=' + m2[3] + '&token=' + m2[4];
  return '';
}

// 详情已解析好的直链（hls2 master / streamtape get_video / mp4 直链），play() 直接交播放器
function isDirectMedia(u) {
  return u.indexOf('.m3u8') >= 0 || u.indexOf('/get_video?') >= 0 || /\.mp4(\?|#|$)/.test(u);
}

// 字幕：只挂 detail() 预热已入缓存的命中（javmove playFinish 同款口径，不再现搜）
function attachSubs(res, durl) {
  if (!durl) return;
  try {
    const hit = subResultCache.get(durl);
    if (hit && Date.now() - hit.ts < SUB_TTL && hit.subs && hit.subs.length) res.subs = hit.subs;
  } catch (e) {}
}

// 详情时现解全部 embed（3 并发、单条 20s 上限）：超时/抛错的按嗅探保留，play() 再懒解一次。
// 2026-11-15 由来：详情只列 embed、不验活，404 死线与删片行照常上架，用户一点就是“视频加载失败”。
async function resolveAll(embeds) {
  const out = new Array(embeds.length);
  let idx = 0;
  async function worker() {
    while (idx < embeds.length) {
      const i = idx++;
      try {
        out[i] = await Promise.race([
          resolveEmbed(embeds[i]),
          new Promise((r) => setTimeout(() => r({ kind: 'sniff', url: embeds[i] }), 20000)),
        ]);
      } catch (e) {
        out[i] = { kind: 'sniff', url: embeds[i] };
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

// embed -> { kind: 'hls'|'mp4'|'sniff'|'dead', url }
async function resolveEmbed(embed) {
  const h = hostOf(embed);
  if (!h) return { kind: 'sniff', url: embed };
  if (isHgHost(h)) {
    const u = await resolveHg(embed);
    if (u === 'DEAD') return { kind: 'dead', url: embed };
    if (u) return { kind: 'hls', url: u };
  } else if (isStreamtape(h)) {
    const u = await resolveStreamtape(embed);
    if (u === 'DEAD') return { kind: 'dead', url: embed };
    if (u) return { kind: 'mp4', url: u };
  }
  return { kind: 'sniff', url: embed };
}

// 跟 302 拿最终直链文件地址（streamtape get_video -> tapecontent MP4；
// vsembed /api/download/get -> 直链 MP4）：axios maxRedirects: 0 拿 Location 手动跟，
// 最多 2 跳；跟不到回 ''。绝不抛错。
function isMediaFileUrl(u) {
  return /tapecontent\.net|\.mp4(\?|#|$)/i.test(u || '');
}
async function followRedirect(url, referer) {
  let cur = url;
  for (let hop = 0; hop < 2; hop++) {
    let loc = '';
    let done = '';
    try {
      const r = await req.get(cur, { headers: headers(referer), timeout: 6000, maxRedirects: 0, validateStatus: () => true });
      if (r) {
        if (r.status >= 300 && r.status < 400) {
          loc = (r.headers && (r.headers.location || r.headers.Location)) || '';
        } else if (r.status === 200) {
          done = r.finalUrl || (r.headers && r.headers['x-final-url']) || '';
        }
      }
    } catch (e) {}
    if (!loc && !done) {
      try {
        if (typeof fetch === 'function') {
          const fr = await fetch(cur, { headers: headers(referer), redirect: 'manual' });
          if (fr.status >= 300 && fr.status < 400) loc = fr.headers.get('location') || '';
          else if (fr.status === 200 && fr.url && fr.url !== cur) done = fr.url;
        }
      } catch (e) {}
    }
    if (loc) {
      try { cur = new URL(loc, cur).toString(); } catch (e) { return ''; }
      if (isMediaFileUrl(cur)) return cur;
      continue;
    }
    if (done && isMediaFileUrl(done)) return done;
    return '';
  }
  return isMediaFileUrl(cur) ? cur : '';
}

function vsIdOf(embed) {
  const parts = String(embed || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// vsembed 下载档位：/api/download/tiers?s=<id> -> [{file:'1080p',label,size_bytes}]
// （站内下载按钮同款公开接口，无鉴权；档位真实，不编造）
async function vsTiers(embed) {
  try {
    const id = vsIdOf(embed);
    if (!id) return [];
    const r = await req.get('https://vsembed.com/api/download/tiers?s=' + encodeURIComponent(id), {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': embed },
      timeout: 10000, validateStatus: () => true,
    });
    if (!r || r.status !== 200 || !r.data) return [];
    const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    const tiers = (j && j.data && j.data.tiers) || [];
    return tiers.filter((x) => x && /^\d+p$/.test(String(x.file || ''))).map((x) => String(x.file));
  } catch (e) { return []; }
}

// vsembed 点播：/api/download/get?s=<id>&t=<档位> 302 -> 直链 MP4，跟 302 拿最终地址
async function vsDownloadUrl(embed, tier) {
  try {
    const id = vsIdOf(embed);
    if (!id || !tier) return '';
    const u = 'https://vsembed.com/api/download/get?s=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(tier);
    return await followRedirect(u, embed);
  } catch (e) { return ''; }
}

function parseList(html) {
  const list = [];
  if (!html) return list;
  const re = /<a href="(https:\/\/openload\.mov\/[^"]*?\/op-\d+\/)"[^>]*>\s*<div class="post-list-image">\s*<img src="([^"]+)"[^>]*?alt="([^"]*)"[^>]*>(?:\s*<div[^>]*>\s*<\/div>)?\s*<\/div>\s*<span>([\s\S]*?)<\/span>\s*(?:<div class="post-list-time">([^<]*)<\/div>)?/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const title = escHtml(m[4] || m[3] || '');
    if (!title) continue;
    list.push({
      vod_id: url,
      vod_name: title,
      vod_pic: m[2] || '',
      vod_remarks: t(m[5] || ''),
    });
  }
  return list;
}

function parsePagecount(html) {
  if (!html) return 1;
  const pages = [];
  const re = /\/page\/(\d+)\//g;
  let m;
  while ((m = re.exec(html)) !== null) pages.push(parseInt(m[1], 10) || 1);
  if (!pages.length) return 1;
  return Math.max.apply(null, pages);
}

function pagePath(path, page) {
  if (!page || page <= 1) return path || '/';
  return (path || '') + '/page/' + page + '/';
}

async function home() {
  const cls = CLASSES.map((c) => ({ type_id: c.type_id, type_name: c.type_name }));
  const filters = {};
  for (const c of CLASSES) {
    const f = filtersFor(c.type_id);
    if (f && f.tag) filters[c.type_id] = f.tag;
  }
  return { class: cls, filters };
}

async function category(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = String(body.id || body.tid || 'latest');
  const page = parseInt(body.page || 1, 10) || 1;
  const flt = body.filters || body.extend || {};
  const tag = t(flt.tag || (flt['tag'] && flt['tag'].value) || '');
  let url;
  if (tag) {
    url = HOST + '/tag/' + tag + (page > 1 ? '/page/' + page + '/' : '/');
  } else if (id === 'soaring' || id === 'popularity') {
    url = HOST + PATH_BY_ID[id] + '/';
  } else {
    url = HOST + pagePath(PATH_BY_ID[id] || '', page);
  }
  const html = await getHtml(url);
  const list = parseList(html);
  const pagecount = (id === 'soaring' || id === 'popularity' || tag) ? (tag ? parsePagecount(html) : 1) : parsePagecount(html);
  return {
    page,
    pagecount,
    limit: 20,
    total: list.length,
    list,
  };
}

// 搜索走 WP REST（/?s= 被 CF 拦 403）；封面逐条取详情页 data-thumb 补
async function search(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const wd = t(body.wd || '');
  const page = parseInt(body.page || 1, 10) || 1;
  if (!wd) return { page, pagecount: 1, limit: 20, total: 0, list: [] };
  const url = HOST + '/wp-json/wp/v2/posts?search=' + encodeURIComponent(wd) + '&per_page=20&page=' + page;
  const res = await getRest(url);
  const posts = res.posts;
  const totalPages = res.totalPages;
  if (!posts || !posts.length) return { page, pagecount: totalPages, limit: 20, total: 0, list: [] };
  const list = posts.map((p) => ({
    vod_id: p.link || '',
    vod_name: escHtml((p.title && p.title.rendered) || ''),
    vod_pic: '',
    vod_remarks: (p.date || '').slice(0, 10),
  })).filter((v) => v.vod_id && v.vod_name);
  // 封面补齐：详情页 div.history data-thumb。站方对并发敏感（12 并行全 20s 超时），
  // 故 3 并发池、只补前 8 条、单次取数不重试，失败留空。
  const thumbJobs = list.slice(0, 8);
  let thumbIdx = 0;
  async function thumbWorker() {
    while (thumbIdx < thumbJobs.length) {
      const v = thumbJobs[thumbIdx++];
      try {
        const f = await getHtmlOnce(v.vod_id, v.vod_id);
        const m = f.body.match(/data-thumb="([^"]+)"/);
        if (m) v.vod_pic = m[1];
      } catch (e) {}
    }
  }
  await Promise.all([thumbWorker(), thumbWorker(), thumbWorker()]);
  return { page, pagecount: totalPages, limit: 20, total: list.length, list };
}

// 详情页解析：标题 / 封面 / 各集线路标签 / embed 列表（死线路已滤）
function parseDetail(html, durl) {
  const title = escHtml(((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/\s*-\s*OPENLOAD\.PRO\s*$/, ''));
  const pic = (html.match(/data-thumb="([^"]+)"/) || [])[1] || '';
  const epBlock = (html.match(/<div id="episode">([\s\S]*?)<\/div>/) || [])[1] || '';
  const epNums = (epBlock.match(/<span[^>]*>(\d+)<\/span>/g) || []).length || 1;
  const parts = [];
  const serverRe = /<div id="e(\d+)"[^>]*>([\s\S]*?)<\/div>/g;
  let sm;
  while ((sm = serverRe.exec(html)) !== null) {
    const labels = [];
    const lre = /<span[^>]*>([^<]+)<\/span>/g;
    let lm;
    while ((lm = lre.exec(sm[2])) !== null) labels.push(t(lm[1]));
    if (labels.length) parts.push(labels);
  }
  const embeds = unpackDetailEmbeds(html).filter((u) => !isDeadEmbed(u));
  return { title, pic, epNums, parts, embeds };
}

async function detail(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = t(body.id || '');
  if (!id) return { list: [] };
  const durl = id.indexOf('http') === 0 ? id : HOST + id;
  const html = await getHtml(durl);
  const d = parseDetail(html, durl);
  // 摊平 (集, 标签, embed)，详情时统一现解：死线丢弃，直链直接写进播放 id
  const jobs = [];
  {
    let ei = 0;
    const nParts0 = Math.max(d.parts.length, 1);
    for (let pi = 0; pi < nParts0; pi++) {
      const labels = d.parts[pi] || ['HG'];
      for (let si = 0; si < labels.length; si++) {
        const emb = d.embeds[ei++] || '';
        if (emb) jobs.push({ pi, label: labels[si], embed: emb });
      }
    }
  }
  const solved = await resolveAll(jobs.map((j) => j.embed));
  // VS：下载 API 有真实档位（1080p/720p/540p），详情时取档位出多集；取不到只留嗅探行
  const vsTierMap = {};
  {
    const vsJobs = [];
    const vsSeen = {};
    for (let k = 0; k < jobs.length; k++) {
      const emb = jobs[k].embed || '';
      if (hostOf(emb) !== 'vsembed.com' || vsSeen[emb]) continue;
      vsSeen[emb] = true;
      const r = solved[k];
      if (r && (r.kind === 'hls' || r.kind === 'mp4')) continue;
      vsJobs.push((async () => {
        try {
          const tiers = await Promise.race([
            vsTiers(emb),
            new Promise((res) => setTimeout(() => res([]), 10000)),
          ]);
          if (tiers && tiers.length) vsTierMap[emb] = tiers;
        } catch (e) {}
      })());
    }
    await Promise.all(vsJobs);
  }
  const from = [];
  const urls = [];
  const nParts = Math.max(d.parts.length, 1);
  for (let pi = 0; pi < nParts; pi++) {
    const lines = [];
    for (let k = 0; k < jobs.length; k++) {
      if (jobs[k].pi !== pi) continue;
      const r = solved[k];
      if (!r || r.kind === 'dead') continue;
      // 播放 id 埋详情 URL + embed + 详情时旧直链：<durl>@@<embed>@@<旧直链>，
      // play() 点播时用 embed 重新现解（IP 绑定地址现铸现用），旧直链只作现解失败
      // 时的兜底；嗅探行无旧直链，仍为 <durl>@@<embed>。play() 凭 durl 查字幕缓存
      // （javmove 同款 playFinish 口径）。
      if (r.kind === 'hls' || r.kind === 'mp4') {
        lines.push(jobs[k].label + '$' + durl + '@@' + jobs[k].embed + '@@' + r.url);
      } else if (vsTierMap[jobs[k].embed]) {
        for (const tier of vsTierMap[jobs[k].embed]) {
          lines.push(jobs[k].label + '·' + tier + '$' + durl + '@@' + jobs[k].embed + '@@' + tier);
        }
      } else {
        lines.push(jobs[k].label + '$' + durl + '@@' + jobs[k].embed);
      }
    }
    if (lines.length) {
      from.push(nParts > 1 ? '第' + (pi + 1) + '集' : '播放线路');
      urls.push(lines.join('#'));
    }
  }
  // 全死 / 解包失败：只留站内页嗅探行
  if (!urls.length) {
    from.push('播放线路');
    urls.push('网页播放$' + durl);
  }
  const vod = {
    vod_id: durl,
    vod_name: d.title || durl,
    vod_pic: d.pic,
    vod_remarks: '',
    vod_play_from: from.join('$$$'),
    vod_play_url: urls.join('$$$'),
  };
  try {
    subRegister([durl], vod);
  } catch (e) {}
  return { list: [vod] };
}

async function play(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  let id = t(body.id || '');
  id = subNormKey(id);
  if (!id) return { parse: 1, url: '' };
  try {
    // 播放 id：新格式 <durl>@@<embed>@@<旧直链>；嗅探行 <durl>@@<embed>；
    // 老格式 <durl>@@<直链>（旧包）与裸 embed / 裸详情 URL 兼容。
    // 直链里不含 '@@'，按 '@@' 切分安全。
    let durl = '';
    let embed = id;
    let oldUrl = '';
    const parts = id.split('@@');
    if (parts.length >= 3) {
      durl = parts[0];
      embed = parts[1];
      oldUrl = parts.slice(2).join('@@');
    } else if (parts.length === 2) {
      durl = parts[0];
      embed = parts[1];
    }
    // 嗅探行：站内详情页本身
    if (embed.indexOf('openload.mov') >= 0 && embed.indexOf('/op-') >= 0) {
      return { parse: 1, url: embed };
    }
    if (embed.indexOf('http') !== 0) return { parse: 1, url: embed };
    // VS：play id 第 3 段是档位（1080p/720p/540p），走下载 API 现取直链 MP4
    if (hostOf(embed) === 'vsembed.com') {
      let tier = /^\d+p$/.test(oldUrl || '') ? oldUrl : '';
      if (!tier) {
        try {
          const tiers = await Promise.race([
            vsTiers(embed),
            new Promise((res) => setTimeout(() => res([]), 10000)),
          ]);
          if (tiers && tiers.length) tier = tiers[0];
        } catch (e) {}
      }
      if (tier) {
        const u = await vsDownloadUrl(embed, tier);
        if (u) {
          const res = {
            parse: 0,
            url: u,
            header: { 'User-Agent': UA, 'Referer': embed },
          };
          attachSubs(res, durl);
          return res;
        }
      }
      return { parse: 1, url: embed };
    }
    // 老格式：id 里直接是详情时铸好的直链（无 embed 可重解），沿用旧行为直接交播放器
    if (isDirectMedia(embed) && !oldUrl) {
      const res = {
        parse: 0,
        url: embed,
        header: {
          'User-Agent': UA,
          'Referer': durl || embed,
        },
      };
      attachSubs(res, durl);
      return res;
    }
    // 点播时对点的这条线重新现解（单线 20s 上限）：IP 绑定地址必须现铸现用，
    // 详情时铸好的到点播时可能已死（SIM-082 三线同死，2026-11-15 真机坐实）。
    let r = null;
    try {
      r = await Promise.race([
        resolveEmbed(embed),
        new Promise((res) => setTimeout(() => res(null), 20000)),
      ]);
    } catch (e) {
      r = null;
    }
    if (r && (r.kind === 'hls' || r.kind === 'mp4')) {
      let playUrl = r.url;
      // ST：跟 302 拿 tapecontent 直链 MP4，播放器不再碰站方常 500 的 get_video
      if (r.kind === 'mp4' && r.url.indexOf('/get_video?') >= 0) {
        try {
          const followed = await followRedirect(r.url, embed);
          if (followed) playUrl = followed;
        } catch (e) {}
      }
      const res = {
        parse: 0,
        url: playUrl,
        header: {
          'User-Agent': UA,
          'Referer': embed,
        },
      };
      attachSubs(res, durl);
      return res;
    }
    // 现解失败（超时/抛错/死线/解不出）：回详情时旧直链让播放器再试一次。
    // 2026-11-17 修：旧直链是 .m3u8 时须先探活，死链不交播放器（op-1042218 HG 旧 master
    // 已死，现解判 DEAD 后兜底又把它原样交出，播放器照样转圈失败）。探活失败则落到嗅探。
    if (oldUrl && isDirectMedia(oldUrl)) {
      let playUrl = oldUrl;
      // ST 旧地址也是 get_video：同样跟 302 拿最终直链
      if (oldUrl.indexOf('/get_video?') >= 0) {
        try {
          const followed = await followRedirect(oldUrl, embed);
          if (followed) playUrl = followed;
        } catch (e) {}
      }
      if (playUrl.indexOf('.m3u8') >= 0) {
        let ok = false;
        try { ok = await probeHlsChain(playUrl, embed); } catch (e) {}
        if (!ok) return { parse: 1, url: embed };
      }
      const res = {
        parse: 0,
        url: playUrl,
        header: {
          'User-Agent': UA,
          'Referer': durl || embed,
        },
      };
      attachSubs(res, durl);
      return res;
    }
    return { parse: 1, url: embed };
  } catch (e) {
    return { parse: 1, url: '' };
  }
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
// [openload 补丁 2026-11-15：传输层容错] VM 实测 axios 到 xunlei oracle 3/3
// "stream has been aborted"（与 openload.mov 同款 keepAlive 断流，5lxtv
// getHtml 亦有同款注释），原生 fetch 直连 200。axios 失败/非 2xx 时改走
// fetch 再试一次；无 fetch 的运行环境退回定版行为。搜索/合并/过滤逻辑一个字未动。
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
    if (ok && text) return { status: r.status || 0, body: text };
    if (ok) return { status: r.status || 0, body: '' };
  } catch (e) {}
  try {
    if (typeof fetch === 'function') {
      let ctrl = null;
      let to = null;
      try {
        if (typeof AbortController !== 'undefined') {
          ctrl = new AbortController();
          to = setTimeout(() => { try { ctrl.abort(); } catch (e2) {} }, timeoutMs || 10000);
        }
        const r = await fetch(url, { headers: headers || {}, signal: ctrl ? ctrl.signal : undefined });
        if (to) clearTimeout(to);
        if (r && r.status >= 200 && r.status < 300) {
          return { status: r.status || 0, body: await r.text() };
        }
        return { status: (r && r.status) || 0, body: '' };
      } catch (e2) {
        if (to) clearTimeout(to);
        return { status: 0, body: '' };
      }
    }
  } catch (e) {}
  return { status: 0, body: '' };
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
}export default {
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