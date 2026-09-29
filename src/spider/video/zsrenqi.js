import axios from 'axios';
import https from 'https';

/**
 * 真实人妻 - https://zsrqab03.zsrenqi.xyz
 * 图片走本地 /proxy 防盗链
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const site = 'https://zsrqab03.zsrenqi.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const REMOVE_CATS = new Set(['视频一区', '视频五区', '热搜视频']);

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
    console.log(`[zsrenqi] ${msg}`);
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/zsrenqi/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function proxyImg(url, inReq) {
    if (!url) return '';
    if (url.startsWith('http://127.0.0.1')) return url;
    if (!url.startsWith('http')) return url;
    return `${getProxyBase(inReq)}?url=${encodeURIComponent(url)}`;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, referer, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            if (i > 0) await sleep(500 + Math.random() * 1000);
            const resp = await http.get(url, {
                headers: {
                    'User-Agent': UA,
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    Referer: referer || `${site}/`,
                },
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

function loadCategories(text) {
    if (!text) return;
    const cats = [{ type_id: 'home', type_name: '首页' }];
    const seen = new Set(['home']);

    const pattern =
        /<div class="row-item[^"]*">\s*<div class="row-item-title[^"]*">\s*<a href="(\/index\.php\/vod\/type\/id\/(\d+)\.html)"[^>]*>([^<]+)<\/a>/g;
    for (const m of text.matchAll(pattern)) {
        const tid = m[2];
        const name = m[3].trim();
        if (seen.has(tid)) continue;
        if (REMOVE_CATS.has(name)) {
            log(`移除分类: ${name}`);
            continue;
        }
        seen.add(tid);
        cats.push({ type_id: tid, type_name: name });
    }

    if (cats.length <= 2) {
        for (const m of text.matchAll(/<a[^>]+href="(\/index\.php\/vod\/type\/id\/(\d+)\.html)"[^>]*>([^<]+)<\/a>/g)) {
            const tid = m[2];
            const name = m[3].trim();
            const href = m[1];
            if (seen.has(tid) || REMOVE_CATS.has(name)) continue;
            if (/https?:/.test(href)) continue;
            seen.add(tid);
            cats.push({ type_id: tid, type_name: name });
        }
    }

    categoriesCache = cats;
    log(`加载分类: ${cats.length} 个`);
}

function parseItems(html, inReq) {
    const items = [];
    if (!html) return items;
    const pattern =
        /<li\s+class="content-item">\s*<a[^>]+href="(\/index\.php\/vod\/detail\/id\/(\d+)\.html)"[^>]*>[\s\S]*?<img[^>]+data-original="([^"]+)"[^>]*>[\s\S]*?<\/a>\s*<div\s+class="title">\s*<h5[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g;
    for (const m of html.matchAll(pattern)) {
        const vid = m[2];
        const pic = m[3];
        const title = m[4].trim();
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic.startsWith('http') ? proxyImg(pic, inReq) : pic,
            vod_remarks: '',
        });
    }
    return items;
}

async function getList(tid, page, inReq) {
    let url =
        page === 1
            ? `${site}/index.php/vod/type/id/${tid}.html`
            : `${site}/index.php/vod/type/id/${tid}.html?page=${page}`;
    let html = await fetchText(url, `${site}/index.php/vod/type/id/${tid}.html`);
    if (!html && page > 1) {
        url = `${site}/index.php/vod/type/id/${tid}/page/${page}.html`;
        html = await fetchText(url, `${site}/index.php/vod/type/id/${tid}.html`);
    }
    return html ? parseItems(html, inReq) : [];
}

function parseDetail(html, vid, baseUrl, inReq) {
    let title = '';
    let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = m[1].replace(/<[^>]+>/g, '').trim();
    if (!title) {
        m = html.match(/<title>([^<]+)<\/title>/);
        if (m) title = m[1].trim().split(/\s*[-–|]\s*/)[0].trim();
    }
    if (!title) title = vid;

    let cover = '';
    m = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (m) cover = m[1];
    if (!cover) {
        m = html.match(/<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/);
        if (m) cover = m[1];
    }
    if (!cover) {
        m = html.match(/data-original="([^"]+)"/);
        if (m) cover = m[1];
    }

    const playLinks = [
        ...new Set(
            [...html.matchAll(/href=["'](\/index\.php\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+\.html)["']/g)].map(
                (x) => {
                    try {
                        return new URL(x[1], baseUrl).href;
                    } catch {
                        return site + x[1];
                    }
                },
            ),
        ),
    ].filter((u) => u.startsWith('http'));

    if (!playLinks.length) {
        playLinks.push(`${site}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`);
    }

    const sources = [];
    const urls = [];
    playLinks.forEach((playUrl, idx) => {
        const label = `线路${idx + 1}`;
        sources.push(label);
        urls.push(`${label}$${playUrl}`);
    });

    return {
        vod_id: vid,
        vod_name: title,
        vod_pic: cover ? proxyImg(cover, inReq) : '',
        // from / url 一一对应 $$$（修正原 Python # 拼接不一致）
        vod_play_from: sources.join('$$$'),
        vod_play_url: urls.join('$$$'),
        vod_content: title,
    };
}

async function fetchDetail(vid, inReq) {
    const url = `${site}/index.php/vod/detail/id/${vid}.html`;
    log(`获取详情: ${url}`);
    const html = await fetchText(url, site);
    if (!html) return null;
    return parseDetail(html, vid, url, inReq);
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
        const cats = categoriesCache || [];
        const homeList = text ? parseItems(text, inReq) : [];
        return {
            class: cats,
            filters: {},
            list: homeList,
            page: 1,
            pagecount: 1,
            limit: homeList.length,
            total: homeList.length,
        };
    } catch (e) {
        log(`home 异常: ${e.message}`);
        return { class: [], filters: {}, list: [] };
    }
}

async function category(inReq, _outResp) {
    try {
        const tid = String(inReq.body.id || '');
        const pg = inReq.body.page || inReq.body.pg || '1';

        if (tid.startsWith('search_')) {
            return search({ body: { wd: tid.slice(7), pg } }, _outResp);
        }

        if (tid === 'home') {
            const html = await fetchText(site);
            const items = html ? parseItems(html, inReq) : [];
            return { list: items, page: 1, pagecount: 1, limit: items.length, total: items.length };
        }

        const page = parseInt(pg, 10) || 1;
        const items = await getList(tid, page, inReq);
        let totalPage = page + 1;
        if (page === 1) {
            const firstHtml = await fetchText(`${site}/index.php/vod/type/id/${tid}.html`);
            if (firstHtml) {
                let pages = [...firstHtml.matchAll(/\/page\/(\d+)\.html/g)].map((x) => parseInt(x[1], 10));
                if (!pages.length) {
                    pages = [...firstHtml.matchAll(/[?&]page=(\d+)/g)].map((x) => parseInt(x[1], 10));
                }
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
        let d = await fetchDetail(vid, inReq);
        if (!d) {
            d = { vod_id: vid, vod_name: vid, vod_pic: '', vod_play_from: '无', vod_play_url: '无$' };
        }
        return { list: [d] };
    } catch (e) {
        log(`detail 异常: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        let id = String(inReq.body.id || '');
        if (!id) return { parse: 0, url: '', header: {} };

        if (/^\d+$/.test(id)) {
            const d = await fetchDetail(id, inReq);
            if (d?.vod_play_url) {
                const first = d.vod_play_url.split('$$$')[0].split('#')[0];
                id = first.includes('$') ? first.split('$').slice(1).join('$') : first;
            }
        }

        if (id.endsWith('.html') && id.startsWith('http')) {
            return {
                parse: 1,
                url: id,
                header: { Referer: site, 'User-Agent': UA },
            };
        }

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
        const url = `${site}/index.php/vod/search.html?wd=${encodeURIComponent(key)}&page=${page}`;
        const html = await fetchText(url, site);
        const items = html ? parseItems(html, inReq) : [];
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
        key: 'zsrenqi',
        name: '🌸真实人妻',
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
