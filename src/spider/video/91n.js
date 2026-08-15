import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

const BASE = 'https://www.vjmqvno.com:2087';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const META_KEY = '91n';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const RSA_N = 11034812746936521251677573694796845190287135084811698639456218467379049151579247190638696356335870349231492335075568852461557851339228649721382342982841093n;
const RSA_D = 647908196136712601682336749890569606363197824226855308674909267474473673425334301798322617684275731265203384933954006416901677577458292570728152232337153n;


const http = axios.create({
    timeout: 12000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${BASE}/`,
    },
});

let catesCache = null;
let lastVodId = null;

function modPow(base, exp, mod) {
    let result = 1n;
    base %= mod;
    while (exp > 0n) {
        if (exp & 1n) result = (result * base) % mod;
        exp >>= 1n;
        base = (base * base) % mod;
    }
    return result;
}

function rsaDecryptKey(b64key) {
    try {
        const c = BigInt(`0x${Buffer.from(b64key, 'base64').toString('hex')}`);
        const m = modPow(c, RSA_D, RSA_N);
        let hex = m.toString(16);
        if (hex.length % 2) hex = `0${hex}`;
        const mb = Buffer.from(hex.padStart(128, '0'), 'hex');
        const i = mb.indexOf(0, 2);
        if (mb[0] === 0 && mb[1] === 2 && i > 0) {
            return mb.subarray(i + 1).toString('utf8');
        }
    } catch {
        /* ignore */
    }
    return null;
}

function aesAlgo(key) {
    if (key.length === 16) return 'aes-128-cbc';
    if (key.length === 24) return 'aes-192-cbc';
    if (key.length === 32) return 'aes-256-cbc';
    return null;
}

function aesCbcDecrypt(ciphertext, keyStr, iv) {
    const key = Buffer.from(keyStr, 'utf8');
    const algo = aesAlgo(key);
    if (!algo) throw new Error('invalid aes key length');
    const decipher = crypto.createDecipheriv(algo, key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function decryptResp(obj) {
    const keyStr = rsaDecryptKey(obj.key);
    if (!keyStr) return null;
    const iv = Buffer.from(keyStr.split('').reverse().join('').slice(0, 16), 'utf8');
    const ct = Buffer.from(obj.data, 'base64');
    try {
        const pt = aesCbcDecrypt(ct, keyStr, iv);
        return pt.toString('utf8');
    } catch {
        return null;
    }
}

async function getJson(url, params) {
    const r = await http.get(url, { params });
    return typeof r.data === 'object' ? r.data : JSON.parse(r.data);
}

async function api(path, params = {}) {
    const obj = await getJson(`${BASE}/v1/${path}`, params);
    if (!obj || typeof obj !== 'object' || !obj.key) return null;
    const plain = decryptResp(obj);
    if (!plain) return null;
    try {
        return JSON.parse(plain);
    } catch {
        return null;
    }
}

async function getCates() {
    if (catesCache) return catesCache;
    try {
        const d = await api('blist', { c: 't1' });
        catesCache = d?.data?.shipin_cates || [];
    } catch {
        catesCache = [];
    }
    return catesCache;
}

function picProxy(pic, inReq) {
    if (!pic) return '';
    const prefix = inReq?.server?.prefix || `/spider/${META_KEY}/3`;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(pic)}`;
}

function withVid(url, vid) {
    if (!url || url.includes('vid=')) return url;
    return `${url}${url.includes('?') ? '&' : '?'}vid=${vid}`;
}

function fmtVod(v, inReq) {
    return {
        vod_id: String(v.id || ''),
        vod_name: v.name || '',
        vod_pic: picProxy(v.enc_img || '', inReq),
        vod_remarks: v.time || '',
    };
}

async function init(_inReq, _outResp) {
    catesCache = null;
    lastVodId = null;
    return {};
}

async function home(inReq, _outResp) {
    const cates = await getCates();
    const classes = cates
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({ type_id: String(c.id), type_name: c.name }));

    const vlist = [];
    try {
        const d = await api('vod/category', { c: 't1' });
        const seen = new Set();
        for (const c of d?.data?.cates || []) {
            for (const v of c.videos || []) {
                if (!v || typeof v !== 'object' || 'href' in v) continue;
                const vid = String(v.id);
                if (seen.has(vid)) continue;
                seen.add(vid);
                vlist.push(fmtVod(v, inReq));
            }
        }
    } catch {
        /* ignore */
    }
    return { class: classes, list: vlist };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = parseInt(inReq.body.page, 10) || 1;
    const d = await api('vod', { c: 't1', cate_id: String(tid), page: pg, limit: 24 });
    if (!d?.data) {
        return { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
    }
    const data = d.data;
    const vlist = (data.videos || [])
        .filter((v) => v && typeof v === 'object' && !('href' in v))
        .map((v) => fmtVod(v, inReq));
    return {
        list: vlist,
        page: pg,
        pagecount: parseInt(data.last_page, 10) || 1,
        limit: 24,
        total: parseInt(data.total, 10) || 0,
    };
}

async function detail(inReq, _outResp) {
    let vid = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '');
    vid = vid.replace(/\D/g, '');
    const d = await api(`vod/${vid}`, { c: 't1' });
    if (!d?.data) return { list: [] };

    const v = d.data.video || {};
    const vodId = String(v.id || vid);
    lastVodId = vodId;
    const name = v.name || '';
    const pic = v.enc_img || '';
    const m3u8 = v.url || '';
    const cates = v.cates || [];
    const typeName = cates[0]?.name || '';
    const actor = (v.actress || []).join(',');
    const tags = (v.tags || []).join(',');
    const content = v.description || '';
    let year = '';
    const ym = String(v.create_time || '').match(/(\d{4})/);
    if (ym) year = ym[1];

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: name,
                vod_pic: picProxy(pic, inReq),
                type_name: typeName,
                vod_year: year,
                vod_area: '',
                vod_actor: actor,
                vod_director: '',
                vod_content: content,
                vod_remarks: m3u8 ? '正片' : '',
                vod_tag: tags,
                vod_play_from: '91n',
                vod_play_url: m3u8 ? `第1集$${withVid(m3u8, vodId)}` : '',
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const d = await api('vod', { c: 't1', name: String(key), page: 1, limit: 24 });
    if (!d?.data) return { list: [] };
    const vlist = (d.data.videos || [])
        .filter((v) => v && typeof v === 'object' && !('href' in v))
        .map((v) => fmtVod(v, inReq));
    return { list: vlist };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '');
    let m = url.match(/[?&]vid=(\d+)/);
    let vid = m ? m[1] : lastVodId;

    m = url.match(/auth_key=(\d+)/);
    if (m && parseInt(m[1], 10) < Math.floor(Date.now() / 1000) + 300 && vid) {
        try {
            const d = await api(`vod/${vid}`, { c: 't1' });
            const u = d?.data?.video?.url;
            if (u) url = withVid(u, String(vid));
        } catch {
            /* keep old url */
        }
    }

    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            Referer: `${BASE}/`,
        },
    };
}

async function imgHandler(inReq, reply) {
    const url = decodeURIComponent(inReq.query.url || '');
    if (!url.startsWith('http')) return reply.code(404).send('');
    try {
        const r = await http.get(url, {
            headers: { 'User-Agent': UA, Referer: `${BASE}/` },
            responseType: 'arraybuffer',
            timeout: 10000,
        });
        if (r.status !== 200 || !r.data) return reply.code(404).send('');
        let data = Buffer.from(r.data);
        const dec = Buffer.from(data.map((b) => b ^ 0x88));
        if (dec[0] === 0xff && dec[1] === 0xd8 && dec[2] === 0xff) data = dec;
        return reply.code(200).header('Content-Type', 'image/jpeg').send(data);
    } catch {
        return reply.code(404).send('');
    }
}

export default {
    meta: {
        key: META_KEY,
        name: '🔥91n影院',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgHandler);
    },
};
