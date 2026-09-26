import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const site = 'https://ipornbase.xyz';

const CLASSES = [
    { type_id: '/asian/new', type_name: '亚洲国产' },
    { type_id: '/japanese/new', type_name: '日本AV' },
    { type_id: '/uncensored-leak/new', type_name: 'JAV无码流出' },
    { type_id: '/fc2/new', type_name: 'FC2素人' },
    { type_id: '/hentai/new', type_name: '里番' },
    { type_id: '/western/new', type_name: '欧美' },
    { type_id: '/korean/new', type_name: '韩国直播' },
    { type_id: '/chinese-subtitles', type_name: '中文字幕' },
    { type_id: '/special', type_name: '精选片单' },
];

const SORT_FILTER = {
    key: 'sort',
    name: '排序',
    value: [
        { n: '最近更新', v: 'created' },
        { n: '发行日期', v: 'releasedate' },
        { n: '今日观看', v: 'daycount' },
        { n: '本周观看', v: 'weekcount' },
        { n: '本月观看', v: 'monthcount' },
        { n: '年度观看', v: 'yearcount' },
        { n: '总观看数', v: 'totalcount' },
    ],
};

const TAG_FILTER = {
    key: 'tag',
    name: '筛选',
    value: [
        { n: '全部', v: 'All' },
        { n: '中文字幕', v: '1' },
    ],
};

function parseFilters(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try { return parseFilters(JSON.parse(raw)); } catch {
            const out = {};
            for (const part of raw.split(/[&;]/)) {
                const [k, v] = part.split('=');
                if (k) out[k.trim()] = (v || '').trim();
            }
            return out;
        }
    }
    if (Array.isArray(raw)) {
        const out = {};
        for (const it of raw) if (it?.key) out[it.key] = it.value ?? it.v;
        return out;
    }
    return typeof raw === 'object' ? raw : {};
}

function fixUrl(u) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    return `${site}${u.startsWith('/') ? u : `/${u}`}`;
}

function buildListUrl(tid, page, filters = {}) {
    const url = new URL(String(tid || '/japanese/new').trim(), site);
    const sort = filters.sort || filters.sort_by || '';
    const tag = filters.tag || filters.field_video_tags_target_id || '';
    if (sort) url.searchParams.set('sort_by', sort);
    if (tag && tag !== 'All') url.searchParams.set('field_video_tags_target_id', tag);
    if (page > 1) url.searchParams.set('page', String(page - 1));
    return url.href;
}

function parsePageCount($, page) {
    let max = 0;
    $('.pagination a.page-link[href*="page="]').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/[?&]page=(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max ? max + 1 : page;
}

function parsePlayUrl(html) {
    const m = String(html).match(/"contentUrl"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    const m2 = String(html).match(/window\.m3u8List\s*=\s*\[\s*"([^"]+)"/);
    return m2 ? m2[1] : '';
}

async function request(url, referer = `${site}/`) {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
        },
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('.video-thumbnail-container').each((_, el) => {
        const box = $(el).parent();
        const href = $(el).find('a').first().attr('href') || '';
        list.push({
            vod_id: href,
            vod_name: box.find('.videotitle a').text().trim() || $(el).find('img').attr('alt') || '',
            vod_pic: fixUrl($(el).find('img').attr('src') || ''),
            vod_remarks: $(el).find('.count-number').text().replace(/\s+/g, ' ').trim() || '',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    const filters = {};
    for (const item of CLASSES) filters[item.type_id] = [SORT_FILTER, TAG_FILTER];
    return { class: CLASSES, filters };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = inReq.body.id || '/japanese/new';
    const filters = parseFilters(inReq.body.filters || inReq.body.filter || inReq.body.extend);
    if (inReq.body.sort) filters.sort = inReq.body.sort;
    if (inReq.body.tag) filters.tag = inReq.body.tag;
    const $ = load(await request(buildListUrl(tid, page, filters), fixUrl(tid)));
    return { page, pagecount: parsePageCount($, page), list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const url = id.startsWith('http') ? id : fixUrl(id);
    const html = await request(url, site);
    const $ = load(html);
    const playUrl = parsePlayUrl(html);
    let pic = '';
    try {
        const json = JSON.parse($('script[type="application/ld+json"]').text().trim() || '{}');
        const node = json['@graph']?.find((it) => it['@type'] === 'VideoObject') || json;
        pic = node.thumbnailUrl || '';
    } catch {}
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || $('title').text().trim() || '',
            vod_pic: fixUrl(pic),
            vod_content: $('meta[name="description"]').attr('content') || '',
            vod_play_from: 'ipornbase',
            vod_play_url: playUrl ? `正片$${playUrl}` : '',
        }],
    };
}

async function play(inReq) {
    return { parse: 0, url: inReq.body.id, header: { 'User-Agent': UA, Referer: `${site}/` } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?fulltext=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'ipornbase', name: '🔥AV空投', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
