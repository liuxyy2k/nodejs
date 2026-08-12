import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

/**
 * 小红薯APP - SuiRui/xhs · AES API + 图片 XOR 解密
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;

const UA =
    'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36;SuiRui/xhs/ver=1.2.6';

const HS = ['fhoumpjjih', 'dyfcbkggxn', 'rggwiyhqtg', 'bpbbmplfxc'];
const IMG_UA = 'Dalvik/2.1.0 (Linux; U; Android 11; M2012K10C Build/RP1A.200720.011)';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let did = '';
let token = '';
let phost = '';
let host = '';
let classCache = [];

const apiCache = new Map();
const imgCache = new Map();

const http = axios.create({
    timeout: 12_000,
    httpsAgent,
    validateStatus: () => true,
});

function md5(text) {
    return crypto.createHash('md5').update(String(text), 'utf8').digest('hex');
}

function getSign() {
    const t = String(Math.floor(Date.now()));
    return { sign: md5(t.slice(3, 8)), t };
}

function getHeaders(forPlay = false) {
    const { sign, t } = getSign();
    const h = {
        'User-Agent': UA,
        deviceid: did,
        t,
        s: sign,
    };
    if (token) h.aut = token;
    if (forPlay) {
        if (h.aut) {
            h.Authorization = h.aut;
            delete h.aut;
        }
        delete h.deviceid;
    }
    return h;
}

function aesDecrypt(word) {
    try {
        const key = Buffer.from('SmhiR2NpT2lKSVV6STFOaQ==', 'base64');
        const iv = key;
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        const decoded = Buffer.from(word, 'base64');
        const dec = Buffer.concat([decipher.update(decoded), decipher.final()]);
        return JSON.parse(dec.toString('utf-8'));
    } catch {
        return {};
    }
}

function dtim(seconds) {
    try {
        const s = parseInt(seconds || 0, 10);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(sec).padStart(2, '0');
        if (h) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
        return `${mm}:${ss}`;
    } catch {
        return '';
    }
}

function imgDecode(data, length, key) {
    const GIF = Buffer.from([0x47, 0x49, 0x46]);
    const JPG = Buffer.from([0xff, 0xd8, 0xff]);
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    if (data.length > 7 && data.slice(1, 8).equals(PNG.slice(1, 8))) return data;
    if (data.length > 2 && data.slice(0, 3).equals(GIF)) return data;
    if (data.length > 2 && data.slice(0, 3).equals(JPG)) return data;

    const keyBytes = Buffer.from(key, 'utf-8');
    const result = Buffer.from(data);
    for (let i = 0; i < length && i < result.length; i++) {
        result[i] ^= keyBytes[i % keyBytes.length];
    }
    return result;
}

function proxyImgUrl(url) {
    const encoded = encodeURIComponent(url);
    return `http://127.0.0.1:${PORT}/spider/suiruixhs/3/img?do=img&type=img&u=${encoded}&url=${encoded}`;
}

function imgUrl(u) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    return `${phost || ''}${u}`;
}

function getDid(db) {
    try {
        const cached = db?.getDataSync?.('/suiruixhs_did');
        if (cached) return cached;
    } catch {
        /* ignore */
    }
    const newDid = md5(String(Math.floor(Date.now() / 1000)));
    try {
        db?.push('/suiruixhs_did', newDid);
    } catch {
        /* ignore */
    }
    return newDid;
}

async function getToken() {
    for (const hs of HS) {
        for (let attempt = 0; attempt < 3; attempt++) {
            const randLen = Math.floor(Math.random() * 6) + 5;
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            const randStr = Array.from({ length: randLen }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            const domain = `https://${randStr}.${hs}.work`;

            try {
                const { sign, t } = getSign();
                const headers = { 'User-Agent': UA, deviceid: did, t, s: sign };
                const body = { deviceId: did, tt: 'U', code: '', chCode: 'dafe13' };
                const resp = await http.post(`${domain}/api/user/traveler`, body, { headers, timeout: 8000 });
                const data = resp.data?.data;
                if (data?.token && data?.imgDomain) {
                    return [data.token, data.imgDomain, domain];
                }
            } catch {
                /* retry */
            }
        }
    }
    return ['', '', ''];
}

async function fetchApi(path) {
    if (!host) return {};

    const url = path.startsWith('http') ? path : `${host}${path.startsWith('/') ? path : `/${path}`}`;
    if (apiCache.has(url)) return apiCache.get(url);

    try {
        const resp = await http.get(url, { headers: getHeaders() });
        const j = resp.data;
        let data = j;
        if (j && typeof j === 'object' && j.encData) {
            data = aesDecrypt(j.encData);
        }
        if (apiCache.size > 80) apiCache.clear();
        apiCache.set(url, data);
        return data;
    } catch {
        return {};
    }
}

function parseItems(arr) {
    const res = [];
    for (const k of arr || []) {
        const vid = String(k.videoId || k.id || '');
        if (!vid) continue;
        res.push({
            vod_id: vid,
            vod_name: k.title || vid,
            vod_pic: proxyImgUrl(k.coverImg || ''),
            vod_remarks: dtim(k.playTime),
            style: { type: 'rect', ratio: 1.33 },
        });
    }
    return res;
}

async function fetchCategoryList(tid, pg) {
    const page = String(pg || '1');
    const paths =
        String(tid) === '0'
            ? [
                  `/api/short/video/getShortVideos?classifyId=0&videoMark=4&page=${page}&pageSize=20`,
                  `/api/short/video/getShortVideos?videoMark=4&page=${page}&pageSize=20`,
              ]
            : [`/api/short/video/getShortVideos?classifyId=${tid}&videoMark=4&page=${page}&pageSize=20`];

    for (const path of paths) {
        const data = await fetchApi(path);
        const arr = Array.isArray(data?.data) ? data.data : data?.list;
        if (Array.isArray(arr) && arr.length) {
            return parseItems(arr);
        }
    }
    return [];
}

function parseProxyParam(query) {
    if (query.u || query.url) {
        return {
            type: query.do || query.type || 'img',
            url: decodeURIComponent(query.u || query.url || ''),
        };
    }
    return { type: 'img', url: '' };
}

async function fetchImgAsset(u) {
    if (imgCache.has(u)) return imgCache.get(u);

    try {
        const resp = await http.get(imgUrl(u), {
            headers: { 'User-Agent': IMG_UA },
            responseType: 'arraybuffer',
            timeout: 15_000,
        });
        const body = imgDecode(Buffer.from(resp.data), 100, '2020-zq3-888');
        const ct = (resp.headers['content-type'] || 'image/jpeg').split(';')[0];
        const result = [ct, body];
        if (imgCache.size > 160) imgCache.clear();
        imgCache.set(u, result);
        return result;
    } catch {
        return ['text/plain', Buffer.from('')];
    }
}

async function init(inReq, _outResp) {
    apiCache.clear();
    imgCache.clear();
    classCache = [];

    const db = inReq.server?.db;
    did = getDid(db);
    [token, phost, host] = await getToken();
    return {};
}

async function home(_inReq, _outResp) {
    const data = await fetchApi('/api/video/queryClassifyList?mark=4');
    let classes = (data.data || [])
        .map((k) => {
            const tid = String(k.classifyId || '');
            const name = k.classifyTitle || '';
            return tid && name ? { type_name: name, type_id: tid } : null;
        })
        .filter(Boolean);

    if (!classes.length) {
        classes = [{ type_name: '推荐', type_id: '0' }];
    }

    classCache = classes;

    const list = await fetchCategoryList(classes[0].type_id, 1);
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id ?? '0');
    const pg = inReq.body.page || inReq.body.pg || 1;
    const list = await fetchCategoryList(tid, pg);

    return {
        list,
        page: parseInt(pg, 10) || 1,
        pagecount: 9999,
        limit: 20,
        total: 999999,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '');
    const data = await fetchApi(`/api/video/getVideoById?videoId=${vid}`);

    if (!data || !Object.keys(data).length) {
        return {
            list: [{
                vod_id: vid,
                vod_name: vid,
                vod_play_from: '小红书官方',
                vod_play_url: '播放$',
            }],
        };
    }

    const name = data.title || data.vod_name || vid;
    const auth = data.authKey || '';
    const path = data.videoUrl || data.playPath || data.url || '';
    const play = auth && path ? `auth_key=${auth}&path=${path}` : path;

    return {
        list: [{
            vod_id: vid,
            vod_name: name,
            vod_pic: proxyImgUrl(data.coverImg || ''),
            type_name: Array.isArray(data.tagTitles) ? data.tagTitles.join(' ') : data.tagTitles || '',
            vod_play_from: data.nickName || '小红书官方',
            vod_play_url: `${name}$${play}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const url = host && id.startsWith('auth_key=') ? `${host}/api/m3u8/decode/authPath?${id}` : id;

    return {
        parse: 0,
        playUrl: '',
        url,
        header: getHeaders(true),
    };
}

async function search(inReq, _outResp) {
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    return { list: [], page: pg, pagecount: 1, limit: 20, total: 0 };
}

async function imgProxy(inReq, reply) {
    try {
        const { url } = parseProxyParam(inReq.query || {});
        if (!url) return reply.code(404).send('');

        const [ct, body] = await fetchImgAsset(url);
        reply.header('Content-Type', ct).send(body);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'suiruixhs',
        name: '小红薯APP',
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
