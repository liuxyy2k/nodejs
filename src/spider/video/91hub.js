import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://91hub-2026114.ms9889.xyz';

/* ------------------------------------------------------------------
 * 站点特征：整页被混淆成「SEO 空壳 + base64 载荷」
 *   <script data-xsg-obfuscation="xsg-base64-v2">(function(s){...})("BASE64")</script>
 * 浏览器里由 document.write 先 base64 解码再按 UTF-8 渲染，
 * 直接抓 HTML 只能拿到 <title> 和一个空 body，选择器全部落空。
 * 这里在服务端解出真正的 DOM 再交给 cheerio。
 * ------------------------------------------------------------------ */
const OBF_RE = /<script[^>]*data-xsg-obfuscation="[^"]*"[^>]*>([\s\S]*?)<\/script>/;
const PAYLOAD_RE = /\}\)\(["']([A-Za-z0-9+/=]{200,})["']\)/;

function base64ToUtf8(s) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(s, 'base64').toString('utf8');
    }
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}

/** 把混淆壳页还原成真实 HTML；未混淆页面原样返回 */
function decodeHtml(raw) {
    const text = String(raw || '');
    const m = text.match(OBF_RE);
    if (!m) return text;
    const p = m[1].match(PAYLOAD_RE);
    if (!p) return text;
    try {
        return base64ToUtf8(p[1]);
    } catch (e) {
        return text;
    }
}

async function request(reqUrl, headers = {}, retry = 2) {
    let lastErr;
    for (let i = 0; i <= retry; i++) {
        try {
            const resp = await axios.get(reqUrl, {
                headers: { 'User-Agent': UA, Referer: site + '/', ...headers },
                timeout: 20000,
                responseType: 'text',
                transformResponse: [(d) => d],
            });
            return resp.data;
        } catch (e) {
            lastErr = e;
            // 只在 5xx / 网络错误时重试，4xx 直接抛出
            const code = e && e.response ? e.response.status : 0;
            if (code >= 400 && code < 500) break;
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
    }
    throw lastErr;
}

async function loadPage(reqUrl, headers) {
    const raw = await request(reqUrl, headers);
    return load(decodeHtml(raw));
}

function absUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('http')) return s;
    if (s.startsWith('/')) return site + s;
    return site + '/' + s;
}

/** 列表卡片：.video-item > a[href*="/watch/video-"] + .poster img + h3 a */
function parseVods($) {
    const seen = {};
    const videos = [];
    $('.video-item').each((_, element) => {
        const link = $(element).find('a[href*="/watch/video-"]').first();
        const href = link.attr('href') || '';
        const name = $(element).find('h3 a').text().trim();
        const pic = $(element).find('.poster img').attr('src')
            || $(element).find('img').first().attr('src') || '';
        const duration = $(element).find('.poster .text-sm').first().text().trim();
        const idMatch = href.match(/video-(\d+)/);
        if (!name || !idMatch) return;
        const id = idMatch[1];
        if (seen[id]) return;            // 桌面版与移动版会各渲染一份，按 id 去重
        seen[id] = 1;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: absUrl(pic),
            vod_remarks: duration,
        });
    });
    return videos;
}

/** 分页条最大页码 */
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

/** 分类表：/movie 的 a.movie-category-card */
async function getClasses() {
    const classes = [{ type_id: 'home', type_name: '最新推荐' }];
    try {
        const $ = await loadPage(site + '/movie');
        $('a.movie-category-card').each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/\/movie\/([a-z0-9_-]+)/i);
            const name = $(el).find('strong').text().trim() || $(el).find('img').attr('alt') || '';
            if (!m || !name) return;
            classes.push({ type_id: m[1], type_name: name });
        });
    } catch (e) {
        // 分类页异常时退化为只有首页，避免整个 home 失败
    }
    return classes;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = await getClasses();
    const $ = await loadPage(site + '/');
    const list = parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'home');
    const page = parseInt(inReq.body.page) || 1;

    let url;
    if (tid === 'home' || tid === 'new') {
        url = page > 1 ? `${site}/?page=${page}` : site + '/';
    } else {
        url = `${site}/movie/${encodeURIComponent(tid)}?page=${page}`;
    }

    const $ = await loadPage(url);
    const list = parseVods($);

    let pagecount = maxPage($);
    if (!pagecount || pagecount < page) {
        pagecount = list.length > 0 ? page + 1 : page;
    }

    return { page, pagecount, list };
}

async function detail(inReq, _outResp) {
    const id = String(inReq.body.id || '').replace(/[^\d]/g, '');
    const url = `${site}/watch/video-${id}`;
    const $ = await loadPage(url, { Referer: site + '/' });

    const name = ($('h1').first().text().trim()
        || $('meta[property="og:title"]').attr('content') || '').replace(/\s*A片$/, '').trim();
    const pic = absUrl($('meta[property="og:image"]').attr('content')
        || $('.poster img').first().attr('src') || '');
    const content = $('meta[name="description"]').attr('content') || '';

    // 面包屑形如「首页 / 分类 / 标题」，跳过分隔符和标题本身取分类名
    let typeName = '';
    $('.dx-breadcrumbs li').each((_, el) => {
        const t = $(el).text().trim();
        if (!t || t === '/' || t === name || t.length > 12) return;
        if (!typeName && !$(el).find('a[href="/"]').length) typeName = t;
    });
    const tags = [];
    $('ul a[href^="/tag/"]').each((_, el) => {
        const t = $(el).text().trim();
        if (t && t.length <= 12 && tags.indexOf(t) < 0) tags.push(t);
    });

    // 播放地址不放死链：m3u8 带时效签名，交给 play 实时换取
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: '',
            vod_area: '',
            vod_remarks: (function () {
                const t = $('.detail-main .flex.items-center').first().text().replace(/\s+/g, ' ').trim();
                return t.length <= 20 ? t : '';
            })(),
            type_name: typeName,
            vod_content: content,
            vod_play_from: '91Hub',
            vod_play_url: `第1集$${id}`,
            vod_tag: tags.slice(0, 8).join(','),
        }],

    };
}

async function play(inReq, _outResp) {
    const raw = String(inReq.body.id || '');
    const idMatch = raw.match(/(\d+)/);
    const vid = idMatch ? idMatch[1] : raw;
    const resource = 'video-' + vid;
    const header = { 'User-Agent': UA, Referer: site + '/' };

    // 官方取流：先 resolve 拿带签名的地址，再播放 master.m3u8
    try {
        const api = `${site}/player/${resource}/resolve?play=0`;
        const resp = await axios.get(api, {
            headers: { ...header, Accept: 'application/json' },
            timeout: 15000,
            responseType: 'text',
            transformResponse: [(d) => d],
        });
        const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
        if (data && data.ok && data.url) {
            return { parse: 0, url: absUrl(data.url), header };
        }
    } catch (e) {
        // 落到下面的直链兜底
    }

    return {
        parse: 0,
        url: `${site}/player/${resource}/master.m3u8?play=0`,
        header,
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || inReq.body.key || '');
    const $ = await loadPage(`${site}/search?q=${text}`);
    return { list: parseVods($) };
}

export default {
    meta: {
        key: '91hub',
        name: '🎞️91Hub',
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
