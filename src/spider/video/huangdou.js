import axios from 'axios';
import crypto from 'crypto';
import https from 'https';
import zlib from 'zlib';

const HMAC_KEY = '7961beb44246e3012ce228d6b5ced05a';
const UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

const HOSTS = [
    { code: 'china_1', base: 'https://lzlukvca.cc' },
    { code: 'china_1', base: 'https://psfxhhox.top' },
    { code: 'china_2', base: 'https://sxqirtho.top' },
    { code: 'china_3', base: 'https://qicuknlj.top' },
    { code: 'china_4', base: 'https://hddj05.com' },
    { code: 'china_5', base: 'https://hddj06.com' },
    { code: 'china_6', base: 'https://hddj07.com' },
    { code: 'oversea_1', base: 'https://hvthtcpa.top' },
];

const CATEGORIES = [
    { id: 'yuandou', name: '黄豆原创' },
    { id: 'aiman', name: 'AI漫剧' },
    { id: 'erciyuan', name: '二次元' },
    { id: 'caibian', name: '擦边' },
    { id: 'zhenren', name: '真人' },
    { id: 'zongyi', name: '综艺' },
    { id: 'heiliao', name: '黑料' },
    { id: 'guochuanmei', name: '国产传媒' },
];

const CAT_NAMES = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));


const http = axios.create({
    timeout: 20000,
    validateStatus: () => true,
});

let currentHost = HOSTS[0].base;
let session = null;
let deviceId = null;
let navCache = null;

function deriveKey(requestId) {
    return crypto
        .createHmac('sha256', Buffer.from(HMAC_KEY, 'utf8'))
        .update(Buffer.from(String(requestId).replace(/-/g, ''), 'hex'))
        .digest();
}

function encryptPayload(data, requestId) {
    const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8'));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', deriveKey(requestId), iv);
    const encrypted = Buffer.concat([cipher.update(gzipped), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
}

function decryptPayload(buf, requestId) {
    if (!buf || buf.length < 32) return null;
    if (buf[0] === 0x7b || buf[0] === 0x5b) {
        try {
            return JSON.parse(buf.toString('utf8'));
        } catch {
            return null;
        }
    }
    if (buf.length % 16 !== 0) {
        try {
            return JSON.parse(buf.toString('utf8'));
        } catch {
            return null;
        }
    }
    const iv = buf.subarray(0, 16);
    const body = buf.subarray(16);
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', deriveKey(requestId), iv);
        let plain = Buffer.concat([decipher.update(body), decipher.final()]);
        try {
            plain = zlib.gunzipSync(plain);
        } catch {
            /* not gzipped */
        }
        return JSON.parse(plain.toString('utf8'));
    } catch {
        return null;
    }
}

async function postEncrypted(url, body, headers, requestId) {
    const resp = await http.post(url, body, {
        headers,
        responseType: 'arraybuffer',
    });
    const data = Buffer.from(resp.data || []);
    if (!data.length) return null;
    if (data[0] === 0x7b || data[0] === 0x5b) {
        try {
            return JSON.parse(data.toString('utf8'));
        } catch {
            return null;
        }
    }
    return decryptPayload(data, requestId);
}

function getDeviceId() {
    if (!deviceId) deviceId = crypto.randomUUID().toLowerCase();
    return deviceId;
}

async function apiCall(path, data) {
    const sessionId = crypto.randomUUID().replace(/-/g, '');
    const payload = { token: '', deviceId: getDeviceId(), data };
    if (session?.token) payload.token = `${session.token}_${session.userId}`;

    const ordered = [...HOSTS];
    ordered.sort((a, b) => (a.base === currentHost ? -1 : b.base === currentHost ? 1 : 0));
    const maxTry = Math.min(3, ordered.length);
    let idx = 0;

    async function attempt() {
        if (idx >= maxTry) throw new Error('所有线路均不可用');
        const hostInfo = ordered[idx++];
        const url = `${hostInfo.base}/api${path}`;
        const requestId = crypto.randomUUID().toLowerCase();
        const body = encryptPayload(payload, requestId);
        const ts = Math.floor(Date.now() / 1000);
        const signPath = url.replace(/^https?:\/\//, '');
        const signRaw = `Dart|${sessionId}|${requestId}|${ts}|${signPath}`;
        const sign = `${crypto.createHash('md5').update(signRaw, 'utf8').digest('hex')}-${ts}`;
        const headers = {
            version: '1.0.0',
            deviceType: 'web',
            time: String(ts),
            sign,
            requestId,
            sessionId,
            deviceBrand: '',
            deviceModel: '',
            systemName: '',
            systemVersion: '',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
        };

        try {
            const result = await postEncrypted(url, body, headers, requestId);
            if (!result) {
                if (idx < maxTry) return attempt();
                return null;
            }
            currentHost = hostInfo.base;
            if (result.status === 'n' && (result.errorCode === 2002 || result.error === '2002')) {
                session = null;
                await login();
                return apiCall(path, data);
            }
            return result;
        } catch (e) {
            if (idx < maxTry) return attempt();
            throw e;
        }
    }

    return attempt();
}

async function login() {
    if (session?.token) return session;
    const result = await apiCall('/login/device', {
        line_code: 'china_1',
        channel_code: '',
        share_code: '',
        clipboard_text: '',
        device_info: {
            browserName: 'BrowserName.safari',
            language: 'zh-CN',
            userAgent: UA,
            platform: 'iPhone',
        },
    });
    if (result?.data) {
        session = {
            userId: String(result.data.user_id),
            token: result.data.token,
        };
        return session;
    }
    throw new Error(`Login failed: ${JSON.stringify(result)}`);
}

async function getNavList() {
    if (navCache) return navCache;
    await login();
    const result = await apiCall('/drama/navList', {});
    if (result?.data?.list) navCache = result.data;
    else if (result?.list) navCache = result;
    return navCache;
}

async function resolveCategoryCode(code) {
    const nav = await getNavList();
    const list = nav?.list || nav?.data?.list;
    if (!list) return code;
    for (const item of list) {
        if (String(item.code) === code) return code;
    }
    const name = CAT_NAMES[code] || '';
    if (name) {
        for (const item of list) {
            const n = String(item.name || '');
            if (n && (n.includes(name) || name.includes(n))) {
                return String(item.code) || code;
            }
        }
    }
    return code;
}

function str(v, fallback = '') {
    return v != null ? String(v) : fallback;
}

function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isNaN(n) ? fallback : n;
}

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return url;
}

function buildHlsUrl(dramaId, seq, base) {
    return `${base || currentHost}/api/drama/hls/${dramaId}/${seq}/play.m3u8?line=free`;
}

function parseVod(item) {
    if (!item) return null;
    const id = str(item.id) || str(item.drama_id).replace(/^[^_]+_/, '');
    if (!id) return null;
    const pic = fixUrl(str(item.img_y || item.img || item.cover || item.img_x));
    const remarks = [];
    const epCount = parseInt(item.episode_count, 10) || 0;
    if (epCount > 0) remarks.push(`${epCount}集`);
    if (item.update_label) remarks.push(str(item.update_label));
    if (item.corner) remarks.push(str(item.corner));
    if (item.hot_rate) remarks.push(`热度${str(item.hot_rate)}`);
    let vodId = `huangdou:${id}`;
    if (epCount > 0) vodId += `~${epCount}`;
    return {
        vod_id: vodId,
        vod_name: str(item.name),
        vod_pic: pic,
        vod_remarks: remarks.join(' · '),
        vod_content: str(item.category),
    };
}

function parseList(resp, nested) {
    if (!resp?.data?.list) return [];
    const out = [];
    for (const row of resp.data.list) {
        if (nested && row.items) {
            for (const item of row.items) {
                const vod = parseVod(item);
                if (vod) out.push(vod);
            }
        } else {
            const vod = parseVod(row);
            if (vod) out.push(vod);
        }
    }
    return out;
}

function parseVodId(raw) {
    let t = String(raw || '').trim();
    if (t.startsWith('huangdou:')) t = t.slice(9);
    let epCount = 0;
    const idx = t.indexOf('~');
    if (idx >= 0) {
        epCount = parseInt(t.slice(idx + 1), 10) || 0;
        t = t.slice(0, idx);
    }
    return { dramaId: t, epCount };
}

async function init(_inReq, _outResp) {
    try {
        await login();
    } catch {
        /* ignore */
    }
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: CATEGORIES.map((c) => ({ type_id: c.id, type_name: c.name })),
    };
}

async function category(inReq, _outResp) {
    const tid = str(inReq.body.id, 'yuandou');
    let pg = num(inReq.body.page, 1);
    if (pg < 1) pg = 1;
    let list = [];
    try {
        const code = await resolveCategoryCode(tid);
        const filterResp = await apiCall('/drama/navFilter', { code });
        const tabs = filterResp?.data?.list || [];
        if (tabs.length > 0 && tabs[0].tab) {
            const blockResp = await apiCall('/drama/navBlock', {
                code,
                tab: tabs[0].tab,
                page: String(pg),
            });
            list = parseList(blockResp, true);
            if (!list.length && tid === 'yuandou' && pg === 1) {
                const fallback = await apiCall('/drama/list', {
                    page: '1',
                    page_size: '30',
                    keywords: '黄豆原创',
                });
                list = parseList(fallback, false);
            }
        } else if (tabs.length > 0 && tabs[0].filter?.cat_id) {
            const listResp = await apiCall('/drama/list', {
                page: String(pg),
                page_size: '30',
                cat_id: tabs[0].filter.cat_id,
            });
            list = parseList(listResp, false);
        } else {
            const kw = CAT_NAMES[tid] || tid;
            const listResp = await apiCall('/drama/list', {
                page: String(pg),
                page_size: '30',
                keywords: kw,
            });
            list = parseList(listResp, false);
        }
    } catch {
        list = [];
    }
    return {
        page: pg,
        pagecount: list.length < 30 ? pg : pg + 1,
        list,
    };
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    const { dramaId, epCount } = parseVodId(vid);
    if (!dramaId) return { list: [] };

    const lineCount = Math.min(4, HOSTS.length);
    const buildEpUrl = (seq, name, base) => `${name}$${buildHlsUrl(dramaId, seq, base)}`;
    const joinEps = (eps) => eps.join('#');

    let title = '';
    let desc = '';
    let pic = '';
    const episodes = [];

    try {
        const resp = await apiCall('/drama/detail', { id: dramaId });
        if (resp?.data) {
            const data = resp.data;
            title = str(data.name);
            desc = str(data.description);
            pic = fixUrl(str(data.img_y || data.img || data.cover || data.img_x));
            for (let i = 0; i < (data.episodes || []).length; i++) {
                const ep = data.episodes[i];
                const seq = num(ep.seq, i + 1);
                let name = str(ep.name, `第${seq}集`);
                if (str(ep.type, 'free') !== 'free') name += ' [VIP]';
                episodes.push({ seq, name });
            }
        }
    } catch {
        /* ignore */
    }

    if (!episodes.length) {
        const total = epCount > 0 ? epCount : 30;
        for (let i = 1; i <= total; i++) {
            episodes.push({ seq: i, name: `第${i}集` });
        }
    }

    const playFrom = [];
    const playUrl = [];
    for (let i = 0; i < lineCount; i++) {
        playFrom.push(`线路${i + 1}`);
        playUrl.push(joinEps(episodes.map((ep) => buildEpUrl(ep.seq, ep.name, HOSTS[i].base))));
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title || `黄豆短剧 ${dramaId}`,
                vod_pic: pic,
                vod_content: desc || `黄豆短剧 ${dramaId}`,
                vod_play_from: playFrom.join('$$$'),
                vod_play_url: playUrl.join('$$$'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: str(inReq.body.id),
        header: {
            'User-Agent': UA,
            Accept: '*/*',
        },
    };
}

async function search(inReq, _outResp) {
    const kw = str(inReq.body.wd);
    let pg = num(inReq.body.page, 1);
    if (pg < 1) pg = 1;
    if (!kw) return { page: pg, pagecount: 1, list: [] };
    let list = [];
    try {
        await login();
        const resp = await apiCall('/drama/list', {
            page: String(pg),
            page_size: '30',
            keywords: kw,
        });
        list = parseList(resp, false);
    } catch {
        list = [];
    }
    return {
        page: pg,
        pagecount: list.length < 30 ? pg : pg + 1,
        list,
    };
}

export default {
    meta: {
        key: 'huangdou',
        name: '📖黄豆短剧',
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
