import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://supjav.blog';

/* ------------------------------------------------------------------
 * 播放链路（2026-11 现状）：
 *   1) GET  {site}/video/{slug}   → 页内 <iframe src="https://upload18.to/play/index/{slug}">
 *   2) GET  iframe 地址（带 Referer: supjav.blog）→ 页内
 *        window.PLAYER_CONFIG = {"m3u8":"https://helvid.com/m/....m3u8?e=..&x=..&i=<IP段>&k=.."}
 *   3) GET  该 m3u8            → master playlist
 *   4) GET  master 里的子 playlist → 分片列表
 *   5) GET  分片                 → MPEG-TS
 *
 * 三个坑（也是「播放不了」的真正原因）：
 *   a. helvid.com 前面有 WAF，只带 UA 会 403；
 *      必须补 Origin / Sec-Fetch-* 等浏览器头才 200。
 *   b. token 里 i= 参数绑定「取 token 时的出口 IP 段」，
 *      服务器取到的链接丢给客户端直连，IP 不一致就 403。
 *   c. token 有时效（x= 时间戳，约 2 小时），不能写死在 detail 里。
 *
 * 所以 play 只返回 /proxy 地址，由代理统一补头 + 重写 playlist 内地址，
 * 保证 playlist、分片全部经过同一出口 IP。
 * ------------------------------------------------------------------ */

const PLAY_REFERER = 'https://upload18.to/';
const PLAY_HEADER = {
    'User-Agent': UA,
    Referer: PLAY_REFERER,
    Origin: 'https://upload18.to',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
};

// 若你的播放器不认相对地址，把这里改成 http://你的服务器:端口
const PROXY_BASE = '';

async function request(reqUrl, headers = {}, retry = 2) {
    let lastErr;
    for (let i = 0; i <= retry; i++) {
        try {
            const resp = await axios.get(reqUrl, {
                headers: { 'User-Agent': UA, Referer: site + '/', ...headers },
                timeout: 25000,
                responseType: 'text',
                transformResponse: [(d) => d],
                maxRedirects: 5,
            });
            return resp.data;
        } catch (e) {
            lastErr = e;
            const code = e && e.response ? e.response.status : 0;
            if (code >= 400 && code < 500) break;
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
    }
    throw lastErr;
}

function absUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('http')) return s;
    if (s.startsWith('/')) return site + s;
    return site + '/' + s;
}

/** 从 /video/{slug}、video/{slug}、/play/index/{slug} 里取出 slug */
function toSlug(input) {
    const s = String(input || '').trim();
    const m = s.match(/(?:video|play\/index)\/([a-z0-9-]+)/i);
    if (m) return m[1];
    const m2 = s.match(/([a-z]{2,6}-\d{2,6})/i);
    if (m2) return m2[1];
    return /^[a-z0-9-]+$/i.test(s) ? s : '';
}

const CATEGORY_MAP = {
    newest: '/',
    uncensored: '/uncensored',
    'uncensored-leaked': '/uncensored-leaked',
    censored: '/censored',
    chinese: '/chinese',
    amateur: '/amateur',
};

function categoryPath(tid) {
    return CATEGORY_MAP[String(tid || '').toLowerCase()] || '/';
}

/** 列表卡片：.box-item（可限定范围，首页只取第一块 section） */
function parseVods($, scope) {
    const videos = [];
    const seen = {};
    const nodes = scope && scope.length ? scope.find('.box-item') : $('.box-item');
    nodes.each((_, element) => {
        const el = $(element);
        const thumbLink = el.find('.thumb a').first();
        const detailLink = el.find('.detail a').first();
        const href = thumbLink.attr('href') || detailLink.attr('href') || '';
        const slug = toSlug(href);
        if (!slug || seen[slug]) return;

        const img = el.find('.thumb img').first();
        const name = (detailLink.text() || img.attr('alt') || '').replace(/\s+/g, ' ').trim();
        if (!name) return;

        seen[slug] = 1;
        videos.push({
            vod_id: slug,
            vod_name: name,
            vod_pic: absUrl(img.attr('src') || ''),
            vod_remarks: '',
        });
    });
    return videos;
}

/** 分页条最大页码 */
function readLastPage($) {
    let max = 0;
    $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
        const t = $(el).text().trim();
        if (/^\d+$/.test(t)) {
            const n = parseInt(t, 10);
            if (n > max) max = n;
        }
    });
    return max;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'newest', type_name: '最新' },
        { type_id: 'uncensored', type_name: '无码' },
        { type_id: 'uncensored-leaked', type_name: '无码流出' },
        { type_id: 'censored', type_name: '有码' },
        { type_id: 'chinese', type_name: '中文字幕' },
        { type_id: 'amateur', type_name: '素人' },
    ];

    const html = await request(site + '/');
    const $ = load(html);
    // 首页分了 最新/无码/有码… 好几块，只取第一块「New Release」
    const list = parseVods($, $('section').first());

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const path = categoryPath(tid);
    let url = site + path;
    if (page > 1) {
        url += `?page=${page}`;
    }

    const html = await request(url);
    const $ = load(html);
    // 首页是一页好几块，翻页时同样只取第一块
    const list = parseVods($, path === '/' ? $('section').first() : null);
    const last = readLastPage($);

    let pagecount = last > page ? last : page + 1;
    if (!list.length && page > 1) pagecount = page - 1;

    return { page, pagecount, list };
}

/** 取详情页 iframe 的播放页地址 */
function findEmbedUrl($) {
    const src = $('#player iframe').attr('src') || $('iframe[src*="/play/"]').attr('src') || '';
    return absUrl(src);
}

async function detail(inReq, _outResp) {
    const id = toSlug(inReq.body.id);
    if (!id) throw new Error('缺少视频 id');

    const url = `${site}/video/${id}`;
    const html = await request(url);
    const $ = load(html);

    if (!$('#player').length && !$('h1').length) {
        return { list: [] };
    }

    const name = $('h1').first().text().trim()
        || ($('meta[property="og:title"]').attr('content') || '').replace(/\s*JAV Video HD \|.*$/i, '');
    const pic = absUrl($('meta[property="og:image"]').attr('content') || '');
    const desc = $('meta[property="og:description"]').attr('content') || '';

    // 详情块里的 Release date 大多是 Unknown，真正的时间在 og:description 里
    let year = '';
    const released = desc.match(/released on (\d{4})-\d{2}-\d{2}/i);
    if (released) {
        year = released[1];
    } else {
        $('div.detail-item div').each((_, element) => {
            const label = $(element).find('span').first().text().trim();
            const value = $(element).find('span').eq(1).text().trim();
            if (!year && /release date/i.test(label) && /\d{4}/.test(value)) {
                year = (value.match(/\d{4}/) || [])[0];
            }
        });
    }

    // 播放地址不在这里定死：token 绑定出口 IP + 有时效，交给 play() 现取
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'SupJav',
            vod_play_url: `第1集$${id}`,
        }],
    };
}

/** 现场解析：详情页 → iframe → PLAYER_CONFIG.m3u8 */
async function resolvePlayUrl(id) {
    const slug = toSlug(id);
    if (!slug) throw new Error('bad id');

    const detailHtml = await request(`${site}/video/${slug}`);
    const $ = load(detailHtml);
    const embed = findEmbedUrl($);
    if (!embed) throw new Error('embed not found');

    const playHtml = await request(embed, { Referer: site + '/' });
    const m = playHtml.match(/"m3u8"\s*:\s*"([^"]+)"/);
    if (!m) throw new Error('PLAYER_CONFIG.m3u8 not found');

    return m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/\\u003d/g, '=')
        .replace(/&amp;/g, '&');
}

function proxyUrlOf(target, inReq) {
    const proto = ((inReq.headers && (inReq.headers['x-forwarded-proto'] || '')) || 'http').split(',')[0].trim() || 'http';
    const host = (inReq.headers && (inReq.headers['x-forwarded-host'] || inReq.headers.host)) || '';
    const base = PROXY_BASE || (host ? `${proto}://${host}` : '');
    return `${base}/proxy?url=${encodeURIComponent(target)}`;
}

async function play(inReq, _outResp) {
    const raw = String(inReq.body.id || '');
    const url = await resolvePlayUrl(raw);
    // 交给代理：统一补 WAF 需要的头，并重写 playlist 内地址
    return {
        parse: 0,
        url: proxyUrlOf(url, inReq),
        header: PLAY_HEADER,
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/search?keyword=${text}`;
    if (page > 1) {
        url += `&page=${page}`;
    }

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

/* ------------------------------------------------------------------
 * 媒体代理：
 *   - 补全 Origin / Sec-Fetch-* 等头，绕过 helvid 的 WAF
 *   - m3u8 响应把内部地址重写成 /proxy?url=...，保证 playlist 与分片
 *     都从同一出口 IP 取，token 的 IP 绑定才不会失效
 *   - ts 二进制透传，支持 Range / 206
 * ------------------------------------------------------------------ */
async function proxyHandler(inReq, reply) {
    const target = decodeURIComponent(String(inReq.query.url || '').trim());
    if (!/^https?:\/\//i.test(target)) {
        return reply.code(404).type('text/plain').send('');
    }

    const headers = { ...PLAY_HEADER };
    if (inReq.headers && inReq.headers.range) headers.Range = inReq.headers.range;

    try {
        const r = await axios.get(target, {
            headers,
            responseType: 'arraybuffer',
            timeout: 60000,
            maxRedirects: 5,
            validateStatus: () => true,
        });
        if (r.status >= 400) {
            return reply.code(r.status).type('text/plain').send('');
        }

        const ct = String(r.headers['content-type'] || '');
        const looksM3u8 = /mpegurl/i.test(ct)
            || /\.m3u8(\?|$)/i.test(target)
            || /\/m\//.test(target);

        if (looksM3u8) {
            const text = Buffer.from(r.data).toString('utf8');
            const rewritten = text.split('\n').map((line) => {
                const t = line.trim();
                if (!t) return line;
                if (t.startsWith('#')) {
                    // EXT-X-KEY / EXT-X-MAP 这类带 URI 的标签也要改写
                    if (/URI="/i.test(t)) {
                        return t.replace(/URI="([^"]+)"/i, (all, u) => `URI="${proxyUrlOf(absUrl(u), inReq)}"`);
                    }
                    return line;
                }
                return proxyUrlOf(absUrl(t), inReq);
            }).join('\n');

            return reply
                .header('Access-Control-Allow-Origin', '*')
                .type('application/vnd.apple.mpegurl')
                .code(200)
                .send(rewritten);
        }

        if (r.headers['content-range']) reply.header('Content-Range', r.headers['content-range']);
        if (r.headers['accept-ranges']) reply.header('Accept-Ranges', r.headers['accept-ranges']);
        if (r.headers['content-length']) reply.header('Content-Length', r.headers['content-length']);

        return reply
            .header('Access-Control-Allow-Origin', '*')
            .type(ct || 'application/octet-stream')
            .code(r.status === 206 ? 206 : 200)
            .send(Buffer.from(r.data));
    } catch (e) {
        return reply.code(502).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 'supjavblog',
        name: '🌸SupJav·blog',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
