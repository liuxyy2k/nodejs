import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/baogua/3';
const SITE = 'https://besides.vumjtkcnc.cc';
const AES_KEY = Buffer.from('f5d965df75336270');
const AES_IV = Buffer.from('97b60394abc2fbe1');

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    Referer: `${SITE}/`,
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const CAT_MAP = {
    zxcgbl: '最新吃瓜',
    rmcgbl: '热搜排行',
    pronhub: '亚洲精选',
    zsxybl: '桃色校园',
    tpzq: '偷拍专区',
    whscbl: '明星网红',
    fcnsbl: '反差网黄',
    crycll: '伦理道德',
    mxbzbg: 'AI专区',
    rmbl: '欧美精选',
};

let homeHtml = '';

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .trim();
}

function absUrl(u) {
    if (!u) return '';
    u = String(u).trim();
    if (u.startsWith('//')) return `https:${u}`;
    if (/^https?:\/\//i.test(u)) return u;
    try {
        return new URL(u, `${SITE}/`).href;
    } catch {
        return u;
    }
}

function e64url(s) {
    return Buffer.from(String(s || ''), 'utf8').toString('base64url');
}

function d64url(s) {
    try {
        return Buffer.from(String(s || ''), 'base64url').toString('utf8');
    } catch {
        return '';
    }
}

function proxyPic(url, inReq) {
    url = absUrl(url);
    if (!url) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(e64url(url))}`;
}

function isVideoFormat(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    return /\.(?:m3u8|mp4|flv|mkv|ts|avi)(?:$|[?#])/i.test(u) || u.includes('m3u8');
}

async function getHtml(url, referer) {
    try {
        const resp = await axios.get(url, {
            headers: { ...HEADERS, Referer: referer || HEADERS.Referer },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: () => true,
            responseType: 'text',
        });
        if (resp.status >= 400) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function extractPosts(html, allowHot = true, inReq) {
    const out = [];
    const seen = new Set();
    for (const m of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
        const raw = m[0];
        const block = m[1];
        if (raw.includes('class="ad-item"')) continue;
        const hm = block.match(/<a[^>]+href="((?:https?:\/\/[^"]+)?\/archives\/(\d+)\.html)"/i);
        if (!hm) continue;
        const vid = hm[2];
        if (seen.has(vid)) continue;
        const im = block.match(/<img[^>]+z-image-loader-url="([^"]+)"/i);
        let title = block.match(/<h2[^>]+class="[^"]*post-card-title[^"]*"[^>]*itemprop="headline"[^>]*>([^<]+)<\/h2>/i)?.[1]?.trim() || '';
        if (!title) title = block.match(/<img[^>]+alt="([^"]+)"/i)?.[1]?.trim() || '';
        seen.add(vid);
        out.push({
            vod_id: vid,
            vod_name: unescapeHtml(title),
            vod_pic: proxyPic(im?.[1] || '', inReq),
            vod_remarks: '',
        });
    }
    if (!out.length && allowHot) {
        const hm = html.match(/var\s+hotRankList\s*=\s*(\[[\s\S]*?\]);/);
        if (hm) {
            try {
                const hotList = JSON.parse(hm[1]);
                for (const item of hotList) {
                    const vid = String(item?.cid || '');
                    if (!vid || seen.has(vid)) continue;
                    seen.add(vid);
                    out.push({
                        vod_id: vid,
                        vod_name: unescapeHtml(item.title || ''),
                        vod_pic: '',
                        vod_remarks: '',
                    });
                }
            } catch {
                /* ignore */
            }
        }
    }
    return out;
}

function extractVideo(html) {
    const tryConfig = (raw) => {
        try {
            const cfg = JSON.parse(raw);
            const url = cfg?.video?.url || '';
            if (url && isVideoFormat(url)) return url;
        } catch {
            /* ignore */
        }
        return '';
    };
    const m1 = html.match(/<div[^>]*class="[^"]*dplayer[^"]*"[^>]*data-config='([^']+)'/i);
    if (m1) {
        const url = tryConfig(m1[1]);
        if (url) return url;
    }
    const m2 = html.match(/<div[^>]*class="[^"]*dplayer[^"]*"[^>]*data-config="([^"]+)"/i);
    if (m2) {
        const url = tryConfig(m2[1].replace(/&quot;/g, '"'));
        if (url) return url;
    }
    const m3u8 = html.match(/(https?:\/\/[^\s"'<>]+?\.m3u8[^\s"'<>]*)/i);
    if (m3u8) return m3u8[1];
    const mp4 = html.match(/(https?:\/\/[^\s"'<>]+?\.mp4[^\s"'<>]*)/i);
    if (mp4) return mp4[1];
    const iframe = html.match(/<iframe[^>]+src="([^"]+)"/i);
    return iframe ? iframe[1] : '';
}

function aesDecrypt(buf) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function looksLikeImage(raw) {
    return (
        (raw[0] === 0xff && raw[1] === 0xd8) ||
        raw.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ||
        raw.slice(0, 4).toString('ascii') === 'GIF8' ||
        raw.slice(0, 4).toString('ascii') === 'RIFF'
    );
}

function decodePic(data) {
    let raw = Buffer.from(data || []);
    try {
        if (raw.length && raw.length % 16 === 0 && !looksLikeImage(raw)) {
            try {
                raw = aesDecrypt(raw);
            } catch {
                const d = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
                d.setAutoPadding(false);
                raw = Buffer.concat([d.update(raw), d.final()]);
            }
        }
    } catch {
        /* keep original */
    }
    let mime = 'image/jpeg';
    if (raw[0] === 0xff && raw[1] === 0xd8) mime = 'image/jpeg';
    else if (raw.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) mime = 'image/png';
    else if (raw.slice(0, 3).toString('ascii') === 'GIF') mime = 'image/gif';
    else if (raw.slice(0, 4).toString('ascii') === 'RIFF' && raw.slice(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
    return { raw, mime };
}

async function ensureHome() {
    if (!homeHtml) homeHtml = await getHtml(`${SITE}/`);
    return homeHtml;
}

async function init() {
    homeHtml = '';
    return {};
}

async function home(inReq) {
    const html = await ensureHome();
    return {
        class: Object.entries(CAT_MAP).map(([type_id, type_name]) => ({ type_id, type_name })),
        list: extractPosts(html, true, inReq),
    };
}

async function category(inReq) {
    const tid = String(inReq.body.id || '');
    let pg = parseInt(inReq.body.page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    let url = `${SITE}/category/${tid}/`;
    if (pg > 1) url += `${pg}/`;
    const html = await getHtml(url);
    if (!html) return { list: [], page: pg, pagecount: pg, limit: 20, total: 0 };
    const list = extractPosts(html, true, inReq);
    let pagecount = pg;
    const totalM = html.match(/<span class="page-info" data-total="(\d+)">/);
    if (totalM) pagecount = parseInt(totalM[1], 10);
    else if (new RegExp(`href="[^"]*/category/${tid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\d+/"`).test(html)) {
        pagecount = pg + 1;
    }
    return { list, page: pg, pagecount, limit: 20, total: list.length };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').trim();
    if (!vid) return { list: [] };
    const html = await getHtml(`${SITE}/archives/${vid}.html`);
    if (!html) return { list: [] };

    let title = '';
    const tm = html.match(/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    if (tm) title = unescapeHtml(tm[1].replace(/<[^>]+>/g, ''));
    if (!title) {
        const t2 = html.match(/<title[^>]*>([^<]{2,80})<\/title>/i);
        if (t2) title = unescapeHtml(t2[1]);
    }
    const pic =
        html.match(/<img[^>]+data-xkrkllgl="([^"]+)"/i)?.[1] ||
        html.match(/property="og:image" content="([^"]+)"/i)?.[1] ||
        '';
    const videoUrl = extractVideo(html);
    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: proxyPic(pic, inReq),
                vod_content: '',
                vod_play_from: '爆瓜网',
                vod_play_url: videoUrl ? `正片$${videoUrl}` : '',
            },
        ],
    };
}

async function search(inReq) {
    let pg = parseInt(inReq.body.page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    const qkey = encodeURIComponent(String(inReq.body.wd || ''));
    let url = `${SITE}/search/${qkey}/`;
    if (pg > 1) url += `${pg}/`;
    let html = await getHtml(url);
    let posts = html ? extractPosts(html, false, inReq) : [];
    if (!html || !posts.length) {
        html = await getHtml(`${SITE}/?s=${qkey}`);
        posts = html ? extractPosts(html, false, inReq) : [];
    }
    return { list: posts, page: pg };
}

async function play(inReq) {
    let url = inReq.body.id;
    if (Array.isArray(url)) url = url[0];
    url = String(url || '').trim();
    if (!url) return { parse: 0, url: '', header: HEADERS };
    if (isVideoFormat(url)) {
        return { parse: 0, url, header: HEADERS, format: 'application/x-mpegURL' };
    }
    if (/^https?:\/\//i.test(url)) return { parse: 1, url, header: HEADERS };
    return { parse: 0, url: '', header: HEADERS };
}

async function imgProxy(inReq, reply) {
    try {
        let u = decodeURIComponent(String(inReq.query.url || ''));
        const decoded = d64url(u);
        if (decoded.startsWith('http')) u = decoded;
        if (!/^https?:\/\//i.test(u)) return reply.code(403).send('');
        const resp = await axios.get(u, {
            headers: HEADERS,
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status >= 400) return reply.code(resp.status).send('');
        const { raw, mime } = decodePic(Buffer.from(resp.data));
        reply.header('Content-Type', mime).send(raw);
    } catch {
        reply.code(403).send('');
    }
}

export default {
    meta: {
        key: 'baogua',
        name: '🔥爆瓜网',
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
