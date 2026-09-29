import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://javsaga.ninja';
const LK_BASE = 'https://lk1.supremejav.com/saga.php';
const LINE_ORDER = { ST: 0, FST: 1, VOE: 2, TV: 3 };

function buildListUrl(tid, page) {
    const path = String(tid || '').replace(/^\/|\/$/g, '');
    if (!path) {
        return page <= 1 ? `${site}/` : `${site}/page/${page}/`;
    }
    if (path === 'popular') {
        return page <= 1 ? `${site}/popular/` : `${site}/popular/page/${page}/`;
    }
    const base = path.includes('/') ? `${site}/${path}` : `${site}/category/${path}`;
    return page <= 1 ? `${base}/` : `${base.replace(/\/$/, '')}/page/${page}/`;
}

function parsePageCount($, page) {
    let max = page;
    $('a[href*="/page/"]').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/\/page\/(\d+)/);
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
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
        },
    });
    return resp.data;
}

async function fetchText(url, referer = `${site}/`) {
    const resp = await req.get(url, {
        headers: { 'User-Agent': UA, Referer: referer },
        timeout: 30000,
        validateStatus: () => true,
    });
    return String(resp.data || '');
}

function absUrl(url, base) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    try { return new URL(url, base).href; } catch { return url; }
}

function pickBestM3u8(text, base) {
    const lines = String(text || '').split('\n');
    let best = '';
    let bestH = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const m = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        const h = m ? parseInt(m[1], 10) : 0;
        const url = absUrl(lines[i + 1]?.trim(), base);
        if (url && h >= bestH) { bestH = h; best = url; }
    }
    if (best) return best;
    const direct = lines.find((l) => l.trim() && !l.startsWith('#'));
    return absUrl(direct?.trim(), base);
}

function unpackPacker(text) {
    const m = String(text || '').match(/}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/s);
    if (!m) return '';
    let payload = m[1];
    const base = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const keys = m[4].split('|');
    try {
        payload = JSON.parse(`"${payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } catch {
        /* keep raw */
    }
    const table = {};
    for (let i = 0; i < count; i++) {
        if (i < keys.length && keys[i]) table[int2base(i, base)] = keys[i];
    }
    return payload.replace(/\b\w+\b/g, (w) => (table[w] !== undefined ? table[w] : w));
}

function int2base(num, radix) {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (num < 0) return `-${int2base(-num, radix)}`;
    const res = [];
    let x = num;
    while (x > 0) {
        res.push(digits[x % radix]);
        x = Math.floor(x / radix);
    }
    return res.length ? res.reverse().join('') : '0';
}

function extractStreamtape(html) {
    const m = String(html || '').match(/getElementById\('botlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/);
    if (!m) return '';
    let link = m[1] + m[2].slice(parseInt(m[3], 10));
    if (link.startsWith('//')) link = `https:${link}`;
    if (!/^https?:/i.test(link)) return '';
    if (!link.includes('stream=1')) link += `${link.includes('?') ? '&' : '?'}stream=1`;
    return link;
}

async function resolveFinalUrl(url, referer) {
    const resp = await req.get(url, {
        headers: { 'User-Agent': UA, Referer: referer, Range: 'bytes=0-1' },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: () => true,
        responseType: 'stream',
    });
    const finalUrl = resp.request?.res?.responseUrl || url;
    resp.data?.destroy?.();
    return finalUrl || url;
}

async function extractStream(html, ref) {
    const tape = extractStreamtape(html);
    if (tape) return resolveFinalUrl(tape, 'https://streamtape.com/');

    let hits = [...String(html || '').matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((x) => x[0]);
    if (hits.length) return hits[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');

    if (String(html).includes('eval(function(p,a,c,k,e')) {
        const dec = unpackPacker(html);
        hits = [...dec.matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((x) => x[0]);
        if (hits.length) return hits[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');
    }

    const hash = load(html)('#video_player').attr('data-hash');
    if (hash) {
        const referer = /turbovidhls|turbosplayer|turboviplay/i.test(hash)
            ? `${new URL(hash).origin}/`
            : 'https://turbovidhls.com/';
        const master = await fetchText(hash, referer);
        return pickBestM3u8(master, hash);
    }

    const redirect = String(html).match(/window\.location\.href\s*=\s*'([^']+)'/);
    if (redirect?.[1]) {
        const page = await fetchText(redirect[1], ref);
        hits = [...String(page || '').matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((x) => x[0]);
        if (hits.length) return hits[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');
        const hash2 = load(page)('#video_player').attr('data-hash');
        if (hash2) {
            const referer = /turbovidhls|turbosplayer|turboviplay/i.test(hash2)
                ? `${new URL(hash2).origin}/`
                : 'https://turbovidhls.com/';
            const master = await fetchText(hash2, referer);
            return pickBestM3u8(master, hash2);
        }
    }
    return '';
}

function normalizeDetailUrl(id) {
    const raw = String(id || '').trim();
    if (!raw) return `${site}/`;
    if (/^https?:\/\//i.test(raw)) return raw;
    const slug = raw.replace(/^\//, '').replace(/\.html$/, '');
    return `${site}/${slug}.html`;
}

function parseVods($) {
    const list = [];
    const seen = new Set();
    $('.clearfix .post, .posts .post').each((_, el) => {
        const href = $(el).find('a[href*=".html"]').first().attr('href') || '';
        if (!/\/\d+\.html$/.test(href) || seen.has(href)) return;
        seen.add(href);
        list.push({
            vod_id: href,
            vod_name: $(el).find('a').attr('title') || $(el).find('h2').text().trim() || '',
            vod_pic: ($(el).find('.thumb').attr('data-original') || $(el).find('img').attr('src') || '').replace('!320x216.jpg', ''),
            vod_remarks: $(el).find('.con .meta .date, .date').text().trim(),
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '', type_name: '最新' },
            { type_id: 'popular', type_name: '热门' },
            { type_id: 'category/censored-jav', type_name: '有码' },
            { type_id: 'category/uncensored-jav', type_name: '无码' },
            { type_id: 'category/amateur', type_name: '素人' },
            { type_id: 'category/chinese-subtitles', type_name: '中文字幕' },
            { type_id: 'category/english-subtitles', type_name: '英文字幕' },
            { type_id: 'category/reducing-mosaic', type_name: '无码破解' },
            { type_id: 'tag/4k', type_name: '4K' },
            { type_id: 'tag/creampie', type_name: '中出' },
            { type_id: 'tag/big-tits', type_name: '巨乳' },
            { type_id: 'tag/amateur', type_name: 'Amateur' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(buildListUrl(inReq.body.id, page)));
    const list = parseVods($);
    let pagecount = parsePageCount($, page);
    if (pagecount <= page && list.length >= 20) pagecount = page + 1;
    return { page, pagecount, list };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const detailUrl = normalizeDetailUrl(id);
    const html = await request(detailUrl);
    const $ = load(html);
    const name = $('meta[name="description"]').attr('content')
        || $('h1').text().trim()
        || '';
    const pic = ($('div.player-wrap').attr('style') || '').match(/url\(([^)]+)\)/)?.[1]
        || ($('img[data-original*="supjav.com"]').first().attr('data-original') || '').replace('!320x216.jpg', '');

    const pairs = [];
    $('a.btn-server').each((_, el) => {
        const trackName = $(el).text().trim();
        const dataLink = $(el).attr('data-link') || '';
        if (!dataLink) return;
        pairs.push([trackName, `正片$${detailUrl}|${dataLink}`]);
    });
    if (!pairs.length) {
        const links = [...String(html).matchAll(/data-link="([0-9a-f]{40,})"/gi)].map((m) => m[1]);
        const names = [...String(html).matchAll(/data-link="[0-9a-f]{40,}"[^>]*>([^<]{1,12})</gi)].map((m) => m[1].trim());
        links.forEach((dataLink, i) => {
            pairs.push([names[i] || `线路${i + 1}`, `正片$${detailUrl}|${dataLink}`]);
        });
    }
    pairs.sort((a, b) => (LINE_ORDER[a[0]] ?? 9) - (LINE_ORDER[b[0]] ?? 9));

    return {
        list: [{
            vod_id: detailUrl,
            vod_name: name,
            vod_pic: pic,
            vod_content: name,
            vod_play_from: pairs.length ? pairs.map((p) => p[0]).join('$$$') : 'JavSaga',
            vod_play_url: pairs.length ? pairs.map((p) => p[1]).join('$$$') : '',
        }],
    };
}

async function play(inReq) {
    const fail = { parse: 0, url: '', header: { 'User-Agent': UA } };
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();

    if (/^https?:\/\/.+\.m3u8/i.test(raw)) {
        return {
            parse: 0,
            url: raw,
            header: { 'User-Agent': UA, Referer: 'https://turbovidhls.com/' },
        };
    }

    const pipe = raw.indexOf('|');
    let detailUrl = pipe >= 0 ? raw.slice(0, pipe).trim() : '';
    const lk = pipe >= 0 ? raw.slice(pipe + 1).trim() : raw;
    if (!lk) return fail;

    if (!/^https?:\/\//i.test(detailUrl)) {
        const vid = detailUrl.replace(/\D/g, '') || detailUrl;
        detailUrl = vid ? `${site}/${vid}.html` : `${site}/`;
    }

    const s1Url = `${LK_BASE}?l=${lk}`;
    const s1 = await fetchText(s1Url, detailUrl);
    const om = s1.match(/var\s+OLID\s*=\s*'([0-9a-f]{40,})'/i);
    const olid = om ? om[1].split('').reverse().join('') : lk.split('').reverse().join('');

    const s2Url = `${LK_BASE}?c=${olid}`;
    const s2 = await fetchText(s2Url, s1Url);
    let playUrl = await extractStream(s2, s2Url);
    if (!playUrl) return fail;

    playUrl = playUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    let referer = s2Url;
    if (/streamtape\.com|tapecontent\.net/i.test(playUrl)) referer = 'https://streamtape.com/';
    else if (/turbovidhls|turbosplayer|turboviplay/i.test(playUrl)) {
        try { referer = `${new URL(playUrl).origin}/`; } catch { referer = 'https://turbovidhls.com/'; }
    }

    return { parse: 0, url: playUrl, header: { 'User-Agent': UA, Referer: referer } };
}

async function search(inReq) {
    const wd = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = page <= 1 ? `${site}/?s=${wd}` : `${site}/page/${page}/?s=${wd}`;
    const $ = load(await request(url));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javsaga', name: '🌸JavSaga', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
