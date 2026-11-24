import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://javtiful.com';

/* ------------------------------------------------------------------
 * 站点已改版：页面里不再直出 m3u8/mp4，播放链路变成三步
 *   1) GET  /video/{id}                      → 页面内 <script id="watch-config"> 带
 *                                              playback.endpoint 和一次性 ticket
 *   2) POST /video/{id}/playback  (body ticket=xxx，必须 XHR 头)
 *        → {"success":true,"sources":[{"src":"/media/video/{id}/720p?expires=..&signature=.."}]}
 *   3) GET  {site}{src}                      → 302 到 Cloudflare R2 预签名 mp4（1 小时有效）
 * 所以旧的「正则抓 m3u8」写法必然拿不到地址，必须按上面顺序换票。
 * ------------------------------------------------------------------ */

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

/** 列表卡片：article.video-card */
function parseVods($) {
    const videos = [];
    const seen = {};
    $('.video-card').each((_, element) => {
        const thumb = $(element).find('a.video-card__thumbnail').first();
        const href = thumb.attr('href') || $(element).find('a.video-card__title').attr('href') || '';
        const idMatch = href.match(/\/video\/(\d+)/);
        if (!idMatch) return;
        const id = idMatch[1];
        if (seen[id]) return;
        seen[id] = 1;

        const titleEl = $(element).find('.video-card__title').first();
        const name = (titleEl.attr('title') || titleEl.text() || '').trim();
        if (!name) return;

        const img = $(element).find('img').first();
        const pic = img.attr('data-front-lazy-src') || img.attr('src') || '';

        // "FHD02:16:24" → 02:16:24
        const detailText = $(element).find('.video-card__details').text().trim();
        const durMatch = detailText.match(/\d{1,2}:\d{2}(?::\d{2})?/);

        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: absUrl(pic),
            vod_remarks: durMatch ? durMatch[0] : '',
        });
    });
    return videos;
}

function maxPage($) {
    let max = 0;
    $('a').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/[?&]page=(\d+)/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
    });
    return max;
}

/** 分类：/categories 的 a.category-card */
async function getClasses() {
    const classes = [
        { type_id: 'new', type_name: '最新更新' },
        { type_id: 'popular', type_name: '本周热门' },
    ];
    try {
        const html = await request(site + '/categories');
        const $ = load(html);
        $('a.category-card').each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/\/category\/([a-z0-9-]+)/i);
            const name = $(el).find('.category-card__name').text().trim()
                || $(el).find('img').attr('alt') || '';
            if (!m || !name) return;
            classes.push({ type_id: 'cat:' + m[1], type_name: name });
        });
    } catch (e) {
        // 分类失败时保留两个基础入口
    }
    return classes;
}

/** 从详情页 JSON 里取 playback 配置 */
function readWatchConfig(html) {
    const m = String(html).match(/<script id="watch-config" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    try {
        const cfg = JSON.parse(m[1].trim());
        if (!cfg || !cfg.playback || !cfg.playback.endpoint) return null;
        return {
            endpoint: cfg.playback.endpoint,
            ticket: cfg.playback.ticket || '',
            poster: cfg.videoPoster || '',
            title: cfg.videoTitle || '',
        };
    } catch (e) {
        return null;
    }
}

/** POST 换票，返回按清晰度排序的播放源 */
async function fetchSources(cfg) {
    const resp = await axios.post(absUrl(cfg.endpoint), 'ticket=' + encodeURIComponent(cfg.ticket), {
        headers: {
            'User-Agent': UA,
            Referer: site + '/',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 20000,
        responseType: 'text',
        transformResponse: [(d) => d],
    });
    const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    if (!data || !data.success || !Array.isArray(data.sources) || !data.sources.length) {
        throw new Error('playback: no source');
    }
    return data.sources
        .filter((s) => s && s.src)
        .sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = await getClasses();
    const $ = load(await request(site + '/'));
    return { class: classes, list: parseVods($), filters: {} };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'new');
    const page = parseInt(inReq.body.page) || 1;

    let url;
    if (tid.indexOf('cat:') === 0) {
        url = `${site}/category/${encodeURIComponent(tid.slice(4))}?page=${page}`;
    } else if (tid === 'popular') {
        url = `${site}/videos?sort=popular_week&page=${page}`;
    } else {
        url = `${site}/videos?page=${page}`;
    }

    const $ = load(await request(url));
    const list = parseVods($);

    let pagecount = maxPage($);
    if (!pagecount || pagecount < page) pagecount = list.length > 0 ? page + 1 : page;

    return { page, pagecount, list };
}

async function detail(inReq, _outResp) {
    const id = String(inReq.body.id || '').replace(/[^\d]/g, '');
    const html = await request(`${site}/video/${id}`);
    const $ = load(html);
    const cfg = readWatchConfig(html);

    const name = ($('h1').first().text().trim()
        || (cfg && cfg.title) || '').replace(/\s+/g, ' ').trim();

    let pic = '';
    const og = $('meta[property="og:image"]').attr('content');
    if (og) pic = absUrl(og);
    else if (cfg && cfg.poster) pic = absUrl(cfg.poster);
    else pic = absUrl($('video#front-player').attr('poster') || '');

    const crumbs = [];
    $('.breadcrumb a, .breadcrumbs a, nav[aria-label="Breadcrumb"] a').each((_, el) => {
        const t = $(el).text().trim();
        if (t) crumbs.push(t);
    });
    const typeName = crumbs.length > 1 ? crumbs[crumbs.length - 1] : '';

    const tags = [];
    $('a[href^="/tag/"], a[href^="/actress/"]').each((_, el) => {
        const t = $(el).text().trim();
        if (t && t.length <= 40 && tags.indexOf(t) < 0) tags.push(t);
    });

    // 只传 id：签名地址 1 小时就失效，交给 play 实时换
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: (name.match(/\b(20\d{2})\b/) || [])[1] || '',
            vod_area: 'JP',
            vod_remarks: '',
            type_name: typeName,
            vod_content: name,
            vod_play_from: 'Javtiful',
            vod_play_url: `正片$${id}`,
            vod_tag: tags.slice(0, 8).join(','),
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '').replace(/[^\d]/g, '');
    const header = { 'User-Agent': UA, Referer: site + '/' };

    try {
        const html = await request(`${site}/video/${id}`);
        const cfg = readWatchConfig(html);
        if (!cfg) throw new Error('watch-config missing');

        const sources = await fetchSources(cfg);
        const best = sources[0];
        return { parse: 0, url: absUrl(best.src), header };
    } catch (e) {
        // 兜底：直接命中站点媒体路由（无签名时通常 403，仅作最后尝试）
        return { parse: 0, url: `${site}/media/video/${id}/720p`, header };
    }
}

async function search(inReq, _outResp) {
    const wd = inReq.body.wd || inReq.body.key || '';
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(wd)}`));
    return { list: parseVods($) };
}

/* ------------------------------------------------------------------
 * 媒体中转：R2 预签名直链一般不校验 Referer，但个别播放器/网络环境
 * 会因跳转或防盗链失败，这里留一个 /proxy 兜底。
 * 用法：/proxy?url=<encodeURIComponent(直链)>&referer=<可选>
 * ------------------------------------------------------------------ */
async function proxyHandler(inReq, reply) {
    const target = decodeURIComponent(String(inReq.query.url || '').trim());
    const referer = decodeURIComponent(String(inReq.query.referer || (site + '/')).trim());
    if (!/^https?:\/\//i.test(target)) {
        return reply.code(404).type('text/plain').send('');
    }

    const headers = { 'User-Agent': UA, Referer: referer, Accept: '*/*' };
    if (inReq.headers.range) headers.Range = inReq.headers.range;

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

        const ct = r.headers['content-type'] || 'application/octet-stream';
        if (r.headers['content-range']) reply.header('Content-Range', r.headers['content-range']);
        if (r.headers['accept-ranges']) reply.header('Accept-Ranges', r.headers['accept-ranges']);
        if (r.headers['content-length']) reply.header('Content-Length', r.headers['content-length']);

        return reply
            .header('Access-Control-Allow-Origin', '*')
            .type(ct)
            .code(r.status === 206 ? 206 : 200)
            .send(Buffer.from(r.data));
    } catch (e) {
        return reply.code(502).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 'javtiful',
        name: '🌸Javtiful',
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
