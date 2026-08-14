import axios from 'axios';
import https from 'https';

/**
 * yemahl - https://www.yemahl.xyz
 * 列表 article 解析 · 双重 base64 标题 · classid=41 磁力播放
 */

const DEFAULT_HOST = 'https://www.yemahl.xyz';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CATS = [
    { type_id: '41', type_name: '有码番号' },
    { type_id: '39', type_name: '番号视频' },
    { type_id: '39&fenlei=中文字幕', type_name: '中文字幕' },
    { type_id: '39&fenlei=巨乳美乳', type_name: '巨乳美乳' },
    { type_id: '39&fenlei=强奸乱伦', type_name: '强奸乱伦' },
    { type_id: '39&fenlei=制服丝袜', type_name: '制服丝袜' },
    { type_id: '39&fenlei=萝莉少女', type_name: '萝莉少女' },
    { type_id: '39&fenlei=精品素人', type_name: '精品素人' },
    { type_id: '39&fenlei=亚洲有码', type_name: '亚洲有码' },
    { type_id: '39&fenlei=亚洲无码', type_name: '亚洲无码' },
    { type_id: '39&fenlei=女同性恋', type_name: '女同性恋' },
    { type_id: '40', type_name: '国产视频' },
    { type_id: '40&fenlei=国产自拍', type_name: '国产自拍' },
    { type_id: '40&fenlei=国产传媒', type_name: '国产传媒' },
    { type_id: '40&fenlei=AV解说', type_name: 'AV解说' },
    { type_id: '40&fenlei=国产乱伦', type_name: '国产乱伦' },
    { type_id: '40&fenlei=网红主播', type_name: '网红主播' },
    { type_id: '40&fenlei=探花约炮', type_name: '探花约炮' },
    { type_id: '40&fenlei=ai换脸', type_name: 'ai换脸' },
    { type_id: '40&fenlei=伦理三级', type_name: '伦理三级' },
    { type_id: '40&fenlei=欧美精品', type_name: '欧美精品' },
    { type_id: '40&fenlei=成人动漫', type_name: '成人动漫' },
];

let host = DEFAULT_HOST;
let headers = {
    'User-Agent': UA,
    Referer: `${DEFAULT_HOST}/`,
};

const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
    maxRedirects: 5,
});

function getHeaders(referer) {
    return {
        ...headers,
        Referer: referer || `${host}/`,
    };
}

function mediaHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
    };
}

function b64Decode(text) {
    try {
        const d1 = Buffer.from(String(text || '').trim(), 'base64').toString('utf8');
        if (/^[A-Za-z0-9+/=]+$/.test(d1) && d1.length > 10) {
            try {
                return Buffer.from(d1, 'base64').toString('utf8');
            } catch {
                return d1;
            }
        }
        return d1;
    } catch {
        return String(text || '').trim();
    }
}

function fixUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return `${host.replace(/\/$/, '')}${u}`;
    return u;
}

function splitVid(raw) {
    const id = String(raw || '').trim();
    if (id.includes('_')) {
        const [classid, vid] = id.split('_', 2);
        return { classid, vid };
    }
    return { classid: '40', vid: id };
}

async function fetchHtml(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const resp = await http.get(url, {
                headers: getHeaders(),
                responseType: 'text',
            });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200 && text.length > 500) return text;
        } catch {
            /* retry */
        }
    }
    return '';
}

function parseList(text) {
    if (!text) return [];
    const items = [];
    const seen = new Set();

    for (const m of text.matchAll(/<article[^>]*>(.*?)<\/article>/gis)) {
        const art = m[1];
        let linkM = art.match(/href="(\/video\.php\?classid=(\d+)&id=(\d+))"/i);
        if (!linkM) linkM = art.match(/href="(\/cili\.php\?classid=(\d+)&id=(\d+))"/i);
        if (!linkM) continue;

        const classid = linkM[2];
        const vid = linkM[3];
        if (seen.has(vid)) continue;
        seen.add(vid);

        let title = '';
        const titleM = art.match(/<h2><a[^>]*>([^<]*)<\/a>/i);
        if (titleM) title = b64Decode(titleM[1]);
        if (!title) title = `视频${vid}`;

        let pic = '';
        const picLazy = art.match(/data-lazy-src="([^"]+)"/i);
        if (picLazy) pic = fixUrl(picLazy[1]);
        if (!pic) {
            const picSrc = art.match(/<img[^>]+src="([^"]+)"/i);
            if (picSrc && !picSrc[1].includes('gifjiazai')) pic = fixUrl(picSrc[1]);
        }

        let remarks = '';
        const dateM = art.match(/class="img-info">([^<]*)</i);
        if (dateM) remarks = b64Decode(dateM[1]);

        items.push({
            vod_id: `${classid}_${vid}`,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarks,
            style: { type: 'rect', ratio: 1.33 },
        });
    }
    return items;
}

function extractM3u8(text) {
    if (!text) return '';
    let m3u8 = '';
    const raw = text.match(/data-raw="(https?:\/\/[^"]+\.m3u8)"/i);
    if (raw) m3u8 = raw[1];
    if (!m3u8) {
        const quoted = text.match(/["'](https?:\/\/[^"'<>]+\.m3u8)["']/i);
        if (quoted) m3u8 = quoted[1];
    }
    if (!m3u8) {
        const src = text.match(/src:\s*["']([^"']+\.m3u8)["']/i);
        if (src) m3u8 = src[1];
    }
    if (!m3u8) {
        for (const sc of text.matchAll(/<script[^>]*>(.*?)<\/script>/gis)) {
            const found = sc[1].match(/https?:\/\/[^\s"'<>]+\.m3u8/i);
            if (found) {
                m3u8 = found[0];
                break;
            }
        }
    }
    return m3u8;
}

function parseMagnetFromCili(text) {
    const reurlCalls = [...text.matchAll(/reurl\('([^']+)'\)/g)];
    if (!reurlCalls.length) return '';
    const binstr = reurlCalls[0][1];
    let hexHash = '';
    for (let i = 0; i <= binstr.length - 8; i += 8) {
        const chunk = binstr.slice(i, i + 8);
        if (chunk.length < 8) break;
        const val = parseInt(chunk, 2) - 10;
        if ((val >= 48 && val <= 57) || (val >= 97 && val <= 102)) {
            hexHash += String.fromCharCode(val);
        } else {
            break;
        }
    }
    if (hexHash.length >= 32) return `magnet:?xt=urn:btih:${hexHash}`;
    return '';
}

async function init(inReq, _outResp) {
    let extend = inReq.body?.extend ?? '';
    if (typeof extend === 'object' && extend !== null) {
        extend = extend.host || extend.site || '';
    }
    if (extend) {
        host = String(extend).startsWith('http')
            ? String(extend).replace(/\/$/, '')
            : String(extend).replace(/\/$/, '');
    } else {
        host = DEFAULT_HOST;
    }
    headers.Referer = `${host}/`;
    return {};
}

async function home(_inReq, _outResp) {
    const list = parseList(await fetchHtml(`${host}/`));
    return { class: CATS, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '').trim();
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const url = `${host}/list.php?classid=${tid}&page=${page}`;
    const text = await fetchHtml(url);
    const items = parseList(text);

    let pagecount = page;
    const pages = [...(text.matchAll(/page=(\d+)/g) || [])]
        .map((m) => parseInt(m[1], 10))
        .filter((n) => !Number.isNaN(n));
    if (pages.length) pagecount = Math.max(...pages);

    const hasNext = text ? new RegExp(`page=${page + 1}[">\\s]`).test(text) : false;
    const finalPagecount = pagecount > page ? pagecount : page + (hasNext ? 1 : 0);

    return {
        list: items,
        page,
        pagecount: finalPagecount,
        limit: items.length,
        total: pagecount > 1 ? pagecount * 20 : items.length,
    };
}

async function detail(inReq, _outResp) {
    let raw = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    raw = String(raw || '').trim();
    if (!raw) return { list: [] };

    const { classid, vid } = splitVid(raw);
    const isCili = classid === '41';
    const pageUrl = isCili
        ? `${host}/cili.php?classid=${classid}&id=${vid}`
        : `${host}/video.php?classid=${classid}&id=${vid}`;
    const text = await fetchHtml(pageUrl);
    if (!text) return { list: [] };

    let title = '';
    const titleM = text.match(/<title>(.*?)<\/title>/is);
    if (titleM) {
        const parts = titleM[1].trim().split(' - ');
        title = parts.length ? b64Decode(parts[0]) : titleM[1].trim();
    }
    if (!title) title = `视频${vid}`;

    let cover = '';
    const coverLazy = text.match(/data-lazy-src="(\/img\/[^"]+)"/i);
    if (coverLazy) cover = fixUrl(coverLazy[1]);
    if (!cover) {
        const poster = text.match(/<video[^>]+poster="([^"]+)"/i);
        if (poster) cover = fixUrl(poster[1]);
    }

    let playUrl = `正片$${classid}_${vid}`;
    if (!isCili) {
        const m3u8 = extractM3u8(text);
        if (m3u8) playUrl = `正片$${m3u8}`;
    }

    return {
        list: [
            {
                vod_id: `${classid}_${vid}`,
                vod_name: title,
                vod_pic: cover,
                vod_play_from: '默认线路',
                vod_play_url: playUrl,
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    if (!key) {
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }

    const url =
        page === 1
            ? `${host}/fontsearch.php?query=${encodeURIComponent(key)}`
            : `${host}/fontsearch.php?query=${encodeURIComponent(key)}&page=${page}`;
    const text = await fetchHtml(url);
    const items = parseList(text);
    const hasNext = text ? new RegExp(`page=${page + 1}`).test(text) : false;

    return {
        list: items,
        page,
        pagecount: hasNext ? page + 1 : page,
        limit: items.length,
        total: items.length,
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '').trim();
    const hdr = mediaHeaders();

    if (id.startsWith('http') && id.includes('.m3u8')) {
        return { parse: 0, jx: 0, playUrl: '', url: id, header: hdr };
    }

    const { classid, vid } = splitVid(id);

    if (classid === '41') {
        const pageUrl = `${host}/cili.php?classid=${classid}&id=${vid}`;
        const text = await fetchHtml(pageUrl);
        if (!text) {
            return { parse: 1, jx: 0, playUrl: '', url: pageUrl, header: hdr };
        }
        const magnet = parseMagnetFromCili(text);
        if (magnet) {
            return { parse: 0, jx: 0, playUrl: '', url: magnet, header: hdr };
        }
        return { parse: 1, jx: 0, playUrl: '', url: pageUrl, header: hdr };
    }

    const pageUrl = `${host}/video.php?classid=${classid}&id=${vid}`;
    const text = await fetchHtml(pageUrl);
    if (!text) {
        return { parse: 1, jx: 0, playUrl: '', url: pageUrl, header: hdr };
    }

    const m3u8 = extractM3u8(text);
    return {
        parse: m3u8 ? 0 : 1,
        jx: 0,
        playUrl: '',
        url: m3u8 || pageUrl,
        header: hdr,
    };
}

export default {
    meta: {
        key: 'yemahl',
        name: '🔥野马视频',
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
