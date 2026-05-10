import axios from 'axios';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PORT = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36;SuiRui/twitter/ver=1.4.4';

const HS = ['wcyfhknomg', 'pdcqllfomw', 'alxhzjvean', 'bqeaaxzplt', 'hfbtpixjso'];

const FILTERS = ['1','2','3','4','5','6','7'].reduce((acc, id) => {
    acc[id] = [{ key: 'fl', name: '分类', value: [{ n: '最近更新', v: '1' }, { n: '最多播放', v: '2' }, { n: '好评榜', v: '3' }] }];
    return acc;
}, {
    jx: [{ key: 'type', name: '精选', value: [{ n: '日榜', v: '1' }, { n: '周榜', v: '2' }, { n: '月榜', v: '3' }, { n: '总榜', v: '4' }] }]
});

// ─── 模块级状态 ────────────────────────────────────────────────────────────

let did   = '';
let token = '';
let phost = '';
let host  = '';

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function md5(text) {
    return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

function getsign() {
    const t    = String(Date.now());
    const sign = md5(t);
    return { sign, t };
}

function getHeaders() {
    const { sign, t } = getsign();
    return { 'User-Agent': UA, 'deviceid': did, 't': t, 's': sign, 'aut': token };
}

function aesDecrypt(word) {
    const key     = Buffer.from('SmhiR2NpT2lKSVV6STFOaQ==', 'base64'); // 16 bytes
    const iv      = key;
    const cipher  = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decoded = Buffer.from(word, 'base64');
    const dec     = Buffer.concat([cipher.update(decoded), cipher.final()]);
    return JSON.parse(dec.toString('utf-8'));
}

function dtim(seconds) {
    try {
        seconds = parseInt(seconds);
        const h  = Math.floor(seconds / 3600);
        const m  = Math.floor((seconds % 3600) / 60);
        const s  = seconds % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
        return `${mm}:${ss}`;
    } catch { return '666'; }
}

function imgDecode(data, length, key) {
    const GIF = Buffer.from([0x47, 0x49, 0x46]);
    const JPG = Buffer.from([0xFF, 0xD8, 0xFF]);
    const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    if (data.length > 7 && data.slice(1, 8).equals(PNG.slice(1, 8))) return data;
    if (data.length > 2 && data.slice(0, 3).equals(GIF))              return data;
    if (data.length > 2 && data.slice(0, 3).equals(JPG))              return data;

    const keyBytes = Buffer.from(key, 'utf-8');
    const result   = Buffer.from(data);
    for (let i = 0; i < length && i < result.length; i++) {
        result[i] ^= keyBytes[i % keyBytes.length];
    }
    return result;
}

function proxyImgUrl(url) {
    return `http://127.0.0.1:${PORT}/spider/suirui/3/img?url=${encodeURIComponent(url)}`;
}

// ─── 初始化 ────────────────────────────────────────────────────────────────

function getDid(db) {
    try {
        const cached = db?.getDataSync?.('/suirui_did');
        if (cached) return cached;
    } catch {}
    const newDid = md5(String(Math.floor(Date.now() / 1000)));
    try { db?.push('/suirui_did', newDid); } catch {}
    return newDid;
}

async function getToken(i = 0) {
    if (i >= HS.length) return ['', '', ''];
    const randStr  = Array.from({ length: Math.floor(Math.random() * 6) + 5 }, () =>
        'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
    ).join('');
    const domain = `https://${randStr}.${HS[i]}.work`;
    try {
        const { sign, t } = getsign();
        const headers = { 'User-Agent': UA, 'Accept': 'application/json', 'deviceid': did, 't': t, 's': sign };
        const body    = { deviceId: did, tt: 'U', code: '##X-4m6Goo4zzPi1hF##', chCode: 'tt09' };
        const resp    = await axios.post(`${domain}/api/user/traveler`, body, { headers, timeout: 8000});
        const data1   = resp.data.data;
        return [data1.token, data1.imgDomain, domain];
    } catch {
        return getToken(i + 1);
    }
}

async function init(inReq, _outResp) {
    const db = inReq.server?.db;
    did              = getDid(db);
    [token, phost, host] = await getToken();
    console.log(host)
    return {};
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function home(_inReq, _outResp) {
    const resp  = await axios.get(`${host}/api/video/classifyList`, { headers: getHeaders(), timeout: 10000 });
    const data1 = aesDecrypt(resp.data.encData);
    const classes = [{ type_name: '精选', type_id: 'jx' }];
    for (const k of data1.data) {
        classes.push({ type_name: `${k.classifyTitle}`, type_id: `${k.classifyId}` });
    }

    return { class: classes, filters: FILTERS };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = inReq.body.page || 1;
    const extend = inReq.body.extend || {};

    let path = `/api/video/queryVideoByClassifyId?pageSize=20&page=${pg}&classifyId=${tid}&sortType=${extend.fl || '1'}`;
    if (tid.includes('click')) {
        path = `/api/video/queryPersonVideoByType?pageSize=20&page=${pg}&userId=${tid.replace('click', '')}`;
    }
    if (tid === 'jx') {
        path = `/api/video/getRankVideos?pageSize=20&page=${pg}&type=${extend.type || '1'}`;
    }

    const resp  = await axios.get(`${host}${path}`, { headers: getHeaders(), timeout: 10000 });
    const data1 = aesDecrypt(resp.data.encData).data;

    const videos = data1.map(k => {
        let id = `${k.videoId}?${k.userId}?${k.nickName}`;
        if (tid.includes('click')) id += 'click';
        return {
            vod_id:      id,
            vod_name:    k.title,
            vod_pic:     proxyImgUrl(k.coverImg[0]),
            vod_remarks: dtim(k.playTime),
            style:       { type: 'rect', ratio: 1.33 },
        };
    });

    return { list: videos, page: pg, pagecount: 9999, limit: 20, total: 999999 };
}

async function detail(inReq, _outResp) {
    const vid  = inReq.body.id.replace('click', '').split('?');
    const resp = await axios.get(`${host}/api/video/can/watch?videoId=${vid[0]}`, { headers: getHeaders(), timeout: 10000 });
    const data1 = aesDecrypt(resp.data.encData);
    const playPath = data1.playPath;

    let clj = `[a=cr:${JSON.stringify({ id: vid[1] + 'click', name: vid[2] })}/]${vid[2]}[/a]`;
    if (inReq.body.id.includes('click')) clj = vid[2];

    return {
        list: [{
            vod_director:  clj,
            vod_play_from: '推特',
            vod_play_url:  `${vid[2]}$${playPath}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return { parse: 0, url: inReq.body.id, header: getHeaders() };
}

async function search(inReq, _outResp) {
    const key  = inReq.body.wd || '';
    const pg   = inReq.body.pg || '1';
    const path = `/api/search/keyWord?pageSize=20&page=${pg}&searchWord=${encodeURIComponent(key)}&searchType=1`;

    const resp  = await axios.get(`${host}${path}`, { headers: getHeaders(), timeout: 10000 });
    const data1 = aesDecrypt(resp.data.encData).videoList;

    const videos = data1.map(k => ({
        vod_id:      `${k.videoId}?${k.userId}?${k.nickName}`,
        vod_name:    k.title,
        vod_pic:     proxyImgUrl(k.coverImg[0]),
        vod_remarks: dtim(k.playTime),
        style:       { type: 'rect', ratio: 1.33 },
    }));

    return { list: videos, page: pg, pagecount: 9999, limit: 90, total: 999999 };
}

// ─── 图片代理（对应 Python imgs + img） ───────────────────────────────────

async function imgProxy(inReq, reply) {
    try {
        const url  = decodeURIComponent(inReq.query.url || '');
        if (!url) return reply.code(404).send('');

        const resp = await axios.get(`${phost}${url}`, {
            headers:      { 'User-Agent': UA },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const ct      = resp.headers['content-type'] || 'image/jpeg';
        const decoded = imgDecode(Buffer.from(resp.data), 100, '2020-zq3-888');
        reply.header('Content-Type', ct).send(decoded);
    } catch {
        reply.code(500).send('');
    }
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'suirui',
        name: '🔥推特',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/img',       imgProxy);
    },
};