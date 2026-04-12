import axios from 'axios';
import crypto from 'crypto';


const siteUrl = 'https://872.9n5c2.com';
const searchUrl = siteUrl + '/drama/search/result?keyword=';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': siteUrl + '/',
    'Content-Type': 'application/json'
};

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(url) {
    const resp = await axios.get(url, { headers});
    return resp.data;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

const ENC_KEY = Buffer.from("H0Z%7n#k$H8*M7xSE^N@8xXZPG*RZ&wY");

function aesDecrypt(buf) {
    const iv         = buf.subarray(0, 16);
    const ciphertext = buf.subarray(16);
    const decipher   = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/vvideos/3/img?url=${encodeURIComponent(e64(raw))}`;
}

const ITERATIONS = 1000;
const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 256;
const CHAR_SHIFT = 3;

function shiftChars(str, shift) {
    return [...str].map(c => String.fromCodePoint(c.codePointAt(0) + shift)).join("");
}

function fixBase64(str) {
    let s = str.replace(/[\r\n\s]+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4;
    if (pad) s = s.padEnd(s.length + (4 - pad), "=");
    return s;
}

function deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN / 8, "sha256", (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
}

async function decrypt(ciphertext, password) {
    const base64 = fixBase64(shiftChars(ciphertext, -CHAR_SHIFT));
    const buf = Buffer.from(base64, "base64");

    if (buf.length < SALT_LEN + IV_LEN) {
        throw new Error("密文长度不足，无法解密。");
    }

    const salt      = buf.subarray(0, SALT_LEN);
    const iv        = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const authTag   = buf.subarray(buf.length - 16);
    const encrypted = buf.subarray(SALT_LEN + IV_LEN, buf.length - 16);

    const key = await deriveKey(password, salt);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]).toString("utf8");

    try {
        return JSON.parse(decrypted);
    } catch {
        return decrypted;
    }
}


async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const url = `https://kk2.hi86jxxr.com/api/v2/home/public/nav/list?channel=vvsjb&cate=video_long`;

    const resp = await request(url);

    const list = await decrypt(resp.data, resp.key);
    const classes = (list?.list ?? list ?? []).map(item => ({
        type_id: `${item.tid ?? ''}-${item.type ?? ''}`,
        type_name: item.title,
    }));
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
   const param = tid.split('-');
    const page = inReq.body.page || 1;
    let url = `https://99uy.b8wlmpdw.com/api/v2/home/public/video/list?channel=vvsjb&page=${page}&limit=20&type=${param[1]}&videoType=1&typeId=${param[0]}`
    const resp = await request(url);
    const list = await decrypt(resp.data, resp.key);
    const videos = []
    for (const item of list.list) {
        if (item.title) {
            videos.push({
                vod_id: item.id,
                vod_name: item.title,
                vod_pic: proxyImgUrl(item.upload_thumb),
                vod_remarks: item.label,
            })
        }
    }

    return { page: page, list: videos };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    let url = `https://66hy.0ru8s11x.com/api/v2/home/public/video/long/detail?channel=vvsjb&id=${id}`
    const resp = await request(url);
    const data = await decrypt(resp.data, resp.key);

    let playUrl = data.play_hls_url
    return {
        list: [{
            vod_id: id,
            vod_name: data.title,
            vod_pic: data.upload_thumb,
            vod_play_from: 'Vvideos',
            vod_play_url: '高清$' + playUrl,
            vod_content: 'Y2K专线'
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: headers
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = searchUrl + text;
    const resp = await request(url);
    const list = await decrypt(resp.data, resp.key);
    const videos = []
    for (const item of list.list) {
        if (item.title) {
            videos.push({
                vod_id: item.id,
                vod_name: item.title,
                vod_pic: proxyImgUrl(item.upload_thumb),
                vod_remarks: item.label,
            })
        }
    }

    return { videos };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);

        if (typeof raw === "string") {
            const match = raw.match(/loadBannerDirect\('([^']*)'/);
            if (match) raw = match[1];
        }

        if (!raw) {
            return reply.code(404).send('');
        }

        const resp = await axios.get(raw, {
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 10000,
        });

        const buffer = Buffer.from(resp.data);

        const decrypted = aesDecrypt(buffer);

        // ===== MIME 判断（完整版）=====
        let ct = 'image/jpeg';

        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) {
            ct = 'image/png';
        } 
        else if (
            decrypted[0] === 0x47 &&
            decrypted[1] === 0x49 &&
            decrypted[2] === 0x46
        ) {
            ct = 'image/gif';
        }
        else if (
            decrypted.slice(0, 4).toString() === 'RIFF'
        ) {
            ct = 'image/webp';
        }

        reply
            .header('Content-Type', ct)
            .header('Cache-Control', 'public, max-age=86400')
            .send(decrypted);

    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'vvideos',
        name: 'Vv视频',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',  imgProxy);
    },
};