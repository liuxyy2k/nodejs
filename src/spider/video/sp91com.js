import { load } from 'cheerio';
import crypto from 'crypto';
import req from '../../util/req.js';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/sp91com/3';
const site = 'https://91sp91.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PLAY_KEY = Buffer.from('2acf7e91e9864673');
const PLAY_IV = Buffer.from('1c29882d3ddfcfd6');
const SIGN_KEY = '5589d41f92a597d016b037ac37db243d';

const CLASSES = [
    { type_id: '/', type_name: '首页' },
    { type_id: '/category/jrxw1/', type_name: '今日更新' },
    { type_id: '/category/bljp/', type_name: '国产视频' },
    { type_id: '/category/aicrdj/', type_name: 'AI成人短剧' },
    { type_id: '/category/thjx/', type_name: '91探花' },
    { type_id: '/category/llsq/', type_name: '海角社区' },
    { type_id: '/category/cglq/', type_name: '吃瓜爆料' },
    { type_id: '/category/rmdg/', type_name: '91话题' },
    { type_id: '/category/mjmsjb/', type_name: '优选投放区' },
    { type_id: '/category/rbph/', type_name: '日榜排行' },
    { type_id: '/category/gcwh/', type_name: '网黄合集' },
    { type_id: '/category/mxwh/', type_name: '网红专区' },
    { type_id: '/category/xsxy/', type_name: '反差合集' },
    { type_id: '/category/gcjc/', type_name: '91porn' },
    { type_id: '/category/fccg/', type_name: '痴汉猎奇' },
    { type_id: '/category/western-videos/', type_name: '欧美视频' },
    { type_id: '/category/zbjx/', type_name: '周榜精选' },
    { type_id: '/category/ybrm/', type_name: '月榜热门' },
    { type_id: '/category/sports-live/', type_name: '体育直播' },
];

const FILTERS = [
    {
        key: 'cat',
        name: '分类',
        value: [{ n: '全部', v: '' }].concat(
            CLASSES.filter((c) => c.type_id !== '/').map((c) => ({ n: c.type_name, v: c.type_id })),
        ),
    },
];

function abs(u) {
    if (!u) return '';
    u = String(u).trim();
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return site + u;
    return `${site}/${u}`;
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const o = JSON.parse(String(raw));
        return o && typeof o === 'object' ? o : {};
    } catch {
        return {};
    }
}

function e64(s) {
    try {
        return Buffer.from(s || '').toString('base64');
    } catch {
        return '';
    }
}

function d64(s) {
    try {
        return Buffer.from(s || '', 'base64').toString('utf-8');
    } catch {
        return '';
    }
}

function isImgMagic(buf) {
    return (
        (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
        (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ||
        buf.slice(0, 3).toString() === 'GIF' ||
        buf.slice(0, 4).toString() === 'RIFF'
    );
}

function xorDescramble(buf) {
    const out = Buffer.from(buf);
    const key = Buffer.from('2019ysapp7527');
    for (let i = 0; i < 100 && i < out.length; i++) out[i] ^= key[i % key.length];
    return out;
}

function aesDecryptImg(buf) {
    const decipher = crypto.createDecipheriv(
        'aes-128-cbc',
        Buffer.from('f5d965df75336270'),
        Buffer.from('97b60394abc2fbe1'),
    );
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function decodeImg(buf) {
    if (isImgMagic(buf)) return buf;
    if (buf.length % 16 === 0) {
        try {
            const aes = aesDecryptImg(buf);
            if (isImgMagic(aes)) return aes;
            const aesXor = xorDescramble(aes);
            if (isImgMagic(aesXor)) return aesXor;
        } catch {}
    }
    return xorDescramble(buf);
}

function proxyPic(url, inReq) {
    url = abs(url);
    if (!url || url.startsWith('blob:')) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(e64(url))}`;
}

function siteHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${site}/`,
        Origin: site,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
}

async function request(url) {
    const resp = await req.get(url, {
        headers: siteHeaders(),
        timeout: 20000,
        validateStatus: () => true,
    });
    return resp.data;
}

function encryptPlay(plain) {
    const cipher = crypto.createCipheriv('aes-128-cbc', PLAY_KEY, PLAY_IV);
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]).toString('base64');
}

function decryptPlay(b64) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', PLAY_KEY, PLAY_IV);
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(Buffer.from(String(b64), 'base64')), decipher.final()]).toString('utf8');
}

function makeSign(obj) {
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => {
        let val = obj[k];
        if (k === 'data') val = String(val).replace(/ /g, '+');
        return `${k}=${val}`;
    });
    const raw = parts.join('&') + SIGN_KEY;
    const sha = crypto.createHash('sha256').update(raw).digest('hex');
    return crypto.createHash('md5').update(sha).digest('hex');
}

function fakeEnv() {
    return {
        ua: UA,
        uaData: null,
        webdriver: false,
        isHeadlessUA: false,
        languages: ['zh-CN', 'zh'],
        pluginsCount: 5,
        mimeTypesCount: 2,
        hc: 8,
        dm: 8,
        dpr: 1,
        touchPoints: 0,
        screen: { w: 1920, h: 1080, aw: 1920, ah: 1040, cd: 24 },
        tzOffset: -480,
        tzName: 'Asia/Shanghai',
        cookiesEnabled: true,
        storage: { local: true, session: true },
        notifPerm: 'default',
        battery: null,
        mediaDevs: { count: 2, kinds: ['audioinput', 'videoinput'] },
        webgl: { vendor: 'Google Inc.', renderer: 'ANGLE' },
        canvasHash: 'a1b2c3d4',
        audioHash: 'e5f67890',
        score: 88,
        label: '自然/低风险',
        reasons: [],
        hevc_supported: false,
        hevc_state: 'unknown',
        hevc_engine: 'h264',
        hevc_reason: '',
        source_contract: 'dual-v1',
    };
}

async function fetchPlayUrl(apiPath) {
    const url = abs(apiPath);
    const payload = { ...fakeEnv(), behavior: {}, verify: true };
    const data = encryptPlay(JSON.stringify(payload));
    const body = { data, timestamp: Date.now(), _ver: 'v1' };
    body.sign = makeSign(body);
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) form.append(k, String(v));
    const resp = await req.post(url, form.toString(), {
        headers: {
            ...siteHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json, text/javascript, */*; q=0.01',
        },
        timeout: 20000,
        validateStatus: () => true,
    });
    const json = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    if (!json || json.status !== 0 || !json.data) return '';
    if (typeof json.data === 'string' && /\.m3u8|https?:\/\//i.test(json.data) && json.data.length < 400) {
        return json.data;
    }
    const dec = decryptPlay(json.data);
    let parsed = dec;
    try {
        parsed = JSON.parse(dec);
    } catch {}
    if (typeof parsed === 'string') return parsed;
    return parsed?.primary || parsed?.url || parsed?.fallback || parsed?.h264 || '';
}

function coverOf($el) {
    const img = $el.find('img').first();
    const raw =
        img.attr('z-image-loader-url') ||
        img.attr('data-src') ||
        $el.find('.blog-background').attr('data-bg') ||
        img.attr('src') ||
        '';
    if (!raw || raw.startsWith('blob:')) return '';
    return raw;
}

function parseVods($, inReq) {
    const list = [];
    const seen = new Set();
    $('article').each((_, el) => {
        const $el = $(el);
        if ($el.find('.post-card-ads, .post-card-advert').length) return;
        const href =
            $el.find('a[href*="/archives/"]').first().attr('href') || $el.find('a').first().attr('href') || '';
        const id = (href.match(/\/archives\/(\d+)/) || [])[1];
        if (!id || seen.has(id)) return;
        seen.add(id);
        const name = $el.find('.post-card-title').text().replace(/\s+/g, ' ').trim();
        if (!name) return;
        const info = $el.find('.post-card-info').text().replace(/\s+/g, ' ').trim();
        const date = (info.match(/(\d{4})\s*年\s*(\d{2})\s*月\s*(\d{2})\s*日/) || []).slice(1).join('-');
        list.push({
            vod_id: id,
            vod_name: name.replace(/\s*热搜\s*HOT\s*$/, '').trim(),
            vod_pic: proxyPic(coverOf($el), inReq),
            vod_remarks: date,
        });
    });
    return list;
}

function buildListUrl(tid, page, ext = {}) {
    let raw = String(ext.cat || tid || '/').trim() || '/';
    try {
        raw = decodeURIComponent(raw);
    } catch {}
    if (!raw.startsWith('/')) raw = `/${raw}`;
    if (raw === '/') {
        return page > 1 ? `${site}/page/${page}/` : `${site}/`;
    }
    if (!raw.endsWith('/')) raw += '/';
    return page > 1 ? `${site}${raw}${page}/` : `${site}${raw}`;
}

function parsePageCount($, page) {
    let max = page;
    $('.page-navigator a').each((_, el) => {
        const href = String($(el).attr('href') || '');
        const m = href.match(/\/page\/(\d+)\/?$/) || href.match(/\/(\d+)\/?$/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (n > max && n < 100000) max = n;
    });
    if ($('.page-navigator .next a').length && max <= page) max = page + 1;
    return max || page;
}

async function init() {
    return {};
}

async function home(inReq) {
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = FILTERS;
    const html = await request(`${site}/`);
    const $ = load(typeof html === 'string' ? html : '');
    return { class: CLASSES, filters, list: parseVods($, inReq) };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = String(inReq.body.id || '/');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const html = await request(buildListUrl(tid, page, ext));
    const $ = load(typeof html === 'string' ? html : '');
    const list = parseVods($, inReq);
    return {
        list,
        page,
        pagecount: parsePageCount($, page) || (list.length ? page + 1 : page),
        limit: 30,
        total: list.length,
    };
}

function parseConfig($el) {
    const raw = $el.attr('data-config') || '';
    if (!raw) return {};
    try {
        return JSON.parse(raw.replace(/&quot;/g, '"'));
    } catch {
        return {};
    }
}

async function resolveCfgUrl(cfg) {
    const u = cfg?.url || cfg?.video?.url || '';
    if (!u) return '';
    if (/\.m3u8(\?|$)/i.test(u) || /\.mp4(\?|$)/i.test(u)) return abs(u);
    if (/get_play_url|\/action\/player\//i.test(u)) {
        try {
            return await fetchPlayUrl(u);
        } catch {
            return '';
        }
    }
    return abs(u);
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').replace(/\/+$/, '').split('/').pop();
    if (!id) return { list: [] };
    const html = await request(`${site}/archives/${id}/`);
    const $ = load(typeof html === 'string' ? html : '');
    const name =
        $('h1.post-title, h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        '';
    const pic =
        $('.dplayer').first().attr('data-config') && parseConfig($('.dplayer').first()).poster
            ? parseConfig($('.dplayer').first()).poster
            : $('meta[property="og:image"]').attr('content') ||
              $('img[z-image-loader-url]').first().attr('z-image-loader-url') ||
              '';
    const content =
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        '';
    const tracks = [];
    const players = $('.dplayer').toArray();
    let i = 0;
    for (const el of players) {
        const cfg = parseConfig($(el));
        const play = await resolveCfgUrl(cfg);
        if (!play) continue;
        i += 1;
        const label = players.length > 1 ? `第${cfg.idx != null ? Number(cfg.idx) + 1 : i}段` : '正片';
        tracks.push(`${label}$${play}`);
    }
    return {
        list: [
            {
                vod_id: id,
                vod_name: name,
                vod_pic: proxyPic(pic, inReq),
                vod_content: content,
                vod_play_from: '91视频网',
                vod_play_url: tracks.join('#'),
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    if (/get_play_url|\/action\/player\//i.test(raw)) {
        try {
            raw = await fetchPlayUrl(raw);
        } catch {
            raw = '';
        }
    }
    return {
        parse: 0,
        url: raw,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const html = await request(`${site}/search/${encodeURIComponent(kw)}/`);
    const $ = load(typeof html === 'string' ? html : '');
    return { list: parseVods($, inReq), page: 1 };
}

async function imgProxy(inReq, reply) {
    try {
        const raw = abs(d64(inReq.query.url));
        if (!raw) return reply.code(404).send('');
        const resp = await req.get(raw, {
            headers: { 'User-Agent': UA, Referer: `${site}/`, Origin: site },
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
        });
        const decrypted = decodeImg(Buffer.from(resp.data || []));
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';
        reply.header('Content-Type', ct).send(decrypted);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: { key: 'sp91com', name: '🍉91视频网', type: 3 },
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
