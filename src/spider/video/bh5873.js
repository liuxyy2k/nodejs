import axios from 'axios';
import crypto from 'crypto';
import https from 'https';
import zlib from 'zlib';

/**
 * 笔盒 - https://bh5873.top
 * AES-128-CBC API + XOR 图片代理 (.txt)
 */

const HOST = 'https://bh5873.top';
const API = `${HOST}/api`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const AES_KEY = Buffer.from([
    0xf6, 0x32, 0x2f, 0xa1, 0xc0, 0x64, 0x37, 0x0e, 0xa4, 0x0c, 0x8c, 0xdc, 0x20, 0x64, 0x9f, 0x8e,
]);
const IMG_XOR_KEY = 18;

const CLASS_IDS = [
    '推荐',
    '最新',
    '国产精品',
    '黑丝巨乳',
    '学生空姐',
    '人妻少妇',
    '偷拍自拍',
    '无码流出',
    '动漫CG',
    '口交颜射',
    'SM调教',
    '美腿丝袜',
    '约炮外遇',
    '乱伦熟女',
    '野战车震',
    '露出暴露',
    '绿帽淫妻',
    '多人群P',
    '制服诱惑',
    '萝莉嫩妹',
    '巨乳肥臀',
    '三级伦理',
    '剧情有码',
    '同性耽美',
    '网红主播',
    'ASMR',
    '专题',
];

const CLASSES = CLASS_IDS.map((tid) => ({ type_name: tid, type_id: tid }));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 15_000,
    httpsAgent,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: `${HOST}/home`,
    },
});

function log(msg) {
    console.log(`[BH] ${msg}`);
}

function getHeaders(extra = {}) {
    return {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: `${HOST}/home`,
        ...extra,
    };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/bh5873/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}/proxy`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}/proxy`;
}

function aesDecrypt(hexData) {
    try {
        const raw = Buffer.from(hexData, 'hex');
        if (raw.length < 16) return hexData;
        const iv = raw.subarray(0, 16);
        const ct = raw.subarray(16);
        const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, iv);
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return pt.toString('utf8');
    } catch (e) {
        log(`aes: ${e.message}`);
        return '';
    }
}

async function apiRequest(path, params = null, method = 'GET', body = null) {
    const url = API + path;
    try {
        const opts = {
            method,
            url,
            headers: getHeaders(),
        };
        if (params) opts.params = params;
        if (body) {
            opts.data = body;
            opts.headers = getHeaders({ 'Content-Type': 'application/json' });
        }
        const resp = await http.request(opts);
        if (resp.status !== 200) return {};
        const j = resp.data;
        if (j?.code !== 200) return {};
        const enc = j.data;
        if (!enc || typeof enc !== 'string' || enc.length < 32) {
            return enc && typeof enc === 'object' ? enc : {};
        }
        const dec = aesDecrypt(enc);
        return dec ? JSON.parse(dec) : {};
    } catch (e) {
        log(`api: ${e.message}`);
        return {};
    }
}

function cleanTitle(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function imageProxyUrl(rawUrl, inReq) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    if (!rawUrl.endsWith('.txt') && rawUrl.startsWith('http')) {
        if (/\.(jpg|jpeg|png|webp|gif)$/i.test(rawUrl)) return rawUrl;
    }
    const encoded = Buffer.from(rawUrl, 'utf8').toString('base64');
    return `${getProxyBase(inReq)}?type=bh_img&url=${encodeURIComponent(encoded)}`;
}

function makeItem(item, inReq) {
    return {
        vod_id: item.vodId || '',
        vod_name: cleanTitle(item.vodName || ''),
        vod_pic: imageProxyUrl(item.vodPic || '', inReq),
        vod_remarks: item.rating || '',
    };
}

function extractVodList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
}

function isDirectMedia(url) {
    return /\.(?:m3u8|mp4|flv)($|\?|&)/i.test(url || '');
}

async function topicFolderList(page, limit, inReq) {
    const data = await apiRequest('/topic/list', { page });
    const topics = extractVodList(data);
    const items = topics.map((t) => {
        let cover = '';
        const related = t.relatedVods;
        if (Array.isArray(related) && related[0] && typeof related[0] === 'object') {
            cover = imageProxyUrl(related[0].vodPic || '', inReq);
        }
        return {
            vod_id: `topic:${t.topicId || ''}`,
            vod_name: String(t.topicName || '').trim(),
            vod_pic: cover,
            vod_remarks: '',
            vod_tag: 'folder',
        };
    });
    return {
        list: items,
        page,
        pagecount: data.totalPages || 1,
        limit,
        total: data.total || items.length,
    };
}

async function topicVideos(tid, inReq) {
    const topicId = tid.replace('topic:', '');
    const topic = await apiRequest(`/topic/detail/${topicId}`);
    const related = topic?.relatedVods || [];
    const items = (Array.isArray(related) ? related : []).map((r) => makeItem(r, inReq));
    return {
        list: items,
        page: 1,
        pagecount: 1,
        limit: items.length,
        total: items.length,
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    let vods = [];
    const carousel = await apiRequest('/vod/carousel');
    if (Array.isArray(carousel) && carousel.length) {
        vods = carousel.slice(0, 20).map((item) => makeItem(item, inReq));
    }
    if (!vods.length) {
        const latest = await apiRequest('/vod/latest', { page: 1, limit: 20 });
        vods = extractVodList(latest).map((item) => makeItem(item, inReq));
    }
    return { class: CLASSES, filters: {}, list: vods };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '推荐');
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const limit = 24;

    if (tid === '专题') {
        return topicFolderList(page, limit, inReq);
    }
    if (tid.startsWith('topic:')) {
        return topicVideos(tid, inReq);
    }

    let data = {};
    let vodList = [];

    if (tid === '推荐') {
        data = await apiRequest('/vod/recommend', { page, limit });
        vodList = extractVodList(data);
    } else if (tid === '最新') {
        data = await apiRequest('/vod/latest', { page, limit });
        vodList = extractVodList(data);
    } else {
        data = await apiRequest('/vod/search', { keyword: tid, page });
        vodList = extractVodList(data);
    }

    const items = vodList.map((item) => makeItem(item, inReq));

    return {
        list: items,
        page,
        pagecount: data.totalPages || 99,
        limit,
        total: data.total || items.length,
    };
}

async function detail(inReq, _outResp) {
    const vodId = String(inReq.body.id || '');
    if (!vodId) return { list: [] };

    const detailData = await apiRequest(`/vod/detail/${vodId}`);
    if (!detailData || typeof detailData !== 'object' || !detailData.vodId) {
        return {
            list: [{ vod_id: vodId, vod_name: '加载失败', vod_pic: '', vod_remarks: '' }],
        };
    }

    const vodPlayFrom = [];
    const vodPlayUrl = [];
    const playSource = detailData.vodPlaySource;

    if (playSource && typeof playSource === 'object') {
        for (const [srcName, episodes] of Object.entries(playSource)) {
            if (!Array.isArray(episodes) || !episodes.length) continue;
            vodPlayFrom.push(srcName);
            const parts = episodes.map((ep) => {
                const playUrl = ep.playUrl || ep.url || '';
                const label = ep.flag || '';
                return `${label}$${playUrl}`;
            });
            vodPlayUrl.push(parts.join('#'));
        }
    }

    if (!vodPlayFrom.length) {
        vodPlayFrom.push('默认');
        vodPlayUrl.push('');
    }

    const vodClass = detailData.vodClass;
    const typeName = Array.isArray(vodClass) ? vodClass[0] || '' : '';

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: String(detailData.vodName || '').trim(),
                vod_pic: imageProxyUrl(detailData.vodPic || '', inReq),
                type_name: typeName,
                vod_year: '',
                vod_area: '',
                vod_remarks: detailData.rating || '',
                vod_actor: '',
                vod_director: '',
                vod_content: '',
                vod_play_from: vodPlayFrom.join('$$$'),
                vod_play_url: vodPlayUrl.join('$$$'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let url = decodeURIComponent(String(inReq.body.id || ''));
    const flag = inReq.body.flag || '';

    if (isDirectMedia(url)) {
        return { parse: 0, url, header: getHeaders() };
    }

    try {
        const parsed = await apiRequest('/vod/parse-url', null, 'POST', {
            playerFrom: flag,
            playUrl: url,
        });
        if (parsed && typeof parsed === 'object' && parsed.url) {
            url = parsed.url;
        }
    } catch (e) {
        log(`parse-url: ${e.message}`);
    }

    if (isDirectMedia(url)) {
        return { parse: 0, url, header: getHeaders() };
    }

    return { parse: 1, url, header: getHeaders() };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const page = Math.max(1, parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1);

    const data = await apiRequest('/vod/search', { keyword: key, page });
    const items = extractVodList(data).map((item) => makeItem(item, inReq));

    return {
        list: items,
        page,
        pagecount: data.totalPages || 99,
        limit: 20,
        total: data.total || items.length,
    };
}

async function proxyHandler(inReq, outResp) {
    if (inReq.query.type !== 'bh_img') {
        return outResp.code(404).type('text/plain').send('not found');
    }

    try {
        let rawUrlB64 = decodeURIComponent(inReq.query.url || '');
        if (!rawUrlB64) return outResp.code(400).type('text/plain').send('missing url');

        const pad = (4 - (rawUrlB64.length % 4)) % 4;
        if (pad) rawUrlB64 += '='.repeat(pad);

        const imgUrl = Buffer.from(rawUrlB64, 'base64').toString('utf8');

        if (imgUrl.endsWith('.txt')) {
            const resp = await http.get(imgUrl, {
                headers: getHeaders({ 'Accept-Encoding': 'identity' }),
                responseType: 'arraybuffer',
            });
            if (resp.status !== 200) {
                return outResp.code(resp.status).type('text/plain').send('image fetch failed');
            }

            let raw = Buffer.from(resp.data);
            if (raw[0] === 0x1f && raw[1] === 0x8b) {
                raw = zlib.gunzipSync(raw);
            }

            const size = Math.min(4096, raw.length);
            const xorPart = Buffer.from(raw.subarray(0, size).map((b) => b ^ IMG_XOR_KEY));
            const xorData = Buffer.concat([xorPart, raw.subarray(size)]);
            const text = xorData.toString('utf8');

            const match = text.match(/^data:([^;]+);base64,(.+)$/i);
            if (!match) return outResp.code(500).type('text/plain').send('decrypt failed');

            const mime = match[1];
            const imgBytes = Buffer.from(match[2], 'base64');
            return outResp.type(mime).send(imgBytes);
        }

        const resp = await http.get(imgUrl, {
            headers: getHeaders(),
            responseType: 'arraybuffer',
            timeout: 30_000,
        });
        if (resp.status !== 200) return outResp.code(resp.status).send('');
        const ct = resp.headers['content-type'] || 'image/jpeg';
        return outResp.type(ct).send(Buffer.from(resp.data));
    } catch (e) {
        log(`proxy: ${e.message}`);
        return outResp.code(500).type('text/plain').send(String(e.message));
    }
}

export default {
    meta: {
        key: 'bh5873',
        name: '💋笔盒',
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
