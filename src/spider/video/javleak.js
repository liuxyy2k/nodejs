import crypto from 'crypto';
import { Readable } from 'stream';
import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://javleak.com';
const playerReferer = 'https://player.abyssplayer.com/';
const FRAG = 2 * 1024 * 1024;
const sessions = new Map();

function buildListUrl(tid, page) {
    let path = String(tid || '/').trim();
    if (!path.startsWith('/')) path = `/${path}`;
    if (!path.endsWith('/')) path += '/';
    const base = `${site}${path === '//' ? '/' : path}`;
    if (page <= 1) return base;
    return `${base.replace(/\/$/, '')}/page/${page}/`;
}

function parsePageCount($, page) {
    let max = page;
    $('a[href*="/page/"]').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/\/page\/(\d+)\//);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
}

async function request(url, referer = '') {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer || `${site}/`,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        },
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    const seen = new Set();
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
        if (!/dmm\.co\.jp|pics\./.test(img)) return;
        if (!/^https:\/\/javleak\.com\/.+\/$/i.test(href) || seen.has(href)) return;
        seen.add(href);
        const name = $(el).parent().find('h2').text().trim()
            || $(el).closest('div').find('h2').text().trim()
            || $(el).attr('title')
            || '';
        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: img,
            vod_remarks: '',
        });
    });
    return list;
}

function parseDatasFromPlayer(html) {
    const m = String(html).match(/const\s+datas\s*=\s*"([^"]+)"/);
    if (!m) return null;
    return JSON.parse(Buffer.from(m[1], 'base64').toString('latin1'));
}

function decryptMedia(datas) {
    const mediaKeyStr = `${datas.user_id}:${datas.slug}:${datas.md5_id}`;
    const keyHex = crypto.createHash('md5').update(mediaKeyStr, 'utf8').digest('hex');
    const keyBytes = Buffer.from(keyHex, 'utf8');
    const iv = Buffer.from(keyHex.slice(0, 16), 'utf8');
    const inputBytes = Buffer.from(datas.media, 'latin1');
    const plain = Buffer.concat([
        crypto.createDecipheriv('aes-256-ctr', keyBytes, iv).update(inputBytes),
        crypto.createDecipheriv('aes-256-ctr', keyBytes, iv).final(),
    ]);
    return JSON.parse(plain.toString('utf8'));
}

function numericKey(value) {
    const raw = String(value);
    const bytes = Buffer.from(raw.split('').map((c) => (/\d/.test(c) ? Number(c) : c.charCodeAt(0))));
    return crypto.createHash('md5').update(bytes).digest('hex');
}

function encryptPath(plaintext, keyHex) {
    const keyBytes = Buffer.from(keyHex, 'utf8');
    const iv = Buffer.from(keyHex.slice(0, 16), 'utf8');
    const enc = Buffer.concat([
        crypto.createCipheriv('aes-256-ctr', keyBytes, iv).update(Buffer.from(plaintext, 'utf8')),
        crypto.createCipheriv('aes-256-ctr', keyBytes, iv).final(),
    ]);
    const first = enc.toString('base64').replace(/=/g, '');
    return Buffer.from(first, 'utf8').toString('base64').replace(/=/g, '');
}

function segmentBase(manifest, source) {
    const domains = manifest?.mp4?.domains || [];
    const hit = domains.find((d) => d.startsWith(`${source.sub}.`));
    if (hit) return `https://${hit}/`;
    const suffix = String(domains[0] || '').split('.').slice(1).join('.');
    return `https://${source.sub}.${suffix}/`;
}

function pickSource(manifest, resId) {
    const sources = (manifest?.mp4?.sources || []).filter((x) => x.status !== false && /h264/i.test(x.codec || 'h264'));
    return sources.find((x) => String(x.res_id) === String(resId))
        || sources.find((x) => x.res_id === 4)
        || sources[0]
        || null;
}

async function loadManifest(detailUrl) {
    const detailHtml = await request(detailUrl);
    const iframe = String(detailHtml).match(/iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    if (!iframe) return null;
    const playerHtml = await request(iframe, detailUrl);
    const datas = parseDatasFromPlayer(playerHtml);
    if (!datas?.media) return null;
    return { datas, manifest: decryptMedia(datas) };
}

function rememberSession(info) {
    const now = Date.now();
    for (const [id, item] of sessions) {
        if (now - item.at > 2 * 60 * 60 * 1000) sessions.delete(id);
    }
    const id = crypto.randomBytes(8).toString('hex');
    sessions.set(id, { ...info, at: now });
    return id;
}

function segUrl(session, index) {
    const path = `/mp4/${session.md5Id}/${session.resId}/${session.size}/${FRAG}/${index}`;
    return `${session.base}sora/${session.size}/${encryptPath(path, session.keyHex)}`;
}

function openRange(session, start, end, signal) {
    return Readable.from((async function* () {
        let offset = start;
        let left = end - start + 1;
        while (offset <= end && left > 0 && !signal.aborted) {
            const index = Math.floor(offset / FRAG);
            const segStart = index * FRAG;
            const localStart = offset - segStart;
            const localEnd = Math.min(FRAG - 1, end - segStart);
            const resp = await req.get(segUrl(session, index), {
                headers: {
                    'User-Agent': UA,
                    Referer: playerReferer,
                    Range: `bytes=${localStart}-${localEnd}`,
                },
                responseType: 'stream',
                timeout: 60000,
                validateStatus: (status) => status >= 200 && status < 300,
            });
            try {
                for await (const chunk of resp.data) {
                    if (signal.aborted || left <= 0) break;
                    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    const piece = buf.subarray(0, left);
                    left -= piece.length;
                    yield piece;
                    if (left <= 0) break;
                }
            } finally {
                resp.data?.destroy?.();
            }
            offset = segStart + localEnd + 1;
        }
    })());
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/', type_name: '最新' },
            { type_id: '/beautiful-girl/', type_name: 'Beautiful Girl' },
            { type_id: '/big-tits/', type_name: 'Big Tits' },
            { type_id: '/creampie/', type_name: 'Creampie' },
            { type_id: '/censored/', type_name: 'Censored' },
            { type_id: '/cosplay/', type_name: 'Cosplay' },
            { type_id: '/married-woman/', type_name: 'Married Woman' },
            { type_id: '/school-girls/', type_name: 'School Girls' },
            { type_id: '/anal/', type_name: 'Anal' },
            { type_id: '/deep-throat/', type_name: 'Deep Throat' },
            { type_id: '/amateur/', type_name: 'Amateur' },
            { type_id: '/milf/', type_name: 'MILF' },
            { type_id: '/nurse/', type_name: 'Nurse' },
            { type_id: '/office-lady/', type_name: 'Office Lady' },
            { type_id: '/teacher/', type_name: 'Teacher' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(buildListUrl(inReq.body.id, page)));
    return { page, pagecount: parsePageCount($, page), list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const detailUrl = id.startsWith('http') ? id : `${site}${id.startsWith('/') ? id : `/${id}`}`;
    const $ = load(await request(detailUrl));
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content')
                || $('img[src*="dmm.co.jp"]').first().attr('src')
                || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: '720p$$$360p',
            vod_play_url: `正片$${detailUrl}|4$$$正片$${detailUrl}|2`,
        }],
    };
}

function requestOrigin(inReq) {
    const proto = String(inReq.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = inReq.headers['x-forwarded-host'] || inReq.headers.host;
    return `${proto}://${host}`;
}

async function play(inReq) {
    const fail = { parse: 0, url: '', header: { 'User-Agent': UA } };
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    const pipe = raw.lastIndexOf('|');
    const detailUrl = pipe >= 0 ? raw.slice(0, pipe) : raw;
    const resId = pipe >= 0 ? raw.slice(pipe + 1) : '4';
    if (!/^https?:\/\//i.test(detailUrl)) return fail;

    const loaded = await loadManifest(detailUrl);
    const source = loaded && pickSource(loaded.manifest, resId);
    if (!source?.size || !source.sub) return fail;

    const sid = rememberSession({
        base: segmentBase(loaded.manifest, source),
        size: Number(source.size),
        md5Id: loaded.datas.md5_id,
        resId: source.res_id,
        keyHex: numericKey(source.size),
    });
    return {
        parse: 0,
        url: `${requestOrigin(inReq)}/spider/javleak/3/mp4?id=${sid}`,
        header: { 'User-Agent': UA },
    };
}

async function mp4(inReq, reply) {
    const session = sessions.get(String(inReq.query.id || ''));
    if (!session?.size) {
        reply.code(404);
        return 'expired';
    }
    const total = session.size;
    let start = 0;
    let end = total - 1;
    const range = String(inReq.headers.range || '');
    const matched = range.match(/bytes=(\d+)-(\d*)/);
    let status = 200;
    if (matched) {
        start = Math.min(parseInt(matched[1], 10) || 0, total - 1);
        end = matched[2] ? Math.min(parseInt(matched[2], 10), total - 1) : total - 1;
        if (end < start) end = total - 1;
        status = 206;
    }
    const signal = { aborted: false };
    inReq.raw.on('close', () => { signal.aborted = true; });
    reply.code(status);
    reply.header('Content-Type', 'video/mp4');
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Length', String(end - start + 1));
    if (status === 206) reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
    return reply.send(openRange(session, start, end, signal));
}

async function search(inReq) {
    const wd = encodeURIComponent(inReq.body.wd || '');
    const $ = load(await request(`${site}/?s=${wd}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javleak', name: '🌸JAVLeak', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.get('/mp4', mp4);
        fastify.post('/search', search);
    },
};
