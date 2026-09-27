import { load } from 'cheerio';
import req from '../../util/req.js';

const site = 'https://javdino.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: 'new-releases', type_name: '最新发布' },
    { type_id: 'reducing-mosaic', type_name: '减马赛克' },
    { type_id: 'genre/big-tits', type_name: '巨乳' },
    { type_id: 'genre/mature-woman', type_name: '熟女' },
    { type_id: 'genre/creampie', type_name: '中出' },
    { type_id: 'genre/female-teacher', type_name: '女教师' },
    { type_id: 'genre/married-woman', type_name: '人妻' },
    { type_id: 'genre/ntr', type_name: 'NTR' },
    { type_id: 'genre/milf', type_name: 'MILF' },
    { type_id: 'genre/cheating-wife', type_name: '出轨' },
    { type_id: 'genre/beautiful-girl', type_name: '美少女' },
    { type_id: 'genre/solowork', type_name: '单体作品' },
    { type_id: 'genre/drama', type_name: '剧情' },
    { type_id: 'genre/slut', type_name: '痴女' },
    { type_id: 'genre/cuckold', type_name: '绿帽' },
];

function buildFilters(classes) {
    const sortFilter = {
        key: 'sort',
        name: '排序',
        init: 'latest',
        value: [
            { n: '最新', v: 'latest' },
            { n: '最多观看', v: 'views' },
            { n: '减马赛克', v: 'reducing' },
        ],
    };
    const filters = {};
    for (const item of classes) {
        if (String(item.type_id).startsWith('genre/')) {
            filters[item.type_id] = [sortFilter];
        }
    }
    return filters;
}

function absUrl(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${site}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function cleanText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function unescapeJsUrl(raw) {
    return String(raw || '').replace(/\\\//g, '/').trim();
}

function b64urlDecode(str) {
    try {
        let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return Buffer.from(s, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

async function fetchText(url, referer = `${site}/`) {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 30000,
        responseType: 'text',
        validateStatus: () => true,
    });
    if (resp.status !== 200) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

async function fetchAjaxGenre(keyword, page, sortBy = 'latest') {
    const resp = await req.post(`${site}/ajax/genre_ajax.php`, {
        headers: {
            'User-Agent': UA,
            Referer: `${site}/genre/${keyword}`,
            Origin: site,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
        },
        data: `keyword=${encodeURIComponent(keyword)}&page=${page}&sortBy=${sortBy}`,
        timeout: 30000,
        responseType: 'text',
        validateStatus: () => true,
    });
    if (resp.status !== 200) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVods(html) {
    const $ = load(html);
    const list = [];
    $('.v-items').each((_, el) => {
        const node = $(el);
        const href = node.find('a.video-link').first().attr('href') || '';
        const name = node.find('.v-details a[title]').attr('title')
            || cleanText(node.find('.v-details a').first().text());
        const pic = node.find('img.thumb_preload').attr('src') || '';
        let remarks = cleanText(node.find('.video-details').text());
        const badge = cleanText(node.find('.overlay-code .badge').text());
        if (badge) remarks = remarks ? `${badge} ${remarks}` : badge;
        if (!href || !name) return;
        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: pic.startsWith('http') ? pic : absUrl(pic),
            vod_remarks: remarks,
        });
    });
    return list;
}

function parsePageCount(html, basePath, page) {
    const escaped = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nums = [...String(html || '').matchAll(new RegExp(`${escaped}/page/(\\d+)`, 'g'))]
        .map((m) => parseInt(m[1], 10));
    if (nums.length) return Math.max(...nums, page);
    const qPages = [...String(html || '').matchAll(/[?&]page=(\d+)/g)].map((m) => parseInt(m[1], 10));
    if (qPages.length) return Math.max(...qPages, page);
    return page;
}

async function fetchListHtml(tid, page, filters = {}) {
    const id = String(tid || 'new-releases').replace(/^\//, '');
    const sort = String(filters.sort || 'latest').trim() || 'latest';

    if (id.startsWith('genre/')) {
        const keyword = id.slice('genre/'.length);
        if (page <= 1) {
            return fetchText(absUrl(`/${id}`), `${site}/genre/${keyword}`);
        }
        return fetchAjaxGenre(keyword, page, sort);
    }

    if (id.startsWith('search/')) {
        const kw = decodeURIComponent(id.slice('search/'.length));
        const url = new URL(absUrl(`/search/${encodeURIComponent(kw)}`));
        if (page > 1) url.searchParams.set('page', String(page));
        return fetchText(url.href, `${site}/search/${encodeURIComponent(kw)}`);
    }

    let url = absUrl(`/${id}`);
    if (page > 1) url = absUrl(`/${id}/page/${page}`);
    return fetchText(url, `${site}/${id}`);
}

function absUrlJoin(base, rel) {
    if (!rel) return '';
    if (/^https?:\/\//i.test(rel)) return rel;
    try { return new URL(rel, base).href; } catch { return rel; }
}

function pickBestM3u8(text, base) {
    const lines = String(text || '').split('\n');
    let best = '';
    let bestH = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const m = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        const h = m ? parseInt(m[1], 10) : 0;
        const url = absUrlJoin(base, lines[i + 1]?.trim());
        if (url && h >= bestH) { bestH = h; best = url; }
    }
    if (best) return best;
    const direct = lines.find((l) => l.trim() && !l.startsWith('#'));
    return absUrlJoin(base, direct?.trim());
}

async function resolveEmbedM3u8(embedUrl, referer = '') {
    const url = unescapeJsUrl(embedUrl);
    if (!url) return '';
    if (/\.m3u8/i.test(url)) return url;

    const embedReferer = /turbovidhls|turbosplayer|turboviplay/i.test(url)
        ? `${new URL(url).origin}/`
        : 'https://turbovidhls.com/';
    const html = await fetchText(url, referer || embedReferer);
    const hits = [...html.matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((m) => m[0]);
    if (hits.length) return hits[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');

    const hash = load(html)('#video_player').attr('data-hash');
    if (hash) {
        const hashRef = /turbovidhls|turbosplayer|turboviplay/i.test(hash)
            ? `${new URL(hash).origin}/`
            : embedReferer;
        const master = await fetchText(hash, hashRef);
        return pickBestM3u8(master, hash);
    }
    return '';
}

function extractEmbedUrls(html) {
    const text = String(html || '');
    const urls = [];
    const add = (raw, label) => {
        const url = unescapeJsUrl(raw);
        if (url && !urls.some((x) => x.url === url)) urls.push({ label, url });
    };

    add(text.match(/embedCat1Url\s*=\s*['"]([^'"]+)/)?.[1], '线路1');
    add(text.match(/embedCat2Url\s*=\s*['"]([^'"]+)/)?.[1], '线路2');

    try {
        const block = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        if (block) {
            const data = JSON.parse(block[1].trim());
            const graph = data['@graph'] || [data];
            for (const item of graph) {
                if (item?.embedUrl) add(item.embedUrl, '默认');
            }
        }
    } catch { /* ignore */ }

    for (const m of text.matchAll(/data-embed="([^"]+)"/g)) {
        add(b64urlDecode(m[1]), `Server${urls.length + 1}`);
    }

    return urls;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: CLASSES,
        filters: buildFilters(CLASSES),
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    let filters = inReq.body.filters || {};
    if (typeof filters === 'string') {
        try { filters = JSON.parse(filters); } catch { filters = {}; }
    }
    const tid = inReq.body.id || 'new-releases';
    const html = await fetchListHtml(tid, page, filters);
    const list = parseVods(html);
    const id = String(tid).replace(/^\//, '');
    let pagecount = page;
    if (list.length) {
        if (id.startsWith('genre/') && page > 1) {
            pagecount = list.length ? page + 1 : page;
        } else if (id.startsWith('search/')) {
            pagecount = parsePageCount(html, `/search/${id.slice('search/'.length)}`, page);
            if (pagecount <= page && list.length >= 20) pagecount = page + 1;
        } else {
            pagecount = parsePageCount(html, `/${id}`, page);
            if (pagecount <= page && list.length >= 20) pagecount = page + 1;
        }
    }
    return { page, pagecount, list };
}

async function detail(inReq) {
    const id = inReq.body.id || '';
    const url = absUrl(id);
    const html = await fetchText(url, url);
    const $ = load(html);
    const embeds = extractEmbedUrls(html);
    const playGroups = embeds.length
        ? embeds.map((item) => [item.label, item.url])
        : [['JavDino', '']];

    const actors = [];
    $('a[href^="/actress/"]').each((_, el) => {
        const name = cleanText($(el).text());
        if (name) actors.push(name);
    });
    const genres = [];
    $('a[href^="/genre/"]').each((_, el) => {
        const name = cleanText($(el).text());
        if (name) genres.push(name);
    });

    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content')?.replace(/\s*-\s*JavDino\.com\s*$/i, '').trim()
                || cleanText($('h1').first().text())
                || id,
            vod_pic: $('meta[property="og:image"]').attr('content') || $('.thumb_preload').attr('src') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_actor: actors.slice(0, 8).join(', '),
            vod_type: genres.slice(0, 6).join(', '),
            vod_play_from: playGroups.map((p) => p[0]).join('$$$'),
            vod_play_url: playGroups.map((p) => `正片$${p[1]}`).join('$$$'),
        }],
    };
}

async function play(inReq) {
    const fail = { parse: 0, url: '', header: { 'User-Agent': UA } };
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (!raw) return fail;

    if (/^https?:\/\/.+\.m3u8/i.test(raw)) {
        let referer = `${site}/`;
        if (/turbovidhls|turbosplayer|turboviplay/i.test(raw)) {
            try { referer = `${new URL(raw).origin}/`; } catch { referer = 'https://turbovidhls.com/'; }
        }
        return { parse: 0, url: raw, header: { 'User-Agent': UA, Referer: referer } };
    }

    const playUrl = await resolveEmbedM3u8(raw, `${site}/`);
    if (!playUrl) return { parse: 1, url: raw, header: { 'User-Agent': UA, Referer: `${site}/` } };

    let referer = `${site}/`;
    if (/turbovidhls|turbosplayer|turboviplay/i.test(playUrl)) {
        try { referer = `${new URL(playUrl).origin}/`; } catch { referer = 'https://turbovidhls.com/'; }
    }
    return {
        parse: 0,
        url: playUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&'),
        header: { 'User-Agent': UA, Referer: referer },
    };
}

async function search(inReq) {
    const wd = String(inReq.body.wd || '').trim();
    if (!wd) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const html = await fetchListHtml(`search/${encodeURIComponent(wd)}`, page);
    const list = parseVods(html);
    let pagecount = parsePageCount(html, `/search/${encodeURIComponent(wd)}`, page);
    if (pagecount <= page && list.length >= 20) pagecount = page + 1;
    return { page, pagecount, list };
}

export default {
    meta: { key: 'javdino', name: '🔥JavDino', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
