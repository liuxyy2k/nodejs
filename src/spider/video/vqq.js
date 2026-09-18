import axios from 'axios';
import { randomUUID } from 'crypto';

const HOST = 'https://v.qq.com';
const API_HOST = 'https://pbaccess.video.qq.com';
const LIST_API =
    `${API_HOST}/trpc.universal_backend_service.page_server_rpc.PageServer/GetPageData?video_appid=1000005&vplatform=2&vversion_name=8.9.10&new_mark_label_enabled=1`;
const DETAIL_API =
    `${API_HOST}/trpc.universal_backend_service.page_server_rpc.PageServer/GetPageData?video_appid=3000010&vplatform=2&vversion_name=8.2.96`;
const SEARCH_API = `${API_HOST}/trpc.videosearch.mobile_search.MultiTerminalSearch/MbSearch?vplatform=2`;

const CATEGORIES = {
    电视剧: '100113',
    电影: '100173',
    综艺: '100109',
    纪录片: '100105',
    动漫: '110755',
    少儿: '100150',
    短剧: '110755',
};

const DEFAULT_FILTER = {
    sort: '75',
    attr: '-1',
    itype: '-1',
    ipay: '-1',
    iarea: '-1',
    iyear: '-1',
    theater: '-1',
    award: '-1',
    recommend: '-1',
};

const DBODY = {
    page_params: {
        channel_id: '',
        filter_params: 'sort=75',
        page_type: 'channel_operation',
        page_id: 'channel_list_second_page',
    },
};

const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5410.0 Safari/537.36';
const MOBILE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

const HEADERS = {
    'User-Agent': UA,
    Origin: HOST,
    Referer: `${HOST}/`,
    Accept: 'application/json',
};

function playHeaders(referer = `${HOST}/`) {
    return {
        'User-Agent': MOBILE_UA,
        Referer: referer,
        Origin: HOST,
    };
}

function isVideoFormat(url) {
    if (!url || !String(url).startsWith('http')) return false;
    const u = String(url).toLowerCase();
    return ['.mp4', '.m3u8', '.ts', '.mkv', '.flv', '.webm'].some((fmt) => u.includes(fmt));
}

function normalizePageUrl(url) {
    let u = String(url || '').trim().replace(/^http:\/\//i, 'https://');
    u = u.replace('https://www.v.qq.com/', `${HOST}/`).replace('https://m.v.qq.com/', `${HOST}/`);
    return u;
}

function parsePlayId(id) {
    const raw = String(id || '').trim();
    if (!raw) return { pageUrl: '', vid: '' };

    if (raw.startsWith('http')) {
        const pageUrl = normalizePageUrl(raw);
        const m = pageUrl.match(/\/x\/cover\/([^/]+)\/([^/.]+)\.html/i);
        return { pageUrl, cid: m?.[1] || '', vid: m?.[2] || '' };
    }

    const at = raw.lastIndexOf('@');
    if (at < 0) return { pageUrl: '', vid: '' };
    const left = raw.slice(0, at);
    const vid = raw.slice(at + 1);
    const cid = left.includes('$') ? left.split('$').pop() : left;
    return { pageUrl: `${HOST}/x/cover/${cid}/${vid}.html`, cid, vid };
}

const http = axios.create({
    timeout: 15000,
    headers: HEADERS,
    validateStatus: () => true,
});

const pageCtx = new Map();

function safeGet(obj, ...keys) {
    let o = obj;
    for (const k of keys) {
        if (o == null) return null;
        if (typeof k === 'number') {
            if (!Array.isArray(o) || k < 0 || k >= o.length) return null;
            o = o[k];
        } else if (typeof o === 'object' && k in o) {
            o = o[k];
        } else {
            return null;
        }
    }
    return o;
}

function jsonToParams(params) {
    return Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
}

function parseTag(raw) {
    try {
        return JSON.parse(raw || '{}');
    } catch {
        return {};
    }
}

function formatItem(its) {
    const p = safeGet(its, 'item_params') || {};
    const cid = p.cid;
    if (!cid) return null;
    const tag = parseTag(p.uni_imgtag || p.imgtag);
    return {
        vod_id: cid,
        vod_name: p.mz_title || p.title || cid,
        vod_pic: p.new_pic_hz || p.new_pic_vt || p.image_url || '',
        vod_year: safeGet(tag, 'tag_2', 'text') || '',
        vod_remarks: safeGet(tag, 'tag_4', 'text') || '',
    };
}

function collectItemDatas(data) {
    const out = [];
    const modList = safeGet(data, 'data', 'module_list_datas') || [];
    for (const mod of modList) {
        const mds = safeGet(mod, 'module_datas') || [];
        for (const md of mds) {
            const ids = safeGet(md, 'item_data_lists', 'item_datas') || [];
            if (Array.isArray(ids)) out.push(...ids);
        }
    }
    return out;
}

async function postPage(url, body) {
    const resp = await http.post(url, body);
    if (resp.status !== 200 || !resp.data) return null;
    return resp.data;
}

async function getFilterData(cid) {
    const body = {
        page_params: {
            ...DBODY.page_params,
            channel_id: cid,
        },
    };
    const data = await postPage(LIST_API, body);
    if (!data) return {};
    const filterDict = {};
    const modList = safeGet(data, 'data', 'module_list_datas') || [];
    for (const modData of modList) {
        const mdList = safeGet(modData, 'module_datas') || [];
        for (const md of mdList) {
            const itemDatas = safeGet(md, 'item_data_lists', 'item_datas') || [];
            for (const it of itemDatas) {
                const params = safeGet(it, 'item_params') || {};
                const fkey = params.index_item_key;
                if (!fkey) continue;
                if (!filterDict[fkey]) {
                    filterDict[fkey] = {
                        key: fkey,
                        name: params.index_name || fkey,
                        init: params.option_value || '-1',
                        value: [],
                    };
                }
                filterDict[fkey].value.push({
                    n: params.option_name || '',
                    v: params.option_value || '',
                });
            }
        }
    }
    return filterDict;
}

async function getHomeList() {
    const resp = await http.get(HOST);
    if (resp.status !== 200) return [];
    const m = String(resp.data).match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return [];
    try {
        const sd = JSON.parse(m[1]);
        const cardListData =
            safeGet(sd, 'storeModulesData', 'channelsModulesMap', 'choice', 'cardListData') || [];
        const vlist = [];
        for (const its of cardListData) {
            const clist = safeGet(its, 'children_list', 'list', 'cards') || [];
            for (const it of clist) {
                const p = safeGet(it, 'params') || {};
                const id = it.id || p.cid;
                const name = p.mz_title || p.title;
                if (!name || !id || String(id).includes('http')) continue;
                const tag = parseTag(p.uni_imgtag || p.imgtag);
                vlist.push({
                    vod_id: id,
                    vod_name: name,
                    vod_pic: p.image_url || '',
                    vod_year: safeGet(tag, 'tag_2', 'text') || '',
                    vod_remarks: safeGet(tag, 'tag_4', 'text') || '',
                });
            }
        }
        return vlist;
    } catch {
        return [];
    }
}

async function getVdata(body) {
    const data = await postPage(DETAIL_API, body);
    return data || { data: { module_list_datas: [] } };
}

async function processTabs(data, body) {
    const pdata = [];
    const modList = safeGet(data, 'data', 'module_list_datas') || [];
    for (const mod of modList) {
        const mds = safeGet(mod, 'module_datas') || [];
        for (const md of mds) {
            const idsList = safeGet(md, 'item_data_lists', 'item_datas') || [];
            if (Array.isArray(idsList)) pdata.push(...idsList);
            const tabsStr = safeGet(md, 'module_params', 'tabs') || '';
            if (!tabsStr) continue;
            let tabs = [];
            try {
                tabs = JSON.parse(tabsStr);
            } catch {
                tabs = [];
            }
            if (!Array.isArray(tabs)) continue;
            for (const tab of tabs.slice(1)) {
                const nbody = JSON.parse(JSON.stringify(body));
                nbody.page_params.page_context = tab.page_context || '';
                const resData = await getVdata(nbody);
                pdata.push(...collectItemDatas(resData));
            }
        }
    }
    return pdata;
}

function processPdata(pdata, cid) {
    const plist = [];
    const ylist = [];
    for (const k of pdata) {
        if (!k?.item_id) continue;
        const unionTitle = safeGet(k, 'item_params', 'union_title') || '';
        const line = `${unionTitle}$${cid}@${k.item_id}`;
        if (unionTitle.includes('预告')) ylist.push(line);
        else plist.push(line);
    }
    return { plist, ylist };
}

function parseQzJson(text) {
    const raw = String(text || '').trim().replace(/^QZOutputJson=/, '').replace(/;\s*$/, '');
    return JSON.parse(raw);
}

function isPreviewStream(data, vi) {
    const previewSec = Number(data?.preview);
    if (previewSec > 0) return true;
    const viPreview = Number(vi?.preview);
    const totalSec = parseFloat(vi?.td || '0');
    if (viPreview > 0 && totalSec > 0 && viPreview < totalSec) return true;
    return false;
}

async function resolveDirectUrl(vid, { allowPreview = false } = {}) {
    const defns = ['fhd', 'shd', 'hd', 'mp4'];
    for (const defn of defns) {
        try {
            const api =
                `https://vv.video.qq.com/getinfo?otype=json&platform=101001&charge=0&vid=${encodeURIComponent(vid)}&defn=${defn}&defaultfmt=auto`;
            const resp = await http.get(api);
            if (resp.status !== 200) continue;
            const data = parseQzJson(resp.data);
            if (!data || data.em !== 0) continue;
            const vi = data.vl?.vi?.[0];
            const ui = vi?.ul?.ui?.[0];
            if (!vi?.fn || !vi?.fvkey || !ui?.url) continue;
            if (!allowPreview && isPreviewStream(data, vi)) continue;
            return `${ui.url}${vi.fn}?vkey=${vi.fvkey}`;
        } catch {
            /* try next quality */
        }
    }
    return '';
}

function buildVod(vdata, actors, plist, ylist) {
    const d =
        safeGet(vdata, 'data', 'module_list_datas', 0, 'module_datas', 0, 'item_data_lists', 0, 'item_datas', 0, 'item_params') || {};
    const names = [];
    const urls = [];
    if (plist.length) {
        names.push('腾讯视频');
        urls.push(plist.join('#'));
    }
    if (ylist.length) {
        names.push('预告片');
        urls.push(ylist.join('#'));
    }
    return {
        type_name: d.sub_genre || '',
        vod_name: d.title || '',
        vod_year: d.year || '',
        vod_area: d.area_name || '',
        vod_remarks: d.holly_online_time || d.hotval || '',
        vod_actor: actors.join(','),
        vod_content: d.cover_description || '',
        vod_play_from: names.join('$$$'),
        vod_play_url: urls.join('$$$'),
    };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = Object.entries(CATEGORIES).map(([name, id]) => ({
        type_id: id,
        type_name: name,
    }));
    const filters = {};
    for (const item of classes) {
        const dict = await getFilterData(item.type_id);
        if (Object.keys(dict).length) filters[item.type_id] = Object.values(dict);
    }
    let list = [];
    try {
        list = await getHomeList();
    } catch {
        list = [];
    }
    return { class: classes, filters, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const page = parseInt(inReq.body.page, 10) || 1;
    const extend = { ...DEFAULT_FILTER, ...(inReq.body.filters || {}) };
    const ctxKey = `${tid}:${jsonToParams(extend)}`;

    const body = {
        page_params: {
            ...DBODY.page_params,
            channel_id: tid,
            filter_params: jsonToParams(extend),
        },
    };
    if (page > 1) {
        const ctx = pageCtx.get(ctxKey);
        if (ctx) body.page_context = ctx;
    } else {
        pageCtx.delete(ctxKey);
    }

    const data = await postPage(LIST_API, body);
    if (!data) {
        return { list: [], page, pagecount: page, limit: 90, total: 0 };
    }

    const ndata = data.data || {};
    const hasNext = !!ndata.has_next_page;
    if (hasNext && ndata.next_page_context) {
        pageCtx.set(ctxKey, ndata.next_page_context);
    } else {
        pageCtx.delete(ctxKey);
    }

    const list = collectItemDatas(data).map(formatItem).filter(Boolean);
    return {
        list,
        page,
        pagecount: hasNext ? 9999 : page,
        limit: 90,
        total: 999999,
    };
}

async function detail(inReq, _outResp) {
    const cid = String(inReq.body.id || '');
    const vbody = {
        page_params: {
            req_from: 'web',
            cid,
            vid: '',
            lid: '',
            page_type: 'detail_operation',
            page_id: 'detail_page_introduction',
        },
        has_cache: 1,
    };
    const ebody = {
        page_params: {
            req_from: 'web_vsite',
            page_id: 'vsite_episode_list',
            page_type: 'detail_operation',
            id_type: '1',
            page_size: '',
            cid,
            vid: '',
            lid: '',
            page_num: '',
            page_context: '',
            detail_page_type: '1',
        },
        has_cache: 1,
    };

    const vdata = await getVdata(vbody);
    const data = await getVdata(ebody);
    const pdata = await processTabs(data, ebody);
    if (!pdata.length) {
        return {
            list: [{
                vod_id: cid,
                vod_play_from: '哎呀翻车啦',
                vod_play_url: '翻车啦$555',
            }],
        };
    }

    const starList =
        safeGet(vdata, 'data', 'module_list_datas', 0, 'module_datas', 0, 'item_data_lists', 0, 'item_datas', 0, 'sub_items', 'star_list', 'item_datas') || [];
    const actors = starList
        .map((star) => safeGet(star, 'item_params', 'name'))
        .filter(Boolean);
    const { plist, ylist } = processPdata(pdata, cid);
    const vod = buildVod(vdata, actors, plist, ylist);
    vod.vod_id = cid;
    return { list: [vod] };
}

async function play(inReq, _outResp) {
    const { pageUrl, vid } = parsePlayId(inReq.body.id || '');
    if (!pageUrl) {
        return { parse: 0, jx: 0, url: '', header: playHeaders() };
    }

    if (isVideoFormat(pageUrl)) {
        return { parse: 0, jx: 0, url: pageUrl, header: playHeaders(pageUrl) };
    }

    let direct = vid ? await resolveDirectUrl(vid, { allowPreview: false }) : '';
    if (!direct && vid) {
        direct = await resolveDirectUrl(vid, { allowPreview: true });
    }
    if (direct) {
        return {
            parse: 0,
            jx: 0,
            url: direct,
            header: playHeaders(pageUrl),
        };
    }

    return {
        parse: 1,
        jx: 0,
        url: `https://jx.xmflv.com/?url=${encodeURIComponent(pageUrl)}`,
        header: playHeaders(pageUrl),
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || '');
    const page = parseInt(inReq.body.page, 10) || 1;
    if (!key) return { list: [], page };

    const body = {
        version: '24072901',
        clientType: 1,
        filterValue: '',
        uuid: randomUUID(),
        retry: 0,
        query: key,
        pagenum: page - 1,
        pagesize: 30,
        queryFrom: 0,
        searchDatakey: '',
        transInfo: '',
        isneedQc: true,
        preQid: '',
        adClientInfo: '',
        extraInfo: { isNewMarkLabel: '1', multi_terminal_pc: '1' },
    };

    const data = await postPage(SEARCH_API, body);
    if (!data) return { list: [], page };

    const boxList = safeGet(data, 'data', 'areaBoxList') || [];
    const list = [];
    for (const k of boxList) {
        const doc = safeGet(k, 'doc') || {};
        const docid = doc.id;
        if (!docid) continue;
        const tag = parseTag(safeGet(k, 'videoInfo', 'imgTag'));
        list.push({
            vod_id: docid,
            vod_name: safeGet(k, 'videoInfo', 'title') || '',
            vod_pic: safeGet(k, 'videoInfo', 'imgUrl') || '',
            vod_year: safeGet(tag, 'tag_2', 'text') || '',
            vod_remarks: safeGet(tag, 'tag_4', 'text') || '',
        });
    }
    return { list, page };
}

export default {
    meta: {
        key: 'vqq',
        name: '🔥腾讯视频',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
