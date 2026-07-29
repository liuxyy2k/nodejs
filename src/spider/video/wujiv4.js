import axios from 'axios';
import { randomUUID } from 'crypto';

/**
 * 无极V4 - AppToV4 API
 * 默认: http://v.2video.cc
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const DEFAULT_HOST = 'http://v.2video.cc';
const DEFAULT_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1';

const PIC_PROXY_RULES = {
    'img.bwcgee.cn': 'http://img.bwcgee.cn/',
};

let host = DEFAULT_HOST;
let localUuid = '';
let config = {};
let parsingConfig = {};

function appHeaders() {
    return {
        'User-Agent': 'Dart/2.19 (dart:io)',
        'Accept-Encoding': 'gzip',
        'appto-local-uuid': localUuid,
    };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/wujiv4/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function fixPic(url, inReq) {
    if (!url) return url;
    for (const domain of Object.keys(PIC_PROXY_RULES)) {
        if (url.includes(domain)) {
            return `${getProxyBase(inReq)}?url=${encodeURIComponent(url)}`;
        }
    }
    return url;
}

function fixVodList(vodList, inReq) {
    return (vodList || []).map((v) => ({
        ...v,
        vod_id: String(v.vod_id ?? ''),
        vod_pic: fixPic(v.vod_pic, inReq),
    }));
}

async function fetchJson(url, opts = {}) {
    const resp = await axios.get(url, {
        timeout: 15_000,
        headers: { ...appHeaders(), ...(opts.headers || {}) },
        params: opts.params,
        validateStatus: () => true,
    });
    return resp.data;
}

async function postForm(url, data) {
    const body = new URLSearchParams(data).toString();
    const resp = await axios.post(url, body, {
        timeout: 15_000,
        headers: {
            ...appHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        validateStatus: () => true,
    });
    return resp.data;
}

function formatFilter(key, name, rawStr) {
    if (!rawStr) return null;
    const items = [{ n: '全部', v: '' }];
    for (const v of String(rawStr).split(',')) {
        if (v.trim()) items.push({ n: v.trim(), v: v.trim() });
    }
    return { key, name, value: items };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    try {
        const extend = inReq.body?.extend ?? inReq.body?.ext ?? '';
        const argHost = String(extend || '').trim();
        host = argHost.startsWith('http') ? argHost.replace(/\/$/, '') : DEFAULT_HOST;

        localUuid = randomUUID();
        const res = await fetchJson(
            `${host}/addons/apptov4/app.php/v1/config/get?p=android&__platform=android`,
        );
        config = res?.data || {};

        const parsingConf = config.get_parsing || [];
        const pc = {};
        for (const i of parsingConf) {
            if (i?.config) {
                const labels = i.config.filter((j) => j?.type === 'json').map((j) => j.label);
                if (labels.length) pc[i.key] = labels;
            }
        }
        parsingConfig = pc;
    } catch (e) {
        console.log(`[wujiv4] 初始化异常：${e.message}`);
    }
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [];
    const filters = {};

    const homeCate = config.get_home_cate || [];
    for (const i of homeCate) {
        const cateId = i?.cate;
        if (cateId != null && String(cateId) !== '0') {
            classes.push({ type_id: String(cateId), type_name: i?.title || '' });
        }
    }

    const types = config.get_type || [];
    if (!classes.length) {
        for (const t of types) {
            if (t?.type_pid === 0 && t?.type_name !== '全部') {
                classes.push({
                    type_id: String(t.type_id),
                    type_name: String(t.type_name || '').trim(),
                });
            }
        }
    }

    for (const t of types) {
        const tId = String(t?.type_id ?? '');
        const extend = t?.type_extend || {};
        const fList = [];
        if (extend.class) {
            const f = formatFilter('type_name', '分类', extend.class);
            if (f) fList.push(f);
        }
        if (extend.area) {
            const f = formatFilter('area', '地区', extend.area);
            if (f) fList.push(f);
        }
        if (extend.year) {
            const f = formatFilter('year', '年份', extend.year);
            if (f) fList.push(f);
        }
        fList.push({
            key: 'order',
            name: '排序',
            value: [
                { n: '最新', v: 'time' },
                { n: '最热', v: 'hits' },
            ],
        });
        filters[tId] = fList;
    }

    return { class: classes, filters };
}

async function homeWithList(inReq, _outResp) {
    const base = await home(inReq, _outResp);
    try {
        const url = `${host}/addons/apptov4/app.php/v1/home/cateData?id=2&__platform=android`;
        const res = await fetchJson(url);
        const vodList = [];
        for (const sec of res?.data?.sections || []) {
            for (const item of sec?.items || []) {
                if (item?.vod_id) {
                    vodList.push({
                        vod_id: String(item.vod_id),
                        vod_name: item.vod_name,
                        vod_pic: fixPic(item.vod_pic, inReq),
                        vod_remarks: item.vod_remarks || item.vod_score || '',
                    });
                }
            }
        }
        return { ...base, list: vodList.slice(0, 30) };
    } catch {
        return { ...base, list: [] };
    }
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = String(inReq.body.page || inReq.body.pg || '1');
    const extend = inReq.body.extend || {};
    const params = {
        type_id: tid,
        page: pg,
        pageSize: 21,
        __platform: 'android',
        type_name: extend.type_name || '',
        area: extend.area || '',
        year: extend.year || '',
        order: extend.order || 'time',
        sort: 'desc',
    };
    const url = `${host}/addons/apptov4/app.php/v1/vod/getLists`;
    const res = await fetchJson(url, { params });
    const data = res?.data || {};
    return {
        list: fixVodList(data.data || [], inReq),
        page: parseInt(pg, 10) || 1,
        total: data.total || 0,
    };
}

async function detail(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const url = `${host}/addons/apptov4/app.php/v1/vod/getVod?id=${id}&__platform=android`;
    const res = await fetchJson(url);
    const data = res?.data || {};
    const vodPlayUrl = [];
    const vodPlayFrom = [];

    for (const i of data.vod_play_list || []) {
        const playFrom = i?.player_info?.from || 'default';
        const playShow = i?.player_info?.show || playFrom;
        const urls = (i?.urls || []).map((j) => `${j.name}$${playFrom}@${j.url}`);
        vodPlayFrom.push(playShow);
        vodPlayUrl.push(urls.join('#'));
    }

    return {
        list: [
            {
                vod_id: data.vod_id,
                vod_name: data.vod_name,
                vod_pic: fixPic(data.vod_pic, inReq),
                vod_content: data.vod_content || '',
                vod_play_from: vodPlayFrom.join('$$$'),
                vod_play_url: vodPlayUrl.join('$$$'),
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = String(inReq.body.pg || inReq.body.page || '1');
    const url = `${host}/addons/apptov4/app.php/v1/vod/getVodSearch?wd=${encodeURIComponent(key)}&page=${pg}&pageSize=20&__platform=android`;
    const res = await fetchJson(url);
    const data = res?.data || {};
    return {
        list: fixVodList(data.data || [], inReq),
        page: parseInt(pg, 10) || 1,
        total: data.total || 0,
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const parts = id.split('@');
    if (parts.length !== 2) {
        return { parse: 0, url: id, header: { 'User-Agent': DEFAULT_UA } };
    }

    const [playfrom, rawurl] = parts;
    const labelList = parsingConfig[playfrom] || ['默认'];

    for (const label of labelList) {
        try {
            const proxyRes = await postForm(
                `${host}/addons/apptov4/app.php/v1/parsing/proxy?__platform=android`,
                { play_url: rawurl, label, key: playfrom },
            );
            if (proxyRes?.code === 1 && proxyRes?.data?.url) {
                const pData = proxyRes.data;
                return {
                    parse: 0,
                    url: pData.url,
                    header: { 'User-Agent': pData.UA || DEFAULT_UA },
                };
            }
        } catch {
            /* try next label */
        }
    }
    return { parse: 1, url: rawurl, header: { 'User-Agent': DEFAULT_UA } };
}

async function proxyHandler(inReq, outResp) {
    try {
        const url = inReq.query.url || '';
        if (!url) return outResp.code(404).type('text/plain').send('');

        let referer = '';
        for (const [domain, ref] of Object.entries(PIC_PROXY_RULES)) {
            if (url.includes(domain)) {
                referer = ref;
                break;
            }
        }

        const r = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                Referer: referer,
            },
            responseType: 'arraybuffer',
            timeout: 15_000,
            validateStatus: () => true,
        });
        if (r.status !== 200) return outResp.code(404).type('text/plain').send('');
        const ct = r.headers['content-type'] || 'image/jpeg';
        return outResp.type(ct).send(Buffer.from(r.data));
    } catch (e) {
        console.log(`[wujiv4] localProxy error: ${e.message}`);
        return outResp.code(404).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 'wujiv4',
        name: '🔥无极V4',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', homeWithList);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
