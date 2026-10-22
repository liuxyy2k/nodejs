import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://javlust.net';

const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};

async function request(reqUrl) {
    const resp = await req.get(reqUrl, {
        headers,
        timeout: 25000,
        validateStatus: () => true,
        responseType: 'text',
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function absUrl(href) {
    const s = String(href || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : `/${s}`);
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

async function resolveStream(raw) {
    const id = String(raw || '').trim();
    if (!id) return '';
    if (/\.m3u8(?:[?#]|$)|\.mp4(?:[?#]|$)/i.test(id)) return id;

    const pageUrl = absUrl(id);
    const html = await request(pageUrl);
    const $ = load(html);

    let playUrl =
        $('#front-player source').attr('src') ||
        $('#front-player video').attr('src') ||
        $('video source').first().attr('src') ||
        $('video').first().attr('src') ||
        '';

    if (!playUrl) {
        const m = html.match(/https?:[^"'\s<>]+?\.(?:m3u8|mp4)(?:[?#][^"'\s<>]*)?/i);
        playUrl = m ? m[0] : '';
    }
    if (playUrl.startsWith('//')) playUrl = `https:${playUrl}`;
    if (playUrl.startsWith('/')) playUrl = site + playUrl;
    return playUrl;
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

    const lines = [];
    $('button[data-src]').each((i, el) => {
        const name = $(el)
            .clone()
            .find('i')
            .remove()
            .end()
            .text()
            .trim()
            .replace(/\s+/g, ' ');
        const src = $(el).attr('data-src')?.trim();
        if (!src) return;
        lines.push(`${name || `服务器${i + 1}`}$${absUrl(src)}`);
    });

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
            vod_play_from: lines.length ? 'Javlust' : '',
            vod_play_url: lines.join('#'),
        }],
    };
}

async function play(inReq) {
    const id = inReq.body.id;
    const playUrl = await resolveStream(id);
    const referer = /\.m3u8|\.mp4/i.test(String(id))
        ? `${site}/`
        : absUrl(id);
    return {
        parse: 0,
        url: playUrl,
        header: { 'User-Agent': UA, Referer: referer },
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
