import crypto from 'crypto';
import req from '../../util/req.js';

/**
 * BestJavPorn · bestjavporn.me
 * 播放: /xx/ embed → pox + dp → CryptoJS AES-256-CBC → m3u8
 */

const SITE_URL = 'https://bestjavporn.me';
const TG_GROUP = 'https://t.me/tvshare23';
const BRAND_ACTOR = '🦋 TG群: @tvshare23';
const BRAND_DIRECTOR = '🦋 蝴蝶影视';
const UA =
    'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const PORT = process.env.DEV_HTTP_PORT || 9988;

const ROUTES = {
    censored: '/category/censored/',
    amateur: '/category/amateur/',
    'reducing-mosaic': '/category/reducing-mosaic/',
    latest: '/?filter=latest',
    'most-viewed': '/?filter=most-viewed',
    longest: '/?filter=longest',
    random: '/?filter=random',
};

const CLASSES = [
    { type_id: 'censored', type_name: '有码专区' },
    { type_id: 'amateur', type_name: '素人专区' },
    { type_id: 'reducing-mosaic', type_name: '去码专区' },
    { type_id: 'latest', type_name: '最新更新' },
    { type_id: 'most-viewed', type_name: '最多观看' },
    { type_id: 'longest', type_name: '最长时长' },
    { type_id: 'random', type_name: '随机推荐' },
];

let options = {};
let siteUrl = SITE_URL;

function applyConfig(extend) {
    options = {};
    if (!extend) return;
    if (typeof extend === 'object' && extend !== null) {
        options = { ...extend };
    } else {
        const raw = String(extend).trim();
        if (raw.startsWith('{')) {
            try {
                options = JSON.parse(raw);
            } catch {
                /* ignore */
            }
        }
    }
    const configured = options.siteUrl || options.site || SITE_URL;
    siteUrl = String(configured).replace(/\/$/, '');
}

function fetchHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${siteUrl}/`,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Connection: 'keep-alive',
    };
}

function absUrl(url) {
    if (!url) return '';
    let u = String(url).trim();
    if (u.startsWith('http://')) u = `https://${u.slice(7)}`;
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return `${siteUrl}${u}`;
    return `${siteUrl}/${u}`;
}

async function fetchHtml(targetUrl, referer = '') {
    if (!targetUrl) return '';
    let url = targetUrl;
    if (url.startsWith('//')) url = `https:${url}`;
    else if (url.startsWith('/')) url = absUrl(url);

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await req.get(url, {
                headers: fetchHeaders(referer),
                timeout: 15000,
                responseType: 'text',
                validateStatus: () => true,
            });
            if (resp.status >= 400) continue;
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        } catch {
            /* retry */
        }
    }
    return '';
}

function cleanText(raw) {
    return String(raw || '')
        .replace(/<[^>]+>/g, '')
        .replace(/[\r\n\t\s]+/g, ' ')
        .trim();
}

function formatRemarks(meta = '') {
    const cleanMeta = String(meta || '')
        .replace(/[\r\n\t]+/g, ' ')
        .trim();
    return cleanMeta ? `蝴蝶影视 | ${cleanMeta}` : '蝴蝶影视';
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/bestjavporn/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function imageMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 4 && buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

function wrapPic(imgUrl, inReq) {
    if (!imgUrl) return '';
    const pic = absUrl(imgUrl);
    if (pic.includes('/img?url=') || pic.includes('@Referer=')) return pic;
    if (inReq && pic.startsWith('http')) {
        const b64 = Buffer.from(pic, 'utf8').toString('base64');
        return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(b64)}`;
    }
    return `${pic}@Referer=${encodeURIComponent(`${siteUrl}/`)}@User-Agent=${encodeURIComponent(UA)}`;
}

function extractImg(chunk) {
    for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'src']) {
        const re = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i');
        const m = chunk.match(re);
        if (!m) continue;
        let val = m[1].trim();
        if (!val || val.startsWith('data:') || val.includes('svg')) continue;
        if (val.startsWith('//')) val = `https:${val}`;
        else if (val.startsWith('http://')) val = `https://${val.slice(7)}`;
        return val;
    }
    return '';
}

function evpKdf(password, salt, keyLen = 32) {
    let dtot = Buffer.alloc(0);
    let d = Buffer.alloc(0);
    const pw = Buffer.from(String(password), 'utf8');
    while (dtot.length < keyLen) {
        d = crypto.createHash('md5').update(Buffer.concat([d, pw, salt])).digest();
        dtot = Buffer.concat([dtot, d]);
    }
    return dtot.subarray(0, keyLen);
}

function cryptoJsAesDecrypt(pox, dpB64) {
    try {
        const data = JSON.parse(Buffer.from(dpB64, 'base64').toString('utf8'));
        const ct = Buffer.from(String(data.ct || '').replace(/\\\//g, '/'), 'base64');
        const iv = Buffer.from(data.iv, 'hex');
        const salt = Buffer.from(data.s, 'hex');
        const parts = String(pox).split('+');
        if (parts.length < 2) return '';
        const keyStr = parts[1].length > 1 ? parts[1].slice(1) : parts[1];
        const key = evpKdf(keyStr, salt, 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return pt
            .toString('utf8')
            .trim()
            .replace(/^"|"$/g, '')
            .replace(/\\\//g, '/');
    } catch {
        return '';
    }
}

function extractEmbedUrl(html) {
    const lazy = html.match(/data-rocketlazyloadscript=['"]data:text\/javascript;base64,([A-Za-z0-9+/=]+)['"]/i);
    if (lazy) {
        try {
            const js = Buffer.from(lazy[1], 'base64').toString('utf8');
            const um = js.match(/defaultUrl\s*=\s*["']([^"']+)["']/);
            if (um) {
                let u = um[1];
                if (u.startsWith('http://')) u = `https://${u.slice(7)}`;
                return u;
            }
        } catch {
            /* ignore */
        }
    }
    const m2 = html.match(/(https?:\/\/[^"']+\/xx\/[A-Za-z0-9]+)/);
    if (m2) {
        let u = m2[1];
        if (u.startsWith('http://')) u = `https://${u.slice(7)}`;
        return u;
    }
    return '';
}

async function resolveStream(pageUrl, html = '') {
    if (!html) html = await fetchHtml(pageUrl);
    if (!html) return '';

    const m3 = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3 && !m3[1].toLowerCase().includes('preview')) return m3[1];

    const embed = extractEmbedUrl(html);
    if (!embed) return '';

    const embHtml = await fetchHtml(embed, pageUrl);
    const poxM = embHtml.match(/let\s+pox\s*=\s*['"]([^'"]+)['"]/);
    const dpM = embHtml.match(/let\s+dp\s*=\s*['"]([^'"]+)['"]/);
    if (poxM && dpM) {
        const stream = cryptoJsAesDecrypt(poxM[1], dpM[1]);
        if (stream && (stream.includes('m3u8') || stream.startsWith('http'))) {
            return stream.trim().replace(/^"|"$/g, '');
        }
    }

    const m3b = embHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    return m3b ? m3b[1] : '';
}

async function preferMediaPlaylist(masterUrl) {
    if (!masterUrl || !masterUrl.includes('master.m3u8')) return masterUrl;
    const text = await fetchHtml(masterUrl, `${siteUrl}/`);
    if (!text || !text.includes('#EXTM3U')) return masterUrl;

    const pairs = [...text.matchAll(/#EXT-X-STREAM-INF:([^\n]*)\n([^\s]+)/g)];
    if (!pairs.length) return masterUrl;

    const base = `${masterUrl.rsplit('/', 1)[0]}/`;
    let bestU = masterUrl;
    let bestBw = -1;
    for (const m of pairs) {
        let u = m[2];
        if (!u.startsWith('http')) u = base + u;
        const bwM = m[1].match(/BANDWIDTH=(\d+)/);
        const bw = bwM ? parseInt(bwM[1], 10) : 0;
        if (bw >= bestBw) {
            bestBw = bw;
            bestU = u;
        }
    }
    return bestU;
}

function buildCategoryUrl(tid, page) {
    let base;
    if (tid.startsWith('http')) base = tid;
    else if (tid.startsWith('/') || tid.startsWith('?s=')) base = `${siteUrl}${tid.startsWith('/') || tid.startsWith('?') ? tid : `/${tid}`}`;
    else if (ROUTES[tid]) base = `${siteUrl}${ROUTES[tid]}`;
    else base = `${siteUrl}/category/censored/`;

    if (page > 1) {
        if (base.includes('filter=') || base.includes('?s=')) {
            const sep = base.includes('?') ? '&' : '?';
            return `${base}${sep}paged=${page}`;
        }
        return `${base.replace(/\/$/, '')}/page/${page}/`;
    }
    return base;
}

function parseCategory(html, inReq) {
    if (!html || html.length < 500) return [];

    let scoped = html.replace(/<header[\s\S]*?<\/header>/gi, '');
    scoped = scoped.replace(/<nav[\s\S]*?<\/nav>/gi, '');

    let articles = [...scoped.matchAll(/(<article[^>]*class="[^"]*loop-video[^"]*"[^>]*>[\s\S]*?<\/article>)/gi)].map(
        (m) => m[1],
    );
    if (!articles.length) {
        const parts = scoped.split('thumb-block');
        if (parts.length > 2) articles = parts.slice(1);
    }

    const list = [];
    for (const chunk of articles) {
        let linkM = chunk.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']*)["']/i);
        if (!linkM) linkM = chunk.match(/<a[^>]+href=["']([^"']+)["']/i);
        if (!linkM) continue;

        const href = linkM[1].trim();
        let title = linkM[2] ? cleanText(linkM[2]) : '';
        if (!title) {
            const t2 = chunk.match(/<header[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
            if (t2) title = cleanText(t2[1]);
        }
        if (!href || href.startsWith('javascript:')) continue;

        const fullHref = absUrl(href);
        const pic = wrapPic(extractImg(chunk), inReq);
        let durM = chunk.match(/class="duration"[^>]*>[\s\S]*?<\/i>\s*([0-9:]+)/i);
        if (!durM) durM = chunk.match(/duration[^>]*>[\s\S]*?([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i);
        const duration = durM ? cleanText(durM[1]) : '';

        list.push({
            vod_id: fullHref,
            vod_name: title || '未知片目',
            vod_pic: pic,
            vod_remarks: formatRemarks(duration),
            style: { type: 'rect', ratio: 1.78 },
        });
    }
    return list;
}

function hasNextPage(html, page) {
    return (
        new RegExp(`/page/${page + 1}[/"']`).test(html) ||
        new RegExp(`paged=${page + 1}`).test(html)
    );
}

async function categoryContent(tid, page, inReq) {
    const reqUrl = buildCategoryUrl(String(tid).trim(), page);
    const html = await fetchHtml(reqUrl);
    const list = parseCategory(html, inReq);
    const hasNext = hasNextPage(html, page);
    return {
        page,
        pagecount: hasNext ? page + 1 : page,
        limit: list.length,
        total: hasNext ? 9999 : list.length,
        list,
    };
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return { ok: true };
}

async function home(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const result = await categoryContent('censored', 1, inReq);
    return { class: CLASSES, filters: {}, list: result.list };
}

async function category(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const tid = inReq.body.tid || inReq.body.id || 'censored';
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    return categoryContent(tid, page, inReq);
}

async function detail(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const targetUrl = absUrl(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id);
    const html = await fetchHtml(targetUrl);

    let titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!titleM) titleM = html.match(/itemprop="name"\s+content="([^"]+)"/i);
    const title = titleM ? cleanText(titleM[1]) : '正片详情';

    const cover = wrapPic(extractImg(html), inReq);
    const durM = html.match(/class="duration"[^>]*>[\s\S]*?([0-9:]+)/i);
    const durStr = durM ? cleanText(durM[1]) : '';

    const intro =
        `【🔥 蝴蝶影视交流群: ${TG_GROUP}】\n` +
        `• 影片标题: ${title}\n` +
        `• 时长: ${durStr || '完整正片'}\n` +
        '• 源站: bestjavporn.me';

    return {
        list: [
            {
                vod_id: targetUrl,
                vod_name: title,
                vod_pic: cover,
                vod_actor: BRAND_ACTOR,
                vod_director: BRAND_DIRECTOR,
                vod_remarks: '蝴蝶影视',
                vod_content: intro.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                vod_play_from: '蝴蝶专线',
                vod_play_url: `超清正片$raw_page@@${targetUrl}`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();

    let streamUrl = '';
    if (raw.startsWith('raw_page@@')) {
        streamUrl = await resolveStream(raw.split('@@', 2)[1]);
    } else if (raw.startsWith('http') && (raw.includes('.m3u8') || raw.includes('videplay') || raw.includes('.mp4'))) {
        streamUrl = raw;
    } else if (raw.startsWith('http')) {
        streamUrl = await resolveStream(raw);
    }

    if (streamUrl && streamUrl.includes('master.m3u8')) {
        try {
            streamUrl = await preferMediaPlaylist(streamUrl);
        } catch {
            /* keep master */
        }
    }

    const header = {
        'User-Agent': UA,
        Referer: `${siteUrl}/`,
        Origin: siteUrl,
        Accept: '*/*',
    };

    return {
        parse: streamUrl ? 0 : 1,
        playUrl: '',
        url: streamUrl || raw,
        jx: 0,
        header,
    };
}

async function search(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const q = encodeURIComponent(String(inReq.body.wd || inReq.body.key || '').trim());
    const path = page > 1 ? `/page/${page}/?s=${q}` : `/?s=${q}`;
    return categoryContent(path, page, inReq);
}

async function imgProxy(inReq, reply) {
    try {
        let imgB64 = inReq.query.url || '';
        try {
            imgB64 = decodeURIComponent(imgB64);
        } catch {
            /* ignore */
        }
        const pad = (4 - (imgB64.length % 4)) % 4;
        if (pad) imgB64 += '='.repeat(pad);
        const imgUrl = Buffer.from(imgB64, 'base64').toString('utf8');
        if (!imgUrl || !imgUrl.startsWith('http')) return reply.code(404).send('');

        const resp = await req.get(imgUrl, {
            headers: fetchHeaders(`${siteUrl}/`),
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data) return reply.code(404).send('');

        const body = Buffer.from(resp.data);
        return reply.code(200).header('Content-Type', imageMime(body)).send(body);
    } catch (e) {
        console.warn('[bestjavporn] imgProxy err', e.message);
        return reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'bestjavporn',
        name: '🔥BestJavPorn',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgProxy);
    },
};
