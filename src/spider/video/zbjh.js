import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;

const origin  = 'https://zh.stripchat.com';
const HEADERS = {
    'Origin':     origin,
    'Referer':    `${origin}/`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
};

// ─── 常量 ──────────────────────────────────────────────────────────────────

const CLASSES = [
    { type_name: '女主播g', type_id: 'girls'   },
    { type_name: '情侣c',   type_id: 'couples' },
    { type_name: '男主播m', type_id: 'men'     },
    { type_name: '跨性别t', type_id: 'trans'   },
];

const VALUE = [
    { n: '中国',   v: 'tagLanguageChinese'     },
    { n: '亚洲',   v: 'ethnicityAsian'         },
    { n: '白人',   v: 'ethnicityWhite'         },
    { n: '拉丁',   v: 'ethnicityLatino'        },
    { n: '混血',   v: 'ethnicityMultiracial'   },
    { n: '印度',   v: 'ethnicityIndian'        },
    { n: '阿拉伯', v: 'ethnicityMiddleEastern' },
    { n: '黑人',   v: 'ethnicityEbony'         },
];

const VALUE_MEN = [
    { n: '情侣', v: 'sexGayCouples'       },
    { n: '直男', v: 'orientationStraight' },
];

const TAG_MAP = { G: 'girls', C: 'couples', M: 'men', T: 'trans' };

// ─── 模块级状态 ────────────────────────────────────────────────────────────

let stripchatKey = '';
let hashCache    = {};

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function decodeKeyCompact() {
    const base64Str = 'NTEgNzUgNjUgNjEgNmUgMzQgNjMgNjEgNjkgMzkgNjIgNmYgNGEgNjEgMzUgNjE=';
    const decoded   = Buffer.from(base64Str, 'base64').toString('utf-8');
    const keyBytes  = Buffer.from(decoded.split(' ').map(h => parseInt(h, 16)));
    return keyBytes.toString('utf-8');
}

function computeHash(key) {
    if (!hashCache[key]) {
        hashCache[key] = crypto.createHash('sha256').update(key, 'utf8').digest();
    }
    return hashCache[key];
}

function decrypt(encryptedB64, key) {
    const pad = encryptedB64.length % 4;
    if (pad) encryptedB64 += '='.repeat(4 - pad);
    const hashBytes     = computeHash(key);
    const encryptedData = Buffer.from(encryptedB64, 'base64');
    const decrypted     = Buffer.alloc(encryptedData.length);
    for (let i = 0; i < encryptedData.length; i++) {
        decrypted[i] = encryptedData[i] ^ hashBytes[i % hashBytes.length];
    }
    return decrypted.toString('utf-8');
}

function countryCodeToFlag(code) {
    if (!code || code.length !== 2 || !/^[A-Za-z]{2}$/.test(code)) return code || '';
    return [...code.toUpperCase()].map(c => String.fromCodePoint(c.codePointAt(0) - 65 + 0x1F1E6)).join('');
}

function processKey(key) {
    const parts = key.split(/\s+/);
    if (parts.length > 1) {
        const tag = TAG_MAP[parts[0].toUpperCase()];
        if (tag) return [tag, parts.slice(1).join(' ').trim()];
    }
    return ['girls', key.trim()];
}

// 对应 Python process_m3u8_content_v2
function processM3u8Content(m3u8) {
    const lines = m3u8.trim().split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-MOUFLON:FILE:') && lines[i + 1]?.includes('media.mp4')) {
            // 对应 Python: line.split(':', 2)[2].strip()
            const encryptedData = lines[i].split(':').slice(2).join(':').trim();
            let decrypted;
            try {
                decrypted = decrypt(encryptedData, stripchatKey);
            } catch {
                decrypted = decrypt(encryptedData, 'Zokee2OhPh9kugh4');
            }
            lines[i + 1] = lines[i + 1].replace('media.mp4', decrypted);
        }
    }
    return lines.join('\n');
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    stripchatKey = decodeKeyCompact();
    hashCache    = {};
    return {};
}

async function home(_inReq, _outResp) {
    const filters = {};
    for (const { type_id } of CLASSES) {
        filters[type_id] = [{
            key:   'tag',
            value: type_id === 'men' ? [...VALUE_MEN, ...VALUE] : VALUE,
        }];
    }
    return { class: CLASSES, filters };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 1;
    const extend = inReq.body.extend || {};
    const limit  = 60;
    const offset = limit * (pg - 1);

    let url = `${origin}/api/front/models?improveTs=false&removeShows=false&limit=${limit}&offset=${offset}&primaryTag=${tid}&sortBy=stripRanking&rcmGrp=A&rbCnGr=true&prxCnGr=false&nic=false`;
    if (extend.tag) url += `&filterGroupTags=%5B%5B%22${extend.tag}%22%5D%5D`;

    const resp   = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const rsp    = resp.data;
    const videos = (rsp.models || []).map(vod => ({
        vod_id:      String(vod.username).trim(),
        vod_name:    `${countryCodeToFlag(String(vod.country).trim())}${String(vod.username).trim()}`,
        vod_pic:     `https://img.doppiocdn.net/thumbs/${vod.snapshotTimestamp}/${vod.id}`,
        vod_remarks: vod.status === 'public' ? '' : '🎫',
    }));
    const total = parseInt(rsp.filteredCount || 0);
    return { list: videos, page: pg, pagecount: Math.ceil(total / limit), limit, total };
}

async function detail(inReq, _outResp) {
    const username = inReq.body.id;
    const resp     = await axios.get(
        `${origin}/api/front/v2/models/username/${username}/cam`,
        { headers: HEADERS, timeout: 10000 }
    );
    const rsp    = resp.data;
    const info   = rsp.cam;
    const user   = rsp.user.user;
    const id     = String(user.id);
    const flag   = countryCodeToFlag(String(user.country).trim());
    const isLive = user.isLive ? '' : ' 已下播';

    let remark = '', startAt = '';
    if (info.show?.createdAt)                     startAt = info.show.createdAt;
    else if (info.groupShowAnnouncement?.startAt) startAt = info.groupShowAnnouncement.startAt;

    if (startAt) {
        const dt  = new Date(startAt);
        dt.setHours(dt.getHours() + 8);
        const mm  = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd  = String(dt.getUTCDate()).padStart(2, '0');
        const hh  = String(dt.getUTCHours()).padStart(2, '0');
        const min = String(dt.getUTCMinutes()).padStart(2, '0');
        remark    = `🎫 始于 ${mm}月${dd}日 ${hh}:${min}`;
    }

    return {
        list: [{
            vod_id:        id,
            vod_name:      String(info.topic).trim(),
            vod_pic:       String(user.avatarUrl),
            vod_director:  `${flag}${username}${isLive}`,
            vod_remarks:   remark,
            vod_play_from: '书生玩剣ⁱ·*₁＇',
            vod_play_url:  `${id}$${id}`,
        }],
    };
}

async function search(inReq, _outResp) {
    const pg = parseInt(inReq.body.pg || inReq.body.page || '1');
    if (pg > 1) return { list: [] };

    const [tag, key] = processKey(inReq.body.wd || '');
    const url        = `${origin}/api/front/v4/models/search/group/username?query=${encodeURIComponent(key)}&limit=900&primaryTag=${tag}`;
    const resp       = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const rsp        = resp.data;

    const list = (rsp.models || [])
        .filter(u => u.isLive)
        .map(u => ({
            vod_id:      String(u.username).trim(),
            vod_name:    `${countryCodeToFlag(String(u.country).trim())}${u.username}`,
            vod_pic:     `https://img.doppiocdn.net/thumbs/${u.snapshotTimestamp}/${u.id}`,
            vod_remarks: u.status === 'public' ? '' : '🎫',
        }));

    return { list };
}

async function play(inReq, _outResp) {
    const id      = inReq.body.id;
    const m3u8Url = `https://edge-hls.doppiocdn.net/hls/${id}/master/${id}_auto.m3u8?playlistType=lowLatency`;

    const resp  = await axios.get(m3u8Url, { headers: HEADERS, timeout: 10000, responseType: 'text' });
    const lines = resp.data.trim().split('\n');

    let psch = '', pkey = '';
    const url = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 对应 Python: parts = line.split(':'), psch=parts[2], pkey=parts[3]
        if (line.startsWith('#EXT-X-MOUFLON:')) {
            const parts = line.split(':');
            if (parts.length >= 4) {
                psch = parts[2];
                pkey = parts[3];
            }
        }
        if (line.includes('#EXT-X-STREAM-INF')) {
            const nameMatch = line.match(/NAME="([^"]+)"/);
            const qn        = nameMatch ? nameMatch[1] : '';
            const urlBase   = lines[i + 1] || '';
            const fullUrl   = `${urlBase}&psch=${psch}&pkey=${pkey}`;
            const proxyUrl  = `http://127.0.0.1:${PORT}/spider/stripchat/3/proxy?url=${encodeURIComponent(fullUrl)}`;
            url.push(qn, proxyUrl);
        }
    }

    return { url, parse: '0', contentType: '', header: HEADERS };
}

// ─── localProxy 严格对应 Python localProxy ────────────────────────────────

async function localProxy(inReq, reply) {
    // 对应 Python: url = unquote(param['url'])
    const url = decodeURIComponent(inReq.query.url || '');
    if (!url) return reply.code(404).type('text/plain').send('');

    // 对应 Python: data = self.fetch(url)
    let text = '', status = 0;
    try {
        const resp = await axios.get(url, { headers: HEADERS, timeout: 10000, responseType: 'text' });
        status = resp.status;
        text   = resp.data;
    } catch (e) {
        status = e.response?.status || 500;
        text   = e.response?.data   || '';
    }

    // 对应 Python: if data.status_code == 403: (仅403才fallback)
    if (status === 403) {
        const fallbackUrl = url.replace(/\d+p\d*\.m3u8/, '160p_blurred.m3u8');
        try {
            const resp = await axios.get(fallbackUrl, { headers: HEADERS, timeout: 10000, responseType: 'text' });
            status = resp.status;
            text   = resp.data;
        } catch (e) {
            status = e.response?.status || 500;
            text   = e.response?.data   || '';
        }
    }

    // 对应 Python: if data.status_code != 200: return [404, ...]
    if (status !== 200) return reply.code(404).type('text/plain').send('');

    // 对应 Python: if "#EXT-X-MOUFLON:FILE" in data
    if (text.includes('#EXT-X-MOUFLON:FILE')) {
        text = processM3u8Content(text);
    }

    // 对应 Python: return [200, "application/vnd.apple.mpegur", data]
    // 原版 content-type 拼写有误 mpegur，保持一致
    reply.header('Content-Type', 'application/vnd.apple.mpegur').send(text);
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'stripchat',
        name: 'Stripchat',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/proxy',     localProxy);
    },
};