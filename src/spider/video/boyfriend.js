import axios from 'axios';
import crypto from 'crypto';

const host = 'https://zh.boyfriend.show';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const headers = {
    Origin:           host,
    Referer:          host + '/',
    Accept:           'application/json, text/plain, */*',
    'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8',
    'User-Agent':     UA,
};

const hashCache = {};

// ─── 解密工具 ────────────────────────────────────────────────────────

function decodeKeyCompact() {
    const base64Str  = 'NTEgNzUgNjUgNjEgNmUgMzQgNjMgNjEgNjkgMzkgNjIgNmYgNGEgNjEgMzUgNjE=';
    const decoded    = Buffer.from(base64Str, 'base64').toString('utf-8');
    const keyBytes   = Buffer.from(decoded.split(' ').map(h => parseInt(h, 16)));
    return keyBytes.toString('utf-8');
}

const STRIPCHAT_KEY = decodeKeyCompact();

function computeHash(key) {
    if (!hashCache[key]) {
        hashCache[key] = crypto.createHash('sha256').update(key, 'utf-8').digest();
    }
    return hashCache[key];
}

function decrypt(encryptedB64, key = STRIPCHAT_KEY) {
    const padding  = encryptedB64.length % 4;
    if (padding) encryptedB64 += '='.repeat(4 - padding);

    const hashBytes     = computeHash(key);
    const encryptedData = Buffer.from(encryptedB64, 'base64');
    const decrypted     = Buffer.alloc(encryptedData.length);

    for (let i = 0; i < encryptedData.length; i++) {
        decrypted[i] = encryptedData[i] ^ hashBytes[i % hashBytes.length];
    }
    return decrypted.toString('utf-8');
}

// ─── 工具函数 ────────────────────────────────────────────────────────

function countryCodeToFlag(code) {
    if (!code || code.length !== 2 || !/^[a-zA-Z]+$/.test(code)) return code;
    return [...code.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1F1E6)).join('');
}

function processM3u8Content(m3u8Text) {
    const lines = m3u8Text.trim().split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-MOUFLON:FILE:') && lines[i + 1]?.includes('media.mp4')) {
            const encryptedData = lines[i].split(':', 2)[1] === 'FILE'
                ? lines[i].split(':').slice(2).join(':').trim()
                : lines[i].replace('#EXT-X-MOUFLON:FILE:', '').trim();
            let decrypted;
            try {
                decrypted = decrypt(encryptedData, STRIPCHAT_KEY);
            } catch {
                decrypted = decrypt(encryptedData, 'Zokee2OhPh9kugh4');
            }
            lines[i + 1] = lines[i + 1].replace('media.mp4', decrypted);
        }
    }
    return lines.join('\n');
}

async function fetch(url) {
    const resp = await axios.get(url, { headers, timeout: 10000 });
    return resp.data;
}

// ─── Filter 定义 ─────────────────────────────────────────────────────

const VALUE = [
    { n: '中国', v: 'tagLanguageChinese'       },
    { n: '亚洲', v: 'ethnicityAsian'           },
    { n: '白人', v: 'ethnicityWhite'           },
    { n: '拉丁', v: 'ethnicityLatino'          },
    { n: '混血', v: 'ethnicityMultiracial'     },
    { n: '印度', v: 'ethnicityIndian'          },
    { n: '阿拉伯', v: 'ethnicityMiddleEastern' },
    { n: '黑人', v: 'ethnicityEbony'           },
];

const VALUE_MEN = [
    { n: '情侣', v: 'sexGayCouples'        },
    { n: '直男', v: 'orientationStraight'  },
];

const FILTERS = {
    girls:   [{ key: 'tag', name: '筛选', value: VALUE }],
    couples: [{ key: 'tag', name: '筛选', value: VALUE }],
    trans:   [{ key: 'tag', name: '筛选', value: VALUE }],
    men:     [{ key: 'tag', name: '筛选', value: [...VALUE_MEN, ...VALUE] }],
};

// ─── Fastify handlers ─────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'girls',   type_name: '女主播' },
        { type_id: 'couples', type_name: '情侣'   },
        { type_id: 'men',     type_name: '男主播' },
        { type_id: 'trans',   type_name: '跨性别' },
    ];
    return { class: classes, filters: FILTERS };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const page   = Math.max(parseInt(inReq.body.page) || 1, 1);
    const extend = inReq.body.filters || {};
    const limit  = 60;
    const offset = limit * (page - 1);

    let url = `${host}/api/front/models?improveTs=false&removeShows=false&limit=${limit}&offset=${offset}&primaryTag=${tid}&sortBy=stripRanking&rcmGrp=A&rbCnGr=true&prxCnGr=false&nic=false`;
    if (extend.tag) url += `&filterGroupTags=%5B%5B%22${extend.tag}%22%5D%5D`;

    const rsp    = await fetch(url);
    const total  = parseInt(rsp.filteredCount || 0);
    const list   = (rsp.models || []).map(vod => ({
        vod_id:      String(vod.username).trim(),
        vod_name:    countryCodeToFlag(String(vod.country).trim()) + String(vod.username).trim(),
        vod_pic:     `https://img.doppiocdn.org/thumbs/${vod.snapshotTimestamp}/${vod.id}`,
        vod_remarks: vod.status === 'public' ? '' : '🎫',
    }));

    return {
        page,
        pagecount: Math.ceil(total / limit),
        limit,
        total,
        list,
    };
}

async function detail(inReq, _outResp) {
    const username = inReq.body.id;
    const rsp      = await fetch(`${host}/api/front/v2/models/username/${username}/cam`);
    const info     = rsp.cam;
    const user     = rsp.user.user;
    const id       = String(user.id);
    const isLive   = user.isLive ? '' : ' 已下播';
    const flag     = countryCodeToFlag(String(user.country).trim());

    let remark = '';
    const show = info.show || info.groupShowAnnouncement;
    if (show) {
        const startAt = show.createdAt || show.startAt;
        if (startAt) {
            const bjTime = new Date(new Date(startAt).getTime() + 8 * 3600 * 1000);
            const mm     = String(bjTime.getUTCMonth() + 1).padStart(2, '0');
            const dd     = String(bjTime.getUTCDate()).padStart(2, '0');
            const hh     = String(bjTime.getUTCHours()).padStart(2, '0');
            const min    = String(bjTime.getUTCMinutes()).padStart(2, '0');
            remark       = `🎫 始于 ${mm}月${dd}日 ${hh}:${min}`;
        }
    }

    return {
        list: [{
            vod_id:        id,
            vod_name:      String(info.topic).trim(),
            vod_pic:       String(user.avatarUrl),
            vod_director:  `${flag}${username}${isLive}`,
            vod_remarks:   remark,
            vod_play_from: 'Boyfriend Show',
            vod_play_url:  `${id}$${id}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = `https://edge-hls.doppiocdn.net/hls/${id}/master/${id}_auto.m3u8?playlistType=lowLatency`;

    const text  = await axios.get(url, { headers, timeout: 10000, responseType: 'text' }).then(r => r.data);
    const lines = text.trim().split('\n');

    let psch = '', pkey = '';
    const urls = [];

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-MOUFLON:')) {
            const parts = lines[i].split(':');
            if (parts.length >= 4) { psch = parts[2]; pkey = parts[3]; }
        }
        if (lines[i].includes('#EXT-X-STREAM-INF')) {
            const nameStart = lines[i].indexOf('NAME="') + 6;
            const nameEnd   = lines[i].indexOf('"', nameStart);
            const qn        = lines[i].substring(nameStart, nameEnd);
            const urlBase   = lines[i + 1] || '';
            const fullUrl   = `${urlBase}&psch=${psch}&pkey=${pkey}`;
            // 通过 localProxy 转发
            const proxyUrl  = `http://127.0.0.1:${PORT}/spider/boyfriendshow/3/proxy?url=${encodeURIComponent(fullUrl)}`;
            urls.push(`${qn}$${proxyUrl}`);
        }
    }

    return {
        parse:  0,
        url:    urls[0]?.split('$')[1] || '',
        header: headers,
        // 多画质
        urls:   urls,
    };
}

async function search(inReq, _outResp) {
    const raw = inReq.body.wd || '';
    const page = parseInt(inReq.body.page) || 1;
    if (page > 1) return { list: [] };

    const TAGS    = { G: 'girls', C: 'couples', M: 'men', T: 'trans' };
    const parts   = raw.split(/\s+/, 2);
    let   tag     = 'men', key = raw.trim();
    if (parts.length > 1 && TAGS[parts[0].toUpperCase()]) {
        tag = TAGS[parts[0].toUpperCase()];
        key = parts[1].trim();
    }

    const url = `${host}/api/front/v4/models/search/group/username?query=${key}&limit=900&primaryTag=${tag}`;
    const rsp = await fetch(url);

    const list = (rsp.models || [])
        .filter(u => u.isLive)
        .map(u => ({
            vod_id:      String(u.username).trim(),
            vod_name:    countryCodeToFlag(String(u.country).trim()) + u.username,
            vod_pic:     `https://img.doppiocdn.org/thumbs/${u.snapshotTimestamp}/${u.id}`,
            vod_remarks: u.status === 'public' ? '' : '🎫',
        }));

    return { list };
}

// localProxy 路由：转发并处理加密 m3u8
async function localProxy(inReq, reply) {
    const url = decodeURIComponent(inReq.query.url || '');
    console.log(url)
    if (!url) return reply.code(400).send('');

    try {
        let resp = await axios.get(url, { headers, timeout: 10000, responseType: 'text' });
        if (resp.status === 403) {
            const fallback = url.replace(/\d+p\d*\.m3u8/, '160p_blurred.m3u8');
            resp = await axios.get(fallback, { headers, timeout: 10000, responseType: 'text' });
        }
        if (resp.status !== 200) return reply.code(404).send('');

        let body = resp.data;
        if (body.includes('#EXT-X-MOUFLON:FILE')) {
            body = processM3u8Content(body);
        }

        reply.header('Content-Type', 'application/vnd.apple.mpegurl').send(body);
    } catch (e) {
        console.error('localProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: { key: 'boyfriendshow', name: '🎥Boyfriend', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/proxy',     localProxy);   // m3u8 代理转发
    },
};