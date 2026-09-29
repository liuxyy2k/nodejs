import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import crypto from 'crypto';
import https from 'https';

const HOST = 'https://adjust.cbpjoocbe.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const PLAY_AES_KEY = Buffer.from('2acf7e91e9864673', 'utf8');
const PLAY_AES_IV = Buffer.from('1c29882d3ddfcfd6', 'utf8');
const IMG_AES_KEY = Buffer.from('f5d965df75336270', 'utf8');
const IMG_AES_IV = Buffer.from('97b60394abc2fbe1', 'utf8');

const SEG_KEYS = ['cate', 'tag', 'bg', 'channel', 'status', 'sort'];

const FILTER_DEFS = [
    {
        key: 'tag',
        name: '标签',
        value: [
            ['全部', '0'],
            ['大男主', '2'],
            ['大女主', '1'],
            ['甜宠', '49'],
            ['双向奔赴', '48'],
            ['赘婿逆袭', '39'],
            ['传承觉醒', '38'],
            ['家长里短', '37'],
            ['破镜重圆', '36'],
            ['虐恋', '35'],
            ['豪门', '34'],
            ['强者回归', '33'],
            ['先婚后爱', '32'],
            ['小人物', '31'],
            ['神豪', '30'],
            ['系统', '29'],
            ['穿越', '28'],
            ['重生', '27'],
            ['马甲', '26'],
            ['打脸虐渣', '25'],
        ],
    },
    {
        key: 'bg',
        name: '背景',
        value: [
            ['全部', '0'],
            ['现代', '40'],
            ['都市', '41'],
            ['古代', '42'],
            ['乡村', '43'],
            ['年代', '44'],
            ['职场', '45'],
        ],
    },
    {
        key: 'channel',
        name: '频道',
        value: [
            ['全部', '0'],
            ['男频', '1'],
            ['女频', '2'],
        ],
    },
    {
        key: 'status',
        name: '状态',
        value: [
            ['全部', '0'],
            ['7天内', '1'],
            ['14天内', '2'],
            ['30天内', '3'],
            ['90天内', '4'],
        ],
    },
    {
        key: 'sort',
        name: '排序',
        value: [
            ['全部', '0'],
            ['最新', '1'],
            ['最热', '2'],
        ],
    },
];

const jar = new CookieJar();

const http = wrapper(
    axios.create({
        jar,
        timeout: 15000,
        validateStatus: () => true,
        headers: {
            'User-Agent': UA,
            Referer: `${HOST}/`,
        },
    }),
);

let oauthId = '';

function siteHeaders() {
    return { 'User-Agent': UA, Referer: `${HOST}/` };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/duanju51/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}`;
}

function proxyPic(raw, inReq) {
    if (!raw) return '';
    const b64 = Buffer.from(raw, 'utf8').toString('base64');
    return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(b64)}`;
}

function unpadPkcs7(buf) {
    const pad = buf[buf.length - 1];
    if (pad >= 1 && pad <= 16) return buf.subarray(0, buf.length - pad);
    return buf;
}

function aesDecryptCbc(buf, key, iv) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return unpadPkcs7(Buffer.concat([decipher.update(buf), decipher.final()]));
}

function decodePlay(dataB64) {
    const dec = aesDecryptCbc(Buffer.from(dataB64, 'base64'), PLAY_AES_KEY, PLAY_AES_IV);
    return JSON.parse(dec.toString('utf8'));
}

function decodeImg(data) {
    return aesDecryptCbc(data, IMG_AES_KEY, IMG_AES_IV);
}

function isPlainImage(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return true;
    if (buf.length >= 4 && buf.subarray(0, 4).toString() === 'GIF8') return true;
    return false;
}

function imageMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 4 && buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

async function ensureOauth() {
    try {
        await http.get(`${HOST}/`, { headers: siteHeaders() });
        const cookies = await jar.getCookies(HOST);
        const c = cookies.find((x) => x.key === 'OAUTH_ID');
        oauthId = c?.value || oauthId || '';
    } catch {
        oauthId = oauthId || '';
    }
}

async function fetchHtml(url) {
    const r = await http.get(url, { headers: siteHeaders() });
    if (r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : String(r.data || '');
}

function parseCards(html, inReq) {
    const videos = [];
    const re =
        /<a[^>]*href="(?:\/video\/|\/play\?id=)(\d+)"[^>]*>[\s\S]*?<img[^>]*?data-src="([^"]+)"[^>]*?alt="([^"]*)"[\s\S]*?>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const [, vid, pic, title, inner] = m;
        if (title.trim() === '广告') continue;
        const rm = inner.match(/全(\d+)集/);
        const remarks = rm ? `全${rm[1]}集` : '';
        videos.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: proxyPic(pic, inReq),
            vod_remarks: remarks,
        });
    }
    return videos;
}

function parseFilterLinks(html) {
    const rows = [];
    const seen = new Set();
    const re =
        /(?:https?:\/\/[^/"]*)?\/new-theater-category\/(\d+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)\/?[^"]*"[^>]*>([^<]*)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const segs = m.slice(1, 7);
        const text = m[7].trim();
        const key = segs.join('-');
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ segs, text });
    }
    return rows;
}

function buildFilterList() {
    return FILTER_DEFS.map((f) => ({
        key: f.key,
        name: f.name,
        value: f.value.map(([n, v]) => ({ n, v })),
    }));
}

function parseExtend(inReq) {
    let ext = inReq.body.filters || inReq.body.extend || {};
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(ext);
        } catch {
            ext = {};
        }
    }
    return ext && typeof ext === 'object' ? ext : {};
}

function buildSegments(tid, extend) {
    const segs = [String(tid), '0', '0', '0', '0', '0'];
    for (let i = 1; i < SEG_KEYS.length; i++) {
        const v = String(extend[SEG_KEYS[i]] || '').trim();
        if (v) segs[i] = v;
    }
    return segs;
}

async function videoEpisodes(playId) {
    await ensureOauth();
    const body = new URLSearchParams({
        id: String(playId),
        oauth_id: oauthId,
        token: '',
    }).toString();
    const r = await http.post(`${HOST}/video/videoepisodes`, body, {
        headers: {
            ...siteHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    let payload = r.data;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            return {};
        }
    }
    const decoded = decodePlay(payload.data || '');
    return decoded?.data && typeof decoded.data === 'object' ? decoded.data : {};
}

function normalizeSerials(d) {
    let serials = d?.episodeAll || [];
    if (serials && typeof serials === 'object' && !Array.isArray(serials)) {
        serials = serials.list || [];
    }
    return Array.isArray(serials) ? serials : [];
}

async function init(_inReq, _outResp) {
    await ensureOauth();
    return {};
}

async function home(inReq, _outResp) {
    const navHtml = await fetchHtml(`${HOST}/new-theater-category/0-0-0-0-0-0/`);
    const html = await fetchHtml(`${HOST}/`);
    const classes = [];
    const cset = new Set();
    const filters = {};
    const flist = buildFilterList();

    for (const r of parseFilterLinks(navHtml)) {
        const s1 = r.segs[0];
        if (s1 === '0' || cset.has(s1)) continue;
        cset.add(s1);
        classes.push({ type_id: s1, type_name: r.text });
    }
    for (const c of classes) {
        filters[c.type_id] = flist.map((x) => ({ ...x, value: [...x.value] }));
    }

    return {
        class: classes,
        filters,
        list: parseCards(html, inReq),
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '0');
    const pg = parseInt(inReq.body.page, 10) || 1;
    const extend = parseExtend(inReq);
    const segs = buildSegments(tid, extend);
    let path = `/new-theater-category/${segs.join('-')}/`;
    if (pg !== 1) path += `page/${pg}`;
    const html = await fetchHtml(`${HOST}${path}`);
    return {
        list: parseCards(html, inReq),
        page: pg,
        pagecount: 999,
        total: 99999,
        limit: 24,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '');
    await ensureOauth();

    let playId = vid;
    let d = await videoEpisodes(playId);
    let serials = normalizeSerials(d);

    let vodName = '';
    let pic = '';
    let desc = '';

    if (!serials.length || String(serials[0]?.id) !== String(playId)) {
        const html = await fetchHtml(`${HOST}/video/${vid}`);
        const nameM = html.match(/<title>(.*?)<\/title>/);
        if (nameM) vodName = nameM[1].split(' - ')[0].trim();
        const picM = html.match(/property="og:image"\s+content="([^"]+)"/);
        if (picM) pic = picM[1];
        const plays = [...html.matchAll(/\/play\?id=(\d+)/g)].map((x) => x[1]);
        if (plays.length) {
            playId = plays[0];
            d = await videoEpisodes(playId);
            serials = normalizeSerials(d);
        }
    }

    if (!vodName) vodName = d.video_title || '';
    if (!desc) desc = d.description || '';
    if (!pic) pic = d.cover_img || d.first_img || '';

    const episodes = [];
    for (const item of serials) {
        const eid = item.id;
        if (eid == null) continue;
        const title = item.episode_title || `第${item.sort || episodes.length + 1}集`;
        episodes.push(`${title}$${eid}`);
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: vodName,
                vod_pic: pic,
                vod_play_from: '51短剧',
                vod_play_url: episodes.join('#'),
                vod_content: desc,
                vod_remarks: episodes.length ? `共${episodes.length}集` : '',
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const raw = String(inReq.body.id || '');
    const val = raw.includes('$') ? raw.split('$').pop() : raw;
    if (val.startsWith('http')) {
        return { parse: 0, url: val, header: siteHeaders() };
    }
    try {
        const d = await videoEpisodes(val);
        const serials = normalizeSerials(d);
        for (const it of serials) {
            if (String(it.id) === String(val)) {
                const url = it.video_url || '';
                if (url) {
                    return { parse: 0, url, header: siteHeaders() };
                }
            }
        }
    } catch (e) {
        console.log('[51duanju] player err:', e.message);
    }
    return { parse: 0, url: '', header: siteHeaders() };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const html = await fetchHtml(`${HOST}/search?wd=${key}`);
    return { list: parseCards(html, inReq) };
}

async function imgHandler(inReq, reply) {
    try {
        let imgB64 = decodeURIComponent(inReq.query.url || '');
        const pad = (4 - (imgB64.length % 4)) % 4;
        if (pad) imgB64 += '='.repeat(pad);
        const imgUrl = Buffer.from(imgB64, 'base64').toString('utf8');
        if (!imgUrl) return reply.code(404).send('');

        const resp = await http.get(imgUrl, {
            headers: siteHeaders(),
            responseType: 'arraybuffer',
            timeout: 20000,
        });
        if (resp.status !== 200) return reply.code(404).send('image not found');

        let body = Buffer.from(resp.data);
        if (!isPlainImage(body)) {
            try {
                body = decodeImg(body);
            } catch {
                return reply.code(500).send('decryption failed');
            }
        }
        const ct = imageMime(body);
        return reply.code(200).header('Content-Type', ct).send(body);
    } catch {
        return reply.code(500).send('decryption failed');
    }
}

export default {
    meta: {
        key: 'duanju51',
        name: '📖51短剧',
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
