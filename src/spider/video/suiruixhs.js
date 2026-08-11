import axios from 'axios';
import crypto from 'crypto';

/**
 * 小红书 SuiRui App - by @嗷呜
 * AES 加密 API + 图片 XOR 解密
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;

const UA =
    'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36;SuiRui/xhs/ver=1.2.6';

const HS = ['fhoumpjjih', 'dyfcbkggxn', 'rggwiyhqtg', 'bpbbmplfxc'];

let did = '';
let token = '';
let phost = '';
let host = '';

function md5(text) {
    return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

function getSign() {
    const t = String(Math.floor(Date.now()));
    const sign = md5(t.slice(3, 8));
    return { sign, t };
}

function getHeaders(forPlay = false) {
    const { sign, t } = getSign();
    const h = {
        'User-Agent': UA,
        deviceid: did,
        t,
        s: sign,
        aut: token,
    };
    if (forPlay) {
        h.Authorization = h.aut;
        delete h.aut;
        delete h.deviceid;
    }
    return h;
}

function aesDecrypt(word) {
    const key = Buffer.from('SmhiR2NpT2lKSVV6STFOaQ==', 'base64');
    const iv = key;
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decoded = Buffer.from(word, 'base64');
    const dec = Buffer.concat([decipher.update(decoded), decipher.final()]);
    return JSON.parse(dec.toString('utf-8'));
}

function dtim(seconds) {
    try {
        let s = parseInt(seconds, 10);
        const h = Math.floor(s / 3600);
        s %= 3600;
        const m = Math.floor(s / 60);
        s %= 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
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
    return `http://127.0.0.1:${PORT}/spider/suiruixhs/3/img?url=${encodeURIComponent(url)}`;
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

async function getToken(i = 0, maxAttempts = 10) {
    if (i >= HS.length || i >= maxAttempts) return ['', '', ''];
    const randLen = Math.floor(Math.random() * 6) + 5;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const randStr = Array.from({ length: randLen }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const domain = `https://${randStr}.${HS[i]}.work`;

    try {
        const { sign, t } = getSign();
        const headers = { 'User-Agent': UA, deviceid: did, t, s: sign };
        const body = { deviceId: did, tt: 'U', code: '', chCode: 'dafe13' };
        const resp = await axios.post(`${domain}/api/user/traveler`, body, { headers, timeout: 8000 });
        const data = resp.data?.data;
        if (!data?.token) throw new Error('no token');
        return [data.token, data.imgDomain, domain];
    } catch {
        return getToken(i + 1, maxAttempts);
    }
}

async function init(inReq, _outResp) {
    const db = inReq.server?.db;
    did = getDid(db);
    [token, phost, host] = await getToken();
    return {};
}

async function home(_inReq, _outResp) {
    const resp = await axios.get(`${host}/api/video/queryClassifyList?mark=4`, {
        headers: getHeaders(),
        timeout: 10_000,
    });
    const data = aesDecrypt(resp.data.encData);
    const classes = (data.data || []).map((k) => ({
        type_name: k.classifyTitle,
        type_id: String(k.classifyId),
    }));
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || inReq.body.pg || 1;
    const path = `/api/short/video/getShortVideos?classifyId=${tid}&videoMark=4&page=${pg}&pageSize=20`;

    const resp = await axios.get(`${host}${path}`, { headers: getHeaders(), timeout: 10_000 });
    const vdata = aesDecrypt(resp.data.encData);

    const videos = (vdata.data || []).map((k) => ({
        vod_id: String(k.videoId),
        vod_name: k.title || '',
        vod_pic: proxyImgUrl(k.coverImg),
        vod_remarks: dtim(k.playTime),
        style: { type: 'rect', ratio: 1.33 },
    }));

    return {
        list: videos,
        page: parseInt(pg, 10) || 1,
        pagecount: 9999,
        limit: 90,
        total: 999999,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(
        Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '',
    );
    const path = `/api/video/getVideoById?videoId=${vid}`;
    const resp = await axios.get(`${host}${path}`, { headers: getHeaders(), timeout: 10_000 });
    const v = aesDecrypt(resp.data.encData);

    const playUrl = `${v.title}$auth_key=${v.authKey}&path=${v.videoUrl}`;

    return {
        list: [
            {
                vod_name: v.title,
                type_name: (v.tagTitles || []).join(''),
                vod_play_from: v.nickName || '小红书官方',
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    return {
        parse: 0,
        url: `${host}/api/m3u8/decode/authPath?${id}`,
        header: getHeaders(true),
    };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

async function imgProxy(inReq, reply) {
    try {
        const url = decodeURIComponent(inReq.query.url || '');
        if (!url) return reply.code(404).send('');

        const resp = await axios.get(`${phost}${url}`, {
            headers: {
                'User-Agent':
                    'Dalvik/2.1.0 (Linux; U; Android 11; M2012K10C Build/RP1A.200720.011)',
            },
            responseType: 'arraybuffer',
            timeout: 10_000,
        });

        const ct = (resp.headers['content-type'] || 'image/jpeg').split(';')[0];
        const decoded = imgDecode(Buffer.from(resp.data), 100, '2020-zq3-888');
        reply.header('Content-Type', ct).send(decoded);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'suiruixhs',
        name: '🔥小红书',
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
