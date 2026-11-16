// JavTubs (https://javtubs.com) -> CatPawOpen spider
// JAV tube 站：SSR HTML，无 CF 墙（VM 直连 200；iPhone UA）。
// 分类：最新 / 精选 / Reducing Mosaic（搜索背书，站内无独立 genre 页）+
//   7 个站内 category（有码/无码/中文字幕/无码中文/素人有码/1080p/4K）；
//   genre 筛选卡片 43 项（站内 /genres 索引实测在列 + 详情页实测，逐项 HTTP 200 验过）。
// 列表：post-entry-1 卡片（48 条/页），分页 /page/N；搜索 /search?s=<kw>&page=N。
// 播放链（2026-11-15 实测）：详情页 hidden #links = base64(embed
//   URL)，可多 server（,, 分隔）；POST /get_link.php {links, option}
//   取 embed URL（option 从 1 开始，无需 Cookie）；主腿
//   earnvidjavgg.xyz（VidHide）：embed 页内 packed JS 解包出 hls2
//   master m3u8（urlset 多档：480p/720p/1080p；单档片只出 480p），
//   分片为明文 TS（无 EXT-X-KEY），分片 Range 206、首字节 0x47；签名 36h。
//   次腿 voe.sx 实测 404（AVGL-109），只作 embed 回落。
// 根因（2026-11-15 坐实）：VidHide 播单 token 绑 IP——master 必须由取
//   embed 页的同一个出口 IP 来取，换连接/换出口即 nginx 403（curl、
//   jina、已部署的中转 Worker 共 6 次全 403；同进程内现铸的 hls4
//   同 host 相对地址回 200（那是前贴片广告播单），hls2 真片跨 host
//   仍 403——VM 侧变体直出验不到，真机定性）。中转
//   因此是死腿，不用。手机 Safari 站内自带播放能播，手机网络没问题，
//   问题在蜘蛛/App 这边。
// 修法：详情只从 embed 页 qualityLabels 取真实档位（不取 master，不编
//   造）；play() 点播时现解现取——POST 取 embed → 取 embed 页 → 解包
//   出 master → 同一次调用、同一 req 池连续取 master（Referer: embed），
//   按档位返回变体地址 parse:0；master 取数失败回 master 本身让播放器
//   再试一次（手机侧 spider 与播放器同出口 IP）；embed 取数失败回
//   parse:1 站内嗅探。详情时缓存的 master 只作参考，play() 绝不用。
// 字幕：接定版字幕芯（Layer A），有番号一律接。
// v3（2026-11-15）：Reducing Mosaic 片走 dramiyos-cdn，播放器拿到播单后卡在变体/
//   分片取数上转圈——用户手机 Safari 站内自带播放能播（2026-11-15 18:32 真机鉴别），
//   内容是活的，问题在 App 取数路径。新增蜘蛛本地代理（照抄 py_24jav / py_5lxtv
//   已证模式）：只对 dramiyos-cdn 的 master 走代理，acek-cdn 保持 v2 原样直出。
import req from '../../util/req.js';

const KEY = 'py_javtubs';
const NAME = '🌸JavTubs';
const HOST = 'https://javtubs.com';
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 实体解码：&amp; &lt; &gt; &quot; &#39; &nbsp; + &#x2013; / &#233; 数字形
function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (a, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return a; } })
    .replace(/&#(\d+);/g, (a, d) => { try { return String.fromCharCode(parseInt(d, 10)); } catch (e) { return a; } });
}

// 顶级分类（站内实测）
const CLASSES = [
  { type_id: 'latest', type_name: '最新', path: '/new-post' },
  { type_id: 'featured', type_name: '精选', path: '/featured' },
  { type_id: 'rm', type_name: 'Reducing Mosaic', path: '' },
  { type_id: 'censored', type_name: '有码', path: '/category/censored' },
  { type_id: 'uncensored', type_name: '无码', path: '/category/uncensored' },
  { type_id: 'chinese-subtitle', type_name: '中文字幕', path: '/category/chinese-subtitle' },
  { type_id: 'chinese-uncensored', type_name: '无码中文', path: '/category/chinese-uncensored' },
  { type_id: 'amateur-censored', type_name: '素人有码', path: '/category/amateur-censored' },
  { type_id: 'hd1080', type_name: '1080p', path: '/category/1080p' },
  { type_id: '4k', type_name: '4K', path: '/category/4k' },
];
const PATH_BY_ID = {};
for (const c of CLASSES) PATH_BY_ID[c.type_id] = c.path;

// genre 筛选卡片：43 项，站内 /genres 索引实测在列 + 逐项 HTTP 200 验过
// （2026-11-15；站方偶发断连属抖动，重试后全通）。
const GENRE_FILTER = [
  { n: '全部', v: '' },
  { n: '美少女', v: 'beautiful-girl' },
  { n: '专属女优', v: 'featured-actress' },
  { n: '单体作品', v: 'single-work' },
  { n: '素人', v: 'amateur' },
  { n: '肛交', v: 'anal' },
  { n: '女优', v: 'actress' },
  { n: '出轨', v: 'affair' },
  { n: '阿姨', v: 'aunt' },
  { n: '熟女', v: 'a-mature-woman' },
  { n: 'ASMR', v: 'asmr' },
  { n: '动漫', v: 'anime' },
  { n: '动漫Cosplay', v: 'anime-cosplay' },
  { n: '阿黑颜', v: 'ahegao' },
  { n: '通奸', v: 'adultery' },
  { n: '素人情侣', v: 'amateur-couple' },
  { n: '姐姐', v: 'お姉さん' },
  { n: 'Cosplay', v: 'コスプレ' },
  { n: '苗条', v: 'スレンダー' },
  { n: '剧情', v: 'ドラマ' },
  { n: '高清', v: 'ハイビジョン' },
  { n: '后宫', v: 'ハーレム' },
  { n: '白虎', v: 'パイパン' },
  { n: '口交', v: 'フェラ' },
  { n: '中出', v: '中出し' },
  { n: '人妻', v: '人妻-主婦' },
  { n: '单体作品·日', v: '単体作品' },
  { n: '女大学生', v: '女子大生' },
  { n: '手交', v: '手コキ' },
  { n: '潮吹', v: '潮吹き' },
  { n: '熟女人妻', v: '熟女-人妻' },
  { n: '美少女·日', v: '美少女' },
  { n: '美臀', v: '美尻' },
  { n: '美腿', v: '美脚' },
  { n: '巨乳', v: '巨乳' },
  { n: '制服', v: '制服' },
  { n: '偷窥', v: '偷窥' },
  { n: '痴女', v: '痴女' },
  { n: '处男', v: '童貞' },
  { n: '乱交', v: '乱交' },
  { n: '萝莉', v: 'ロリ' },
  { n: '辣妹', v: 'ギャル' },
  { n: '自慰', v: 'オナニー' },
  { n: '1080p', v: '1080p' },
];

function filtersFor() {
  return { genre: [{ key: 'genre', name: '类型', value: GENRE_FILTER }] };
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
    await sleep(500);
  }
  return '';
}

// 仅 200 才回正文（master/变体清单用）
async function getText200(url, referer) {
  const opts = { headers: headers(referer), timeout: 15000, validateStatus: () => true };
  for (let i = 0; i < 2; i++) {
    try {
      const r = await req.get(url, opts);
      if (r && r.status === 200 && r.data) return String(r.data);
      if (r && r.status) return '';
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers: headers(referer) });
        if (r && r.ok) return await r.text();
        if (r) return '';
      }
    } catch (e) {}
    await sleep(400);
  }
  return '';
}

// get_link.php 只认表单 POST（application/x-www-form-urlencoded）
async function postForm(url, body, referer) {
  const opts = {
    headers: {
      'User-Agent': UA,
      'Referer': referer || (HOST + '/'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '*/*',
    },
    timeout: 15000,
    validateStatus: () => true,
  };
  for (let i = 0; i < 2; i++) {
    try {
      const r = await req.post(url, body, opts);
      if (r && r.status === 200 && r.data) return String(r.data);
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { method: 'POST', headers: opts.headers, body });
        if (r && r.ok) return await r.text();
      }
    } catch (e) {}
    await sleep(400);
  }
  return '';
}

// 列表卡片：<div class="post-entry-1"><a href="/<slug>" title="<CODE>">
//   <img src="https://javqw.com/u2/<hash>.jpg" ...>
function parseList(html) {
  const list = [];
  if (!html) return list;
  const re = /<div class="post-entry-1">[\s\S]*?<a href="(\/[^"]+)" title="([^"]*)">[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    let name = decodeEntities(m[2] || '').trim();
    const pic = m[3] || '';
    const slug = href.replace(/^\//, '').replace(/\/$/, '');
    if (!name) {
      // 回落：slug 转番号形（avgl-109-reduce-mosaic -> AVGL-109）
      const cm = slug.match(/^([a-z]+-\d+)/i);
      name = cm ? cm[1].toUpperCase() : slug.toUpperCase();
    }
    if (!pic) continue;
    list.push({
      vod_id: HOST + href,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: '',
    });
  }
  return list;
}

function parsePagecount(html) {
  if (!html) return 1;
  const pages = [];
  // 站内两种翻页形：/page/N（分类/genre）与 ?page=N / &page=N（搜索）
  const re = /(?:\/page\/|[?&]page=)(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) pages.push(parseInt(m[1], 10) || 1);
  if (!pages.length) return 1;
  return Math.max.apply(null, pages);
}

function listUrl(id, page, genre) {
  if (genre) {
    return HOST + '/genre/' + encodeURIComponent(genre) + (page > 1 ? '/page/' + page : '');
  }
  if (id === 'rm') {
    return HOST + '/search?s=' + encodeURIComponent('reducing mosaic') + (page > 1 ? '&page=' + page : '');
  }
  const path = PATH_BY_ID[id] || '/new-post';
  return HOST + path + (page > 1 ? '/page/' + page : '');
}

async function home() {
  const cls = CLASSES.map((c) => ({ type_id: c.type_id, type_name: c.type_name }));
  const filters = {};
  for (const c of CLASSES) filters[c.type_id] = filtersFor().genre;
  return { class: cls, filters };
}

async function category(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = String(body.id || body.tid || 'latest');
  const page = parseInt(body.page || 1, 10) || 1;
  const flt = body.filters || body.extend || {};
  const genre = t(flt.genre || (flt.genre && flt.genre.value) || (flt['genre'] && flt['genre'].value) || '');
  const html = await getHtml(listUrl(id, page, genre));
  const list = parseList(html);
  return {
    page,
    pagecount: parsePagecount(html),
    limit: 48,
    total: list.length,
    list,
  };
}

async function search(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const wd = t(body.wd || '');
  const page = parseInt(body.page || 1, 10) || 1;
  if (!wd) return { page, pagecount: 1, limit: 48, total: 0, list: [] };
  const html = await getHtml(HOST + '/search?s=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : ''));
  const list = parseList(html);
  return {
    page,
    pagecount: parsePagecount(html),
    limit: 48,
    total: list.length,
    list,
  };
}

// ---------- 播放链 ----------
// VidHide embed 页内 packed JS 解包（Dean Edwards packer，纯字符串替换）
// 注意：payload 内含单引号串（如 '28',），直接找第一个 "'," 会截断；
// 须逐个候选校验其后是 "<数字>,<数字>,'" 的参数形才算真正的 payload 尾。
function unpackPacked(html) {
  const s = String(html || '');
  const i = s.indexOf('eval(function(p,a,c,k,e,d){');
  if (i < 0) return '';
  const j = s.indexOf("}('", i);
  if (j < 0) return '';
  const pStart = j + 3;
  let k1 = -1;
  let a = 0;
  let c0 = 0;
  let kStr = '';
  let pos = pStart;
  while (true) {
    const q = s.indexOf("',", pos);
    if (q < 0) return '';
    const rest = s.slice(q + 2);
    const m = rest.match(/^(\d+),(\d+),'/);
    if (m) {
      k1 = q;
      a = parseInt(m[1], 10);
      c0 = parseInt(m[2], 10);
      kStr = rest.slice(m[0].length);
      break;
    }
    pos = q + 2;
  }
  const p = s.slice(pStart, k1);
  const kEnd = kStr.indexOf("'.split('|')");
  if (kEnd < 0) return '';
  const k = kStr.slice(0, kEnd).split('|');
  let out = p;
  let c = c0;
  while (c--) {
    if (k[c]) out = out.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
  }
  if (out.indexOf('hls2') < 0 && out.indexOf('jwplayer') < 0) return '';
  return out;
}

function labelOf(h) {
  if (h >= 1080) return '1080p';
  if (h >= 720) return '720p';
  if (h >= 480) return '480p';
  if (h > 0) return h + 'p';
  return '自适应';
}

// 从解包文本取 hls2 master 地址（绝对地址；仅作缓存参考，play()
// 绝不使用详情时缓存的地址，点播时现解现取）。hls2 形如
// "hls2":"/stream/.../master.m3u8"，或 jwplayer sources[0].file。
function masterFromEmbedHtml(html, embed) {
  const up = unpackPacked(html || '');
  if (!up) return '';
  let m = up.match(/"hls2"\s*:\s*"([^"]+)"/);
  let u = m ? m[1] : '';
  if (!u) {
    m = up.match(/"file"\s*:\s*"([^"]*master\.m3u8[^"]*)"/);
    u = m ? m[1] : '';
  }
  if (!u) return '';
  u = u.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === '/') {
    const om = String(embed || '').match(/^(https?:\/\/[^\/]+)/);
    return om ? om[1] + u : '';
  }
  return '';
}

// 变体/分片相对地址按基准地址补全（只用字符串拼接，不依赖 URL）
function absUrl(base, rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  const m = String(base || '').match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
  if (!m) return rel;
  if (rel.charAt(0) === '/') return m[1] + rel;
  const dir = (m[2] || '/').replace(/[^\/]*$/, '');
  return m[1] + dir + rel;
}

// 单个 VidHide embed -> 解包文本里 qualityLabels 的真实档位（只出
//   embed 页写明的档，不编造）+ hls2 master 地址（仅作缓存参考）。
async function labelsFromVidHide(embed, referer) {
  try {
    const html = await getHtml(embed, referer);
    if (!html) return { labels: [], master: '' };
    return { labels: labelsFromEmbedHtml(html), master: masterFromEmbedHtml(html, embed) };
  } catch (e) {
    return { labels: [], master: '' };
  }
}

// qualityLabels 在解包文本里是转义引号形：\'qualityLabels\':{\"2934\":\"1080p\",...}
function labelsFromEmbedHtml(html) {
  const up = unpackPacked(html || '');
  if (!up) return [];
  const m = up.match(/qualityLabels[^}]*\}/);
  if (!m) return [];
  const clean = m[0].replace(/\\"/g, '"').replace(/\\'/g, "'");
  const out = [];
  const seen = {};
  for (const mm of clean.matchAll(/"(\d+)"\s*:\s*"([^"]+)"/g)) {
    const label = labelOf(parseInt(mm[2].replace(/[^0-9]/g, ''), 10) || 0);
    if (!label || label === '自适应') continue;
    if (seen[label]) continue;
    seen[label] = true;
    out.push({ label, h: parseInt(mm[2].replace(/[^0-9]/g, ''), 10) || 0 });
  }
  out.sort((a, b) => b.h - a.h);
  return out;
}

const tierCache = new Map(); // durl -> {ts, v:{tiers, embed}}

// 详情页 -> {tiers:[{label,h}], embed, master}；10 分钟缓存
// （master 仅作缓存参考，play() 绝不用，点播时现解现取）
async function resolveTiers(durl) {
  const hit = tierCache.get(durl);
  if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.v;
  const res = { tiers: [], embed: '', master: '' };
  try {
    const html = await getHtml(durl);
    if (html) {
      const lm = html.match(/id="links" value="([^"]+)"/);
      if (lm) {
        const linksVal = lm[1];
        const nBtn = (html.match(/class="btn btn-server[^"]*"/g) || []).length;
        const nParts = linksVal.split(',,').length;
        const n = Math.max(nBtn, nParts, 1);
        for (let opt = 1; opt <= n; opt++) {
          let embed = '';
          try {
            const body = 'links=' + encodeURIComponent(linksVal) + '&option=' + opt;
            const r = (await postForm(HOST + '/get_link.php', body, durl)).trim();
            if (/^https?:\/\//i.test(r)) embed = r;
          } catch (e) {}
          if (!embed) continue;
          if (!res.embed) res.embed = embed;
          if (/earnvidjavgg\.xyz/i.test(embed)) {
            const r2 = await labelsFromVidHide(embed, durl);
            if (r2.labels.length) { res.tiers = r2.labels; if (r2.master) res.master = r2.master; break; }
          }
        }
      }
    }
  } catch (e) {}
  tierCache.set(durl, { ts: Date.now(), v: res });
  if (tierCache.size > 100) tierCache.delete(tierCache.keys().next().value);
  return res;
}

function slugCode(durl) {
  const slug = String(durl || '').replace(/\/$/, '').split('/').pop() || '';
  const cm = slug.match(/^([a-z]+-\d+)/i);
  return cm ? cm[1].toUpperCase() : slug.toUpperCase();
}

async function detail(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = t(body.id || '');
  if (!id) return { list: [] };
  const durl = id.indexOf('http') === 0 ? id : HOST + '/' + id.replace(/^\//, '');
  const html = await getHtml(durl);
  const title = decodeEntities((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim();
  const pic = (html.match(/<div class="information[\s\S]{0,2000}?<img[^>]*src="([^"]+)"/) || [])[1] || '';
  const dur = (html.match(/<span>(\d+)\s*Min\.<\/span>/) || [])[1] || '';
  const date = (html.match(/<b>([A-Z][a-z]{2}\. \d{1,2}, \d{4})<\/b>/) || [])[1] || '';
  const r = await resolveTiers(durl);
  let playUrl;
  if (r.tiers.length) {
    playUrl = r.tiers.map((x) => x.label + '$' + durl + '@' + x.label).join('#');
  } else {
    // 档位全死：只给站内 embed 行，play() 走 parse:1
    playUrl = '站内播放$' + durl + '@app';
  }
  const vod = {
    vod_id: durl,
    vod_name: title || slugCode(durl),
    vod_pic: pic,
    vod_remarks: [dur ? dur + ' Min.' : '', date].filter(Boolean).join(' '),
    vod_play_from: '正片',
    vod_play_url: playUrl,
  };
  try {
    subRegister([durl], vod);
  } catch (e) {}
  return { list: [vod] };
}

// 点播时现解现取（不要用详情时的缓存地址）：详情与点播可能隔几秒，
// 连接可能已断；embed 页与 master 必须在同一次 play() 调用内、同一
// 个 req 池里连续取——VidHide 的播单 token 只认取 embed 页的那个
// 出口 IP，换连接/换出口即 403。
async function resolveFresh(durl) {
  const out = { tiers: [], embed: '', master: '' };
  try {
    const html = await getHtml(durl);
    if (!html) return out;
    const lm = html.match(/id="links" value="([^"]+)"/);
    if (!lm) return out;
    const linksVal = lm[1];
    const nBtn = (html.match(/class="btn btn-server[^"]*"/g) || []).length;
    const nParts = linksVal.split(',,').length;
    const n = Math.max(nBtn, nParts, 1);
    for (let opt = 1; opt <= n; opt++) {
      let embed = '';
      try {
        const body = 'links=' + encodeURIComponent(linksVal) + '&option=' + opt;
        const r = (await postForm(HOST + '/get_link.php', body, durl)).trim();
        if (/^https?:\/\//i.test(r)) embed = r;
      } catch (e) {}
      if (!embed) continue;
      if (!out.embed) out.embed = embed;
      if (!/earnvidjavgg\.xyz/i.test(embed)) continue;
      let ehtml = '';
      try { ehtml = await getHtml(embed, durl); } catch (e) {}
      if (!ehtml) continue;
      const labels = labelsFromEmbedHtml(ehtml);
      const master = masterFromEmbedHtml(ehtml, embed);
      if (!master) continue;
      out.master = master;
      if (labels.length) out.tiers = labels;
      break;
    }
  } catch (e) {}
  return out;
}

// master 变体播单里按档位挑变体地址（相对地址按 master 所在目录补全；
// 点的档位不在播单里时回 ''，由调用方回 master 本身让播放器自适应）
function variantForTier(masterText, masterUrl, want) {
  const lines = String(masterText || '').split('\n');
  const vars = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    const rm = line.match(/RESOLUTION=(\d+)x(\d+)/);
    const h = rm ? parseInt(rm[2], 10) || 0 : 0;
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const u = lines[j].trim();
      if (!u) continue;
      if (u.charAt(0) === '#') continue;
      uri = u;
      break;
    }
    if (!uri) continue;
    vars.push({ label: labelOf(h), h, url: absUrl(masterUrl, uri) });
  }
  vars.sort((a, b) => b.h - a.h);
  if (!vars.length) return '';
  if (want) {
    for (const v of vars) { if (v.label === want) return v.url; }
    return '';
  }
  return vars[0].url;
}

// ---------------- 播单/分片本地代理（2026-11-15 v3：修 Reducing Mosaic 点播转圈） ----------------
// 病因（2026-11-15 坐实）：RM 重编码片的 hls2 走 dramiyos-cdn.com；播放器拿到播单后
// 卡在变体/分片取数上转圈（分片要 Referer 而 system 播放器不带，或该 CDN 拒播放器
// 请求）；用户手机 Safari 站内自带播放能播（2026-11-15 18:32 真机鉴别），内容本身
// 是活的。修法照抄 py_24jav / py_5lxtv 已证的本地代理模式：播单与分片全部经蜘蛛
// 本机代理取回，代理代带 Referer（嵌页地址），分片原样透传 video/mp2t + Range；
// 只对 dramiyos-cdn 的 master 走代理，acek-cdn（FNS-276 等普通片，现已能播）
// 保持 v2 原样直出，绝不回归。
// 地址形态同 24jav/5lxtv 先例：播放地址查询串形式 /proxy/m3u8?u=&r=（&m= 为父播单
// 地址，供取数失败时换 Referer 重试）；改写后的清单行一律用请求 Host 拼完整
// http:// 绝对地址；媒体清单的分片行走路径段形式并带 .ts 后缀（过 ffmpeg
// 分片后缀白名单）。分片是明文 TS，无 PNG 头，不剥头（与 5lxtv 同款直通）。
function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}

function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// 构造本地代理地址（js2p://_WEB_ 为 App 动态地址 scheme，同 24jav/5lxtv 先例：
// 查询串形式 /proxy/m3u8?u=&r=）
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}

async function fetchBytes(url, referer) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || (HOST + '/'), 'Accept': '*/*' },
      timeout: 30000,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (!r || r.status < 200 || r.status >= 300 || !r.data) return null;
    return Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
  } catch (e) {
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': referer || (HOST + '/') } });
        if (!r || !r.ok) return null;
        return Buffer.from(await r.arrayBuffer());
      }
    } catch (e2) {}
    return null;
  }
}

// 改写清单正文：# 行的 URI="..."（音频轨/密钥）与非 # 行（variant/分片）一律改指回本地代理。
// selfBase 是完整 http:// 绝对基址（同 24jav/5lxtv：取请求 Host 拼 http://<host>/spider/py_javtubs/3）。
// master 的 variant 行与音频/密钥 URI 行是子播单，走查询串形式 /proxy/m3u8?u=&r=&m=；
// 媒体清单的分片行走路径段形式并在末尾加 .ts 后缀（过 ffmpeg 分片后缀白名单；
// b64url 字母表无 '.'，后缀无歧义）。m= 是父播单地址：代理取数失败时换它作 Referer 再试一次。
function rewriteJavtubsM3u8(raw, playlistUrl, selfBase, referer) {
  const isMaster = String(raw).includes('#EXT-X-STREAM-INF');
  const lines = String(raw).split(/\r?\n/);
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try {
            const abs = new URL(uri, playlistUrl).toString();
            return `URI="${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}&m=${b64url(playlistUrl)}"`;
          } catch (e) { return all; }
        });
      }
      return line;
    }
    try {
      const abs = new URL(s, playlistUrl).toString();
      if (isMaster) return `${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}&m=${b64url(playlistUrl)}`;
      return `${selfBase}/proxy/${b64url(abs)}/${b64url(referer || '-')}/${b64url(playlistUrl)}.ts`;
    } catch (e) { return line; }
  });
  return out.join('\n');
}

// 代理入口（两种地址格式都接受）：
// 主格式（本版 play 发出）：/proxy/m3u8?u={b64url}&r={b64url}[&m={b64url 父播单}]，同 24jav/5lxtv 先例；
// 分片格式：/proxy/{b64url 目标}/{b64url referer}/{b64url 父播单}.ts。
// 取回的文本是 #EXTM3U 即按清单改写；否则按分片字节原样透传 video/mp2t（支持 Range）。
// 取数失败时：有父播单地址 m= 就换它作 Referer 再试一次；仍失败则 302 回源地址
// （播放器直取，等价于 v2 回落），绝不挂住播放器。
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  let uEnc = q.u || '';
  let rEnc = q.r || '';
  let mEnc = q.m || '';
  if (!uEnc) {
    const wild = request?.params && request.params['*'];
    let segs = [];
    if (wild) segs = String(wild).split('/').filter(Boolean);
    else {
      const rawPath = String((request?.raw && request.raw.url) || request?.url || '').split('?')[0];
      const pi = rawPath.indexOf('/proxy/');
      if (pi >= 0) segs = rawPath.slice(pi + 7).split('/').filter(Boolean);
    }
    // 分片行带 .ts 后缀（过 ffmpeg 分片后缀白名单）；b64url 无 '.'，剥后缀无歧义。
    if (segs.length && segs[segs.length - 1].endsWith('.ts')) {
      segs[segs.length - 1] = segs[segs.length - 1].slice(0, -3);
    }
    if (segs.length) { uEnc = segs[0]; rEnc = segs[1] || ''; mEnc = segs[2] || ''; }
  }
  if (!uEnc) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  let parent = '';
  try {
    target = unb64url(uEnc);
    if (rEnc && rEnc !== '-') referer = unb64url(rEnc) || referer;
    if (mEnc) parent = unb64url(mEnc) || '';
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  // 改写基址：同 24jav/5lxtv，用请求 Host 拼完整 http:// 绝对地址；无 Host 时退回
  // proxyUrl 拼出的 js2p:// 形式。
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  try {
    let buf = await fetchBytes(target, referer);
    if (!buf || !buf.length) {
      // 换父播单地址作 Referer 再试一次（dramiyos-cdn 可能认播单地址不认嵌页）
      if (parent && parent !== referer) buf = await fetchBytes(target, parent);
    }
    if (!buf || !buf.length) { reply.redirect(target); return; }
    const head = buf.subarray(0, Math.min(buf.length, 16)).toString('utf8');
    if (head.trimStart().startsWith('#EXTM3U')) {
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-cache');
      reply.send(rewriteJavtubsM3u8(buf.toString('utf8'), target, selfBase, referer));
      return;
    }
    // 分片：明文 TS 原样透传，不剥头；回 video/mp2t + Range。
    const range = request?.headers && request.headers.range;
    const m = range ? String(range).match(/bytes=(\d+)-(\d*)/) : null;
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Accept-Ranges', 'bytes');
    if (m) {
      const start = Math.min(parseInt(m[1], 10) || 0, buf.length);
      const end = m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
      if (start <= end) {
        reply.code(206);
        reply.header('Content-Range', 'bytes ' + start + '-' + end + '/' + buf.length);
        reply.send(buf.subarray(start, end + 1));
        return;
      }
    }
    reply.send(buf);
  } catch (e) {
    try { reply.redirect(target); } catch (e2) { /* 已发送则忽略 */ }
  }
}

async function play(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  let id = t(body.id || '');
  id = subNormKey(id);
  if (!id) return { parse: 1, url: '' };
  const at = id.lastIndexOf('@');
  let durl = id;
  let want = '';
  if (at > 0) {
    durl = id.slice(0, at);
    want = id.slice(at + 1);
  }
  if (durl.indexOf('http') !== 0) durl = HOST + '/' + durl.replace(/^\//, '');
  try {
    const fr = await resolveFresh(durl);
    // 嗅探行（详情时就没档位）或现解没拿到 master：回站内 embed
    if (want === 'app' || !fr.master) {
      return { parse: 1, url: fr.embed || durl };
    }
    // dramiyos-cdn（RM 重编码片）：走本地代理——播单与分片全由蜘蛛代取并带
    // Referer（嵌页），播放器只跟本机代理说话；代理取数失败时 302 回源地址。
    if (/dramiyos-cdn\.com/i.test(fr.master)) {
      let target = '';
      try {
        const mt = await getText200(fr.master, fr.embed);
        if (mt && mt.indexOf('#EXTM3U') >= 0) target = variantForTier(mt, fr.master, want) || fr.master;
      } catch (e) {}
      if (!target) target = fr.master;
      const proxied = proxyUrl(reqIn, '/proxy/m3u8', target, fr.embed);
      const pres = {
        parse: 0,
        url: proxied || target,
        header: { 'User-Agent': UA, 'Referer': fr.embed },
      };
      try {
        const subs = await subSearchAll(durl);
        if (subs && subs.length) pres.subs = subs;
      } catch (e) {}
      return pres;
    }
    // acek-cdn（普通片，现已能播）：v2 原样直出，一字不动。
    // master 现取：必须与 embed 页同一次调用、同一 req 池连续取，
    // token 只认取 embed 页的出口 IP（Referer: embed，15 秒超时）。
    let url = '';
    try {
      const mt = await getText200(fr.master, fr.embed);
      if (mt && mt.indexOf('#EXTM3U') >= 0) url = variantForTier(mt, fr.master, want);
    } catch (e) {}
    // 变体没取到（VM 出口轮换/403）：把 master 本身交给播放器试一次，
    // 手机侧 spider 与播放器同出口 IP，token 是通的。
    if (!url) url = fr.master;
    const res = {
      parse: 0,
      url,
      header: { 'User-Agent': UA, 'Referer': fr.embed },
    };
    try {
      const subs = await subSearchAll(durl);
      if (subs && subs.length) res.subs = subs;
    } catch (e) {}
    return res;
  } catch (e) {
    return { parse: 1, url: durl };
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
    const warmKey = vod.vod_id ? String(vod.vod_id) : (eps[0] || '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}

// ---------------- 字幕聚合 (Layer A 重写, 2026-10-23) ----------------
// 按用户自有迅雷看看 REX 组件 (xunlei.subtitle) 的方法重写: 旧版把
// [番号, 全标题, 番号+标题] 多个键的召回合并成一池只排序不过滤,
// 全标题键的模糊召回灌进大量别片字幕 (实测 JUR-887 全标题键池
// 前排即 JUX-021 等别片), 且迅雷档位恒占满上限 10, SubtitleCat
// 永远挤不进来。新版三招 (与组件一致):
// (a) 键序逐个查、首个有结果的键即停 — 番号键命中的池小而准;
// (b) 命中后严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可)
//     或片名全文, 不含的全扔, 无回退;
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

// JavTubs URL 形如 https://javtubs.com/fns-276 或 /avgl-109-reduce-mosaic
function subSlugTitle(durl) {
  const slug = (String(durl || '').replace(/\/$/, '').split('/').pop() || '');
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
// 形) 或片名全文, 否则扔掉。片名分支必须守非空。
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
// 有结果的键即停; 命中池只过严过滤、无任何回退。
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
// 与详情页的解析链并行跑, 用户点播时 play 直接命中缓存/在途。
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
      fastify.get('/proxy/*', m3u8Proxy);
      fastify.get('/proxy/m3u8', m3u8Proxy);
      fastify.post('/search', search);
    },
}