import { load } from 'cheerio';
import req from '../../util/req.js';

const site = 'https://tinyavideo.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: '/asian/new', type_name: '国产AV' },
    { type_id: '/japanese/new', type_name: '日本AV' },
    { type_id: '/uncensored-leak/new', type_name: 'JAV无码' },
    { type_id: '/fc2/new', type_name: 'FC2素人' },
    { type_id: '/hentai/new', type_name: '里番' },
    { type_id: '/western/new', type_name: '欧美' },
    { type_id: '/korean/new', type_name: '韩国' },
    { type_id: '/chinese-subtitles', type_name: '中文字幕' },
    { type_id: '/special', type_name: '精选片单' },
];

const SORT_PATH = {
    created: 'new',
    releasedate: 'release',
    daycount: 'today-hot',
    weekcount: 'weekly-hot',
    monthcount: 'monthly-hot',
    yearcount: 'yearly-hot',
    totalcount: 'hot',
};

const FILTERS = [
    {
        key: 'sort',
        name: '排序',
        value: [
            { n: '最近更新', v: 'created' },
            { n: '最新发行', v: 'releasedate' },
            { n: '今日热门', v: 'daycount' },
            { n: '本周热门', v: 'weekcount' },
            { n: '本月热门', v: 'monthcount' },
            { n: '年度热门', v: 'yearcount' },
            { n: '总观看数', v: 'totalcount' },
        ],
    },
    {
        key: 'sub',
        name: '字幕',
        value: [
            { n: '全部', v: '' },
            { n: '中文字幕', v: '1' },
        ],
    },
    {
        key: 'tag',
        name: '标签',
        value: [
            { n: '全部', v: '' },
            { n: '亚洲国产', v: '亞洲國產av' },
            { n: '无码流出', v: '无码流出' },
            { n: '无码', v: '无码' },
            { n: '中文字幕', v: '中文字幕' },
            { n: '巨乳', v: '巨乳' },
            { n: '熟女', v: '熟女' },
            { n: '口交', v: '口交' },
            { n: '内射', v: '内射' },
            { n: '丝袜', v: '絲襪' },
            { n: '黑丝', v: '黑絲' },
            { n: 'cosplay', v: 'cosplay' },
            { n: '按摩', v: '按摩' },
            { n: '露出', v: '露出' },
            { n: '多人', v: '多人' },
            { n: '肛交', v: '肛交' },
            { n: '自慰', v: '自慰' },
            { n: '台湾', v: '台灣' },
            { n: 'FC2', v: 'fc2' },
            { n: 'AI短剧', v: 'ai短劇' },
            { n: '黑人', v: '黑人' },
        ],
    },
];

function abs(u) {
    if (!u) return '';
    u = String(u).trim().replace(/&amp;/g, '&');
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

function headers(extra) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        Referer: `${site}/`,
        ...extra,
    };
}

async function fetchHtml(url) {
    const opts = {
        headers: headers(),
        timeout: 25000,
        validateStatus: () => true,
    };
    try {
        let res = await req.get(url, { ...opts, family: 4 });
        if (typeof res.data !== 'string' || !res.data) {
            res = await req.get(url, opts);
        }
        return typeof res.data === 'string' ? res.data : '';
    } catch {
        try {
            const res = await req.get(url, opts);
            return typeof res.data === 'string' ? res.data : '';
        } catch {
            return '';
        }
    }
}

function parseVods($) {
    const vods = [];
    const seen = new Set();
    $('.videotitle a[href*="/video/"], .video-thumbnail-container a[href*="/video/"]').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const m = href.match(/\/video\/([^/?#]+)/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const card = a.closest('.cf, .views-row, article, .col-6, .col-md-3').length
            ? a.closest('.cf, .views-row, article, .col-6, .col-md-3')
            : a.parent().parent();
        let name = card.find('.videotitle a').first().text().trim() || a.attr('title') || a.text().trim();
        if (!name) name = id;
        let pic =
            card.find('img').attr('src') ||
            card.find('img').attr('data-src') ||
            card.find('img').attr('data-lazy-src') ||
            '';
        vods.push({
            vod_id: id,
            vod_name: name,
            vod_pic: abs(pic),
            vod_remarks: card.find('.count-number').first().text().trim(),
        });
    });
    return vods;
}

function parsePagecount($, page) {
    let max = page;
    $('a[href*="page="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10) + 1);
    });
    return Math.max(max, page);
}

function withSortPath(tid, sort) {
    const slug = SORT_PATH[sort];
    if (!slug) return tid;
    const m = String(tid).match(/^\/(asian|japanese|uncensored-leak|fc2|hentai|western|korean)\/[a-z0-9-]+$/);
    if (!m) return tid;
    return `/${m[1]}/${slug}`;
}

function buildListUrl(tid, page, ext) {
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const tag = String(ext.tag || '').trim();
    let path;
    if (tag) path = `/tags/${encodeURIComponent(tag)}`;
    else path = withSortPath(tid || '/asian/new', ext.sort);
    const url = new URL(abs(path));
    if (ext.sort) url.searchParams.set('sort_by', ext.sort);
    if (ext.sub) url.searchParams.set('field_video_tags_target_id', ext.sub);
    if (pg > 1) url.searchParams.set('page', String(pg - 1));
    return url.toString();
}

function extractPlay(html) {
    const urls = [];
    const seen = new Set();
    const add = (u) => {
        u = abs(u);
        if (!u || seen.has(u)) return;
        seen.add(u);
        urls.push(u);
    };
    const listM = html.match(/window\.m3u8List\s*=\s*(\[[\s\S]*?\])/);
    if (listM) {
        try {
            JSON.parse(listM[1]).forEach(add);
        } catch {}
    }
    for (const re of [
        /"contentUrl"\s*:\s*"([^"]+)"/g,
        /https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/gi,
    ]) {
        let m;
        while ((m = re.exec(html))) add(m[1] || m[0]);
    }
    return urls;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home() {
    const html = await fetchHtml(`${site}/asian/new`);
    return {
        class: CLASSES,
        filters: Object.fromEntries(CLASSES.map((c) => [c.type_id, FILTERS])),
        list: parseVods(load(html)),
    };
}

async function category(inReq) {
    const tid = inReq.body.id || CLASSES[0].type_id;
    const pg = inReq.body.page || inReq.body.pg || 1;
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const html = await fetchHtml(buildListUrl(tid, pg, ext));
    const $ = load(html);
    return {
        page: pg,
        pagecount: parsePagecount($, pg),
        limit: 24,
        total: 0,
        list: parseVods($),
    };
}

async function detail(inReq) {
    const id = String(inReq.body.id || '').replace(/^\/+/, '');
    const html = await fetchHtml(`${site}/video/${id}`);
    const $ = load(html);
    const name = $('h1').first().text().trim() || id;
    const pic =
        $('meta[property="og:image"]').attr('content') ||
        $('#player').attr('poster') ||
        $('video').attr('poster') ||
        '';
    const desc =
        $('.video-description, .field--name-body').first().text().trim() ||
        $('meta[property="og:description"]').attr('content') ||
        '';
    const tags = $('a[href*="/tags/"]')
        .map((_, el) => $(el).text().replace(/^#/, '').trim())
        .get()
        .filter(Boolean)
        .join('/');
    const plays = extractPlay(html);
    return {
        list: [
            {
                vod_id: id,
                vod_name: name,
                vod_pic: abs(pic),
                vod_content: desc,
                vod_actor: tags,
                vod_play_from: plays.length ? 'TinyAV' : '',
                vod_play_url: plays.length ? plays.map((u, i) => `${plays.length > 1 ? '线路' + (i + 1) : '播放'}$${u}`).join('#') : '',
            },
        ],
    };
}

async function play(inReq) {
    let flag = inReq.body.flag;
    let id = inReq.body.id;
    if (!id && typeof flag === 'string' && flag.includes('$')) {
        const p = flag.split('$');
        flag = p[0];
        id = p.slice(1).join('$');
    }
    if (/^https?:\/\//i.test(id) && /\.m3u8|\.mp4/i.test(id)) {
        return { parse: 0, url: id, header: { 'User-Agent': UA, Referer: `${site}/` } };
    }
    const html = await fetchHtml(abs(id.startsWith('/video/') ? id : `/video/${id}`));
    const plays = extractPlay(html);
    return {
        parse: 0,
        url: plays[0] || '',
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const url = new URL(`${site}/search`);
    url.searchParams.set('fulltext', kw);
    if (pg > 1) url.searchParams.set('page', String(pg - 1));
    const html = await fetchHtml(url.toString());
    const $ = load(html);
    return { page: pg, pagecount: parsePagecount($, pg), list: parseVods($) };
}

export default {
    meta: { key: 'tinyav', name: '🌸TinyAV', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
