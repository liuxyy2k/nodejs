import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://huangguo.video';

const CLASSES = [
    { type_id: '/videos?category=all', type_name: '全部' },
    { type_id: '/updates', type_name: '今日更新' },
    { type_id: '/ranking', type_name: '排行榜' },
    { type_id: '/videos?category=1', type_name: 'MV/音乐剧' },
    { type_id: '/videos?category=2', type_name: '短片' },
    { type_id: '/videos?category=3', type_name: '连续剧' },
    { type_id: '/videos?category=4', type_name: '片段' },
];

const FILTERS = [
    {
        key: 'sort',
        name: '排序',
        value: [
            { n: '最新发布', v: 'newest' },
            { n: '最多播放', v: 'views' },
            { n: '最多收藏', v: 'favorites' },
        ],
    },
    {
        key: 'rating',
        name: '尺度',
        value: [
            { n: '全部', v: '' },
            { n: '安全', v: '1' },
            { n: '裸露', v: '2' },
            { n: '限制级', v: '3' },
        ],
    },
    {
        key: 'tags',
        name: '标签',
        value: [
            { n: '全部', v: '' },
            { n: '都市', v: '1' },
            { n: '人妻', v: '2' },
            { n: '同人', v: '4' },
            { n: '校园', v: '5' },
            { n: '职场', v: '6' },
            { n: '古风', v: '7' },
            { n: '乱伦', v: '8' },
            { n: 'NTR', v: '9' },
            { n: '穿越', v: '39' },
            { n: '玄幻', v: '40' },
            { n: '露出', v: '42' },
            { n: '女同', v: '55' },
            { n: '男同', v: '56' },
            { n: '欧美', v: '57' },
            { n: '二次元', v: '59' },
        ],
    },
];

function abs(u) {
    if (!u) return '';
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

function parsePageCount($, page) {
    let max = page;
    $('a[href*="page="]').each((_, el) => {
        const m = String($(el).attr('href') || '').match(/[?&]page=(\d+)/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (n > max) max = n;
    });
    return max || page;
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
        timeout: 20000,
        validateStatus: () => true,
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVods($, html = '') {
    const list = [];
    const seen = new Set();
    const push = (href, name, pic, remark) => {
        if (!href || seen.has(href)) return;
        if (!/\/(series|video)\//.test(href)) return;
        seen.add(href);
        list.push({
            vod_id: href,
            vod_name: name || href.split('/').pop(),
            vod_pic: abs(pic),
            vod_remarks: remark || '',
        });
    };
    $('.video-card').each((_, el) => {
        const href = $(el).find('a[href^="/series/"], a[href^="/video/"]').first().attr('href')
            || $(el).find('a').eq(0).attr('href') || '';
        const pic = $(el).find('.video-cover-img').attr('src') || $(el).find('img').attr('src') || '';
        const name =
            $(el).find('.font-display').first().text().trim() ||
            $(el).find('img').attr('alt') ||
            '';
        const remark = $(el).find('.font-mono-meta').last().text().replace(/\s+/g, ' ').trim() || '';
        push(href, name, pic, remark);
    });
    if (!list.length && html) {
        const re = /<article class="video-card[\s\S]*?<\/article>/g;
        let m;
        while ((m = re.exec(html))) {
            const block = m[0];
            const href = (block.match(/href="(\/(?:series|video)\/[^"]+)"/) || [])[1] || '';
            const pic = (block.match(/video-cover-img[^>]*src="([^"]+)"/) || [])[1] || '';
            const name = (block.match(/alt="([^"]+)"/) || [])[1] || '';
            push(href, name, pic, '');
        }
    }
    return list;
}

function buildListUrl(tid, page, ext = {}) {
    let raw = String(tid || '/videos?category=all').trim();
    try {
        raw = decodeURIComponent(raw);
    } catch {}
    if (raw === 'all') raw = '/videos?category=all';
    else if (raw === 'updates') raw = '/updates';
    else if (raw === 'ranking') raw = '/ranking';
    else if (/^\d+$/.test(raw)) raw = `/videos?category=${raw}`;
    if (!raw.startsWith('http') && !raw.startsWith('/')) raw = `/${raw}`;
    const u = raw.startsWith('http') ? new URL(raw) : new URL(raw, site);
    if (u.pathname.startsWith('/videos')) {
        if (ext.sort) u.searchParams.set('sort', String(ext.sort));
        if (ext.rating) u.searchParams.set('rating', String(ext.rating));
        if (ext.tags) u.searchParams.set('tags', String(ext.tags));
    }
    if (page > 1) u.searchParams.set('page', String(page));
    else u.searchParams.delete('page');
    return u.href;
}

function epName($a, idx) {
    const t = $a.text().replace(/\s+/g, ' ').trim();
    const m = t.match(/第\s*(\d+)\s*集/);
    if (m) return `第${m[1]}集`;
    const ep = t.match(/EP\s*(\d+)/i);
    if (ep) return `第${ep[1]}集`;
    return t || `第${idx}集`;
}

function parseHls(html) {
    const m = String(html || '').match(/data-hls="([^"]+)"/);
    return m ? abs(m[1]) : '';
}

async function init() {
    return {};
}

async function home() {
    const filters = {};
    for (const c of CLASSES) {
        if (c.type_id === '/ranking' || c.type_id === '/updates') continue;
        filters[c.type_id] = FILTERS;
    }
    const html = await request(`${site}/videos?category=all`);
    const $ = load(html);
    return { class: CLASSES, filters};
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = String(inReq.body.id || '/videos?category=all');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const url = buildListUrl(tid, page, ext);
    const html = await request(url,url);
    console.log(html)
    const $ = load(html);
    const list = parseVods($, html);
    return {
        list,
        page,
        pagecount: parsePageCount($, page) || (list.length ? 9999 : 1),
        limit: 20,
        total: list.length,
    };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };
    const url = id.startsWith('http') ? id : abs(id);
    const html = await request(url);
    const $ = load(html);
    const name =
        $('meta[property="og:title"]').attr('content') ||
        $('h1').first().text().trim() ||
        '';
    const pic =
        $('meta[property="og:image"]').attr('content') ||
        $('.video-cover-img').attr('src') ||
        '';
    const content = $('meta[property="og:description"]').attr('content') || '';
    const tracks = [];
    const seen = new Set();
    $('a[href^="/video/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!href || seen.has(href)) return;
        const label = epName($(el), tracks.length + 1);
        if (!/第\d+集|EP\s*\d+/i.test(label) && tracks.length && !href.includes('/video/')) return;
        if (!href.startsWith('/video/')) return;
        seen.add(href);
        tracks.push(`${label.replace(/[#$]/g, ' ')}$${href}`);
    });
    if (!tracks.length && /\/video\//.test(url)) {
        tracks.push(`正片$${id.startsWith('http') ? id.replace(site, '') : id}`);
    }
    if (!tracks.length) {
        const hls = parseHls(html);
        if (hls) tracks.push(`正片$${hls}`);
    }
    return {
        list: [
            {
                vod_id: id,
                vod_name: name,
                vod_pic: abs(pic),
                vod_content: content,
                vod_play_from: '黄果剧场',
                vod_play_url: tracks.join('#'),
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    let url = '';
    if (/\.m3u8(\?|$)/i.test(raw)) {
        url = abs(raw);
    } else if (raw) {
        const html = await request(raw.startsWith('http') ? raw : abs(raw));
        url = parseHls(html);
    }
    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const html = await request(`${site}/search?q=${encodeURIComponent(kw)}`);
    const $ = load(html);
    return { list: parseVods($, html), page: 1 };
}

export default {
    meta: { key: 'hgjc', name: '📖黄果剧场', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
