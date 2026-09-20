import crypto from 'crypto';
import req from '../../util/req.js';

const BASE_HOST = 'https://getav.me';
const STATIC_HOST = 'https://static.worldstatic.com';
const TG_GROUP = 'https://t.me/tvshare23';
const BRAND_ACTOR = '🦋 TG群: @tvshare23';
const BRAND_DIRECTOR = '🦋 蝴蝶影视';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const IMG_REFERER = `${BASE_HOST}/zh`;

let options = {};

function applyConfig(extend) {
    options = {};
    if (!extend) return;
    if (typeof extend === 'object' && extend !== null) {
        options = { ...extend };
        return;
    }
    const raw = String(extend).trim();
    if (!raw) return;
    if (raw.startsWith('{')) {
        try {
            options = JSON.parse(raw);
        } catch {
            /* ignore */
        }
    }
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        if (raw.startsWith('{')) {
            try {
                return JSON.parse(raw);
            } catch {
                return {};
            }
        }
        const out = {};
        for (const part of raw.split('&')) {
            const [k, ...rest] = part.split('=');
            if (k) out[k] = rest.join('=');
        }
        return out;
    }
    return {};
}

function cleanHtmlText(rawHtml) {
    const txt = String(rawHtml || '').replace(/<[^>]+>/g, '');
    return txt
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[\r\n\t\s]+/g, ' ')
        .trim();
}

function formatSeconds(secs) {
    try {
        const s = parseInt(secs, 10);
        if (!Number.isFinite(s) || s <= 0) return '';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    } catch {
        return '';
    }
}

function generateColorCard(text, isCtrl = false) {
    const palette = [
        ['#4f46e5', '#7c3aed'],
        ['#2563eb', '#06b6d4'],
        ['#059669', '#10b981'],
        ['#d97706', '#f59e0b'],
        ['#dc2626', '#ea580c'],
        ['#db2777', '#f43f5e'],
        ['#475569', '#334155'],
        ['#0891b2', '#0284c7'],
    ];
    const nameStr = String(text || 'GetAV').trim();
    let c1;
    let c2;
    if (isCtrl) {
        [c1, c2] = ['#e11d48', '#be123c'];
    } else {
        const hVal = parseInt(crypto.createHash('md5').update(nameStr).digest('hex').slice(0, 4), 16);
        [c1, c2] = palette[hVal % palette.length];
    }
    const displayTitle = nameStr.slice(0, 12);
    const fontSize = displayTitle.length <= 6 ? '40' : displayTitle.length <= 9 ? '32' : '26';
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
        `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
        `<stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>` +
        `<rect width="640" height="360" rx="24" fill="url(#g)"/>` +
        `<text x="50%" y="54%" font-size="${fontSize}" font-family="sans-serif" font-weight="bold" ` +
        `fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${displayTitle}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function apiHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${BASE_HOST}/zh`,
        Origin: BASE_HOST,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Connection: 'keep-alive',
    };
}

async function fetchApi(apiPath, timeout = 20000) {
    const url = apiPath.startsWith('http') ? apiPath : `${BASE_HOST}${apiPath}`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await req.get(url, {
                headers: apiHeaders(),
                timeout,
                validateStatus: () => true,
            });
            if (resp.status >= 400) continue;
            const data = resp.data;
            if (typeof data === 'object' && data !== null) return data;
            if (typeof data === 'string') {
                try {
                    return JSON.parse(data);
                } catch {
                    return {};
                }
            }
            return {};
        } catch {
            if (attempt === 1) return {};
        }
    }
    return {};
}

function imgReferer() {
    return String(options.imgReferer || IMG_REFERER);
}

function absUrl(url) {
    if (!url) return '';
    let pic = String(url).trim();
    if (pic.startsWith('http')) return pic;
    if (pic.startsWith('//')) return `https:${pic}`;
    if (pic.startsWith('/')) return `${STATIC_HOST}${pic}`;
    return pic;
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/getav/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function imageMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 4 && buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

function fetchImgHeaders() {
    return {
        'User-Agent': UA,
        Referer: imgReferer(),
        Origin: BASE_HOST,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function wrapPic(rawUrl, inReq) {
    if (!rawUrl) return '';
    const pic = absUrl(rawUrl);
    if (pic.includes('/img?url=') || pic.includes('@Referer=')) return pic;

    if (inReq && pic.startsWith('http')) {
        const b64 = Buffer.from(pic, 'utf8').toString('base64');
        return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(b64)}`;
    }

    return `${pic}@Referer=${encodeURIComponent(imgReferer())}@User-Agent=${encodeURIComponent(UA)}`;
}

function formatMovieItem(m, inReq) {
    const cid = String(m?.id || '')
        .trim()
        .toLowerCase();
    if (!cid || /^\d+$/.test(cid)) return null;
    const dur = formatSeconds(m?.videoLength);
    return {
        vod_id: cid,
        vod_name: m?.title || cid.toUpperCase(),
        vod_pic: wrapPic(m?.localImg || m?.img, inReq),
        vod_remarks: dur ? `蝴蝶影视 | ${dur}` : '蝴蝶影视',
        style: { type: 'rect', ratio: 1.42 },
    };
}

function buildSubfolderId(subType, targetId, pDict) {
    return (
        `subfolder@@${subType}@@${targetId}` +
        `@@sortBy=${pDict.sortBy}` +
        `@@subtitles=${pDict.subtitles}` +
        `@@resolution=${pDict.resolution}` +
        `@@name=${encodeURIComponent(pDict.name)}`
    );
}

function parseSubfolderId(tid) {
    const parts = String(tid).split('@@');
    const subType = parts[1];
    const targetId = parts[2];
    const pDict = {
        sortBy: subType === 'star' ? 'popular' : 'latest',
        subtitles: '',
        resolution: '',
        name: targetId,
    };
    for (const p of parts.slice(3)) {
        if (p.includes('=')) {
            const [k, ...rest] = p.split('=');
            pDict[k] = decodeURIComponent(rest.join('='));
        }
    }
    return { subType, targetId, pDict };
}

function buildCtrlCards(subType, targetId, pDict) {
    const cards = [];
    const { sortBy: currSort, subtitles: currSub, resolution: currRes, name: subName } = pDict;

    const sortNextMap = {
        popular: ['latest', '最热', '最新'],
        latest: ['duration', '最新', '时长'],
        duration: ['popular', '时长', '最热'],
    };
    const [nextSort, curSortName, nextSortName] = sortNextMap[currSort] || ['popular', currSort, '最热'];
    cards.push({
        vod_id: buildSubfolderId(subType, targetId, { ...pDict, sortBy: nextSort }),
        vod_name: `🔀 排序: ${curSortName} (点击切换)`,
        vod_pic: generateColorCard(`排序:${curSortName}`, true),
        vod_remarks: `切至 ${nextSortName}`,
        vod_tag: 'folder',
        style: { type: 'rect', ratio: 1.42 },
    });

    const nextSub = currSub === 'true' ? '' : 'true';
    const curSubName = currSub === 'true' ? '中文字幕' : '全部版本';
    const nextSubName = currSub === 'true' ? '全部版本' : '中文字幕';
    cards.push({
        vod_id: buildSubfolderId(subType, targetId, { ...pDict, subtitles: nextSub }),
        vod_name: `🔤 字幕: ${curSubName}`,
        vod_pic: generateColorCard(curSubName, true),
        vod_remarks: `切至 ${nextSubName}`,
        vod_tag: 'folder',
        style: { type: 'rect', ratio: 1.42 },
    });

    const nextRes = currRes === '4k' ? '' : '4k';
    const curResName = currRes === '4k' ? '4K超清' : '全部画质';
    const nextResName = currRes === '4k' ? '全部画质' : '4K超清';
    cards.push({
        vod_id: buildSubfolderId(subType, targetId, { ...pDict, resolution: nextRes }),
        vod_name: `💎 画质: ${curResName}`,
        vod_pic: generateColorCard(curResName, true),
        vod_remarks: `切至 ${nextResName}`,
        vod_tag: 'folder',
        style: { type: 'rect', ratio: 1.42 },
    });

    return cards;
}

const VIDEO_FILTERS = [
    {
        key: 'sortBy',
        name: '排序',
        value: [
            { n: '最新', v: 'latest' },
            { n: '最热', v: 'popular' },
            { n: '评分', v: 'rating' },
            { n: '时长', v: 'duration' },
        ],
    },
    {
        key: 'subtitles',
        name: '字幕',
        value: [
            { n: '全部', v: '' },
            { n: '中文字幕', v: 'true' },
        ],
    },
    {
        key: 'resolution',
        name: '画质',
        value: [
            { n: '全部', v: '' },
            { n: '4K超高清', v: '4k' },
        ],
    },
];

const FOLDER_SORT_FILTERS = [
    {
        key: 'sort',
        name: '排序',
        value: [
            { n: '最热', v: 'popular' },
            { n: '名称', v: 'name' },
            { n: '数量', v: 'movies' },
        ],
    },
];

async function categoryContent(tid, pg, extend, inReq) {
    const page = Number.isFinite(pg) && pg > 0 ? pg : 1;
    extend = extend || {};

    if (String(tid).startsWith('folder@@')) {
        const fType = String(tid).replace('folder@@', '');

        if (fType === 'stars') {
            const gender = extend.gender || '2';
            const sortType = extend.sort || 'popular';
            const queryParts = [`page=${page}`, 'limit=24', `sort=${sortType}`, 'locale=zh'];
            if (gender) queryParts.push(`gender=${gender}`);
            const res = await fetchApi(`/api/stars?${queryParts.join('&')}`);
            const dataObj = res.data || {};
            const stars = dataObj.stars || (Array.isArray(res.data) ? res.data : []);
            const vList = [];
            for (const s of stars) {
                const sId = String(s?.id || '').trim();
                const baseName = s?.name || s?.originalName || s?.nameJp || '';
                if (!baseName) continue;
                const count = s?.movieCount || s?.movie_count || '';
                const displayName = count ? `${baseName} (${count}部)` : baseName;
                const remarks = count ? `蝴蝶影视 | ${count}部` : '蝴蝶影视';
                const rawAvatar = s?.localAvatar || s?.avatar || s?.localImg || s?.img;
                const avatar = rawAvatar ? wrapPic(rawAvatar, inReq) : generateColorCard(baseName);
                vList.push({
                    vod_id: buildSubfolderId('star', sId, {
                        sortBy: 'popular',
                        subtitles: '',
                        resolution: '',
                        name: baseName,
                    }),
                    vod_name: displayName,
                    vod_pic: avatar,
                    vod_remarks: remarks,
                    vod_tag: 'folder',
                    style: { type: 'oval', ratio: 1.0 },
                });
            }
            const totalPages = dataObj.pagination?.totalPages || (vList.length >= 24 ? page + 1 : page);
            return { page, pagecount: totalPages, limit: vList.length, total: 5487, list: vList };
        }

        if (fType === 'genres') {
            const sortType = extend.sort || 'popular';
            const res = await fetchApi(`/api/genres?limit=100&sort=${sortType}&locale=zh-CN`);
            const items = res.data?.genres || [];
            const vList = items.map((g) => {
                const gId = String(g?.id || '');
                const name = g?.name || g?.originalName || '';
                const count = g?.movieCount || '';
                return {
                    vod_id: buildSubfolderId('genre', gId, {
                        sortBy: 'latest',
                        subtitles: '',
                        resolution: '',
                        name,
                    }),
                    vod_name: name,
                    vod_pic: generateColorCard(name),
                    vod_remarks: count ? `蝴蝶影视 | ${count}部` : '蝴蝶影视',
                    vod_tag: 'folder',
                    style: { type: 'rect', ratio: 1.78 },
                };
            });
            return { page: 1, pagecount: 1, limit: vList.length, total: vList.length, list: vList };
        }

        if (fType === 'studios') {
            const sortType = extend.sort || 'popular';
            const res = await fetchApi(`/api/studios?limit=100&sort=${sortType}&locale=zh-CN`);
            const studios = res.data?.studios || [];
            const vList = studios.map((st) => {
                const stId = String(st?.id || '');
                const name = st?.name || '';
                const count = st?.movieCount || st?.movie_count || '';
                return {
                    vod_id: buildSubfolderId('studio', stId, {
                        sortBy: 'latest',
                        subtitles: '',
                        resolution: '',
                        name,
                    }),
                    vod_name: name,
                    vod_pic: generateColorCard(name),
                    vod_remarks: count ? `蝴蝶影视 | ${count}部` : '蝴蝶影视',
                    vod_tag: 'folder',
                    style: { type: 'rect', ratio: 1.78 },
                };
            });
            return { page: 1, pagecount: 1, limit: vList.length, total: vList.length, list: vList };
        }

        if (fType === 'codes') {
            const sortType = extend.sort || 'popular';
            const res = await fetchApi(`/api/codes?limit=100&sort=${sortType}&locale=zh-CN`);
            const codes = res.data?.codes || [];
            const vList = codes.map((cd) => {
                const cdCode = String(cd?.code || cd?.name || '')
                    .trim()
                    .toUpperCase();
                const count = cd?.movieCount || cd?.movie_count || '';
                return {
                    vod_id: buildSubfolderId('code', cdCode, {
                        sortBy: 'latest',
                        subtitles: '',
                        resolution: '',
                        name: cdCode,
                    }),
                    vod_name: cdCode,
                    vod_pic: generateColorCard(cdCode),
                    vod_remarks: count ? `蝴蝶影视 | ${count}部` : '蝴蝶影视',
                    vod_tag: 'folder',
                    style: { type: 'rect', ratio: 1.78 },
                };
            });
            return { page: 1, pagecount: 1, limit: vList.length, total: vList.length, list: vList };
        }
    }

    if (String(tid).startsWith('subfolder@@')) {
        const { subType, targetId, pDict } = parseSubfolderId(tid);
        const apiParams = [`page=${page}`, 'limit=40', 'locale=zh', `sortBy=${pDict.sortBy}`];
        if (pDict.subtitles === 'true') apiParams.push('subtitles=true');
        if (pDict.resolution === '4k') apiParams.push('resolution=4k');
        if (subType === 'star') apiParams.push(`starId=${targetId}`);
        else if (subType === 'genre') apiParams.push(`genreId=${targetId}`);
        else if (subType === 'studio') apiParams.push(`studioId=${targetId}`);
        else if (subType === 'code') apiParams.push(`code=${encodeURIComponent(targetId)}`);

        const res = await fetchApi(`/api/movies?${apiParams.join('&')}`);
        const dataObj = res.data || {};
        const movies = dataObj.movies || [];
        const vList = page === 1 ? buildCtrlCards(subType, targetId, pDict) : [];
        for (const m of movies) {
            const item = formatMovieItem(m, inReq);
            if (item) vList.push(item);
        }
        const totalPages = dataObj.pagination?.totalPages || (movies.length >= 40 ? page + 1 : page);
        return { page, pagecount: totalPages, limit: vList.length, total: 9999, list: vList };
    }

    const params = [`page=${page}`, 'limit=40', 'locale=zh'];
    const sortVal = extend.sortBy || 'latest';
    params.push(`sortBy=${sortVal}`);
    if (extend.subtitles === 'true') params.push('subtitles=true');
    if (extend.resolution === '4k') params.push('resolution=4k');

    const cat = String(tid).startsWith('api@@') ? String(tid).replace('api@@', '') : 'latest';
    const res = await fetchApi(`/api/movies?category=${cat}&${params.join('&')}`);
    const dataObj = res.data || {};
    const movies = dataObj.movies || [];
    const vList = movies.map((m) => formatMovieItem(m, inReq)).filter(Boolean);
    const totalPages = dataObj.pagination?.totalPages || (vList.length >= 40 ? page + 1 : page);
    return { page, pagecount: totalPages, limit: vList.length, total: 9999, list: vList };
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return { ok: true };
}

async function home(inReq, _outResp) {
    const classes = [
        { type_name: '🔥 最近更新', type_id: 'api@@latest' },
        { type_name: '📈 热门影片', type_id: 'api@@hot' },
        { type_name: '✨ 新片上市', type_id: 'api@@new-releases' },
        { type_name: '🔞 无码影片', type_id: 'api@@uncensored' },
        { type_name: '🈵 有码影片', type_id: 'api@@censored' },
        { type_name: '🔤 字幕专区', type_id: 'api@@subtitle' },
        { type_name: '💎 4K 超高清', type_id: 'api@@4k' },
        { type_name: '📂 类型大全', type_id: 'folder@@genres' },
        { type_name: '📂 演员大全', type_id: 'folder@@stars' },
        { type_name: '📂 片商大全', type_id: 'folder@@studios' },
        { type_name: '📂 番号系列', type_id: 'folder@@codes' },
    ];

    const filters = {
        'api@@latest': VIDEO_FILTERS,
        'api@@hot': VIDEO_FILTERS,
        'api@@new-releases': VIDEO_FILTERS,
        'api@@uncensored': VIDEO_FILTERS,
        'api@@censored': VIDEO_FILTERS,
        'api@@subtitle': VIDEO_FILTERS,
        'api@@4k': VIDEO_FILTERS,
        'folder@@genres': FOLDER_SORT_FILTERS,
        'folder@@studios': FOLDER_SORT_FILTERS,
        'folder@@codes': FOLDER_SORT_FILTERS,
        'folder@@stars': [
            {
                key: 'gender',
                name: '性别',
                value: [
                    { n: '女优', v: '2' },
                    { n: '男优', v: '1' },
                ],
            },
            {
                key: 'sort',
                name: '排序',
                value: [
                    { n: '最热', v: 'popular' },
                    { n: '最新', v: 'latest' },
                    { n: '数量', v: 'movies' },
                    { n: '名称', v: 'name' },
                ],
            },
        ],
    };

    const res = await fetchApi('/api/movies?category=latest&sortBy=latest&limit=20&page=1&locale=zh');
    const movies = res.data?.movies || [];
    const list = movies.map((m) => formatMovieItem(m, inReq)).filter(Boolean);

    return { class: classes, filters, list };
}

async function category(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const tid = inReq.body.tid || inReq.body.id || '';
    const pg = parseInt(inReq.body.page, 10) || 1;
    const extend = parseExtend(inReq.body.filters || inReq.body.filter || inReq.body.extend || {});
    return categoryContent(tid, pg, extend, inReq);
}

async function detail(inReq, _outResp) {
    const rawId = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;

    if (String(rawId).startsWith('subfolder@@')) {
        return categoryContent(rawId, 1, {}, inReq);
    }

    const code = String(rawId || '')
        .trim()
        .toLowerCase();
    const res = await fetchApi(`/api/movies/${encodeURIComponent(code)}`);
    const data = res.data || {};

    const title = data.title || code.toUpperCase();
    const poster = wrapPic(data.localImg || data.img, inReq);

    const actorNames = (data.stars || []).map((a) => cleanHtmlText(a?.name)).filter(Boolean);
    const actorStr = actorNames.length ? actorNames.join(', ') : BRAND_ACTOR;

    const genreNames = (data.genres || []).map((g) => cleanHtmlText(g?.name)).filter(Boolean);
    const typeStr = genreNames.length ? genreNames.join(' / ') : '情色';

    const durStr = formatSeconds(data.videoLength);
    const remarks = durStr ? `蝴蝶影视 | ${durStr}` : '蝴蝶影视';

    const desc = data.description || title;
    const fullContent =
        `【🔥 官方交流群: ${TG_GROUP}】\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `番号: ${code.toUpperCase()}\n` +
        `片名: ${title}\n` +
        `时长: ${durStr}\n` +
        `发行: ${String(data.date || '').slice(0, 10)}\n` +
        `简介: ${desc}`;

    const labelMap = {
        raw_1080p: '正片 1080P',
        raw_720p: '高清 720P',
        raw_480p: '标清 480P',
        raw_240p: '流畅 240P',
    };
    const playLines = [];
    for (const vs of data.videoSources || []) {
        const sUrl = vs?.url || '';
        const sType = vs?.type || '';
        if (sUrl) {
            const tLabel = labelMap[sType] || sType || '默认线路';
            playLines.push(`${tLabel}$${sUrl}`);
        }
    }
    if (!playLines.length) {
        if (data.localM3u8Path4k) playLines.push(`超清 4K$${data.localM3u8Path4k}`);
        if (data.localM3u8Path) playLines.push(`高清 1080P$${data.localM3u8Path}`);
        if (data.localM3u8PathUc) playLines.push(`无码专线$${data.localM3u8PathUc}`);
    }

    let previewUrl = data.previewVideoUrl;
    if (previewUrl) {
        if (!previewUrl.startsWith('http')) previewUrl = `${STATIC_HOST}${previewUrl}`;
        playLines.push(`精彩预告$${previewUrl}`);
    }

    const playUrlStr = playLines.length ? playLines.join('#') : '暂无可用线路$http://127.0.0.1';

    return {
        list: [
            {
                vod_id: code,
                vod_name: title,
                vod_pic: poster,
                type_name: typeStr,
                vod_year: String(data.date || '').slice(0, 4),
                vod_area: '日本',
                vod_remarks: remarks,
                vod_actor: actorStr,
                vod_director: BRAND_DIRECTOR,
                vod_content: fullContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                vod_play_from: '蝴蝶影视专线',
                vod_play_url: playUrlStr,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const playUrl = String(inReq.body.id || inReq.body.url || '').trim();
    return {
        parse: 0,
        jx: 0,
        url: playUrl,
        header: {
            'User-Agent': UA,
            Referer: `${BASE_HOST}/zh`,
            Origin: BASE_HOST,
        },
    };
}

async function search(inReq, _outResp) {
    const page = parseInt(inReq.body.page, 10) || 1;
    const key = encodeURIComponent(String(inReq.body.wd || inReq.body.key || '').trim());
    const res = await fetchApi(`/api/movies?q=${key}&sortBy=latest&limit=40&page=${page}&locale=zh`);
    const dataObj = res.data || {};
    const movies = dataObj.movies || [];
    const list = movies.map((m) => formatMovieItem(m, inReq)).filter(Boolean);
    const totalPages = dataObj.pagination?.totalPages || (list.length >= 40 ? page + 1 : page);
    return { page, pagecount: totalPages, limit: list.length, total: 9999, list };
}

async function imgProxy(inReq, reply) {
    try {
        let imgB64 = inReq.query.url || '';
        try {
            imgB64 = decodeURIComponent(imgB64);
        } catch {
            /* ignore */
        }
        const pad = (4 - (imgB64.length % 4)) % 4;
        if (pad) imgB64 += '='.repeat(pad);
        const imgUrl = Buffer.from(imgB64, 'base64').toString('utf8');
        if (!imgUrl || !imgUrl.startsWith('http')) return reply.code(404).send('');

        const resp = await req.get(imgUrl, {
            headers: fetchImgHeaders(),
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data) return reply.code(404).send('');

        const body = Buffer.from(resp.data);
        return reply.code(200).header('Content-Type', imageMime(body)).send(body);
    } catch (e) {
        console.warn('[getav] imgProxy err', e.message);
        return reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'getav',
        name: '🔥GetAV',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgProxy);
    },
};
