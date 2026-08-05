import axios from 'axios';
import https from 'https';

/**
 * t66yy - https://t66yy.cc
 * Base64 标题解码 + 图片 proxy + play.php 多线路
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const site = 'https://t66yy.cc';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 30_000,
    httpsAgent,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: `${site}/`,
    },
});

let categoriesCache = null;

function log(msg) {
    console.log(`[t66yy] ${msg}`);
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/t66yy/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function proxyImg(url, inReq) {
    if (!url) return '';
    if (url.startsWith('http://127.0.0.1')) return url;
    if (!url.startsWith('http')) return url;
    return `${getProxyBase(inReq)}?url=${encodeURIComponent(url)}`;
}

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: referer || `${site}/`,
    };
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, referer, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            if (i > 0) await sleep(500 + Math.random() * 1000);
            const resp = await http.get(url, {
                headers: getHeaders(referer || `${site}/`),
                responseType: 'text',
            });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200) return text;
            if ([403, 429, 503].includes(resp.status)) {
                log(`请求被拦截 [${resp.status}]，重试 ${i + 1}/${retries}`);
                continue;
            }
            return '';
        } catch (e) {
            log(`请求异常 [${e.message}]，重试 ${i + 1}/${retries}`);
        }
    }
    return '';
}

function decodeB64(encoded) {
    try {
        const raw = Buffer.from(encoded, 'base64').toString('utf8');
        return decodeURIComponent(raw);
    } catch {
        return encoded;
    }
}

function loadCategories(text) {
    if (!text) return;
    const cats = [];
    const seen = new Set();
    const areaRe =
        /<div class="area">\s*<dl class="first">\s*<dt><a[^>]*>([^<]+)<\/a><\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/dl>\s*<\/div>/g;
    const linkRe =
        /<a href="(\/list\/\d+-\d+\.html)">\s*<script[^>]*>document\.write\(d\('([A-Za-z0-9+/=]+)'\)\);<\/script>/g;

    for (const area of text.matchAll(areaRe)) {
        if (area[1].includes('磁力')) continue;
        for (const m of area[2].matchAll(linkRe)) {
            const href = m[1];
            const name = decodeB64(m[2]).replace(/<[^>]+>/g, '').trim();
            if (!name || seen.has(name)) continue;
            seen.add(name);
            const tid = href.split('/').pop().split('-')[0];
            cats.push({ type_id: tid, type_name: name });
        }
    }
    categoriesCache = cats;
    log(`加载分类: ${cats.length} 个`);
}

function parseList(html, inReq) {
    const items = [];
    const re =
        /<li>\s*<a class="thumbnail" href="(\/video\/\d+\.html)"[\s\S]*?<img[^>]+data-original="([^"]+)"[\s\S]*?<\/a>\s*<div class="video-info">\s*<h5><a[^>]*><script[^>]*>document\.write\(d\('([A-Za-z0-9+/=]+)'\)\);<\/script><\/a><\/h5>/g;
    for (const m of html.matchAll(re)) {
        const href = m[1];
        const pic = m[2];
        const title = decodeB64(m[3]);
        const vid = href.split('/').pop().replace('.html', '');
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: proxyImg(pic, inReq),
            vod_remarks: '',
        });
    }
    return items;
}

async function getList(tid, page, inReq) {
    const url = `${site}/list/${tid}-${page}.html`;
    const html = await fetchText(url, `${site}/list/${tid}-1.html`);
    return html ? parseList(html, inReq) : [];
}

function absUrl(base, link) {
    if (!link) return '';
    if (link.startsWith('http')) return link;
    try {
        return new URL(link, base).href;
    } catch {
        return link.startsWith('/') ? site + link : `${site}/${link}`;
    }
}

function parseDetail(html, vid, baseUrl, inReq) {
    let title = '';
    let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = m[1].replace(/<[^>]+>/g, '').trim();
    if (!title) {
        m = html.match(/<title>([^<]+)<\/title>/);
        if (m) title = m[1].trim();
    }

    let cover = '';
    m = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (m) cover = m[1];
    if (!cover) {
        m = html.match(/<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/s);
        if (m) cover = m[1];
    }
    if (!cover) {
        m = html.match(/data-original="([^"]+)"/);
        if (m) cover = m[1];
    }

    const playUrls = [];
    const seen = new Set();
    const add = (label, url) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        playUrls.push({ label, url });
    };

    for (const link of new Set([...html.matchAll(/href=["']?(\/[^"'<>\s]*play\.php[^"'<>\s]*)/g)].map((x) => x[1]))) {
        const full = absUrl(baseUrl, link);
        if (full.includes('site_id=') && full.includes('source_id=')) add('主线路', full);
        else add('备用播放', full);
    }
    for (const link of new Set([...html.matchAll(/href=["']?(https?:\/\/[^"'<>\s]*play\.php[^"'<>\s]*)/g)].map((x) => x[1]))) {
        if (link.includes('site_id=') && link.includes('source_id=')) add('主线路', link);
        else add('备用播放', link);
    }
    for (const media of new Set([
        ...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|mkv|ts)(?:\?[^\s"'<>]*)?/g),
    ].map((x) => x[0]))) {
        add('直链', media);
    }
    for (const src of new Set([
        ...html.matchAll(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/g),
    ].map((x) => x[1]))) {
        if (['play.php', 'm3u8', 'mp4', 'embed', 'player'].some((k) => src.includes(k))) {
            add('外链', src.startsWith('http') ? src : absUrl(baseUrl, src));
        }
    }
    for (const script of html.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || []) {
        const body = script.replace(/<\/?script[^>]*>/g, '');
        for (const b64 of body.match(/["']([A-Za-z0-9+/]{20,}={0,2})["']/g) || []) {
            const raw = b64.slice(1, -1);
            try {
                const dec = Buffer.from(raw, 'base64').toString('utf8');
                if (dec.startsWith('http') && ['.m3u8', '.mp4', 'play.php'].some((x) => dec.includes(x))) {
                    add('Base64', dec);
                }
            } catch {
                /* skip */
            }
        }
    }

    if (!playUrls.length) {
        const sidM = html.match(/site_id[=:](\d+)/);
        const srcM = html.match(/source_id[=:](\d+)/);
        if (sidM && srcM) {
            add('默认线路', `https://m.892539.xyz/play.php?site_id=${sidM[1]}&source_id=${srcM[1]}`);
        } else {
            add('默认线路', `${site}/play.php?vid=${vid}`);
        }
    }

    const sources = playUrls.map((p) => p.label);
    const urls = playUrls.map((p) => `${p.label}$${p.url}`);

    return {
        vod_id: vid,
        vod_name: title || vid,
        vod_pic: cover ? proxyImg(cover, inReq) : '',
        vod_play_from: sources.join('$$$'),
        vod_play_url: urls.join('$$$'),
        vod_content: title || '',
    };
}

async function fetchDetail(vid, inReq) {
    const urls = [
        `${site}/video/${vid}.html`,
        `${site}/v/${vid}.html`,
        `${site}/movie/${vid}.html`,
        `${site}/detail/${vid}.html`,
    ];

    for (const url of urls) {
        log(`获取详情: ${url}`);
        const html = await fetchText(url, site);
        if (
            html &&
            ['video', 'play', 'm3u8', 'mp4', 'iframe', 'source_id'].some((k) => html.includes(k))
        ) {
            const detail = parseDetail(html, vid, url, inReq);
            if (detail?.vod_play_url) return detail;
        }
    }

    const tryUrls = [`${site}/play.php?vid=${vid}`, `${site}/play.php?source_id=${vid}`];
    for (const tryUrl of tryUrls) {
        log(`尝试直接 play.php: ${tryUrl}`);
        try {
            const resp = await http.get(tryUrl, { headers: getHeaders(site), responseType: 'text' });
            if (resp.status !== 200 || !resp.data) continue;
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data);
            try {
                const data = JSON.parse(text);
                if (data.url) return { vod_play_url: `直链$${data.url}` };
            } catch {
                if (text.includes('.m3u8') || text.includes('.mp4')) {
                    return { vod_play_url: `直链$${text.trim()}` };
                }
            }
        } catch {
            /* next */
        }
    }
    return null;
}

async function resolvePlayUrl(id) {
    if (!id || !id.includes('play.php')) return id;
    try {
        const resp = await http.get(id, { headers: getHeaders(site), responseType: 'text' });
        if (resp.status !== 200) return id;
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data);
        try {
            const data = JSON.parse(text);
            if (data.url) return data.url;
        } catch {
            const m = text.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|ts)(?:\?[^\s"'<>]*)?/);
            if (m) return m[0];
        }
    } catch {
        /* keep id */
    }
    return id;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    const text = await fetchText(site);
    if (text) loadCategories(text);
    return {};
}

async function home(inReq, _outResp) {
    try {
        const text = await fetchText(site);
        if (text && !categoriesCache) loadCategories(text);
        return {
            class: categoriesCache || [],
            filters: {},
            list: [],
            page: 1,
            pagecount: 1,
            limit: 0,
            total: 0,
        };
    } catch (e) {
        log(`home 异常: ${e.message}`);
        return { class: [], filters: {}, list: [] };
    }
}

async function category(inReq, _outResp) {
    try {
        const tid = String(inReq.body.id || '');
        const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
        const items = await getList(tid, page, inReq);
        let totalPage = page + 1;
        if (page === 1) {
            const html = await fetchText(`${site}/list/${tid}-1.html`);
            if (html) {
                const pages = [...html.matchAll(/\/list\/\d+-(\d+)\.html/g)].map((x) => parseInt(x[1], 10));
                if (pages.length) totalPage = Math.max(...pages);
            }
        }
        return {
            list: items,
            page,
            pagecount: totalPage,
            limit: items.length,
            total: totalPage * items.length,
        };
    } catch (e) {
        log(`category 异常: ${e.message}`);
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    try {
        const vid = String(inReq.body.id || '');
        const d = await fetchDetail(vid, inReq);
        if (!d) return { list: [] };
        return { list: [d] };
    } catch (e) {
        log(`detail 异常: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        let id = String(inReq.body.id || '');

        if (/^\d+$/.test(id)) {
            const d = await fetchDetail(id, inReq);
            if (d?.vod_play_url) {
                const first = d.vod_play_url.split('$$$')[0];
                id = first.includes('$') ? first.split('$').slice(1).join('$') : first;
            }
        }

        id = await resolvePlayUrl(id);

        let referer = site;
        if (id.startsWith('http')) {
            try {
                const u = new URL(id);
                referer = `${u.protocol}//${u.host}/`;
            } catch {
                /* keep */
            }
        }

        return {
            parse: 0,
            url: id,
            header: { Referer: referer, 'User-Agent': UA },
        };
    } catch (e) {
        log(`play 异常: ${e.message}`);
        return { parse: 0, url: '', header: {} };
    }
}

async function search(inReq, _outResp) {
    try {
        const key = inReq.body.wd || '';
        const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
        const url = `${site}/search.php?content=${encodeURIComponent(key)}&type=1&page=${page}`;
        const html = await fetchText(url, site);
        const items = html ? parseList(html, inReq) : [];
        return {
            list: items,
            page,
            pagecount: page + 1,
            limit: items.length,
            total: page * items.length,
        };
    } catch (e) {
        log(`search 异常: ${e.message}`);
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }
}

async function proxyHandler(inReq, outResp) {
    const url = inReq.query.url || '';
    if (!url || !/^https?:\/\//i.test(url)) {
        return outResp.code(404).type('text/plain').send('');
    }
    try {
        const r = await http.get(url, {
            headers: getHeaders(`${site}/`),
            responseType: 'arraybuffer',
            timeout: 20_000,
        });
        const ct = r.headers['content-type'] || 'image/jpeg';
        return outResp.header('Access-Control-Allow-Origin', '*').type(ct).send(Buffer.from(r.data));
    } catch {
        return outResp.code(404).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 't66yy',
        name: 't66yy',
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
