import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

/**
 * hscka - https://hscka.cc
 * Base64 标题 + 多策略详情抽链；图片走 /proxy
 * （省略原 Python 写 /sdcard M3U/磁力TXT 的导出逻辑）
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const site = 'https://hscka.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


const http = axios.create({
    timeout: 30_000,
    validateStatus: () => true,
});

let categoriesCache = null;

function log(msg) {
    console.log(`[hscka] ${msg}`);
}

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: referer || `${site}/`,
    };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/hscka/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function proxyUrl(url, inReq) {
    if (!url) return '';
    if (url.startsWith('http://127.0.0.1')) return url;
    return `${getProxyBase(inReq)}?url=${encodeURIComponent(url)}`;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function decodeB64(encoded) {
    try {
        return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
        return encoded;
    }
}

function absUrl(u, base = site) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    try {
        return new URL(u, base).href;
    } catch {
        return u.startsWith('/') ? site + u : `${site}/${u}`;
    }
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

async function fetchText(url, referer, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            if (attempt > 0) await sleep(500 + Math.random() * 1000);
            const resp = await http.get(url, {
                headers: getHeaders(referer),
                responseType: 'text',
            });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200) return text;
            if ([403, 429, 503].includes(resp.status)) {
                log(`请求被拦截 [${resp.status}]，第${attempt + 1}次重试: ${url}`);
                continue;
            }
            log(`请求失败 [${resp.status}]: ${url}`);
            return '';
        } catch (e) {
            log(`请求异常 [${e.message}]，第${attempt + 1}次重试: ${url}`);
        }
    }
    return '';
}

function aesCbcDecrypt(data, key, iv) {
    try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch {
        return null;
    }
}

function loadCategories(text) {
    if (!text) return [];
    const cats = [];
    const seen = new Set();
    const pattern =
        /href="(\/list\/\d+-\d+\.html)"[^>]*>\s*<script[^>]*>document\.write\(d\('([A-Za-z0-9+/=]+)'\)\);<\/script>/g;
    for (const m of text.matchAll(pattern)) {
        let name = stripTags(decodeB64(m[2]));
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const tid = m[1].split('/').pop().split('-')[0];
        cats.push({ type_id: tid, type_name: name });
    }
    categoriesCache = cats;
    return cats;
}

function parseList(html, inReq) {
    const items = [];
    if (!html) return items;
    const cards = [...html.matchAll(/<div class="item item-post">\s*([\s\S]*?)\s*<\/div>/g)].map((m) => m[1]);

    for (const card of cards) {
        const aMatch = card.match(/<a href="([^"]+)"/);
        if (!aMatch) continue;
        const href = aMatch[1];

        const imgMatch = card.match(/<img[^>]+(?:data-original|src)="([^"]+)"/);
        const pic = imgMatch ? imgMatch[1] : '';

        let title = '';
        const titleMatch = card.match(/<h3 class="name">([\s\S]*?)<\/h3>/);
        if (titleMatch) {
            const titleRaw = titleMatch[1];
            const b64 = titleRaw.match(/document\.write\(d\('([A-Za-z0-9+/=]+)'\)\)/);
            title = b64 ? stripTags(decodeB64(b64[1])) : stripTags(titleRaw);
        }

        if (href.startsWith('magnet:')) {
            items.push({
                vod_id: href,
                vod_name: title || '磁力资源',
                vod_pic: proxyUrl(pic, inReq),
                vod_remarks: '磁力',
            });
        } else if (href.includes('/torrent/')) {
            const vid = href.split('/').pop().replace('.html', '');
            items.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: proxyUrl(pic, inReq),
                vod_remarks: '磁力',
            });
        } else if (href.includes('/video/')) {
            const vid = href.split('/').pop().replace('.html', '');
            items.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: proxyUrl(pic, inReq),
                vod_remarks: '',
            });
        }
    }
    return items;
}

async function getList(tid, page, inReq) {
    const url = `${site}/list/${tid}-${page}.html`;
    const html = await fetchText(url, `${site}/list/${tid}-1.html`);
    return html ? parseList(html, inReq) : [];
}

function parseDetail(html, vid, baseUrl, inReq) {
    let title = '';
    let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = stripTags(m[1]);
    if (!title) {
        m = html.match(/<title>([^<]+)<\/title>/);
        if (m) title = m[1].trim();
    }

    let cover = '';
    m = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (m) cover = m[1];
    if (!cover) {
        m = html.match(/<img[^>]*class="thumb"[^>]*src="([^"]+)"/);
        if (m) cover = m[1];
    }
    if (!cover) {
        m = html.match(/<img[^>]*class="poster"[^>]*src="([^"]+)"/);
        if (m) cover = m[1];
    }

    const playUrls = [];
    const seen = new Set();
    const add = (label, url) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        playUrls.push(`${label}$${url}`);
        log(`解析到[${label}]: ${url.slice(0, 80)}...`);
    };

    for (const mag of new Set(
        [...html.matchAll(/magnet:\?xt=urn:btih:[A-Za-z0-9]+[^\s"'<>]*/g)].map((x) => x[0]),
    )) {
        add('磁力', mag);
    }

    for (const link of new Set(
        [...html.matchAll(/href=["']?(\/[^"'<>\s]*play\.php[^"'<>\s]*)/g)].map((x) => x[1]),
    )) {
        add('备用播放', absUrl(link, baseUrl));
    }

    for (const link of new Set(
        [...html.matchAll(/["']([^"']*play\.php[^"']*)["']/g)].map((x) => x[1]),
    )) {
        if (link.startsWith('http')) add('备用播放', link);
    }

    for (const src of new Set(
        [...html.matchAll(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/g)].map((x) => x[1]),
    )) {
        if (['play.php', 'm3u8', 'mp4', 'embed', 'player'].some((k) => src.includes(k))) {
            add('外链', absUrl(src, baseUrl));
        }
    }

    for (const media of new Set(
        [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|mkv|ts)(?:\?[^\s"'<>]*)?/g)].map(
            (x) => x[0],
        ),
    )) {
        add('直链', media);
    }

    for (const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1])) {
        for (const match of [
            ...script.matchAll(/["'](?:url|src|playUrl|videoUrl|file|source)["']\s*:\s*["']([^"']+)["']/g),
        ].map((x) => x[1])) {
            if (['.m3u8', '.mp4', 'play.php', 'magnet:', '.flv', '.ts'].some((ext) => match.includes(ext))) {
                add('JS解析', absUrl(match, baseUrl));
            }
        }

        for (const b64 of [...script.matchAll(/["']([A-Za-z0-9+/]{20,}={0,2})["']/g)].map((x) => x[1])) {
            try {
                const decoded = Buffer.from(b64, 'base64').toString('utf-8');
                if (
                    decoded.startsWith('http') &&
                    ['.m3u8', '.mp4', 'play.php', '.flv'].some((ext) => decoded.includes(ext))
                ) {
                    add('Base64解码', decoded);
                }
            } catch {
                /* ignore */
            }
        }

        for (const aesB64 of [...script.matchAll(/["']([A-Za-z0-9+/]{50,}={0,2})["']/g)].map((x) => x[1])) {
            try {
                const raw = Buffer.from(aesB64, 'base64');
                if (raw.length % 16 !== 0 || raw.length < 16) continue;
                const keys = [
                    [Buffer.from('1234567890123456'), Buffer.from('1234567890123456')],
                    [Buffer.from('0123456789abcdef'), Buffer.from('0123456789abcdef')],
                ];
                for (const [key, iv] of keys) {
                    const decrypted = aesCbcDecrypt(raw, key, iv);
                    if (!decrypted) continue;
                    const decStr = decrypted.toString('utf-8');
                    if (
                        decStr.startsWith('http') &&
                        ['.m3u8', '.mp4', 'play.php'].some((ext) => decStr.includes(ext))
                    ) {
                        add('AES解码', decStr);
                        break;
                    }
                }
            } catch {
                /* ignore */
            }
        }
    }

    for (const media of new Set(
        [...html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/g)].map((x) => x[1]),
    )) {
        if (['.m3u8', '.mp4', '.flv', '.ts'].some((ext) => media.includes(ext))) {
            add('HTML5', absUrl(media, baseUrl));
        }
    }

    for (const media of new Set(
        [...html.matchAll(/<a[^>]+(?:data-url|data-src|data-link)=["']([^"']+)["']/g)].map((x) => x[1]),
    )) {
        if (['.m3u8', '.mp4', 'play.php', 'magnet:'].some((ext) => media.includes(ext))) {
            add('数据属性', absUrl(media, baseUrl));
        }
    }

    for (const onclick of new Set(
        [...html.matchAll(/onclick=["'][^"']*(https?:\/\/[^"'<>]+)["']/g)].map((x) => x[1]),
    )) {
        if (['.m3u8', '.mp4', 'play.php'].some((ext) => onclick.includes(ext))) {
            add('点击播放', onclick);
        }
    }

    if (!playUrls.length) {
        log(`未找到任何播放链接: ${vid}`);
        return null;
    }

    log(`共解析到 ${playUrls.length} 个播放源`);
    const sources = [];
    const urls = [];
    playUrls.forEach((pu, i) => {
        const idx = pu.indexOf('$');
        const sourceName = idx >= 0 ? pu.slice(0, idx) : `线路${i + 1}`;
        const url = idx >= 0 ? pu.slice(idx + 1) : pu;
        sources.push(sourceName);
        urls.push(`${sourceName}$${url}`);
    });

    return {
        vod_id: vid,
        vod_name: title || vid,
        vod_pic: cover ? proxyUrl(cover, inReq) : '',
        // from / url 一一对应
        vod_play_from: sources.join('$$$'),
        vod_play_url: urls.join('$$$'),
        vod_content: title || '',
    };
}

async function fetchDetail(vid, inReq) {
    if (vid.startsWith('magnet:')) {
        return { vod_play_url: `磁力$${vid}`, vod_play_from: '磁力', vod_id: vid, vod_name: '磁力资源' };
    }

    const urlPatterns = [
        `${site}/video/${vid}.html`,
        `${site}/torrent/${vid}.html`,
        `${site}/v/${vid}.html`,
        `${site}/movie/${vid}.html`,
        `${site}/play/${vid}.html`,
    ];

    for (const url of urlPatterns) {
        log(`尝试获取详情: ${url}`);
        const html = await fetchText(url, site);
        if (
            html &&
            (html.includes('video') ||
                html.includes('play') ||
                html.includes('magnet') ||
                html.includes('m3u8') ||
                html.includes('mp4'))
        ) {
            const result = parseDetail(html, vid, url, inReq);
            if (result?.vod_play_url) {
                log(`成功解析详情: ${vid}`);
                return result;
            }
        }
    }
    log(`无法获取详情: ${vid}`);
    return null;
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
        if (text) loadCategories(text);
        const cats = categoriesCache || [];
        const items = cats.length ? await getList(cats[0].type_id, 1, inReq) : [];
        return {
            class: cats,
            filters: {},
            list: items,
            page: 1,
            pagecount: 1,
            limit: items.length,
            total: items.length,
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
        if (vid.startsWith('magnet:')) {
            return {
                list: [
                    {
                        vod_id: vid,
                        vod_name: '磁力资源',
                        vod_pic: '',
                        vod_play_from: '磁力',
                        vod_play_url: `磁力$${vid}`,
                        vod_content: '磁力链接',
                    },
                ],
            };
        }
        const d = await fetchDetail(vid, inReq);
        return { list: d ? [d] : [] };
    } catch (e) {
        log(`detail 异常: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        const id = String(inReq.body.id || '');
        if (id.startsWith('magnet:')) {
            return { parse: 0, url: id, header: {} };
        }
        const header = {
            Referer: site,
            'User-Agent': UA,
            Origin: site,
        };
        return { parse: 0, url: id, header };
    } catch (e) {
        log(`play 异常: ${e.message}`);
        return { parse: 0, url: '', header: {} };
    }
}

async function search(inReq, _outResp) {
    try {
        const key = inReq.body.wd || '';
        const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
        let url = `${site}/search.php?content=${encodeURIComponent(key)}&type=1&page=${page}`;
        let html = await fetchText(url, site);
        let items = html ? parseList(html, inReq) : [];
        if (!items.length) {
            url = `${site}/search.php?content=${encodeURIComponent(key)}&type=2&page=${page}`;
            html = await fetchText(url, site);
            items = html ? parseList(html, inReq) : [];
        }
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
            headers: { 'User-Agent': UA, Referer: `${site}/` },
            responseType: 'arraybuffer',
            timeout: 20_000,
        });
        const ct = r.headers['content-type'] || 'image/jpeg';
        return outResp
            .header('Access-Control-Allow-Origin', '*')
            .type(ct)
            .send(Buffer.from(r.data));
    } catch {
        return outResp.code(404).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 'hscka',
        name: '💋黄色仓库',
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
