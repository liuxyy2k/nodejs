import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

const site    = 'https://v.qq.com';
const apiHost = 'https://pbaccess.video.qq.com';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5410.0 Safari/537.36',
    origin:       site,
    referer:      `${site}/`,
};

const PAGE_API = `${apiHost}/trpc.universal_backend_service.page_server_rpc.PageServer/GetPageData?video_appid=1000005&vplatform=2&vversion_name=8.9.10&new_mark_label_enabled=1`;
const DETAIL_API = `${apiHost}/trpc.universal_backend_service.page_server_rpc.PageServer/GetPageData?video_appid=3000010&vplatform=2&vversion_name=8.2.96`;

const DEFAULT_BODY = {
    page_params: {
        channel_id:    '',
        filter_params: 'sort=75',
        page_type:     'channel_operation',
        page_id:       'channel_list_second_page',
    },
};

// 记录翻页 context
let pageContext = null;

const http = axios.create({ timeout: 15_000, headers: HEADERS });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonToParams(params) {
    return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

function safeParseJson(str) {
    try { return JSON.parse(str || '{}'); } catch { return {}; }
}

async function getVdata(body) {
    try {
        const { data } = await http.post(DETAIL_API, body);
        return data;
    } catch {
        return { data: { module_list_datas: [] } };
    }
}

async function getFilterData(cid) {
    const body = JSON.parse(JSON.stringify(DEFAULT_BODY));
    body.page_params.channel_id = cid;
    const { data } = await http.post(PAGE_API, body);
    return [cid, data];
}

function processPdata(pdata, ids) {
    const plist = [], ylist = [];
    for (const k of pdata) {
        if (k.item_id) {
            const pid = `${k.item_params.union_title}$${ids[0]}@${k.item_id}`;
            if (k.item_params.union_title.includes('预告')) ylist.push(pid);
            else plist.push(pid);
        }
    }
    return [plist, ylist];
}

function buildVod(vdata, actors, plist, ylist, names) {
    const d    = vdata.data.module_list_datas[0].module_datas[0].item_data_lists.item_datas[0].item_params;
    const urls = [];
    if (plist.length) urls.push(plist.join('#'));
    if (ylist.length) urls.push(ylist.join('#'));
    return {
        type_name:     d.sub_genre     || '',
        vod_name:      d.title         || '',
        vod_year:      d.year          || '',
        vod_area:      d.area_name     || '',
        vod_remarks:   d.holly_online_time || d.hotval || '',
        vod_actor:     actors.join(','),
        vod_content:   d.cover_description || '',
        vod_play_from: names.join('$$$'),
        vod_play_url:  urls.join('$$$'),
    };
}

async function processTabs(data, body, ids) {
    try {
        let pdata = data.data.module_list_datas.at(-1).module_datas.at(-1).item_data_lists.item_datas;
        const rawTabs = data.data.module_list_datas.at(-1).module_datas.at(-1).module_params?.tabs;
        const tabs    = rawTabs ? safeParseJson(rawTabs) : [];

        if (tabs.length > 1) {
            const remaining = tabs.slice(1);
            const results = await Promise.all(remaining.map((tab) => {
                const nbody = JSON.parse(JSON.stringify(body));
                nbody.page_params.page_context = tab.page_context;
                return getVdata(nbody);
            }));
            for (const result of results) {
                if (result) {
                    const extra = result.data.module_list_datas.at(-1).module_datas.at(-1).item_data_lists.item_datas;
                    pdata = [...pdata, ...extra];
                }
            }
        }
        return pdata;
    } catch {
        return [];
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    pageContext = null;
    return {};
}

async function home(_inReq, _outResp) {
    const cdata = {
        '电视剧': '100113', '电影':  '100173', '综艺':  '100109',
        '纪录片': '100105', '动漫':  '100119', '少儿':  '100150', '短剧': '110755',
    };

    const classes = Object.entries(cdata).map(([k, v]) => ({ type_id: v, type_name: k }));

    // 并发获取所有分类的筛选器
    const filterResults = await Promise.all(classes.map((c) => getFilterData(c.type_id)));
    const filters = {};
    for (const [cid, data] of filterResults) {
        try {
            const items = data.data.module_list_datas.at(-1).module_datas.at(-1).item_data_lists.item_datas;
            const filterDict = {};
            for (const item of items) {
                if (!item.item_params?.index_item_key) continue;
                const p   = item.item_params;
                const key = p.index_item_key;
                if (!filterDict[key]) filterDict[key] = { key, name: p.index_name, value: [] };
                filterDict[key].value.push({ n: p.option_name, v: p.option_value });
            }
            filters[cid] = Object.values(filterDict);
        } catch { /* ignore */ }
    }

    // 首页推荐
    let list = [];
    try {
        const { data: html } = await http.get(site);
        const $    = cheerio.load(html);
        let   jstr = '';
        $('script').each((_, el) => {
            const t = $(el).html() || '';
            if (t.includes('window.__INITIAL_STATE__')) { jstr = t; return false; }
        });
        if (jstr) {
            const idx = jstr.indexOf('=');
            const sd  = JSON.parse(jstr.slice(idx + 1));
            const map = sd?.storeModulesData?.channelsModulesMap?.choice?.cardListData || [];
            for (const its of map) {
                for (const it of its?.children_list?.list?.cards || []) {
                    const p   = it?.params;
                    if (!p) continue;
                    const tag  = safeParseJson(p.uni_imgtag || p.imgtag);
                    const id   = it.id || p.cid;
                    const name = p.mz_title || p.title;
                    if (name && id && !id.includes('http')) {
                        list.push({ vod_id: id, vod_name: name, vod_pic: p.image_url,
                                    vod_year: tag.tag_2?.text, vod_remarks: tag.tag_4?.text });
                    }
                }
            }
        }
    } catch { /* ignore */ }

    return { class: classes, filters, list };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 1;
    const extend = inReq.body.extend || {};

    const params = {
        sort:      extend.sort      || '75',
        attr:      extend.attr      || '-1',
        itype:     extend.itype     || '-1',
        ipay:      extend.ipay      || '-1',
        iarea:     extend.iarea     || '-1',
        iyear:     extend.iyear     || '-1',
        theater:   extend.theater   || '-1',
        award:     extend.award     || '-1',
        recommend: extend.recommend || '-1',
    };

    const body = JSON.parse(JSON.stringify(DEFAULT_BODY));
    body.page_params.channel_id    = tid;
    body.page_params.filter_params = jsonToParams(params);
    if (pg > 1 && pageContext) body.page_context = pageContext;

    const { data } = await http.post(PAGE_API, body);
    const ndata = data.data;

    let pagecount;
    if (ndata.has_next_page) {
        pagecount   = 9999;
        pageContext = ndata.next_page_context;
    } else {
        pagecount   = pg;
        pageContext = null;
    }

    const list = [];
    for (const its of ndata.module_list_datas.at(-1).module_datas.at(-1).item_data_lists.item_datas) {
        const id = its.item_params?.cid;
        if (!id) continue;
        const p   = its.item_params;
        const tag = safeParseJson(p.uni_imgtag || p.imgtag);
        list.push({
            vod_id:      id,
            vod_name:    p.mz_title || p.title,
            vod_pic:     p.new_pic_hz || p.new_pic_vt,
            vod_year:    tag.tag_2?.text,
            vod_remarks: tag.tag_4?.text,
        });
    }

    return { page: pg, pagecount, limit: 90, total: 999999, list };
}

async function detail(inReq, _outResp) {
    const ids = [inReq.body.id];

    const vbody = {
        page_params: {
            req_from: 'web', cid: ids[0], vid: '', lid: '',
            page_type: 'detail_operation', page_id: 'detail_page_introduction',
        },
        has_cache: 1,
    };

    const epBody = {
        page_params: {
            req_from: 'web_vsite', page_id: 'vsite_episode_list',
            page_type: 'detail_operation', id_type: '1',
            page_size: '', cid: ids[0], vid: '', lid: '',
            page_num: '', page_context: '', detail_page_type: '1',
        },
        has_cache: 1,
    };

    const [vdata, epData] = await Promise.all([getVdata(vbody), getVdata(epBody)]);
    const pdata = await processTabs(epData, epBody, ids);
    if (!pdata?.length) return { list: [{ vod_play_from: '哎呀翻车啦', vod_play_url: '翻车啦#555' }] };

    try {
        const starList = vdata.data.module_list_datas[0].module_datas[0].item_data_lists.item_datas[0]
            .sub_items?.star_list?.item_datas || [];
        const actors = starList.map((s) => s.item_params.name);

        const [plist, ylist] = processPdata(pdata, ids);
        const names = [];
        if (plist.length) names.push('腾讯视频');
        if (ylist.length) names.push('预告片');

        return { list: [buildVod(vdata, actors, plist, ylist, names)] };
    } catch (e) {
        console.error('detail error:', e.message);
        return { list: [{ vod_play_from: '哎呀翻车啦', vod_play_url: '翻车啦#555' }] };
    }
}

async function play(inReq, _outResp) {
    const ids      = inReq.body.id.split('@');
    const url      = `${site}/x/cover/${ids[0]}/${ids[1]}.html`;
    const parseUrl = `https://jx.xmflv.com/?url=${url}`;
    return { parse: 1, url: parseUrl, header: '' };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;

    const body = {
        version: '24072901', clientType: 1, filterValue: '', uuid: uuidv4(),
        retry: 0, query: key, pagenum: pg - 1, pagesize: 30, queryFrom: 0,
        searchDatakey: '', transInfo: '', isneedQc: true, preQid: '',
        adClientInfo: '', extraInfo: { isNewMarkLabel: '1', multi_terminal_pc: '1' },
    };

    const { data } = await http.post(
        `${apiHost}/trpc.videosearch.mobile_search.MultiTerminalSearch/MbSearch?vplatform=2`, body
    );

    const list = [];
    for (const k of data.data.areaBoxList.at(-1).itemList) {
        if (!k.doc?.id) continue;
        const tag = safeParseJson(k.videoInfo?.imgTag);
        list.push({
            vod_id:      k.doc.id,
            vod_name:    k.videoInfo.title,
            vod_pic:     k.videoInfo?.imgUrl || '',
            vod_year:    tag.tag_2?.text || '',
            vod_remarks: tag.tag_4?.text || '',
        });
    }

    return { list, page: pg };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'qqvideo',
        name: '🔥腾讯视频',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};