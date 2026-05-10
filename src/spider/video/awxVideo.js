import axios from 'axios';
import CryptoJS from 'crypto-js';  // npm i crypto-js

// ─── Constants ────────────────────────────────────────────────────────────────
const PORT   = process.env.DEV_HTTP_PORT || 9988;

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const home_url = 'https://d34vyrelvmcjzt.cloudfront.net';

// 图片魔数标记 & XOR key
const IMG_MAGIC  = new Uint8Array([136, 168, 48, 203, 16, 118]);
const XOR_KEY    = [50,48,49,57,121,115,97,112,112,55,53,50,55];
const XOR_LIMIT  = 100;
const XOR_BYTE   = 163;
const IMG_SIGS   = [
    new Uint8Array([255, 216, 255]),
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    new Uint8Array([71, 73, 70]),
];

const PASSPHRASE = 'vEukA&w15z4VAD3kAY#fkL#rBnU!WDhN';

const BASE_HEADERS = {
    'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    Connection:      'keep-alive',
    Accept:          '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Content-Type':  'application/json',
    'accept-language': 'zh-CN,zh;q=0.9',
    origin:          home_url,
    referer:         `${home_url}/`,
    'x-user-agent':  'DevType=Apple iPhone mobile;SysType=h5_pc;Ver=2.1.2;BuildID=Chrome 143.0.0.0',
};

let token = '';

// ─── HTTP Client ──────────────────────────────────────────────────────────────

const http = axios.create({ timeout: 15_000, headers: BASE_HEADERS });

// ─── Crypto / Decode Helpers ──────────────────────────────────────────────────

// encodeURIComponent → byte array
function strToBytes(str) {
    const enc = encodeURIComponent(str);
    const out = [];
    for (let i = 0; i < enc.length; i++) {
        if (enc[i] === '%') {
            out.push(parseInt(enc[i + 1] + enc[i + 2], 16));
            i += 2;
        } else {
            out.push(enc.charCodeAt(i));  // ← 取当前位 i
        }
    }
    return out;
}

// hex string → byte array
function hexToBytes(hex) {
    const out = [];
    for (let i = 0; i < hex.length; i += 2)
        out.push(parseInt(hex.substr(i, 2), 16));
    return out;
}

// byte array → base64 string  (used to feed CryptoJS.enc.Base64.parse)
function bytesToB64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

// base64 string → byte array
function b64ToBytes(b64) {
    return Array.from(Buffer.from(b64, 'base64'));
}

/**
 * K8: 解密接口返回的 base64 密文
 * 逻辑：从数据头 12 字节 + 固定口令推导 AES key & IV，解密剩余数据
 */
function K8(b64str) {
    const a = b64ToBytes(b64str);           // 全部字节
    const s = a.splice(0, 12);              // 头 12 字节作为 salt；a 剩余为密文字节

    const i = [...strToBytes(PASSPHRASE), ...s];
    const r = Math.floor(i.length / 2);

    // round 1 SHA256
    const o = CryptoJS.enc.Base64.parse(bytesToB64(i));
    const c = hexToBytes(CryptoJS.SHA256(o).toString()).splice(8, 16);   // 16 字节

    // round 2 SHA256
    const l = [...c, ...i.splice(0, r)];
    const d = CryptoJS.enc.Base64.parse(bytesToB64(l));
    const f = hexToBytes(CryptoJS.SHA256(d).toString());                  // 32 字节

    // round 3 SHA256
    const m = [...i, ...c];
    const h = CryptoJS.enc.Base64.parse(bytesToB64(m));
    const v = hexToBytes(CryptoJS.SHA256(h).toString());                  // 32 字节

    // 派生 key (32 B) & IV (16 B)
    const key = [...f.splice(0, 8), ...v.splice(8, 16), ...f.splice(16, 24)];
    const iv  = [...v.splice(0, 4), ...f.splice(4, 8),  ...v.splice(8, 12)];

    const ciphertext = bytesToB64(a);   // 剩余密文
    const keyWA = CryptoJS.enc.Base64.parse(bytesToB64(key));
    const ivWA  = CryptoJS.enc.Base64.parse(bytesToB64(iv));

    return CryptoJS.AES.decrypt(ciphertext, keyWA, {
        iv:   ivWA,
        mode: CryptoJS.mode.CBC,
    }).toString(CryptoJS.enc.Utf8);
}

// ─── Image Decoding ───────────────────────────────────────────────────────────

function isStandardImage(bytes) {
    for (const sig of IMG_SIGS) {
        if (sig.every((b, i) => b === bytes[i])) return true;
    }
    return false;
}

function xorDecode(bytes, key, limit) {
    const klen = key.length;
    const end  = Math.min(limit > 0 ? limit : bytes.length, bytes.length);
    const out  = new Uint8Array(bytes);
    for (let r = 0; r < end; r += klen)
        for (let n = 0; n < klen && r + n < end; n++)
            out[r + n] ^= key[n];
    return out;
}

function magicDecode(bytes) {
    let idx = -1;
    return bytes.map(b => { idx++; return idx < IMG_MAGIC.length && b === IMG_MAGIC[idx] ? null : b ^ XOR_BYTE; });
}

function decodeImage(bytes) {
    if (!bytes || bytes.length === 0) return bytes;

    // magic header check
    if (IMG_MAGIC.every((b, i) => b === bytes[i])) {
        return magicDecode(bytes).filter(b => b !== null);
    }

    // 非标准图片 → XOR 解密前 100 字节
    if (!isStandardImage(bytes)) {
        return xorDecode(bytes, XOR_KEY, XOR_LIMIT);
    }

    return bytes;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function fetchToken(db) {
    const devID = '9114060865631122mkdsw8rx';
    const sign  = 'd98d36db04cf9f0cd9de05e72920b75416d78025';
    try {
        const body = JSON.stringify({ devID, affCode: '{}', sign });
        const { data } = await http.post(`${home_url}/api/app/login/guest`, body);
        if (data?.data) {
            const raw = K8(data.data);
            if (raw) {
                const t = JSON.parse(raw).token;
                if (t) {
                    token = t;
                    await db?.push('/awxVideo/token', t);
                    return t;
                }
            }
        }
    } catch { /* ignore */ }
    return null;
}

async function ensureToken(db) {
    if (token) return token;
    let saved = null;
    try { saved = await db?.getData('/awxVideo/token'); } catch { /* ignore */ }
    if (saved) { token = saved; return token; }
    return await fetchToken(db);
}

// ─── List Formatter ───────────────────────────────────────────────────────────

function formatList(items, proxyBase) {
    return items.map((d) => ({
        vod_id:      `${d.id}@@${d.videoUrl}`,
        vod_name:    d.title,
        vod_pic:     `${proxyBase}?imgUrl=${encodeURIComponent(`https://8d864d288532ce24.cdn.jiashule.com/${d.coverImg}`)}`,
        vod_remarks: `观看：${d.watchTimes} 次`,
    }));
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    const db = inReq.server?.db;
    await ensureToken(db);

    return {
        class: [
            { type_id: '376401', type_name: '最新'   },
            { type_id: '342081', type_name: '精选'   },
            { type_id: '342001', type_name: '17岁'   },
            { type_id: '342083', type_name: '国产'   },
            { type_id: '342082', type_name: '伦理'   },
            { type_id: '349041', type_name: '萝莉'   },
            { type_id: '342089', type_name: '传媒'   },
            { type_id: '669981', type_name: '猎奇'   },
            { type_id: '19201',  type_name: '动漫'   },
            { type_id: '342088', type_name: 'AV'     },
            { type_id: '342085', type_name: '网黄'   },
            { type_id: '428541', type_name: '制服'   },
            { type_id: '342087', type_name: 'P站'    },
            { type_id: '159061', type_name: '频道'   },
            { type_id: '342086', type_name: '福利姬' },
        ],
        list:    [],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const id         = inReq.body.id;
    const pg         = parseInt(inReq.body.page) || 1;
    const proxyBase  = `http://127.0.0.1:${PORT}${inReq.server?.prefix || ''}/proxy`;
    console.log(proxyBase)
    const body = JSON.stringify({ id: parseInt(id), pageSize: 30, pageNum: pg, sort: 1 });
    const { data } = await http.post(`${home_url}/api/app/media/home`, body);
    let items = [];
    try {
        const dec = K8(data.data);
        items = JSON.parse(dec)?.mediaList || [];
    } catch(err) { 
        console.log(err)
     }

    return { page: pg, pagecount: 999, total: 999, list: formatList(items, proxyBase) };
}

async function detail(inReq, _outResp) {
    const ids  = Array.isArray(inReq.body.id) ? inReq.body.id : [inReq.body.id];
    const list = ids.map((raw) => {
        const [id, videoUrl] = raw.split('@@');
        return {
            vod_id:        id,
            vod_name:      '',
            vod_pic:       '',
            vod_play_from: '秒播线路',
            vod_play_url:  `VIP$${home_url}/api/app/media/h5/m3u8/${videoUrl}?token=${token}`,
        };
    });
    return { list };
}

async function play(inReq, _outResp) {
    return { parse: 0, url: inReq.body.id };
}

async function search(inReq, _outResp) {
    const pg        = parseInt(inReq.body.page) || 1;
    const wd        = inReq.body.wd || '';
    const db        = inReq.server?.db;
    const proxyBase  = `http://127.0.0.1:${PORT}${inReq.server?.prefix || ''}/proxy`;
    const referer   = `${home_url}/subpage/search/result?searchTxt=${encodeURIComponent(wd)}`;

    const body = JSON.stringify({ pageSize: 30, pageNum: pg, sort: 3, content: wd, mediaType: 1 });

    async function doSearch() {
        try {
            const { data } = await http.post(`${home_url}/api/app/search/details`, body, {
                headers: { ...BASE_HEADERS, referer, authorization: token },
            });
            if (data?.code !== 200 && data?.code !== 0) return { success: false };
            const dec   = K8(data.data);
            const items = JSON.parse(dec)?.mediaList || [];
            return { success: true, items };
        } catch {
            return { success: false };
        }
    }

    let result = await doSearch();
    if (!result.success || result.items?.length === 0) {
        await fetchToken(db);
        result = await doSearch();
    }

    const items = result.success ? result.items : [];
    return { page: pg, pagecount: 999, total: 999, list: formatList(items, proxyBase) };
}

// ─── Image Proxy ──────────────────────────────────────────────────────────────

async function proxy(inReq, outResp) {
    const imgUrl = decodeURIComponent(inReq.query.imgUrl || '');
    if (!imgUrl) return outResp.status(400).send('missing imgUrl');

    const { data } = await http.get(imgUrl, {
        responseType: 'arraybuffer',
        timeout:      5_000,
    });

    const decoded = decodeImage(new Uint8Array(data));
    outResp.header('Content-Type', 'image/png').send(Buffer.from(decoded));
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'awxVideo',
        name: '🔥awxVideo',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/proxy',     proxy);
    },
};