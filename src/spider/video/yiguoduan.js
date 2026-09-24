import req from '../../util/req.js';
import { SITES_CONFIG_DATA, TOP_CLASSES } from './yiguoduanSites.js';

/**
 * 🦋 一锅端·12站实测 — 聚合 API
 * 后端: https://av.telstra.com.cv
 */

const DEFAULT_SITE = 'https://av.telstra.com.cv';
const TG_GROUP = 'https://t.me/tvshare23';
const BRAND_ACTOR = '🦋 TG群: @tvshare23';
const BRAND_DIRECTOR = '🦋 蝴蝶影视';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const SHORT_PRIORITY = ['huangdou', 'kuangbiao', 'yidouge', 'xifu', 'xingya'];
const SEARCH_TARGETS = [
    'cj', 'imaoyou', 'iyf', 'huangdou', 'xifu', 'xingya',
    'yidouge', 'kuangbiao', 'asmrhoney', 'avxq', 'b8xx6', 'djuu',
];
const DIRECT_PASS_DOMAINS = [
    'asmrhoney.com', 'cdn202511.com', 'pic.892539.xyz', 'cdn-xj.cc',
    'img.picbf.com', 'hongniuzyimage.com', 'cjysw.cc', 'img.djuu.com',
    'cloudfront.net', 'shorttv.online', 'contentchina.com',
    'rongjuwh.cn', 'images.weserv.nl',
];

let siteUrl = DEFAULT_SITE;
let options = {};

function applyConfig(extend) {
    options = {};
    if (!extend) return;
    if (typeof extend === 'object' && extend !== null) {
        options = { ...extend };
    } else {
        const raw = String(extend).trim();
        if (raw.startsWith('{')) {
            try {
                options = JSON.parse(raw);
            } catch {
                /* ignore */
            }
        } else if (raw.startsWith('http')) {
            options = { site: raw };
        }
    }
    const h = options.site || options.siteUrl || options.base || '';
    if (h) siteUrl = String(h).replace(/\/$/, '');
}

function fetchHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${siteUrl}/`,
        Accept: '*/*',
        Connection: 'keep-alive',
    };
}

async function fetchJson(url, timeout = 8000) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await req.get(url, {
                headers: fetchHeaders(),
                timeout,
                responseType: 'text',
                validateStatus: () => true,
            });
            if (resp.status >= 400) continue;
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            try {
                return JSON.parse(text || '{}');
            } catch {
                return {};
            }
        } catch {
            /* retry */
        }
    }
    return {};
}

async function fetchBytes(url, timeout = 8000) {
    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(),
            timeout,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        return {
            code: resp.status || 200,
            body: Buffer.from(resp.data || []),
        };
    } catch {
        return { code: -1, body: Buffer.alloc(0) };
    }
}

function formatRemarks(meta = '') {
    const cleanMeta = String(meta || '').replace(/[\r\n\t]+/g, ' ').trim();
    return cleanMeta ? `蝴蝶影视 | ${cleanMeta}` : '蝴蝶影视';
}

function dummyPic(text) {
    return `https://dummyimage.com/400x600/1e293b/ffffff.png&text=${encodeURIComponent(text)}`;
}

function universalPic(srcKey, rawPic) {
    if (!rawPic) return dummyPic(String(srcKey || 'NA').toUpperCase());
    let pic = String(rawPic).trim();

    if (srcKey === 'cj' && pic.startsWith('/upload/')) {
        return `https://cjysw.cc${pic}`;
    }
    if (pic.startsWith('//')) pic = `https:${pic}`;
    else if (pic.startsWith('/') && !pic.startsWith('/api/')) pic = `${siteUrl}${pic}`;

    if (DIRECT_PASS_DOMAINS.some((d) => pic.includes(d))) return pic;
    return `${siteUrl}/api/v1/spiders/${srcKey}/proxy?type=img&url=${encodeURIComponent(pic)}`;
}

function getSpidersForPlat(platId) {
    const matched = [];
    for (const [skey, sinfo] of Object.entries(SITES_CONFIG_DATA)) {
        const spPlat = sinfo.platform;
        if (platId === 'all' || spPlat === platId) {
            matched.push({
                key: skey,
                name: sinfo.name || skey,
                cat_count: (sinfo.categories || []).length,
            });
        }
    }
    if (platId === 'short') {
        matched.sort((a, b) => {
            const ia = SHORT_PRIORITY.indexOf(a.key);
            const ib = SHORT_PRIORITY.indexOf(b.key);
            return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99);
        });
    }
    return matched;
}

function buildFolderItems(platId) {
    return getSpidersForPlat(platId).map((sp) => {
        const skey = sp.key;
        const cats = SITES_CONFIG_DATA[skey]?.categories || [];
        let initTarget = `site/${skey}`;
        if (cats.length) initTarget = `site/${skey}/cat/${encodeURIComponent(cats[0].v)}`;
        return {
            vod_id: initTarget,
            vod_name: `📁 ${sp.name}`,
            vod_pic: dummyPic(skey.toUpperCase()),
            vod_remarks: `${sp.cat_count}个细分类`,
            vod_tag: 'folder',
            style: { type: 'rect', ratio: 1.78 },
        };
    });
}

function parseSitePath(tidStr) {
    const cleanPath = String(tidStr).trim().replace(/^\/+/, '').replace(/^site\//, '');
    if (cleanPath.includes('/cat/')) {
        const [srcKey, sub] = cleanPath.split('/cat/');
        return { srcKey, targetSubTid: decodeURIComponent(sub) };
    }
    return { srcKey: cleanPath, targetSubTid: '' };
}

function isVideoFormat(url) {
    const low = String(url || '').toLowerCase();
    return ['.m3u8', '.mp4', '.mp3', '.m4a', '.flv', '.mkv', '.avi', '.ts', '.mpd', 'index.png'].some((k) =>
        low.includes(k),
    );
}

async function categoryContent(tid, page) {
    const tidStr = String(tid || '').trim().replace(/^\/+/, '');

    if (['all', 'adult', 'drama', 'short', 'anime', 'audio'].includes(tidStr)) {
        const folderItems = buildFolderItems(tidStr);
        return {
            page: 1,
            pagecount: 1,
            limit: folderItems.length,
            total: folderItems.length,
            list: folderItems,
        };
    }

    const { srcKey, targetSubTid: initialSub } = parseSitePath(tidStr);
    const siteInfo = SITES_CONFIG_DATA[srcKey] || {};
    const validCats = siteInfo.categories || [];

    let currentIdx = 0;
    let targetSubTid = initialSub;
    let curCatName = '默认';

    if (validCats.length) {
        for (let idx = 0; idx < validCats.length; idx++) {
            if (validCats[idx].v === targetSubTid) {
                currentIdx = idx;
                break;
            }
        }
        if (!targetSubTid) targetSubTid = validCats[0].v;
        curCatName = validCats[currentIdx]?.n || '默认';
    } else if (!targetSubTid) {
        targetSubTid = '1';
    }

    const vodList = [];
    if (page === 1 && validCats.length > 1) {
        const nextIdx = (currentIdx + 1) % validCats.length;
        const nextCat = validCats[nextIdx];
        vodList.push({
            vod_id: `site/${srcKey}/cat/${encodeURIComponent(nextCat.v)}`,
            vod_name: `🔄【当前: ${curCatName}】`,
            vod_pic: 'https://dummyimage.com/400x600/3b82f6/ffffff.png&text=SWITCH',
            vod_remarks: `点我瞬切: ${nextCat.n} (${currentIdx + 1}/${validCats.length})`,
            vod_tag: 'folder',
            style: { type: 'rect', ratio: 1.78 },
        });
    }

    try {
        const catUrl = `${siteUrl}/api/v1/spiders/${srcKey}/category?tid=${encodeURIComponent(String(targetSubTid))}&pg=${page}`;
        const data = await fetchJson(catUrl);
        let items = data.list || [];

        if (!items.length && page === 1) {
            const homeData = await fetchJson(`${siteUrl}/api/v1/spiders/${srcKey}/home`);
            items = homeData.list || [];
        }

        for (const item of items) {
            const vId = String(item.id || item.vod_id || '');
            const vName = item.name || item.vod_name || '未知片名';
            const pic = universalPic(srcKey, item.pic || item.vod_pic || '');
            const rawMeta = item.remarks || item.vod_remarks || item.duration || item.vod_duration || '';
            vodList.push({
                vod_id: `${srcKey}@@${vId}`,
                vod_name: vName,
                vod_pic: pic,
                vod_remarks: formatRemarks(rawMeta),
                style: { type: 'rect', ratio: 1.78 },
            });
        }

        const pageCount = parseInt(data.pagecount, 10) || 1;
        const total = parseInt(data.total, 10) || vodList.length;
        return {
            page,
            pagecount: pageCount > 0 ? pageCount : 1,
            limit: vodList.length,
            total,
            list: vodList,
        };
    } catch {
        return {
            page: 1,
            pagecount: 1,
            limit: 1,
            total: 1,
            list: [{
                vod_id: `site/${srcKey}`,
                vod_name: '⚠️ 源站暂无数据或超时',
                vod_pic: 'https://dummyimage.com/400x600/7f1d1d/ffffff.png&text=EMPTY',
                vod_remarks: '请换其他源站',
                vod_tag: 'folder',
                style: { type: 'rect', ratio: 1.78 },
            }],
        };
    }
}

function parsePlayParts(raw) {
    if (!String(raw).includes('@@')) {
        return { srcKey: 'cj', realId: String(raw), epTarget: String(raw) };
    }
    const parts = String(raw).split('@@');
    return {
        srcKey: parts[0] || 'cj',
        realId: parts[1] || '',
        epTarget: parts[2] ? decodeURIComponent(parts[2]) : parts[1] || '',
    };
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return { ok: true };
}

async function home(_inReq, _outResp) {
    return { class: TOP_CLASSES, filters: {}, list: [] };
}

async function category(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const tid = inReq.body.tid || inReq.body.id || 'all';
    const page = parseInt(inReq.body.page, 10) || 1;
    return categoryContent(tid, page);
}

async function detail(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let rawId = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    rawId = String(rawId || '');

    if (rawId.startsWith('site/')) {
        return categoryContent(rawId, 1);
    }

    let srcKey = 'cj';
    let realId = rawId;
    if (rawId.includes('@@')) {
        const parts = rawId.split('@@', 2);
        srcKey = parts[0];
        realId = parts[1];
    }

    const data = await fetchJson(`${siteUrl}/api/v1/spiders/${srcKey}/detail?id=${encodeURIComponent(realId)}`);
    let v = data;
    if (Array.isArray(data.list) && data.list.length) v = data.list[0];
    else if (data.data && typeof data.data === 'object') v = data.data;

    const vName = v?.name || v?.vod_name || realId;
    const vPic = universalPic(srcKey, v?.pic || v?.vod_pic || '');
    const vContent = v?.content || v?.vod_content || '蝴蝶聚合源站极速穿透播放。';
    const vCategory = v?.category || v?.type_name || '';
    const vRemarks = formatRemarks(v?.remarks || v?.vod_remarks || '');

    const fullContent =
        `【🦋 官方交流群: ${TG_GROUP}】\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `【当前源站】: ${srcKey.toUpperCase()}\n` +
        `【影片类别】: ${vCategory}\n` +
        vContent;

    const playEntries = [];
    const episodes = v?.episodes || [];
    if (episodes.length) {
        for (const ep of episodes) {
            const epName = String(ep.name || '正片').replace(/[$#]/g, '_');
            const epVal = String(ep.id || ep.url || realId);
            playEntries.push(`${epName}$${srcKey}@@${realId}@@${encodeURIComponent(epVal)}`);
        }
    } else if (v?.vod_play_url) {
        for (const subP of String(v.vod_play_url).split('#')) {
            let epName = '正片';
            let epVal = subP;
            if (subP.includes('$')) [epName, epVal] = subP.split('$', 2);
            playEntries.push(`${epName.replace(/[$#]/g, '_')}$${srcKey}@@${realId}@@${encodeURIComponent(epVal)}`);
        }
    } else {
        playEntries.push(`正片$${srcKey}@@${realId}@@${encodeURIComponent(realId)}`);
    }

    return {
        list: [{
            vod_id: rawId,
            vod_name: vName,
            vod_pic: vPic,
            vod_type: vCategory,
            vod_remarks: vRemarks,
            vod_actor: BRAND_ACTOR,
            vod_director: BRAND_DIRECTOR,
            vod_content: fullContent,
            vod_play_from: `蝴蝶·${srcKey.toUpperCase()}`,
            vod_play_url: playEntries.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();

    const { srcKey, realId, epTarget } = parsePlayParts(raw);
    let cleanId = realId;
    if (cleanId.includes('/') && !cleanId.startsWith('http')) {
        cleanId = cleanId.replace(/\/$/, '').split('/').pop().replace('.html', '');
    }

    const playParamId =
        epTarget.startsWith('http') || /[-|@]/.test(epTarget) ? epTarget : cleanId;
    const playData = await fetchJson(
        `${siteUrl}/api/v1/spiders/${srcKey}/play?id=${encodeURIComponent(playParamId)}`,
        15000,
    );

    let finalUrl = epTarget;
    const header = {
        'User-Agent': UA,
        Referer: `${siteUrl}/`,
    };
    let needParse = 0;

    if (playData.url) {
        finalUrl = String(playData.url).trim();
    }
    if (playData.header && typeof playData.header === 'object') {
        Object.assign(header, playData.header);
    }
    needParse = parseInt(playData.parse, 10) || 0;

    if (srcKey === 'cj') header.Referer = 'https://cjysw.cc/';
    if (srcKey === 'xifu') header.Referer = 'https://minidrama.contentchina.com/';

    if (finalUrl.startsWith('/api/v1/spiders/')) {
        finalUrl = `${siteUrl}${finalUrl}`;
        needParse = 0;
    }

    if (isVideoFormat(finalUrl) || ['.mp3', '.m4a', '.aac', '.wav'].some((k) => finalUrl.toLowerCase().includes(k))) {
        needParse = 0;
    }

    return {
        parse: needParse,
        playUrl: '',
        url: finalUrl,
        jx: 0,
        header,
    };
}

async function search(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const page = parseInt(inReq.body.page, 10) || 1;
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    if (page > 1 || !key) {
        return { page, pagecount: page, limit: 0, total: 0, list: [] };
    }

    const aggregated = [];
    for (const sKey of SEARCH_TARGETS) {
        const data = await fetchJson(
            `${siteUrl}/api/v1/spiders/${sKey}/search?wd=${encodeURIComponent(key)}&pg=1`,
            4000,
        );
        const items = data.list || [];
        for (const item of items.slice(0, 4)) {
            const vId = String(item.id || item.vod_id || '');
            const vName = item.name || item.vod_name || '';
            aggregated.push({
                vod_id: `${sKey}@@${vId}`,
                vod_name: `[${sKey.toUpperCase()}] ${vName}`,
                vod_pic: universalPic(sKey, item.pic || item.vod_pic || ''),
                vod_remarks: formatRemarks(item.remarks || item.vod_remarks || ''),
                style: { type: 'rect', ratio: 1.78 },
            });
        }
    }

    return {
        page,
        pagecount: 1,
        limit: aggregated.length,
        total: aggregated.length,
        list: aggregated,
    };
}

function imageMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 3 && buf.subarray(0, 3).toString() === 'GIF') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

async function proxyHandler(inReq, reply) {
    const url = inReq.query.url || inReq.query.do || '';
    if (!url) return reply.code(404).header('Content-Type', 'text/plain; charset=utf-8').send('Missing url parameter');

    const { code, body } = await fetchBytes(url);
    if (!body.length) return reply.code(code >= 400 ? code : 404).send('');

    return reply
        .code(code >= 200 && code < 400 ? code : 200)
        .header('Content-Type', imageMime(body))
        .header('Access-Control-Allow-Origin', '*')
        .send(body);
}

export default {
    meta: {
        key: 'yiguoduan',
        name: '🦋一锅端·12站实测',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
