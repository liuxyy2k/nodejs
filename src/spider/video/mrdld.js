import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

const DYNAMIC_URLS = [
    'https://border.bshzjjgq.cc/',
    'https://blood.bshzjjgq.cc/',
];

let hostUrl = DYNAMIC_URLS[0];
const imgCache = new Map();

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Connection:        'keep-alive',
        'Cache-Control':   'no-cache',
    },
});

// ─── AES ──────────────────────────────────────────────────────────────────────

const AES_KEYS = [
    { key: Buffer.from('f5d965df75336270'), iv: Buffer.from('97b60394abc2fbe1') },
    { key: Buffer.from('75336270f5d965df'), iv: Buffer.from('abc2fbe197b60394') },
];

function aesImg(data) {
    if (data.length < 16) return data;
    for (const { key, iv } of AES_KEYS) {
        try {
            const dec = crypto.createDecipheriv('aes-128-cbc', key, iv);
            const out = Buffer.concat([dec.update(data), dec.final()]);
            if (out[0] === 0xff && out[1] === 0xd8) return out;
            if (out.slice(0, 4).toString('hex') === '89504e47') return out;
        } catch { /* ignore */ }
        try {
            const dec = crypto.createDecipheriv('aes-128-ecb', key, Buffer.alloc(0));
            const out = Buffer.concat([dec.update(data), dec.final()]);
            if (out[0] === 0xff && out[1] === 0xd8) return out;
        } catch { /* ignore */ }
    }
    return data;
}

function e64(text) { return Buffer.from(String(text)).toString('base64'); }
function d64(text) { return Buffer.from(String(text), 'base64').toString('utf-8'); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getWorkingHost() {
    for (const url of DYNAMIC_URLS) {
        try {
            const { status } = await http.get(url, { timeout: 10_000 });
            if (status === 200) return url;
        } catch { /* ignore */ }
    }
    return DYNAMIC_URLS[0];
}

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('/'))    return hostUrl.replace(/\/$/, '') + url;
    return hostUrl + url;
}

function procUrl(url, proxyBase) {
    if (!url) return '';
    url = url.trim().replace(/^['"\s]+|['"\s]+$/g, '');
    if (url.startsWith('data:')) {
        try {
            const b64Str = url.split(',')[1];
            let raw = Buffer.from(b64Str, 'base64');
            if (!((raw[0] === 0xff && raw[1] === 0xd8) ||
                   raw.slice(0, 4).toString() === '\x89PNG' ||
                   raw.slice(0, 4).toString() === 'GIF8')) {
                raw = aesImg(raw);
            }
            const key = crypto.createHash('md5').update(raw).digest('hex');
            imgCache.set(key, raw);
            return proxyBase ? `${proxyBase}&type=cache&key=${key}` : '';
        } catch { return ''; }
    }
    url = absUrl(url);
    return proxyBase ? `${proxyBase}&url=${e64(url)}&type=img` : url;
}

function getImg(scriptText, $el, proxyBase) {
    const html = $el ? cheerio.load($el.toString()).html() || '' : '';
    const decoded = html.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

    const m1 = (scriptText || '').match(/loadBannerDirect\('([^']+)'/);
    if (m1) return procUrl(m1[1], proxyBase);

    if (decoded.includes('data:image')) {
        const m = decoded.match(/(data:image\/[a-zA-Z0-9+/=;,]+)/);
        if (m) return procUrl(m[1], proxyBase);
    }
    const m2 = decoded.match(/(https?:\/\/[^"'\s)]+\.(?:jpg|png|jpeg|webp))/i);
    if (m2) return procUrl(m2[1], proxyBase);
    if (decoded.includes('url(')) {
        const m = decoded.match(/url\s*\(\s*['"]?([^"')]+)['"]?\s*\)/i);
        if (m) return procUrl(m[1], proxyBase);
    }
    return '';
}

function getList($, selector, tid = '', proxyBase = '') {
    const videos = [];
    const isFolder = tid.includes('/mrdg');
    $(selector).each((_, el) => {
        const item  = $(el);
        const a     = item.is('a') ? item : item.find('a').first();
        const href  = a.attr('href') || '';
        const title = (item.find('h2').text() || item.find('.entry-title').text() ||
                       item.find('.post-title').text() || (item.is('a') ? item.text() : '')).trim();
        if (!href || !title) return;

        const pic = getImg(item.find('script').text(), item, proxyBase);
        videos.push({
            vod_id:      href + (isFolder ? '@folder' : ''),
            vod_name:    title,
            vod_pic:     pic,
            vod_remarks: item.find('time').text() || '',
            vod_tag:     isFolder ? 'folder' : '',
            style:       { type: 'rect', ratio: 1.33 },
        });
    });
    return videos;
}

function getProxyBase(inReq) {
    const prefix = inReq.server?.prefix || '';
    return `http://localhost:9988${prefix}/proxy`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    hostUrl = await getWorkingHost();
    http.defaults.headers['Origin']  = hostUrl;
    http.defaults.headers['Referer'] = hostUrl + '/';
    return {};
}

async function home(inReq, _outResp) {
    const proxyBase = getProxyBase(inReq);
    const { data: html } = await http.get(hostUrl);
    const $ = cheerio.load(html);

    let classes = [];
    for (const sel of ['.category-list ul li', '.nav-menu li', '.menu li', 'nav ul li']) {
        $(sel).each((_, el) => {
            const a    = $(el).find('a');
            const href = (a.attr('href') || '').trim();
            const name = (a.text() || '').trim();
            if (!href || href === '#' || !name) return;
            classes.push({ type_id: href, type_name: name });
        });
        if (classes.length) break;
    }
    if (!classes.length) {
        classes = [{ type_id: '/latest/', type_name: '最新' }, { type_id: '/hot/', type_name: '热门' }];
    }

    return { class: classes, list: getList($, '#index article, article', '', proxyBase), filters: {} };
}

async function category(inReq, _outResp) {
    const tid       = inReq.body.id;
    const pg        = parseInt(inReq.body.page) || 1;
    const proxyBase = getProxyBase(inReq);

    if (tid.includes('@folder')) {
        const v = await getFod(tid.replace('@folder', ''), proxyBase);
        return { list: v, page: 1, pagecount: 1, limit: 90, total: v.length };
    }

    const base = tid.startsWith('http') ? tid.replace(/\/$/, '')
                                        : (hostUrl + (tid.startsWith('/') ? tid : '/' + tid)).replace(/\/$/, '');
    const url  = pg === 1 ? `${base}/` : `${base}/${pg}/`;

    const { data: html } = await http.get(url);
    const $ = cheerio.load(html);
    return {
        list:      getList($, '#archive article, #index article, article', tid, proxyBase),
        page:      pg,
        pagecount: 9999,
        limit:     90,
        total:     999999,
    };
}

async function getFod(id, proxyBase) {
    const { data: html } = await http.get(absUrl(id));
    const $ = cheerio.load(html);
    const videos = [];
    $('.post-content h2').each((i, _) => {
        const pTxt = $('.post-content p').eq(i * 2);
        const pImg = $('.post-content p').eq(i * 2 + 1);
        videos.push({
            vod_id:      pTxt.find('a').attr('href') || '',
            vod_name:    pTxt.text().trim(),
            vod_pic:     getImg('', pImg, proxyBase),
            vod_remarks: $('.post-content h2').eq(i).text().trim(),
        });
    });
    return videos;
}

async function detail(inReq, _outResp) {
    const url = absUrl(inReq.body.id);
    const { data: html } = await http.get(url);
    const $ = cheerio.load(html);

    const plist = [];
    const usedNames = new Set();

    if ($('.dplayer').length) {
        $('.dplayer').each((c, el) => {
            try {
                const config   = JSON.parse($(el).attr('data-config') || '{}');
                const videoUrl = config?.video?.url;
                if (!videoUrl) return;

                let epName = '';
                let parent = $(el).parent();
                for (let i = 0; i < 4 && parent.length; i++) {
                    const h = parent.find('h2, h3, h4').first().text().trim();
                    if (h) { epName = h; break; }
                    parent = parent.parent();
                }
                let name = epName || `视频${c + 1}`;
                let count = 2;
                while (usedNames.has(name)) { name = `${epName || '视频'} ${count++}`; }
                usedNames.add(name);
                plist.push(`${name}$${videoUrl}`);
            } catch { /* ignore */ }
        });
    }

    if (!plist.length) {
        const kws = ['点击观看','观看','播放','视频','第一弹','第二弹','第三弹','第四弹','第五弹','第六弹','第七弹','第八弹','第九弹','第十弹'];
        $('.post-content, article').find('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (href && kws.some((k) => text.includes(k))) {
                const ep = text.replace('点击观看：', '').replace('点击观看', '').trim() || `视频${i + 1}`;
                plist.push(`${ep}$${absUrl(href)}`);
            }
        });
    }

    const playUrl = plist.length ? plist.join('#') : `未找到视频源$${url}`;

    const seenIds = new Set(), seenNames = new Set();
    const candidates = [];
    $('.tags a, .keywords a, .post-tags a').each((_, el) => {
        const name = $(el).text().trim();
        const href = $(el).attr('href') || '';
        if (name && href) candidates.push({ name, id: href });
    });
    candidates.sort((a, b) => b.name.length - a.name.length);

    const tags = [];
    for (const { name, id } of candidates) {
        if (seenIds.has(id)) continue;
        if ([...seenNames].some((s) => name.includes(s) || s.includes(name))) continue;
        tags.push(`[a=cr:${JSON.stringify({ id, name })}/]${name}[/a]`);
        seenNames.add(name);
        seenIds.add(id);
    }
    const vod_content = tags.length ? tags.join(' ') : ($('.post-title').text() || $('h1').text() || '每日大乱斗');

    return { list: [{ vod_play_from: '每日大乱斗', vod_play_url: playUrl, vod_content }] };
}

async function play(inReq, _outResp) {
    const id    = inReq.body.id;
    const parse = /\.(m3u8|mp4|ts)/.test(id) ? 0 : 1;
    return { parse, url: id, header: { 'User-Agent': http.defaults.headers['User-Agent'] } };
}

async function search(inReq, _outResp) {
    const key       = inReq.body.wd || '';
    const pg        = parseInt(inReq.body.pg) || 1;
    const proxyBase = getProxyBase(inReq);
    const url       = pg === 1 ? `${hostUrl}search/${key}/` : `${hostUrl}search/${key}/${pg}/`;

    const { data: html } = await http.get(url);
    const $ = cheerio.load(html);
    return { list: getList($, 'article', '', proxyBase), page: pg, pagecount: 9999 };
}

async function proxyHandler(inReq, outResp) {
    const { type, url, key } = inReq.query;

    if (type === 'cache') {
        const content = imgCache.get(key);
        if (content) return outResp.type('image/jpeg').send(content);
        return outResp.status(404).send('Expired');
    }
    if (type === 'img') {
        const realUrl = url.startsWith('http') ? url : d64(url);
        const { data } = await http.get(realUrl, { responseType: 'arraybuffer' });
        const out = aesImg(Buffer.from(data));
        return outResp.type('image/jpeg').send(out);
    }
    if (type === 'm3u8') {
        const realUrl = d64(url);
        const res = await http.get(realUrl, { responseType: 'text' });
        const baseUrl = realUrl.rsplit?.('/', 1)[0] || realUrl.split('/').slice(0, -1).join('/');
        const lines = res.data.split('\n').map((line) => {
            if (!line.includes('#EXT') && line.trim()) {
                const full = line.startsWith('http') ? line : `${baseUrl}/${line}`;
                return `${getProxyBase(inReq)}&url=${e64(full)}&type=ts`;
            }
            return line;
        });
        return outResp.type('application/vnd.apple.mpegurl').send(lines.join('\n'));
    }
    if (type === 'ts') {
        const { data } = await http.get(d64(url), { responseType: 'arraybuffer' });
        return outResp.type('video/mp2t').send(Buffer.from(data));
    }
    return outResp.status(404).send('');
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: { key: 'mrdg', name: '🔥每日大乱斗', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/proxy',     proxyHandler);
    },
};