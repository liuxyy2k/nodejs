import axios from 'axios';
import https from 'https';

const HOST = 'https://maomi66.cc';
const PLAY_HOST = 'https://m.892539.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const TID_BLACKLIST = new Set([
    '69799699',
    '69809699',
    '69819699',
    '69829699',
    '69839699',
    '69849699',
    '69859699',
    '69869699',
]);


const http = axios.create({
    timeout: 30000,
    validateStatus: () => true,
});

let categoriesCache = null;

function headers(referer = `${HOST}/`) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: referer,
    };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/maomi66/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}/proxy`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}/proxy`;
}

function proxyPic(url, inReq) {
    if (!url) return '';
    if (url.startsWith('http://127.0.0.1')) return url;
    return `${getProxyBase(inReq)}?url=${encodeURIComponent(url)}`;
}

function cleanHtml(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url, referer = `${HOST}/`, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            if (i > 0) await sleep(500 + Math.random() * 1000);
            const r = await http.get(url, { headers: headers(referer) });
            if (r.status === 200) {
                let text = typeof r.data === 'string' ? r.data : String(r.data || '');
                if (text.includes('location.href') && (text.includes('请稍后') || text.includes('数据处理中'))) {
                    const jumpM = text.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
                    if (jumpM) {
                        const jumpPath = jumpM[1];
                        const jumpUrl = jumpPath.startsWith('http')
                            ? jumpPath
                            : new URL(jumpPath, url).href;
                        console.log(`[maomi66] 遇到跳转页，跟随至: ${jumpUrl}`);
                        const r2 = await http.get(jumpUrl, { headers: headers(referer) });
                        if (r2.status === 200) {
                            return typeof r2.data === 'string' ? r2.data : String(r2.data || '');
                        }
                    }
                }
                return text;
            }
            if ([403, 429, 503].includes(r.status)) {
                console.log(`[maomi66] 请求被拦截 [${r.status}]，重试 ${i + 1}/${retries}`);
            } else {
                return '';
            }
        } catch (e) {
            console.log(`[maomi66] 请求异常 [${e.message}]，重试 ${i + 1}/${retries}`);
        }
    }
    return '';
}

function loadCategories(text) {
    if (!text) return [];
    const cats = [];
    const seen = new Set();
    const re = /<a href="\/list\/(\d+)-1\.html"(?:[^>]*?)>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const tid = m[1];
        const name = m[2].trim();
        if (!name || seen.has(name)) continue;
        if (TID_BLACKLIST.has(tid)) {
            console.log(`[maomi66] 过滤分类: [${tid}] ${name}`);
            continue;
        }
        seen.add(name);
        cats.push({ type_id: tid, type_name: name });
    }
    categoriesCache = cats;
    console.log(`[maomi66] 加载分类: ${cats.length} 个`);
    return cats;
}

function parseList(html, inReq) {
    const items = [];
    if (!html) return items;
    const blocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => x[1]);
    for (const li of blocks) {
        const aM = li.match(/<a class="xx-thumb" href="(\/(?:video|torrent)\/([^"]+)\.html)"/);
        if (!aM) continue;
        const href = aM[1];
        const vid = aM[2];
        if (href.startsWith('/torrent/')) continue;
        const imgM = li.match(/<img[^>]+data-original="([^"]+)"/);
        const pic = imgM ? imgM[1] : '';
        let title = vid;
        const h5M = li.match(/<h5><a[^>]*>([\s\S]*?)<\/a><\/h5>/);
        if (h5M) title = cleanHtml(h5M[1]);
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: proxyPic(pic, inReq),
            vod_remarks: '',
        });
    }
    return items;
}

async function getList(tid, page, inReq) {
    const url = `${HOST}/list/${tid}-${page}.html`;
    const html = await fetchHtml(url, `${HOST}/list/${tid}-1.html`);
    return parseList(html, inReq);
}

function parseDetail(html, vid, baseUrl, inReq) {
    let title = '';
    let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = cleanHtml(m[1]);
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
        playUrls.push(`${label}$${url}`);
    };

    let siteId = '';
    let sourceId = '';

    const commentM = html.match(/<!--\s*source_id:(\d+),\s*site_id:(\d+)/);
    if (commentM) {
        sourceId = commentM[1];
        siteId = commentM[2];
    }

    if (!siteId || !sourceId) {
        const hlsM = html.match(/hls\.loadSource\(['"]([^'"]+)['"]\)/);
        if (hlsM) {
            const playUrl = hlsM[1];
            const sidM = playUrl.match(/site_id=(\d+)/);
            const srcM = playUrl.match(/source_id=(\d+)/);
            if (sidM && srcM) {
                siteId = sidM[1];
                sourceId = srcM[1];
            }
        }
    }

    if (!siteId) {
        m = html.match(/site_id[=:]\s*(\d+)/);
        if (m) siteId = m[1];
    }
    if (!sourceId) {
        m = html.match(/source_id[=:]\s*(\d+)/);
        if (m) sourceId = m[1];
    }

    if (siteId && sourceId) {
        add('HLS直链', `${PLAY_HOST}/play.php?site_id=${siteId}&source_id=${sourceId}`);
    }

    for (const media of new Set(html.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|mkv|ts)(?:\?[^\s"'<>]*)?/g) || [])) {
        add('媒体直链', media);
    }

    for (const src of new Set(
        [...html.matchAll(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/g)].map((x) => x[1]),
    )) {
        if (['play.php', 'm3u8', 'mp4', 'embed', 'player'].some((k) => src.includes(k))) {
            add('外链', src.startsWith('http') ? src : new URL(src, baseUrl).href);
        }
    }

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    for (const script of scripts) {
        for (const b64 of script.match(/["']([A-Za-z0-9+/]{20,}={0,2})["']/g) || []) {
            const raw = b64.slice(1, -1);
            try {
                const dec = Buffer.from(raw, 'base64').toString('utf8');
                if (dec.startsWith('http') && ['.m3u8', '.mp4', 'play.php'].some((x) => dec.includes(x))) {
                    add('Base64', dec);
                }
            } catch {
                /* ignore */
            }
        }
    }

    if (!playUrls.length) add('默认线路', baseUrl);

    const sources = [];
    const urls = [];
    for (const pu of playUrls) {
        const idx = pu.indexOf('$');
        const sn = pu.slice(0, idx);
        const url = pu.slice(idx + 1);
        sources.push(sn);
        urls.push(`${sn}$${url}`);
    }

    return {
        vod_id: vid,
        vod_name: title || vid,
        vod_pic: cover ? proxyPic(cover, inReq) : '',
        vod_play_from: sources.length ? sources.join('$$$') : '默认',
        vod_play_url: urls.length ? urls.join('#') : `默认$${baseUrl}`,
        vod_content: title || '',
    };
}

async function fetchDetail(vid, inReq) {
    const url = `${HOST}/video/${vid}.html`;
    const html = await fetchHtml(url, HOST);
    if (!html) return null;
    const detail = parseDetail(html, vid, url, inReq);
    return detail?.vod_play_url ? detail : null;
}

async function init(_inReq, _outResp) {
    const text = await fetchHtml(HOST);
    if (text) loadCategories(text);
    return {};
}

async function home(_inReq, _outResp) {
    if (!categoriesCache) {
        const text = await fetchHtml(HOST);
        if (text) loadCategories(text);
    }
    return {
        class: categoriesCache || [],
        filters: {},
        type: '影视',
        list: [],
        page: 1,
        pagecount: 1,
        limit: 0,
        total: 0,
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    let page = parseInt(inReq.body.page, 10) || 1;
    const items = await getList(tid, page, inReq);
    let totalPage = page + 1;
    if (page === 1) {
        const html = await fetchHtml(`${HOST}/list/${tid}-1.html`);
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
}

async function detail(inReq, _outResp) {
    const vid = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '');
    const detail = await fetchDetail(vid, inReq);
    if (!detail) return { list: [] };
    return { list: [detail] };
}

async function play(inReq, _outResp) {
    let id = String(inReq.body.id || '');
    if (id && !id.startsWith('http')) {
        const detail = await fetchDetail(id, inReq);
        if (detail?.vod_play_url) {
            const first = detail.vod_play_url.split('#')[0];
            id = first.includes('$') ? first.split('$').slice(1).join('$') : first;
        }
    }
    let referer = `${HOST}/`;
    if (id.startsWith('http')) {
        try {
            const u = new URL(id);
            referer = `${u.protocol}//${u.host}/`;
        } catch {
            /* keep default */
        }
    }
    return {
        parse: 0,
        url: id,
        header: {
            Referer: referer,
            'User-Agent': UA,
        },
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    let page = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const html = await fetchHtml(`${HOST}/search.php?content=${key}&type=1&page=${page}`, HOST);
    const items = parseList(html, inReq);
    return {
        list: items,
        page,
        pagecount: page + 1,
        limit: items.length,
        total: page * items.length,
    };
}

async function proxyHandler(inReq, outResp) {
    let url = inReq.query.url || '';
    if (Array.isArray(url)) url = url[0] || '';
    url = decodeURIComponent(url || '');
    if (!url.startsWith('http')) return outResp.code(404).send('');

    try {
        const resp = await http.get(url, {
            headers: {
                'User-Agent': UA,
                Referer: `${HOST}/`,
            },
            responseType: 'arraybuffer',
            timeout: 20000,
        });
        if (resp.status !== 200) return outResp.code(resp.status).send('');
        const ct = resp.headers['content-type'] || 'image/jpeg';
        return outResp.header('Access-Control-Allow-Origin', '*').type(ct).send(Buffer.from(resp.data));
    } catch {
        return outResp.code(404).send('');
    }
}

export default {
    meta: {
        key: 'maomi66',
        name: '🔥maomi66',
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
