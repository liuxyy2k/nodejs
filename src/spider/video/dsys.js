import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';  // npm i uuid

const host  = 'https://dsav.app/';
const phost = 'https://cdni155n8.230110.xyz';

const AES_KEY = Buffer.from('OPQT123412FRANME');
const AES_IV  = Buffer.from('MRDCQP12QPM13412');

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const headers = {
    origin:       host,
    referer:      `${host}/`,
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.8 Mobile/15E148 Safari/604.1',
};

// ─── HTTP Client ──────────────────────────────────────────────────────────────

const http = axios.create({ timeout: 15_000, headers,httpsAgent : agent});

// ─── Crypto Helpers ───────────────────────────────────────────────────────────

function aesEncrypt(obj) {
    const plain  = JSON.stringify(obj);
    const cipher = crypto.createCipheriv('aes-128-cbc', AES_KEY, AES_IV);
    const block  = 16;
    const padLen = block - (Buffer.byteLength(plain) % block);
    const padded = Buffer.concat([Buffer.from(plain), Buffer.alloc(padLen, padLen)]);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function aesDecrypt(b64str) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
    const buf      = Buffer.concat([decipher.update(Buffer.from(b64str, 'base64')), decipher.final()]);
    const padLen   = buf[buf.length - 1];
    return JSON.parse(buf.slice(0, buf.length - padLen).toString('utf-8'));
}

function md5(str) {
    return crypto.createHash('md5').update(str, 'utf-8').digest('hex');
}

function e64(str) {
    return Buffer.from(str, 'utf-8').toString('base64');
}

function d64(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
}

// ─── URL Helpers ──────────────────────────────────────────────────────────────

// 替换域名，保留路径
function rebase(url) {
    const path = new URL(url).pathname;
    return new URL(path, phost).href;
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function getdata(data) {
    const uid  = uuidv4();
    const t    = Math.floor(Date.now() / 1000);
    const sign = md5(`${e64(JSON.stringify(data))}${uid}${t}AjPuom638LmWfWyeM5YueKuJ9PuWLdRn`);

    const payload = {
        sign,
        nonce:     uid,
        timestamp: t,
        data:      aesEncrypt(data),
    };

    const { data: res } = await http.post(`${host}/v1`, payload);
    return aesDecrypt(res.data);
}

// ─── List Formatter ───────────────────────────────────────────────────────────

function getl(data) {
    return data.map((i) => {
        let img = i.video_cover || '';
        if (img && img.includes('http')) img = rebase(img);
        return {
            vod_id:      i.video_id,
            vod_name:    i.video_title,
            vod_pic:     img,
            vod_remarks: i.video_duration,
            style:       { type: 'rect', ratio: 1.33 },
        };
    });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const b64 = '9XSPkyFMrOOG34JSg//ZosMof45cyBo9hwZMZ5rvI6Yz/ZZlXWIf8/644OzwW+FNIOdJ61R/Lxjy1tqN+ZzokxtiVzb8LjYAkh6GFudwAUXFt9yS1ZjAxC3tDKrQsJQLk3nym0s00DBBzLBntRBDFz7nbba+OOBuQOZpL3CESGL42l4opdoViQLhO/dIizY1kIOk2NxxpDC9Z751gPl1ctHWuLWhuLG/QWgNWi/iHScjKrMHJKcC9GQHst/4Q3dgZ03eQIIVB6jvoV1XXoBCz6fjM/jM3BXpzSttT4Stglwy93gWuNWuZiKypHK2Q0lO10oM0ceRW2a0fPGId+rNYMRO3cR/C0ZueD4cmTAVOuxVr9ZZSP8/nhD0bHyAPONXtchIDJb0O/kdFHk2KTJfQ5q4fHOyzezczc4iQDV/R0S8cGZKM14MF+wytA/iljfj43H0UYqq5pM+MCUGRTdYEtuxCp0+A+DiOhNZwY/Km/TgBoGZQWGbpljJ2LAVnWhxX+ickLH7zuR/FeIwP/R8zOuR+8C8UlT9eHTqtvfNzaGdFxt316atHy8TNjRO7J5a177mqsHs3ziG0toDDzLDCbhRUjFgVA3ktahhXiWaaCo/ZGSJAA8TDO5DYqnJ0JDaX0ILPj8QB5zxrHYmRE8PboIr3RBAjz1sREbaHfjrUjoh29ePhlolLV00EvgoxP5knaqt5Ws/sq5IG57qKCAPgqXzblPLHToJGBtukKhLp8jbGJrkb6PVn4/jysks0NGE';
    const classes = aesDecrypt(b64);
    console.log(classes)
    return { class: classes, list: [], filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    // 标签搜索
    if (tid.startsWith('skey_')) {
        return search({ body: { wd: tid.split('_').pop(), pg: String(pg) } });
    }

    const data = {
        q:      '',
        filter: [`type_id = ${tid}`],
        offset: (pg - 1) * 24,
        limit:  24,
        sort:   ['video_time:desc'],
        lang:   'zh-cn',
        route:  '/videos/search',
    };

    const res = await getdata(data);
    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list: getl(res) };
}

async function detail(inReq, _outResp) {
    const id  = inReq.body.id;
    const data = {
        limit:  1,
        filter: [`video_id = ${id}`],
        lang:   'zh-cn',
        route:  '/videos/search',
    };

    const res  = await getdata(data);
    const item = res[0];
    const purl = rebase(item.video_url);

    const vod = {
        vod_id:        id,
        vod_play_from: 'dsysav',
        vod_play_url:  `${item.video_duration}$${purl}`,
    };

    if (item.video_tag) {
        const links = item.video_tag.split(',').map((k) =>
            `[a=cr:${JSON.stringify({ id: `skey_${k}`, name: k })}/]${k}[/a]`
        );
        vod.vod_content = links.join(' ');
    }

    return { list: [vod] };
}

async function play(inReq, _outResp) {
    let id = inReq.body.id;

    if (id.endsWith('.mpd')) {
        // 代理地址由框架侧处理，这里简单透传
        id = `${id}`;
    }

    return { parse: 0, url: id, header: headers };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;

    const data = {
        q:      key,
        filter: [],
        offset: (pg - 1) * 24,
        limit:  24,
        sort:   ['video_time:desc'],
        lang:   'zh-cn',
        route:  '/videos/search',
    };

    const res = await getdata(data);
    return { list: getl(res), page: pg };
}

// ─── localProxy (MPD 代理) ────────────────────────────────────────────────────

async function localProxy(param) {
    // MPD manifest 改写
    if (param.type === 'mpd') {
        const url    = d64(param.url);
        const parts  = url.split('/');
        const id     = `${parts[parts.length - 3]}/${parts[parts.length - 2]}/`;
        const xpu    = `/proxy?path=`;   // 根据实际框架代理路径调整
        const { data } = await http.get(url);
        const patched = data
            .replace(/initialization="/g, `initialization="${xpu}${id}`)
            .replace(/media="/g,          `media="${xpu}${id}`);
        return [200, 'application/octet-stream', {}, patched];
    }

    // 分片签名跳转
    const raw   = `AjPuom638LmWfWyeM5YueKuJ9PuWLdRn/mpd/${param.path}1767196800`;
    const hex   = md5(raw);
    const sign  = Buffer.from(hex, 'hex')
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    const url   = `${phost}/mpd/${param.path}?sign=${sign}&expire=1767196800`;
    return [302, 'text/plain', { Location: url }, ''];
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'dsav',
        name: 'DSYS',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/proxy',     async (req, reply) => {
            const [status, mime, hdrs, body] = await localProxy(req.query);
            reply.status(status).headers(hdrs || {}).type(mime).send(body);
        });
    },
};