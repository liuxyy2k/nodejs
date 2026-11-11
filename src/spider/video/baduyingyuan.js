import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// 八度影院 badyi.cc —— 蜘蛛插件（meta.type = 3）
//
//   站点：模板站（shipin1），列表/详情是服务端渲染 HTML，搜索和播放走 JSON 接口
//   列表：/page/N（最新）  /c{分类ID}/page/N（分类）
//   详情：/video/{数字ID}
//   播放：/api/video.php?id={ID} → { ok, url }  →  CloudFront 上的 AES-128 HLS
//   搜索：/api/search.php?q=&page=&per=  → { ok, total, page, pages, articles[] }
//
//   两个必须知道的事：
//   1) 站点没有 UA 直接断连（curl 返回 000），所有请求都得带浏览器 UA。
//   2) 片源 CDN 域名会轮换，页面里 og:video 写的可能是**已经死掉的旧域名**，
//      播放地址必须实时走 /api/video.php 拿，不能缓存死了的 host。
// ═══════════════════════════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const EXT = {
    site:      '',            // 换镜像域名用
    proxy:     'direct',      // direct | m3u8 | all
    proxyHost: '',            // 壳子内部地址，播放器访问不到时手填
    ttl:       300,           // 缓存秒数
    timeout:   15000,
    pageSize:  12,            // 站点固定 12 条/页（上限就是 12）
    cats:      60,            // 分类树最多放多少个
    imgMode:   'mirror',      // mirror(图床，浏览器可直接显示) | site(站点 302)
};

const DEFAULTS = { ...EXT };

const meta = { key: 'badyi', name: '💋八度影院', type: 3 };

const site = () => (EXT.site || 'https://badyi.cc').replace(/\/+$/, '');

const headers = () => ({
    'User-Agent':      UA,
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer':         site() + '/',
});

function applyExt(inReq) {
    Object.assign(EXT, DEFAULTS);
    let ext = inReq && inReq.body && inReq.body.ext;
    if (typeof ext === 'string') { try { ext = JSON.parse(ext); } catch (e) { ext = null; } }
    if (ext && typeof ext === 'object') {
        for (const k of Object.keys(ext)) {
            if (ext[k] !== undefined && ext[k] !== null && ext[k] !== '') EXT[k] = ext[k];
        }
    }
    return EXT;
}

// ─── 缓存 ─────────────────────────────────────────────────────────────────────
const cache = new Map();
const CMAX  = 600;
function cget(k) {
    const e = cache.get(k);
    if (!e) return null;
    if (Date.now() > e.exp) { cache.delete(k); return null; }
    return e.v;
}
function cset(k, v, ttlSec) {
    if (cache.size > CMAX) {
        const now = Date.now();
        for (const [kk, vv] of cache) if (now > vv.exp) cache.delete(kk);
        if (cache.size > CMAX) cache.delete(cache.keys().next().value);
    }
    cache.set(k, { v, exp: Date.now() + (ttlSec || EXT.ttl) * 1000 });
    return v;
}

// ─── 请求 ─────────────────────────────────────────────────────────────────────
async function request(reqUrl, opt = {}) {
    let lastErr;
    for (let i = 0; i < 2; i++) {
        try {
            const r = await axios.get(reqUrl, {
                headers:     { ...headers(), ...(opt.headers || {}) },
                timeout:     opt.timeout || EXT.timeout,
                responseType: opt.type || 'text',
                // 站点对不存在的视频返回 404，交给调用方判断
                validateStatus: s => s >= 200 && s < 400,
                maxRedirects: 5,
                transformResponse: opt.type === 'arraybuffer' ? undefined : (d => d),
            });
            return r.data;
        } catch (e) {
            lastErr = e;
            if (i === 0) await new Promise(r => setTimeout(r, 320));
        }
    }
    throw lastErr;
}

async function getJSON(url, opt = {}) {
    const r = await axios.get(url, {
        headers: { ...headers(), ...(opt.headers || {}) },
        timeout: opt.timeout || EXT.timeout,
        validateStatus: () => true,
    });
    const d = r.data;
    if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return null; } }
    return d;
}

// ─── 小工具 ───────────────────────────────────────────────────────────────────
function unesc(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/\s+/g, ' ').trim();
}
function stripTags(s) {
    return unesc(String(s || '').replace(/<[^>]*>/g, ' '));
}
function absUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('/')) return site() + s;
    return site() + '/' + s;
}
// 图片统一走固定图床：站点 /media/image/... 会 302 到轮换的 CDN 域名，
// 浏览器内核（WebView/Chromium）拿到 302 那一跳会偶发 ERR_HTTP2_PROTOCOL_ERROR，
// 实测图床域名 dfdf.tjacq.com（站点自己在 ld+json 里配的）浏览器直接就能显示。
// 图床偶有没同步的新图（403），所以留 imgMode 可切。
const IMG_HOST = 'https://dfdf.tjacq.com';
function pic(u) {
    if (!u) return '';
    const s = absUrl(u);
    if (String(EXT.imgMode || 'mirror').toLowerCase() === 'site') return s;
    const m = s.match(/\/media\/image\/(.+)$/);
    return m ? IMG_HOST + '/image/' + m[1] : s;
}
function b64e(s) { return Buffer.from(s, 'utf8').toString('base64url'); }
function b64d(s) { try { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); } catch (e) { return ''; } }

function fmtDur(sec) {
    const n = Math.round(Number(sec) || 0);
    if (!n) return '';
    const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
    const p = x => String(x).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

// ─── 列表解析 ─────────────────────────────────────────────────────────────────
// 卡片结构（列表页 / 分类页 / 相关文章 全部一致）：
//   <a href="/video/307877" class="nav-art-card" itemscope ...>
//     <meta itemprop="datePublished" content="2026-11-11">
//     <meta itemprop="image" content="/media/image/...">
//     <div class="nav-card-topbar">...<span class="nav-card-cat">cosplay</span></div>
//     <div class="nav-card-cover"><div class="nc-img"><img src="..." alt="标题"></div>...
//     <div class="nav-card-overlay"><h2>标题</h2></div>
//   </a>
function parseCards(html) {
    const out = [];
    if (!html) return out;
    const re = /<a href="(\/video\/(\d+))"\s+class="nav-art-card"[\s\S]*?<\/a>/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(html))) {
        const block = m[0];
        const id = m[2];
        if (seen.has(id)) continue;
        seen.add(id);

        const date = (block.match(/itemprop="datePublished"\s+content="([^"]*)"/) || [])[1] || '';
        const img  = (block.match(/itemprop="image"\s+content="([^"]*)"/) || [])[1]
                  || (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
        const catL = stripTags((block.match(/<span class="nav-card-cat">([\s\S]*?)<\/span>/) || [])[1] || '');
        let title  = stripTags((block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '');
        if (!title) {
            const alt = (block.match(/<img[^>]+alt="([^"]*)"/) || [])[1] || '';
            title = unesc(alt.replace(/&quot;/g, '"'));
        }
        out.push({ id, date, img, cat: catL, title });
    }
    return out;
}

// 分页控件：<span class="nav-pg-info">2 / 20</span>
function parsePager(html, fallbackPage) {
    const m = String(html || '').match(/nav-pg-info">\s*(\d+)\s*\/\s*(\d+)\s*</);
    if (m) return { page: parseInt(m[1], 10) || fallbackPage || 1, pagecount: parseInt(m[2], 10) || 1 };
    return { page: fallbackPage || 1, pagecount: fallbackPage || 1 };
}

function toVod(c) {
    return {
        vod_id:       c.id,
        vod_name:     c.title || '',
        vod_pic:      pic(c.img),
        vod_remarks:  c.cat || '',
        vod_year:     (c.date || '').slice(0, 4),
        vod_area:     '',
        vod_lang:     '',
        vod_actor:    '',
        vod_director: '',
        type_name:    c.cat || '',
        vod_content:  c.title || '',
        vod_pubdate:  c.date || '',
    };
}

// ─── 分类 ─────────────────────────────────────────────────────────────────────
// 首页导航那 10 个分类是固定的（三次请求 md5 一致）
async function getNavCats() {
    const hit = cget('navcats');
    if (hit) return hit;
    try {
        const html = await request(site() + '/');
        const out = [];
        const seen = new Set();
        const re = /href="\/c(\d+)"[^>]*>([^<]{1,30})</g;
        let m;
        while ((m = re.exec(html))) {
            const id = m[1], name = unesc(m[2]);
            if (!name || seen.has(id)) continue;
            seen.add(id);
            out.push({ type_id: 'c' + id, type_name: name });
        }
        return cset('navcats', out, 3600);
    } catch (e) {
        return [];
    }
}

// 全站 572 个分类，抓 /tags 前几页凑够 EXT.cats 个
async function getAllCats() {
    const hit = cget('allcats');
    if (hit) return hit;
    const want = Math.max(20, Number(EXT.cats) || 60);
    const out = [];
    const seen = new Set();
    try {
        for (let pg = 1; pg <= 4 && out.length < want; pg++) {
            const url = pg === 1 ? `${site()}/tags` : `${site()}/tags/page/${pg}`;
            const html = await request(url);
            const re = /<a href="\/c(\d+)" class="tag-btn">([^<]{1,40})<\/a>/g;
            let m;
            while ((m = re.exec(html))) {
                const id = m[1], name = unesc(m[2]);
                if (!name || seen.has(id)) continue;
                seen.add(id);
                out.push({ type_id: 'c' + id, type_name: name });
                if (out.length >= want) break;
            }
        }
    } catch (e) { /* 拿多少算多少 */ }
    return cset('allcats', out, 3600);
}

// 分类 id 容错：c108 / 108 / cosplay / 中文名 / 完整 URL
async function resolveCat(tid) {
    const raw = String(tid == null ? '' : tid).trim();
    if (!raw) return null;
    let m;

    if ((m = raw.match(/\/c(\d+)/i)))  return 'c' + m[1];
    if ((m = raw.match(/^c(\d+)$/i)))  return 'c' + m[1];
    if (/^\d+$/.test(raw))             return 'c' + raw;

    // 中文名 / 英文名 → 查表
    const all = [...(await getNavCats()), ...(await getAllCats())];
    const hit = all.find(c => c.type_name === raw || c.type_id === raw
        || c.type_name.toLowerCase() === raw.toLowerCase());
    return hit ? hit.type_id : null;
}

// ─── 详情 ─────────────────────────────────────────────────────────────────────
function normId(id) {
    const raw = String(id == null ? '' : id).trim();
    if (!raw) return '';
    let m;
    if ((m = raw.match(/^https?:\/\/[^/]+\/video\/(\d+)/i))) return m[1];
    if ((m = raw.match(/\/video\/(\d+)/i)))                   return m[1];
    if ((m = raw.match(/^video[-_]?(\d+)$/i)))                return m[1];
    if (/^\d+$/.test(raw))                                    return raw;
    return '';
}

async function getDetail(id) {
    const vid = normId(id);
    if (!vid) return null;
    const key = 'd:' + vid;
    const hit = cget(key);
    if (hit) return hit;

    let html;
    try {
        html = await request(`${site()}/video/${vid}`);
    } catch (e) {
        return null;
    }
    if (!html || !/class="watch-title"/.test(html)) return null;

    const title  = stripTags((html.match(/<h1[^>]*class="watch-title"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
    const cover  = (html.match(/itemprop="thumbnailUrl"\s+content="([^"]*)"/) || [])[1] || '';
    const dateRaw = (html.match(/<time[^>]*itemprop="datePublished"[^>]*datetime="([^"]*)"/) || [])[1]
                 || (html.match(/itemprop="datePublished"[^>]*datetime="([^"]*)"/) || [])[1] || '';
    const ogImg  = (html.match(/<meta property="og:image" content="([^"]*)"/) || [])[1] || '';

    // 主分类在面包屑第二个链接
    const crumb = html.match(/article-breadcrumb[\s\S]{0,600}?<\/div>/);
    let catId = '', catName = '';
    if (crumb) {
        const cs = [...crumb[0].matchAll(/<a href="\/c(\d+)">([^<]+)<\/a>/g)];
        if (cs.length) { catId = 'c' + cs[0][1]; catName = unesc(cs[0][2]); }
    }
    if (!catName) {
        const wc = html.match(/<span class="wm-cat">([\s\S]*?)<\/span>/);
        if (wc) catName = stripTags(wc[1]);
    }

    const tags = [...html.matchAll(/<span class="article-tag">([^<]+)<\/span>/g)].map(m => unesc(m[1])).filter(Boolean);

    // 简介：watch-body 里的正文文本（去掉图片）
    let desc = '';
    const body = html.match(/<div class="watch-body"[^>]*>([\s\S]*?)<\/div>/);
    if (body) desc = stripTags(body[1].replace(/<img[^>]*>/g, ' ')).slice(0, 800);
    if (!desc) desc = title;

    // 相关视频（详情页尾部「相关文章」）
    let related = [];
    const ri = html.indexOf('相关文章');
    if (ri > 0) related = parseCards(html.slice(ri)).slice(0, 12);

    const data = {
        // 这里存**原始**站点地址，pic() 放到输出时再做，否则切 imgMode 会被缓存挡住
        id: vid, title, cover: absUrl(cover || ogImg), date: (dateRaw || '').slice(0, 10),
        catId, catName, tags, desc, related,
    };
    return cset(key, data);
}

// ─── 播放地址：实时走接口，避免拿到死掉的 CDN 域名 ──────────────────────────────
async function getPlayUrl(id) {
    const vid = normId(id);
    if (!vid) return null;
    const key = 'p:' + vid;
    const hit = cget(key);
    if (hit) return hit;

    const j = await getJSON(`${site()}/api/video.php?id=${encodeURIComponent(vid)}`);
    if (!j || !j.ok || !j.url) return null;
    return cset(key, j.url, Math.min(Number(EXT.ttl) || 300, 600));
}

// ─── 路由 ─────────────────────────────────────────────────────────────────────
async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    applyExt(inReq);
    const nav = await getNavCats();
    const all = await getAllCats();
    const seen = new Set(nav.map(c => c.type_id));
    const classes = [{ type_id: 'latest', type_name: '最新更新' }];
    for (const c of nav) classes.push(c);
    for (const c of all) {
        if (seen.has(c.type_id)) continue;
        seen.add(c.type_id);
        classes.push(c);
    }

    let list = [];
    try {
        const html = await request(site() + '/');
        list = parseCards(html).map(toVod);
    } catch (e) { /* ignore */ }

    // 分区：最新 + 前几个热门分类各给一屏
    const sections = [];
    if (list.length) sections.push({ type_id: 'latest', type_name: '最新更新', list });
    for (const c of nav.slice(0, 4)) {
        try {
            const html = await request(`${site()}/${c.type_id}`);
            const l = parseCards(html).map(toVod);
            if (l.length) sections.push({ type_id: c.type_id, type_name: c.type_name, list: l });
        } catch (e) { /* ignore */ }
    }

    return { class: classes, filters: {}};
}

async function category(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const tid  = String(body.id != null ? body.id : (body.tid != null ? body.tid : 'latest'));
    const pg   = Math.max(1, parseInt(body.page, 10) || 1);

    let url;
    const cat = await resolveCat(tid);
    if (!cat || tid === 'latest' || tid === 'home' || tid === '') {
        if (tid && tid !== 'latest' && tid !== 'home' && tid !== '' && !cat) {
            return { page: pg, pagecount: 0, limit: 0, total: 0, list: [] };
        }
        url = pg === 1 ? `${site()}/` : `${site()}/page/${pg}`;
    } else {
        url = pg === 1 ? `${site()}/${cat}` : `${site()}/${cat}/page/${pg}`;
    }

    const key = 'c:' + url;
    const hit = cget(key);
    if (hit) return hit;

    let html = '';
    try { html = await request(url); } catch (e) { html = ''; }
    if (!html) return { page: pg, pagecount: 0, limit: 0, total: 0, list: [] };

    const cards = parseCards(html);
    const pgInfo = parsePager(html, pg);
    // 越界页站点会夹到最后一页，这里按实际页码回
    const list = cards.map(toVod);
    const result = {
        page:      pgInfo.page,
        pagecount: pgInfo.pagecount,
        limit:     EXT.pageSize,
        total:     pgInfo.pagecount * EXT.pageSize,
        list,
    };
    return cset(key, result);
}

async function detail(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const id = body.id != null ? body.id : body.ids;
    const d = await getDetail(id);
    if (!d) return { list: [] };

    // 播放地址：实时取（CDN 域名会轮换）
    let m3u8 = '';
    try { m3u8 = (await getPlayUrl(d.id)) || ''; } catch (e) { m3u8 = ''; }

    const vod = {
        vod_id:       d.id,
        vod_name:     d.title,
        vod_pic:      pic(d.cover),
        vod_content:  d.desc,
        vod_remarks:  d.date,
        vod_year:     (d.date || '').slice(0, 4),
        vod_area:     '',
        vod_lang:     '',
        vod_actor:    d.tags.join(','),
        vod_director: '',
        type_name:    d.catName || '',
        vod_pubdate:  d.date || '',
        vod_play_from: '八度',
        vod_play_url:  m3u8 ? `线路1$${m3u8}` : '',
    };
    if (d.tags.length) vod.vod_tag = d.tags.join(',');

    return { list: [vod] };
}

// 拼出播放器能访问的插件根地址（带壳子的路由前缀，如 /spider/badyi/3）
function proxyBase(inReq) {
    if (EXT.proxyHost) return String(EXT.proxyHost).replace(/\/+$/, '');

    const h = (inReq && inReq.headers) || {};
    let host = h['x-forwarded-host'] || h.host || h[':authority'] || '';
    if (host && host.includes(',')) host = host.split(',')[0].trim();
    if (!host) return '';

    let proto = String(h['x-forwarded-proto'] || '').split(',')[0].trim();
    if (!proto) proto = h['x-forwarded-ssl'] === 'on' ? 'https' : 'http';

    // 从这次请求的路径反推前缀：/spider/badyi/3/play → /spider/badyi/3
    const full = String(h['x-forwarded-prefix'] || h['x-original-uri'] || inReq.url || '');
    let prefix = '';
    const m = full.match(/^(\/spider\/[^/]+\/\d+)/);
    if (m) prefix = m[1];
    else if (inReq && inReq.routerPath && inReq.routerPath.startsWith('/spider/')) {
        prefix = inReq.routerPath.replace(/\/(play|detail|category|home|search|init|debug)\/?$/, '');
    } else prefix = '/spider/badyi/3';

    return `${proto}://${host}${prefix}`;
}

async function play(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    let id = String(body.id != null ? body.id : '');
    let header = { 'User-Agent': UA, 'Referer': site() + '/' };

    // 入参可能是：纯 id / 完整 URL / "线路1$https://..." / "线路1$$https://..."
    if (id.includes('$$')) id = id.slice(id.lastIndexOf('$$') + 2);
    else if (!/^https?:\/\//i.test(id) && id.includes('$')) id = id.slice(id.lastIndexOf('$') + 1);
    id = id.trim();

    let m3u8 = '';
    if (/^https?:\/\//i.test(id)) m3u8 = id;                 // 详情给的直链，直接用
    else m3u8 = (await getPlayUrl(id)) || '';                // 纯 id，实时取

    if (!m3u8) return { parse: 1, url: '' };

    const reqExt = body.ext || {};
    const mode = String(reqExt.proxy || EXT.proxy || DEFAULTS.proxy || 'direct').toLowerCase();
    const base = proxyBase(inReq);

    // direct：CDN 带 CORS 全开 + key 是相对根路径，播放器能直接吃
    if (mode === 'direct' || !base) {
        return { parse: 0, url: m3u8, header };
    }
    return {
        parse: 0,
        url: `${base}/proxy/stream?u=${b64e(m3u8)}&m=${encodeURIComponent(mode)}`,
        header,
    };
}

async function search(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const wd = String(body.wd != null ? body.wd : (body.key != null ? body.key : (body.id != null ? body.id : ''))).trim();
    const pg = Math.max(1, parseInt(body.pg != null ? body.pg : (body.page != null ? body.page : 1), 10) || 1);
    if (!wd) return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };

    const key = `s:${wd}:${pg}`;
    const hit = cget(key);
    if (hit) return hit;

    const j = await getJSON(`${site()}/api/search.php?q=${encodeURIComponent(wd)}&page=${pg}&per=${EXT.pageSize}`);
    if (!j || !j.ok) return { page: pg, pagecount: 0, limit: 0, total: 0, list: [] };

    const list = (j.articles || []).map(a => toVod({
        id:    String(a.id || ''),
        title: a.title || '',
        img:   a.img || a.thumb || '',
        cat:   (a.tags && a.tags[0]) || '',
        date:  a.date || '',
    }));

    const result = {
        page:      j.page || pg,
        pagecount: j.pages || 1,
        limit:     EXT.pageSize,
        total:     j.total || list.length,
        list,
    };
    return cset(key, result);
}

// ─── 自检口 ───────────────────────────────────────────────────────────────────
async function debug(inReq, _outResp) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const id = String(body.id != null ? body.id : '307877');
    const out = { id, site: site(), mode: EXT.proxy };

    const d = await getDetail(id);
    if (!d) return { ...out, detail: 'FAIL', error: '详情页拿不到，站点改版或 id 不对' };
    out.detail      = 'OK';
    out.title       = d.title;
    out.cover       = d.cover;
    out.date        = d.date;
    out.cat         = d.catName;
    out.tags        = d.tags.length;

    const m3u8 = await getPlayUrl(d.id);
    if (!m3u8) return { ...out, play: 'FAIL', error: '/api/video.php 没给地址' };
    out.play   = 'OK';
    out.m3u8   = m3u8;
    out.m3u8_host = (m3u8.match(/^https?:\/\/([^/]+)/) || [])[1] || '';

    try {
        const t0 = Date.now();
        const mBody = await request(m3u8);
        out.m3u8_status = 'OK';
        out.m3u8_ms     = Date.now() - t0;
        const lines = String(mBody).split('\n');
        const segs  = lines.filter(l => /^https?:\/\//.test(l.trim()));
        out.segments  = segs.length;
        out.encrypted = /AES-128/.test(mBody);
        const keyUri = (String(mBody).match(/URI="([^"]+)"/) || [])[1] || '';
        out.key_uri  = keyUri;
        // KEY 的相对路径（/keyhome/video.key）是相对 **m3u8 所在 CDN**，不是站点
        let keyAbs = '';
        try { keyAbs = keyUri ? new URL(keyUri, m3u8).toString() : ''; } catch (e) { keyAbs = ''; }
        out.key_host = keyAbs ? (keyAbs.match(/^https?:\/\/([^/]+)/) || [])[1] || '' : '';
        if (keyAbs) {
            const kb = await request(keyAbs, { type: 'arraybuffer' });
            out.key_status = 'OK';
            out.key_bytes  = Buffer.from(kb).length;
        }
        if (segs.length) {
            const seg = segs[0].trim();
            const r = await axios.get(seg, {
                headers: { ...headers(), Range: 'bytes=0-15' },
                timeout: EXT.timeout, responseType: 'arraybuffer', validateStatus: () => true,
            });
            const buf = Buffer.from(r.data);
            out.segment_status    = r.status;
            out.segment_first_byte = '0x' + buf[0].toString(16).padStart(2, '0');
            out.segment_is_ts     = buf[0] === 0x47 ? 'clean TS' : '加密分片（AES-128，正常）';
        }
    } catch (e) {
        out.m3u8_status = 'FAIL';
        out.m3u8_error  = e.message;
    }

    // 搜索链路
    try {
        const s = await search({ body: { wd: body.wd || '少女', page: 1 }, headers: inReq.headers }, null);
        out.search = s.list.length ? `OK ${s.total}条/${s.pagecount}页` : 'EMPTY';
    } catch (e) {
        out.search = 'FAIL ' + e.message;
    }
    return out;
}

// ─── 代理转发（m3u8 / all 模式用） ─────────────────────────────────────────────
function isPrivateHost(host) {
    return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1)/i.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

// 把 m3u8 里的分片地址 / key 地址都换成走本插件的地址
function rewriteM3u8(body, baseUrl, proxyBaseUrl, mode) {
    const origin = (() => { try { return new URL(baseUrl).origin; } catch (e) { return ''; } })();
    const wrap = (u) => {
        const abs = /^https?:\/\//i.test(u) ? u : (u.startsWith('/') ? origin + u : new URL(u, baseUrl).toString());
        return `${proxyBaseUrl}/proxy/stream?u=${b64e(abs)}&m=${encodeURIComponent(mode)}`;
    };
    return String(body).split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
            // URI="..." 可能是 key、也可能是子清单
            return line.replace(/URI="([^"]+)"/gi, (m0, u) => `URI="${wrap(u)}"`);
        }
        if (mode === 'all') return wrap(t);      // 分片也走代理
        return t;                                // m3u8 模式：只代理清单，分片直连 CDN
    }).join('\n');
}

async function proxyStream(req, reply) {
    const q = (req && req.query) || {};
    const target = b64d(q.u);
    const mode = String(q.m || 'm3u8').toLowerCase();

    if (!target || !/^https?:\/\//i.test(target)) {
        reply.code(400).send('bad target');
        return;
    }
    let host = '';
    try { host = new URL(target).hostname; } catch (e) { host = ''; }
    if (!host || isPrivateHost(host)) {
        reply.code(403).send('forbidden');
        return;
    }

    let up;
    try {
        up = await axios.get(target, {
            headers:      { ...headers(), ...(req.headers && req.headers.range ? { Range: req.headers.range } : {}) },
            timeout:      Math.max(Number(EXT.timeout) || 15000, 25000),
            responseType: 'arraybuffer',
            validateStatus: () => true,
            maxRedirects: 5,
            decompress:   false,
        });
    } catch (e) {
        reply.code(502).send('upstream error');
        return;
    }

    const ct  = String((up.headers && up.headers['content-type']) || '');
    const buf = Buffer.from(up.data);

    // 上游报错（4xx/5xx）原样透传，别当成清单去重写
    if (up.status >= 400) {
        reply.code(up.status);
        reply.header('content-type', ct || 'text/plain');
        reply.send(buf);
        return;
    }

    // 只认真清单才重写：#EXTM3U 开头。
    // KEY 是 16 字节任意二进制（可能带 0x0a），当文本 split/join 会直接弄坏解密，
    // 所以非清单一律按二进制原样透传。
    const isM3u8 = /^#EXTM3U/.test(buf.slice(0, 16).toString('utf8'));

    // 分片 / KEY：原样透传（含 206 / Content-Range）
    if (!isM3u8) {
        reply.code(up.status);
        if (up.headers['content-range'])  reply.header('content-range', up.headers['content-range']);
        if (up.headers['accept-ranges'])  reply.header('accept-ranges', up.headers['accept-ranges']);
        if (up.headers['content-length']) reply.header('content-length', up.headers['content-length']);
        reply.header('content-type', ct || 'application/octet-stream');
        reply.header('access-control-allow-origin', '*');
        reply.send(buf);
        return;
    }

    const base = proxyBase(req);
    const text = rewriteM3u8(buf.toString('utf8'), target, base, mode);
    reply.header('content-type', 'application/vnd.apple.mpegurl');
    reply.header('access-control-allow-origin', '*');
    reply.header('cache-control', 'no-cache');
    reply.send(text);
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default {
    meta,
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.post('/debug',    debug);
        fastify.get('/proxy/stream', proxyStream);
    },
};
