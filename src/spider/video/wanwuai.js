import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

import { HttpsProxyAgent } from 'https-proxy-agent';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://wanwuu.com';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(reqUrl, headers = {}) {
    const opts = {
        headers: { 'User-Agent': UA, ...headers },
        timeout: 15000,
    };
    try {
        const resp = await axios.get(reqUrl, opts);
        return resp.data;
    } catch {
        const resp = await axios.get(reqUrl, { ...opts, httpsAgent: agent, proxy: false });
        return resp.data;
    }
}

function getImgUrl($el) {
    const src = $el.attr('data-src') || '';
    const enc = extractImgFromOnload($el.attr('onload') || '');
    const t   = enc || src;
    if (!t) return '';
    if (enc || shouldDecrypt(t)) {
        return `http://127.0.0.1:${PORT}/spider/wanwuai/3/img?url=${encodeURIComponent(e64(t))}`;
    }
    return absUrl(t);
}

function extractImgFromOnload(onload) {
    const m = (onload || '').match(/load(?:Share)?Img\s*\([^,]+,\s*['"]([^'"]+)['"]/);
    return m ? m[1] : '';
}

function shouldDecrypt(url) {
    const u = (url || '').toLowerCase();
    return ['pic.gylhaa.cn', 'new.slfpld.cn', '/upload_01/', '/upload/'].some(x => u.includes(x));
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//'))  return 'https:' + u;
    if (u.startsWith('/'))   return site + u;
    return u;
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
 const classes = [
        { type_id: '/ai/all/', type_name: '全部' },
        { type_id: '/ai/ai-duanju/', type_name: '成人短剧' },
        { type_id: '/ai/ai-manju/', type_name: 'AI漫剧' },
        { type_id: '/ai/ai-huanlian/', type_name: 'AI换脸' },
        { type_id: '/ai/ai-meinv/', type_name: 'AI美女' },
        { type_id: '/porn/all/', type_name: '成人视频' },
        { type_id: '/porn/rihan-av/', type_name: '日韩AV' },
        { type_id: '/porn/oumei-wuma/', type_name: '欧美无码' },
        { type_id: '/porn/guochan-tanhua/', type_name: '国产探花' },
        { type_id: '/porn/heiren-zhuanqu/', type_name: '黑人专区' },
        { type_id: '/porn/lvmao-yinqi/', type_name: '绿帽淫妻' },
        { type_id: '/porn/chigua-baoliao/', type_name: '黑料吃瓜' },
        { type_id: '/moviesets/', type_name: '合集' },
        { type_id: '/moviesets/?cate=ai-duanju', type_name: '短剧合集' },
        { type_id: '/moviesets/?cate=rmfl', type_name: '热门合集' },
        { type_id: '/moviesets/?cate=nwhj', type_name: '女王合集' },
    ];
    return { class: classes, filters: {} };
}

function buildPageUrl(typeurl, page) {
    if (page <= 1) return typeurl;
    const u = new URL(typeurl, site);
    const path = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
    u.pathname = `${path}page/${page}/`;
    return u.href;
}

function isCollectionIndex(id) {
    const path = String(id || '').split('?')[0];
    return /^\/moviesets\/?(page\/\d+\/)?$/.test(path);
}

function isCollectionPage(id) {
    const path = String(id || '').split('?')[0];
    return /^\/moviesets\/[^/?#]+\/?(page\/\d+\/)?$/.test(path);
}

function parseSets($) {
    const list = [];
    const seen = new Set();
    $('a.group.block[href^="/moviesets/"]').each((_, element) => {
        const id = $(element).attr('href') || '';
        if (!/^\/moviesets\/[^/?#]+\/?$/.test(id) || seen.has(id)) return;
        const img = $(element).find('img[alt]').first();
        const name = (img.attr('alt') || $(element).find('h3').first().text() || '').trim();
        if (!name) return;
        seen.add(id);
        const remark = $(element).find('span').toArray()
            .map(el => $(el).text().trim())
            .find(text => /部$/.test(text)) || '';
        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: img.length ? getImgUrl(img) : '',
            vod_remarks: remark,
        });
    });
    return list;
}

function parseVideos($) {
    const list = [];
    const seen = new Set();
    $('a[href^="/videos/"]').each((_, element) => {
        const $el = $(element);
        const id = $el.attr('href') || '';
        if (!/^\/videos\/(?!cate\/|search\/).+\/vd-/.test(id) || seen.has(id)) return;
        const img = $el.find('img[alt]').first();
        const name = (img.attr('alt') || '').trim();
        if (!name || /^top-\d+$/i.test(name)) return;
        seen.add(id);
        const remark = $el.find('span, .text-sm').toArray()
            .map(el => $(el).text().trim())
            .find(text => /^\d+:\d+/.test(text)) || '';
        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: img.length ? getImgUrl(img) : '',
            vod_remarks: remark,
        });
    });
    return list;
}

async function category(inReq, _outResp) {
    const id = inReq.body.id || '';
    const page = inReq.body.page || 1;
    const url = buildPageUrl(site + id, page);
    const html = await request(url);
    const $ = load(html);
    const videos = isCollectionIndex(id) ? parseSets($) : parseVideos($);
    return { page: parseInt(page), list: videos };
}

function playFlag(name, index) {
    const text = String(name || '').replace(/[$#]/g, ' ').trim();
    return text || `第${index + 1}集`;
}

async function loadSetEpisodes(setPath) {
    const raw = String(setPath || '');
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
    const base = raw.split('?')[0].replace(/\/page\/\d+\/?$/, '/');
    const episodes = [];
    const seen = new Set();
    for (let page = 1; page <= 24; page += 4) {
        const pages = await Promise.all([0, 1, 2, 3].map(async offset => {
            const n = page + offset;
            const path = n <= 1 ? `${base}${query}` : `${base}page/${n}/${query}`;
            try {
                const html = await request(site + path);
                return parseVideos(load(html));
            } catch {
                return [];
            }
        }));
        let ended = false;
        for (const list of pages) {
            if (!list.length) {
                ended = true;
                break;
            }
            for (const item of list) {
                if (seen.has(item.vod_id)) continue;
                seen.add(item.vod_id);
                episodes.push(item);
            }
        }
        if (ended) break;
    }
    return episodes;
}

async function resolvePlayUrl(pagePath, html) {
    const pageUrl = pagePath.startsWith('http') ? pagePath : site + pagePath;
    if (!html) html = await request(pageUrl, { Referer: site + '/' });
    const $ = load(html);
    const firstDecoded = unpackPacker($('.player-container script').html() || '');
    if (!firstDecoded) return '';
    const idMatch = firstDecoded.match(/id=(\d+)/);
    const imgMatch = firstDecoded.match(/img=([^&"\\]+)/);
    const adsMatch = firstDecoded.match(/ads=([^&"\\]*)/);
    const uMatch = firstDecoded.match(/encodeURIComponent\("([^"]+)"\)/);
    if (!idMatch || !uMatch) return '';
    const t = Math.floor(Date.now() / 1000 / 1800);
    const jsUrl = `${site}/videos/detail_play?id=${idMatch[1]}&img=${imgMatch?.[1] || ''}&ads=${adsMatch?.[1] || ''}&u=${encodeURIComponent(uMatch[1])}&t=${t}`;
    const respJs = await request(jsUrl, { Referer: pageUrl });
    const decoded = unpackPacker(typeof respJs === 'string' ? respJs : '');
    if (!decoded) return '';
    const urlMatch = decoded.match(/https?:\/\/[^"'\\\s]+?\.m3u8[^"'\\\s]*/);
    return urlMatch ? urlMatch[0].replace(/&amp;/g, '&') : '';
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    if (isCollectionPage(url)) {
        const html = await request(site + url.split('?')[0]);
        const $ = load(html);
        const title = $('h1').first().text().trim() || $('title').text().trim();
        const cover = $('img[data-src*="upload"]').first();
        const episodes = await loadSetEpisodes(url);
        return {
            list: [{
                vod_id: url,
                vod_name: title,
                vod_pic: cover.length ? getImgUrl(cover) : '',
                vod_play_from: '合集',
                vod_play_url: episodes.map((item, index) => `${playFlag(item.vod_name, index)}$${item.vod_id}`).join('#'),
            }],
        };
    }
    const html = await request(site + url);
    const $ = load(html);
    const title = $('meta[name="twitter:title"]').attr('content') || '';
    const playUrl = await resolvePlayUrl(url, html);
    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: '',
            vod_play_from: '默认',
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

function unpackPacker(source) {
        const match = source.match(
            /\}\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/
        );
        if (!match) return null;

        const [, p, a, c, kStr] = match;
        const base = parseInt(a);
        const count = parseInt(c);
        const k = kStr.split('|');

        const decode = (n) => {
            return (n < base ? '' : decode(parseInt(n / base))) +
                ((n = n % base) > 35
                    ? String.fromCharCode(n + 29)
                    : n.toString(36));
        };

        const dict = {};
        let i = count;
        while (i--) {
            dict[decode(i)] = k[i] || decode(i);
        }

        return p.replace(/\b\w+\b/g, (w) => dict[w] || w);
    }

async function play(inReq, _outResp) {
    let url = inReq.body.id || '';
    if (url.startsWith('/')) url = await resolvePlayUrl(url);
    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/?q=${text}&page=${page}`;

    const html = await request(url);
    return { list: parseVideos(load(html)) };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const imgOpts = {
            headers: {
                'User-Agent': UA,
                'Referer':    `${site}/`,
                'Origin':     site,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        };
        let resp;
        try {
            resp = await axios.get(raw, imgOpts);
        } catch {
            resp = await axios.get(raw, { ...imgOpts, httpsAgent: agent, proxy: false });
        }

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8')  ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'wanwuai',
        name: '💋玩物AI',
        type: 3
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