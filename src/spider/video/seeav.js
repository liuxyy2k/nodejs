import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://seeav-2026115.ms9889.xyz';

/* ---------- 站点防护（xsg-hex-v1）：响应体是 hex 混淆 + JS unescape ---------- */
function unescapeUtf8(s) {
    let out = '';
    let bytes = [];
    const flush = () => {
        if (bytes.length) {
            out += Buffer.from(bytes).toString('utf8');
            bytes = [];
        }
    };
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '%') {
            const hex2 = s.substr(i + 1, 2);
            if (/^[0-9a-fA-F]{2}$/.test(hex2)) {
                bytes.push(parseInt(hex2, 16));
                i += 2;
                continue;
            }
            if (s[i + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(s.substr(i + 2, 4))) {
                flush();
                out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16));
                i += 5;
                continue;
            }
        }
        flush();
        out += s[i];
    }
    flush();
    return out;
}

function deobfuscate(html) {
    if (!html || typeof html !== 'string') return '';
    if (!html.includes('xsg') && !html.includes('unescape(')) return html;

    const m = html.match(/"([0-9a-fA-F]{500,})"/);
    if (!m || m[1].length % 2 !== 0) return html;

    try {
        const raw = Buffer.from(m[1], 'hex').toString('utf8');
        const decoded = unescapeUtf8(raw);
        return decoded.includes('<') ? decoded : html;
    } catch (e) {
        return html;
    }
}

/* ---------- 请求 ---------- */
async function request(reqUrl, headers = {}) {
    const opts = {
        timeout: 20000,
        maxRedirects: 5,
        responseType: 'text',
        transformResponse: [(d) => d],
        validateStatus: () => true,
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Referer': site + '/',
            ...headers,
        },
    };
    try {
        const resp = await axios.get(reqUrl, opts);
        return deobfuscate(typeof resp.data === 'string' ? resp.data : String(resp.data || ''));
    } catch (e) {
        return '';
    }
}

function absUrl(u) {
    if (!u) return '';
    u = String(u).trim().replace(/&amp;/g, '&');
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (/^https?:\/\//i.test(u)) return u;
    return site + (u.startsWith('/') ? u : '/' + u);
}

/* ---------- 列表解析 ---------- */
function parseVods($) {
    const list = [];
    const seen = new Set();

    $('article.video-card, .video-card').each((_, el) => {
        const card = $(el);
        const a = card.find('a.card-cover').first().length
            ? card.find('a.card-cover').first()
            : card.find('a[href*="/movie/"]').first();

        let href = (a.attr('href') || '').trim();
        if (!href) return;

        const img = card.find('img').first();
        const pic = absUrl(
            img.attr('src') || img.attr('data-src') || img.attr('data-original') || img.attr('img') || ''
        );

        let name = card.find('h3.card-title').first().text().trim();
        if (!name) name = card.find('.card-title').first().text().trim();
        if (!name) name = (img.attr('alt') || '').trim();
        if (!name) return;

        name = name.replace(/\s*-\s*SeeAV\s*$/i, '').trim();

        const id = href.replace(/^https?:\/\/[^/]+/i, '').split('?')[0].split('#')[0];
        if (seen.has(id)) return;
        seen.add(id);

        const remarks = card.find('span.duration').first().text().trim();
        const badge = card.find('span.badge').first().text().trim();

        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remarks || badge,
        });
    });

    return list;
}

function parsePageCount($, page) {
    let max = page || 1;
    $('nav.pagination a, .pagination a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
}

/* ---------- 详情解析 ---------- */
function parseDetail(html, id) {
    const $ = load(html);

    let name = $('h1.detail-title').first().text().trim();
    if (!name) name = ($('meta[property="og:title"]').attr('content') || '').trim();
    if (!name) name = $('title').text().trim();

    const player = $('video#player').first();

    let pic = player.attr('poster') || '';
    if (!pic) pic = $('img.side-poster').attr('src') || '';
    if (!pic) pic = $('meta[property="og:image"]').attr('content') || '';
    pic = absUrl(pic);

    let playUrl = player.attr('data-xsg-source') || player.attr('data-src') || '';
    if (!playUrl) {
        const m = html.match(/["'](\/play\/\d+\/master\.m3u8[^"']*)["']/i)
            || html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
        if (m) playUrl = m[1];
    }

    const info = {};
    $('dl.detail-info .info-row').each((_, el) => {
        const k = $(el).find('dt').text().trim();
        const dd = $(el).find('dd').clone();
        const pills = [];
        dd.find('a.pill').each((i, p) => pills.push($(p).text().trim()));
        info[k] = pills.length ? pills.join(',') : dd.text().trim();
    });

    const content = $('p.detail-summary').first().text().trim();

    return {
        vod_id: id,
        vod_name: name.replace(/\s*-\s*SeeAV\s*$/i, '').trim(),
        vod_pic: pic,
        vod_year: (info['发行日期'] && info['发行日期'] !== '-') ? info['发行日期'] : '',
        vod_area: (info['发行商'] || '').replace(/,/g, ' '),
        vod_actor: (info['女优'] || '').replace(/,/g, ' '),
        vod_remarks: info['时长'] || '',
        vod_content: content,
        vod_play_from: 'SEEAV',
        vod_play_url: `正片$${absUrl(playUrl) || absUrl(id)}`,
    };
}

/* ---------- 接口 ---------- */
async function init(_inReq, _outResp) {
    return {};
}

const CLASSES = [
    { type_id: 'movie', type_name: '最新上线' },
    { type_id: 'nav/2', type_name: '中文字幕' },
    { type_id: 'block/11', type_name: '无码流出' },
    { type_id: 'block/16', type_name: '素人' },
    { type_id: 'block/23', type_name: '无码影片' },
    { type_id: 'block/34', type_name: '亚洲AV' },
    { type_id: 'block/73', type_name: '欧美AV' },
    { type_id: 'tag/563', type_name: '巨乳' },
    { type_id: 'tag/554', type_name: '人妻' },
    { type_id: 'tag/670', type_name: '熟女' },
];

async function home(_inReq, _outResp) {
    const html = await request(site + '/');
    const $ = load(html);

    const list = [];
    const seen = new Set();
    for (const v of parseVods($)) {
        if (!seen.has(v.vod_id)) {
            seen.add(v.vod_id);
            list.push(v);
        }
    }

    return { class: CLASSES, list, filters: {} };
}

function buildListUrl(tid, page) {
    let path = '';

    if (/^https?:\/\//i.test(tid)) {
        path = tid;
    } else if (/^movie$/i.test(tid)) {
        path = '/movie';
    } else if (/^\//.test(tid)) {
        path = tid;
    } else if (/^\d+$/.test(tid)) {
        path = '/block/' + tid;
    } else {
        path = '/' + tid;
    }

    let url = absUrl(path);
    if (page > 1) {
        url += (url.includes('?') ? '&' : '?') + 'page=' + page;
    }
    return url;
}

async function category(inReq, _outResp) {
    const tid = (inReq.body && inReq.body.id) || 'movie';
    const page = parseInt(inReq.body && inReq.body.page) || 1;

    const html = await request(buildListUrl(String(tid), page));
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: parsePageCount($, page), limit: list.length, total: list.length, list };
}

async function detail(inReq, _outResp) {
    const id = (inReq.body && inReq.body.id) || '';
    const url = /^https?:\/\//i.test(id) ? id : absUrl(id);
    const html = await request(url);

    if (!html) return { list: [] };
    return { list: [parseDetail(html, id)] };
}

async function play(inReq, _outResp) {
    const id = (inReq.body && inReq.body.id) || '';
    const header = { 'User-Agent': UA, 'Referer': site + '/' };

    if (/\.m3u8(\?|$)/i.test(id)) {
        return { parse: 0, url: absUrl(id), header };
    }

    const html = await request(/^https?:\/\//i.test(id) ? id : absUrl(id));
    if (!html) {
        return { parse: 1, url: absUrl(id), header };
    }

    const $ = load(html);
    let playUrl = $('video#player').first().attr('data-xsg-source') || '';
    if (!playUrl) {
        const m = html.match(/["'](\/play\/\d+\/master\.m3u8[^"']*)["']/i)
            || html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
        if (m) playUrl = m[1];
    }

    if (!playUrl) return { parse: 1, url: absUrl(id), header };
    return { parse: 0, url: absUrl(playUrl), header };
}

async function search(inReq, _outResp) {
    const wd = (inReq.body && inReq.body.wd) || '';
    const page = parseInt(inReq.body && inReq.body.page) || 1;

    const text = encodeURIComponent(wd);
    let url = `${site}/search/all?q=${text}`;
    if (page > 1) url += `&page=${page}`;

    let html = await request(url);
    let $ = load(html);
    let list = parseVods($);

    if (!list.length) {
        html = await request(`${site}/search?q=${text}`);
        $ = load(html);
        list = parseVods($);
    }

    return { page, pagecount: parsePageCount($, page), limit: list.length, list };
}

export default {
    meta: {
        key: 'seeav',
        name: '🌸SeeAV',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
