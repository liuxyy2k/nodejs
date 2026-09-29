import axios from 'axios';
import { load } from 'cheerio';
import req from '../../util/req.js';
import { config } from './config.js';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const SITE = 'https://www.uaa001.com';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const REQ_HEADERS = {
    'User-Agent': UA,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Origin: SITE,
};

const CATEGORY_CFG = {
    国产片: { exclude: '' },
    日韩片: { exclude: '' },
    无码流出: { exclude: 'H动漫,国产片' },
    H动漫: { exclude: '' },
    欧美片: { exclude: '' },
};

const ORDER_FILTERS = {
    key: 'orderType',
    name: '排序',
    init: '2',
    value: [
        { n: '最新', v: '2' },
        { n: '最热', v: '1' },
    ],
};

function buildLoadUrl({ page, size, includeCategories, excludeCategories = '', orderType = '2', ids = '' }) {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('size', String(size));
    if (ids) qs.set('ids', ids);
    else if (includeCategories) qs.set('category', includeCategories);
    qs.set('orderType', String(orderType));
    qs.set('_', String(Date.now()));
    return `${SITE}/api/video/app/video/search?${qs.toString()}`;
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        const out = {};
        for (const part of raw.split('&')) {
            const [k, v] = part.split('=');
            if (k) out[k] = v ?? '';
        }
        return out;
    }
    return {};
}

function parseJson(raw) {
    if (typeof raw === 'object' && raw !== null) return raw;
    try {
        return JSON.parse(String(raw || '{}'));
    } catch {
        return {};
    }
}

async function request(url, referer = `${SITE}/`) {
    const resp = await req.get(url, {
        headers: {
            ...REQ_HEADERS,
            Referer: referer,
            Accept: 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 20000,
        validateStatus: () => true,
    });
    return resp.data;
}

async function fetchJson(url, referer = '') {
    const raw = await request(url, referer || `${SITE}/video/list/`);
    return parseJson(raw);
}

function parseVodId(raw) {
    const s = String(raw || '');
    if (s.includes('@')) {
        const idx = s.indexOf('@');
        return { id: s.slice(0, idx), url: s.slice(idx + 1) };
    }
    if (s.includes('.m3u8')) return { id: s, url: s };
    return { id: s, url: '' };
}

function mapVideoItem(item) {
    const id = String(item.id || '');
    const playUrl = item.url || '';
    return {
        vod_id: playUrl ? `${id}@${playUrl}` : id,
        vod_name: item.title || '',
        vod_pic: item.coverUrl || item.cover || '',
        vod_remarks: item.durationFormat || item.onlineTimeFormat || '',
    };
}

function parseVods($) {
    const list = [];
    $('.video_li').each((_, e) => {
        const href = $(e).find('a').eq(0).attr('href') || '';
        const title = $(e).find('.title').text().trim();
        const cover = $(e).find('.cover').attr('src') || $(e).find('.cover').attr('data-cfsrc') || '';
        const pubdate = $(e).find('span').first().text();
        list.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: pubdate,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '国产片',     type_name: '国产片' },
        { type_id: '日韩片',     type_name: '日韩片' },
        { type_id: '无码流出',   type_name: '无码流出' },
        { type_id: 'H动漫',      type_name: 'H动漫' },
        { type_id: '欧美片',     type_name: '欧美片' },
    ];
    const filters = {};
    for (const item of classes) {
        filters[item.type_id] = [ORDER_FILTERS];
    }
    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page, 10) || 1;
    const size = 48;
    const cfg = CATEGORY_CFG[tid] || {};
    const extend = parseExtend(inReq.body.filters || inReq.body.filter);
    const url = buildLoadUrl({
        page,
        size,
        includeCategories: tid,
        excludeCategories: cfg.exclude || '',
        orderType: extend.orderType || ORDER_FILTERS.init,
    });
    try {
        const data = await fetchJson(url);
        const model = data?.model || {};
        const rows = model.data;
        const list = Array.isArray(rows)
            ? rows.map(mapVideoItem).filter((v) => v.vod_id && v.vod_name)
            : [];
        return {
            page: model.currentPage || page,
            pagecount: model.totalPage || page,
            limit: model.pageSize || size,
            total: model.totalCount || list.length,
            list,
        };
    } catch (e) {
        console.log('[uua] category error:', e.message);
        return { page, pagecount: page, limit: size, total: 0, list: [] };
    }
}

async function detail(inReq, _outResp) {
    const { id, url } = parseVodId(inReq.body.id);
    let item = null;
    if (!url && id) {
        const data = await fetchJson(buildLoadUrl({ page: 1, size: 1, ids: id, orderType: '2' }));
        item = data?.model?.data?.[0] || null;
    }
    const playUrl = url || item?.url || '';
    return {
        list: [{
            vod_id: inReq.body.id,
            vod_name: item?.title || '',
            vod_pic: item?.coverUrl || '',
            vod_content: item?.tags || item?.description || '',
            vod_remarks: item?.durationFormat || item?.onlineTimeFormat || '',
            vod_play_from: '有爱爱',
            vod_play_url: playUrl ? `播放$${playUrl}` : '',
        }],
    };
}

async function play(inReq, _outResp) {
    const { url } = parseVodId(inReq.body.id);
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            Referer: `${SITE}/`,
            Origin: SITE,
        },
    };
}

async function search(inReq, _outResp) {
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const text = encodeURIComponent(inReq.body.wd);

    const url = page > 1
        ? `${SITE}/api/video/app/video/search?keyword=${text}&category=&origin=&tag=&sort=0&page=${page}`
        : `${SITE}/api/video/app/video/search?searchType=1&keyword=${text}`;

    const html = await fetchJson(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: list.length > 0 ? page + 1 : page, list };
}

export default {
    meta: { key: 'uaa', name: '💋有爱爱', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
