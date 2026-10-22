import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const MOBILE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const site = 'https://javlust.net';
const JAVTIFUL = 'https://javtiful.com';

const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};

async function request(reqUrl, referer = `${site}/`, ua = UA) {
    const resp = await req.get(reqUrl, {
        headers: { ...headers, 'User-Agent': ua, Referer: referer },
        timeout: 25000,
        validateStatus: () => true,
        responseType: 'text',
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function absUrl(href, base = site) {
    const s = String(href || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return base + (s.startsWith('/') ? s : `/${s}`);
}

function playId(raw) {
    let id = String(raw || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    return id.replace(/\s+/g, '');
}

function buildListUrl(id, page) {
    const path = String(id || '/').trim() || '/';
    const u = new URL(path.startsWith('/') ? path : `/${path}`, site);
    if (page > 1) u.searchParams.set('page', String(page));
    return u.href;
}

function parseVods($) {
    const list = [];
    $('.col-sm-6').each((_, el) => {
        const href = $(el).find('a').eq(0).attr('href') || '';
        if (!href) return;
        list.push({
            vod_id: href,
            vod_name: $(el).find('h6').text().trim() || '',
            vod_pic: $(el).find('img').attr('data-src') || '',
            vod_remarks: $(el).find('.video-details').text().trim() || '',
        });
    });
    return list;
}

function pickBestSource(sources) {
    if (!Array.isArray(sources) || !sources.length) return '';
    const sorted = sources
        .map((item) => ({
            url: String(item?.src || item?.url || '').trim(),
            size: parseInt(item?.size, 10) || 0,
        }))
        .filter((item) => /^https?:\/\//i.test(item.url));
    if (!sorted.length) return '';
    sorted.sort((a, b) => b.size - a.size);
    return sorted[0].url;
}

async function resolveJavtifulEmbed(embedUrl) {
    const pageUrl = absUrl(embedUrl, JAVTIFUL);
    const html = await request(pageUrl, pageUrl);
    const cfgMatch = html.match(/<script id="watch-config" type="application\/json">\s*([\s\S]*?)<\/script>/i);
    if (!cfgMatch) return { url: '', referer: pageUrl };
    let cfg;
    try {
        cfg = JSON.parse(cfgMatch[1]);
    } catch {
        return { url: '', referer: pageUrl };
    }
    const endpoint = String(cfg?.playback?.endpoint || '').trim();
    const ticket = String(cfg?.playback?.ticket || '').trim();
    if (!endpoint || !ticket) return { url: '', referer: pageUrl };

    const resp = await req.post(`${JAVTIFUL}${endpoint}`, `ticket=${encodeURIComponent(ticket)}`, {
        headers: {
            'User-Agent': UA,
            Referer: pageUrl,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 25000,
        validateStatus: () => true,
    });
    const data = resp.data && typeof resp.data === 'object' ? resp.data : {};
    const url = pickBestSource(data.sources);
    return { url, referer: pageUrl };
}

async function resolveUpload18(pageUrl) {
    const html = await request(pageUrl, `${site}/`, MOBILE_UA);
    const m = html.match(/window\.PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return { url: '', referer: pageUrl };
    try {
        const cfg = JSON.parse(m[1]);
        const url = String(cfg.m3u8 || '').replace(/\\\//g, '/').trim();
        if (/^https?:\/\//i.test(url)) return { url, referer: pageUrl };
    } catch {
        /* ignore */
    }
    return { url: '', referer: pageUrl };
}

async function resolveStream(raw) {
    const id = playId(raw);
    if (!id) return { url: '', referer: `${site}/` };
    if (/\.m3u8(?:[?#]|$)|\.mp4(?:[?#]|$)/i.test(id)) {
        return { url: id, referer: `${site}/` };
    }

    const pageUrl = absUrl(id);
    if (/javtiful\.com\/embed\//i.test(pageUrl)) {
        return resolveJavtifulEmbed(pageUrl);
    }
    if (/upload18\.org/i.test(pageUrl)) {
        return resolveUpload18(pageUrl);
    }

    const html = await request(pageUrl, pageUrl);
    const $ = load(html);

    let playUrl =
        $('#front-player source').attr('src') ||
        $('#front-player video').attr('src') ||
        $('video source').first().attr('src') ||
        $('video').first().attr('src') ||
        '';

    if (!playUrl) {
        const iframe = $('iframe[src]').first().attr('src') || '';
        if (/javtiful\.com\/embed\//i.test(iframe)) return resolveJavtifulEmbed(absUrl(iframe, JAVTIFUL));
        if (/upload18\.org/i.test(iframe)) return resolveUpload18(absUrl(iframe));
    }

    if (!playUrl) {
        const m = html.match(/https?:[^"'\s<>]+?\.(?:m3u8|mp4)(?:[?#][^"'\s<>]*)?/i);
        playUrl = m ? m[0] : '';
    }
    playUrl = absUrl(playUrl);
    return { url: playUrl, referer: pageUrl };
}

function parseServerButtons($) {
    const vod_play_from = [];
    const vod_play_url = [];
    $('button[data-src]').each((i, el) => {
        const name = $(el)
            .clone()
            .find('i')
            .remove()
            .end()
            .text()
            .trim()
            .replace(/\s+/g, ' ');
        const src = $(el).attr('data-src')?.replace(/\s+/g, '').trim();
        if (!src) return;
        vod_play_from.push(name || `服务器${i + 1}`);
        vod_play_url.push(`播放$${absUrl(src, /^https?:\/\//i.test(src) ? undefined : site)}`);
    });
    return { vod_play_from, vod_play_url };
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/genre?name=featured-actress', type_name: '精选视频' },
            { type_id: '/most-viewed', type_name: '浏览量最高' },
            { type_id: '/amateur?sort=latest', type_name: '素人' },
            { type_id: '/censored?sort=latest', type_name: '有码' },
            { type_id: '/reducing-mosaic?sort=latest', type_name: '缩减马赛克' },
            { type_id: '/uncensored', type_name: '无码' },
            { type_id: '/genre?name=hi-def', type_name: '高清' },
            { type_id: '/genre?name=tall-girl', type_name: '高个女孩' },
            { type_id: '/genre?name=4k', type_name: '4K' },
            { type_id: '/genre?name=slender', type_name: '苗条' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = buildListUrl(inReq.body.id, page);
    const $ = load(await request(url));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(absUrl(id)));
    const { vod_play_from, vod_play_url } = parseServerButtons($);

    let vod_name = $('head title').text().trim();
    const pageTitle = $('.mt-3 h4').first().text().trim();
    if (pageTitle) vod_name = pageTitle;

    let vod_pic = $('meta[property="og:image"]').attr('content') || '';
    if (!vod_pic) {
        vod_pic =
            $('meta[name="twitter:image"]').attr('content') ||
            $('.card img').first().attr('src') ||
            '';
    }

    const vod_content =
        $('meta[name="description"]').attr('content') ||
        $('.mt-3 h4').first().text().trim() ||
        '';

    return {
        list: [{
            vod_id: id,
            vod_name,
            vod_pic,
            vod_content,
            vod_play_from: vod_play_from.join('$$$'),
            vod_play_url: vod_play_url.join('$$$'),
        }],
    };
}

async function play(inReq) {
    const { url: playUrl, referer } = await resolveStream(inReq.body.id);
    return {
        parse: 0,
        url: playUrl,
        header: { 'User-Agent': UA, Referer: referer || `${site}/` },
    };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javlust', name: '🌸Javlust', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
