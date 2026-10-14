import { load } from 'cheerio';
import req from '../../util/req.js';

/* ==========================================================================
 *  JAV Verse  ·  https://javverse.com
 *  日本成人影片资料库(番号 / 女优 / 片商 / 类别 / 发售时间线)
 *  ---------------------------------------------------------------------
 *  说明:
 *   1. 列表页是服务端直出,卡片用 cheerio 取;搜索结果有一部分在 RSC 流里,
 *      所以列表解析做成了「HTML 优先 + RSC 兜底」两条腿。
 *   2. 详情页的资料(出演者 / 时长 / 片商 / 类别 / 剧照)在 RSC 流里,
 *      从 self.__next_f.push 里抽出来。
 *   3. 片源走站内播放接口 /api/video/sessions(线路1)与 /api/video/line2(线路2),
 *      这两个接口需要登录态。把 JAV Verse 账号的 Cookie 填到 ext.cookie 里即可播。
 *      没填 Cookie 时仍然能正常浏览全部资料(番号 / 封面 / 出演者 / 类别 / 剧照)。
 * ========================================================================== */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://javverse.com';

// 登录 Cookie(整串,从浏览器 F12 -> Application -> Cookies 里复制)。也可以走 ext.cookie 传进来。
let cookie = '';

function headers(referer = `${site}/`) {
    const h = {
        'User-Agent': UA,
        Referer: referer,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        Connection: 'keep-alive',
    };
    if (cookie) h.Cookie = cookie;
    return h;
}

function abs(u) {
    if (!u) return '';
    const s = String(u).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : `/${s}`);
}

async function getHtml(url) {
    const resp = await req.get(url, { headers: headers() });
    return resp.data;
}

/* --------------------------------------------------------------------------
 *  RSC(Next.js App Router)流式数据 → 纯文本
 *  页面里 self.__next_f.push([1,"..."]) 里塞的是转义过的 JSON 字符串,
 *  还原出来之后所有字段都能用普通正则捞。
 * ------------------------------------------------------------------------ */
function flightText(html) {
    const src = String(html || '');
    const out = [];
    const re = /self\.__next_f\.push\(\[\s*\d+\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g;
    let m;
    while ((m = re.exec(src))) {
        try {
            out.push(JSON.parse(`"${m[1]}"`));
        } catch (e) {
            out.push(
                m[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\\\/g, '\\')
            );
        }
    }
    return out.join('\n');
}

/* --------------------------------------------------------------------------
 *  列表解析
 * ------------------------------------------------------------------------ */
function pickTitle(el) {
    const t = el.find('h3').text().trim();
    if (t) return t;
    return el.find('.ready-who').text().trim();
}

function parseByHtml(html) {
    const $ = load(String(html || ''));
    const list = [];
    $('a.work-card').each((_, node) => {
        const el = $(node);
        const href = el.attr('href') || '';
        const m = href.match(/\/work\/(\d+)/);
        if (!m) return;
        const plate = el.find('.work-card-code .code-plate').first();
        const code =
            plate.attr('aria-label') ||
            `${el.find('.code-plate-prefix').first().text().trim()}${el.find('.code-plate-number').first().text().trim()}`;
        const who = el.find('.ready-who').first().text().trim();
        const date = el.find('.work-card-bottom span').first().text().trim();
        const ready = el.find('.is-ready').length > 0;
        const remarks = [who, date, ready ? '有资源' : ''].filter(Boolean).join(' · ');
        const head = pickTitle(el);
        const name = head ? (code && !head.includes(code) ? `${code} ${head}` : head) : code || `作品 ${m[1]}`;
        list.push({
            vod_id: `/work/${m[1]}`,
            vod_name: name,
            vod_pic: el.find('img').first().attr('src') || '',
            vod_remarks: remarks,
        });
    });
    return list;
}

function parseByFlight(html) {
    const text = flightText(html);
    if (!text) return [];
    const list = [];
    const re = /"className":"work-card","workId":(\d+),"cover":"([^"]*)"/g;
    const marks = [];
    let m;
    while ((m = re.exec(text))) marks.push({ at: m.index, id: m[1], pic: m[2] });
    marks.forEach((mk, i) => {
        const seg = text.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : mk.at + 4000);
        const code = (seg.match(/"code":"([^"]*)"/) || [])[1] || '';
        const title = (seg.match(/"h3",null,\{[^{}]*"children":"((?:[^"\\]|\\.)*)"/) || [])[1] || '';
        const date = (seg.match(/"work-card-bottom","children":\[\["\$","span",null,\{"children":"([^"]*)"/) || [])[1] || '';
        list.push({
            vod_id: `/work/${mk.id}`,
            vod_name: title || code || `作品 ${mk.id}`,
            vod_pic: mk.pic || '',
            vod_remarks: date,
        });
    });
    return list;
}

function parseWorks(html) {
    const byHtml = parseByHtml(html);
    return byHtml.length ? byHtml : parseByFlight(html);
}

// 分页:优先看「下一页」链接里的 page=N,退而求其次看页码列表里的最大页码
function parsePageInfo(html, page) {
    const $ = load(String(html || ''));
    const box = $('.catalog-pagination').first();
    let pagecount = 0;
    box.find('a[href*="page="]').each((_, node) => {
        const href = $(node).attr('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) pagecount = Math.max(pagecount, parseInt(m[1], 10));
    });
    return { page, pagecount: pagecount > 0 ? pagecount : page, limit: 0, total: 0 };
}

/* --------------------------------------------------------------------------
 *  目录页(女优墙 / 片商 / 类别)
 * ------------------------------------------------------------------------ */
function parseActressWall(html) {
    const $ = load(String(html || ''));
    const out = [];
    $('a.portrait-tile').each((_, node) => {
        const el = $(node);
        const m = (el.attr('href') || '').match(/\/actress\/(\d+)/);
        if (!m) return;
        const name = el.find('.sr-only').first().text().trim() || el.attr('title') || `女优 ${m[1]}`;
        const cnt = el.find('.directory-count').first().text().replace(/\s+/g, '').trim();
        out.push({ type_id: `/actress/${m[1]}`, type_name: cnt ? `${name} ${cnt}` : name });
    });
    return out;
}

function parseDirectory(html) {
    const $ = load(String(html || ''));
    const out = [];
    $('a.directory-row').each((_, node) => {
        const el = $(node);
        const href = el.attr('href') || '';
        if (!/\/(genre|maker|label|series|code|actress)\//.test(href)) return;
        const name = el.find('.directory-name').first().text().trim() || href;
        const cnt = el.find('.directory-count').first().text().replace(/\s+/g, '').trim();
        out.push({ type_id: href, type_name: cnt ? `${name} ${cnt}` : name });
    });
    return out;
}

/* --------------------------------------------------------------------------
 *  详情资料:从 RSC 流里按字段名切块
 * ------------------------------------------------------------------------ */
function sliceAfter(text, label, stopLabel, len = 3000) {
    const i = text.indexOf(`"children":"${label}"`);
    if (i < 0) return '';
    if (stopLabel) {
        const j = text.indexOf(`"children":"${stopLabel}"`, i + 10);
        if (j > i) return text.slice(i, j);
    }
    return text.slice(i, i + len);
}

function linksOf(block, kind) {
    const out = [];
    const seen = new Set();
    const re = new RegExp(`/${kind}/([A-Za-z0-9_-]+)"[^"]*"children":"((?:[^"\\\\]|\\\\.)*)"`, 'g');
    let m;
    while ((m = re.exec(block))) {
        const name = m[2];
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
    }
    return out;
}

function plainDd(block) {
    const m = block.match(/"dd",null,\{"children":"((?:[^"\\]|\\.)*)"/);
    return m ? m[1] : '';
}

/* --------------------------------------------------------------------------
 *  播放接口
 * ------------------------------------------------------------------------ */
async function postJson(path, body) {
    const url = site + path;
    const h = { ...headers(), 'Content-Type': 'application/json' };
    if (typeof req.post === 'function') {
        try {
            const r = await req.post(url, body, { headers: h });
            const status = (r && (r.status || r.statusCode)) || 200;
            // 部分实现的 axios 遇到 4xx 会直接抛,这里按抛错处理,失败再落 fetch
            if (status >= 200 && status < 300) return { status, data: r.data };
            return { status, data: r.data };
        } catch (e) {
            const st = (e && e.response && e.response.status) || 0;
            if (st) return { status: st, data: (e.response && e.response.data) || {} };
        }
    }
    const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const txt = await r.text();
    let data;
    try {
        data = JSON.parse(txt);
    } catch (e) {
        data = { error: txt.slice(0, 200) };
    }
    return { status: r.status, data };
}

// 解析片源:线路1 = sessions(m3u8 播放列表) 线路2 = line2(直链)
async function resolvePlay(workId, code, variant) {
    const lines = [];
    const notes = [];
    if (!workId) return { lines, notes };

    const body1 = variant ? { workId, code, variant } : { workId, code };
    try {
        const s = await postJson('/api/video/sessions', body1);
        if (s.status === 401) {
            notes.push(s.data && s.data.error ? s.data.error : '请先登录后再观看视频');
        } else if (s.status >= 200 && s.status < 300 && s.data && s.data.playlistUrl) {
            lines.push({ name: '线路1', url: abs(s.data.playlistUrl) });
        } else {
            notes.push((s.data && s.data.error) || '线路 1 片源暂时无法获取');
        }
    } catch (e) {
        notes.push('线路 1 请求失败');
    }

    try {
        const s = await postJson('/api/video/line2', { workId, code });
        if (s.status >= 200 && s.status < 300 && s.data && s.data.fileUrl) {
            lines.push({ name: '线路2', url: abs(s.data.fileUrl) });
        } else if (s.status !== 401) {
            notes.push((s.data && s.data.error) || '线路 2 片源暂时无法获取');
        }
    } catch (e) {
        /* 线路 2 拿不到就算了 */
    }

    return { lines, notes };
}

/* --------------------------------------------------------------------------
 *  接口实现
 * ------------------------------------------------------------------------ */
async function init(inReq) {
    const ext = (inReq && inReq.body && inReq.body.ext) || {};
    cookie = ext.cookie || ext.cookieJavverse || cookie || '';
    return { cookie: cookie };
}

async function home(inReq) {
    const ext = (inReq && inReq.body && inReq.body.ext) || {};
    if (!cookie && ext.cookie) cookie = ext.cookie;

    const classList = [
        { type_id: '/works', type_name: '推荐作品' },
        { type_id: '/discover', type_name: '最新发售' },
        { type_id: '/discover?view=upcoming', type_name: '即将发售' },
        { type_id: '/discover?sort=oldest', type_name: '最早发售' },
        { type_id: '/discover?year=2026', type_name: '2026 年' },
        { type_id: '/discover?year=2025', type_name: '2025 年' },
        { type_id: '/discover?year=2024', type_name: '2024 年' },
        { type_id: '/genre/4025', type_name: '单体作品' },
        { type_id: '/genre/5001', type_name: '中出' },
        { type_id: '/genre/1039', type_name: '人妻・主妇' },
        { type_id: '/genre/1014', type_name: '熟女' },
        { type_id: '/genre/4024', type_name: '素人' },
        { type_id: '/genre/2001', type_name: '巨乳' },
        { type_id: '/genre/4111', type_name: 'NTR' },
        { type_id: '/genre/6793', type_name: 'VR 专用' },
        { type_id: '/genre/6533', type_name: '高清' },
        { type_id: '/genre/6012', type_name: '4 小时以上' },
    ];

    // 顺带把「今日推荐女优 / 热门片商 / 热门类别」拉成分类,日常基本够用
    const [a, m, g] = await Promise.all([
        getHtml(`${site}/actresses`).catch(() => ''),
        getHtml(`${site}/makers`).catch(() => ''),
        getHtml(`${site}/genres`).catch(() => ''),
    ]);
    const actresses = parseActressWall(a).slice(0, 10);
    const makers = parseDirectory(m).slice(0, 8);
    const genres = parseDirectory(g).slice(0, 12);
    if (actresses.length) classList.push(...actresses);
    if (makers.length) classList.push(...makers);
    if (genres.length) classList.push(...genres);

    const yearFilter = [{ n: '全部', v: '' }];
    for (let y = 2027; y >= 2002; y--) yearFilter.push({ n: `${y}`, v: `${y}` });

    return {
        class: classList,
        filters: {
            '/discover': [
                { key: 'sort', name: '排序', value: [{ n: '新 → 旧', v: '' }, { n: '旧 → 新', v: 'oldest' }] },
                { key: 'view', name: '档期', value: [{ n: '已发售', v: '' }, { n: '未来档期', v: 'upcoming' }] },
                { key: 'year', name: '年份', value: yearFilter },
            ],
            '/works': [],
        },
    };
}

// 把 type_id + 页码 + 筛选拼成真实 URL
function buildListUrl(tid, page, filters) {
    let base = String(tid || '/discover').trim() || '/discover';
    if (!base.startsWith('/')) base = `/${base}`;
    const url = new URL(base, site);
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    const f = filters || {};
    Object.keys(f).forEach((k) => {
        const v = f[k];
        if (v === undefined || v === null || v === '') url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
    });
    return url.href;
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const tid = body.id || body.tid;
    const filters = body.filters || {};
    const url = buildListUrl(tid, page, filters);
    const html = await getHtml(url);
    const list = parseWorks(html);
    const info = parsePageInfo(html, page);
    return { page: info.page, pagecount: info.pagecount, limit: info.limit, total: info.total, list };
}

async function detail(inReq) {
    let id = String((inReq && inReq.body && inReq.body.id) || '').trim();
    if (!id) return { list: [] };
    if (/^\d+$/.test(id)) id = `/work/${id}`;
    const url = abs(id);

    const html = await getHtml(url);
    const $ = load(html);
    const flight = flightText(html);

    // 基本资料
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';

    const workM = flight.match(/"work":\{"id":(\d+),"code":"([^"]*)","title":"((?:[^"\\]|\\.)*)","cover":"([^"]*)"/);
    const workId = workM ? workM[1] : (id.match(/\/work\/(\d+)/) || [])[1] || '';
    const srcCode = workM ? workM[2] : '';
    const rawTitle = workM ? workM[3] : '';
    const cover = (workM && workM[4]) || ogImage || '';

    // og:title 形如 「KRG-050 · 正文标题 · JAV Verse」
    const parts = ogTitle.split(' · ').map((s) => s.trim()).filter(Boolean);
    const display = parts.filter((s) => s !== 'JAV Verse');
    const codeText = display.length > 1 ? display[0] : '';
    const titleText = rawTitle || (display.length > 1 ? display.slice(1).join(' · ') : display[0] || '');

    // 资料区
    const facts = sliceAfter(flight, '作品资料', null, 6000);
    const actresses = linksOf(sliceAfter(flight, '出演者', '时长'), 'actress');
    const genres = linksOf(sliceAfter(flight, '类别', '番号系列'), 'genre');
    const maker = linksOf(sliceAfter(flight, '制作片商', '厂牌'), 'maker')[0] || '';
    const label = linksOf(sliceAfter(flight, '厂牌', '系列'), 'label')[0] || '';
    const series = plainDd(sliceAfter(flight, '系列', '类别'));
    const releaseDate = (facts.match(/"dd",null,\{"children":"(\d{4}-\d{2}-\d{2})"\}/) || [])[1] || '';
    const duration = (facts.match(/"dd",null,\{"children":"([^"]*分钟)"\}/) || [])[1] || '';
    const sourceNo = plainDd(sliceAfter(flight, '来源编号', null, 400)) || srcCode;

    // 剧照
    const stills = [];
    const sm = flight.match(/"urls":\[((?:"[^"]*",?)+)\]/);
    if (sm) {
        const re = /"([^"]+)"/g;
        let x;
        while ((x = re.exec(sm[1]))) stills.push(x[1]);
    }

    // 片源
    const { lines, notes } = await resolvePlay(workId, srcCode || codeText.replace(/-/g, ''), null);
    const playUrl = lines.map((l) => `${l.name}$${l.url}`).join('#');
    const playFrom = lines.length ? 'javverse' : '';
    if (!lines.length) {
        // 没登录/没会员时留一个官网入口,点开可以自己登录观看
        notes.push('本站片源需登录后观看,把账号 Cookie 填到插件配置即可直接播');
    }

    const contentLines = [];
    if (ogDesc) contentLines.push(ogDesc);
    contentLines.push(`番号:${codeText || srcCode || '—'}`);
    if (releaseDate) contentLines.push(`发售日期:${releaseDate}`);
    if (duration) contentLines.push(`时长:${duration}`);
    if (maker) contentLines.push(`片商:${maker}${label && label !== maker ? ` / ${label}` : ''}`);
    if (series && series !== '待补充') contentLines.push(`系列:${series}`);
    if (genres.length) contentLines.push(`类别:${genres.join('、')}`);
    if (actresses.length) contentLines.push(`出演:${actresses.join('、')}`);
    if (notes.length) contentLines.push(`提示:${notes.join(';')}`);
    contentLines.push(`来源:${url}`);

    return {
        list: [
            {
                vod_id: id.startsWith('/') ? id : `/work/${workId}`,
                vod_name: codeText ? `${codeText} ${titleText}`.trim() : titleText,
                vod_pic: cover,
                vod_content: contentLines.join('\n'),
                vod_year: (releaseDate || '').slice(0, 4),
                vod_area: '日本',
                vod_remarks: lines.length ? (codeText || '有资源') : '需登录观看',
                vod_play_from: playFrom,
                vod_play_url: playUrl,
                vod_pic_screenshot: stills.join('$$$'),
            },
        ],
    };
}

async function play(inReq) {
    const body = (inReq && inReq.body) || {};
    let url = String(body.id || '').trim();

    // 支持 jv://<workId>|<code>|<line> 这种延迟解析(播放会话过期时重新取一次)
    if (url.startsWith('jv://')) {
        const seg = url.slice(5).split('|');
        const r = await resolvePlay(seg[0], seg[1], null);
        const idx = parseInt(seg[2] || '0', 10) || 0;
        const hit = r.lines[idx] || r.lines[0];
        if (hit) url = hit.url;
    }

    const header = { 'User-Agent': UA, Referer: `${site}/` };
    if (cookie) header.Cookie = cookie;
    return { parse: 0, url, header };
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    const wd = String(body.wd || body.key || '').trim();
    if (!wd) return { list: [] };
    const url = `${site}/search?q=${encodeURIComponent(wd)}&type=works`;
    const html = await getHtml(url);
    return { list: parseWorks(html) };
}

export default {
    meta: { key: 'javverse', name: '🎬JAV Verse', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
