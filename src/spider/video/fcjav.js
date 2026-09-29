import req from '../../util/req.js';

/**
 * FCJAV · fcjav.com
 * 修复业余/减薄马赛克分类路由及多维筛选
 */

const HOST = 'https://fcjav.com';
const TG_GROUP = 'https://t.me/tvshare23';
const BRAND_ACTOR = '🦋 TG群: @tvshare23';
const BRAND_DIRECTOR = '🦋 蝴蝶影视';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: 'movies?genre=censored', type_name: '有码 (Censored)' },
    { type_id: 'movies?genre=uncensored', type_name: '无码 (Uncensored)' },
    { type_id: 'movies', type_name: '最新/全部' },
    { type_id: 'movies?genre=amateur', type_name: '业余' },
    { type_id: 'movies?genre=reducing-mosaic', type_name: '减薄马赛克' },
    { type_id: 'genre/uncensored-leaked', type_name: '无码流出' },
    { type_id: 'label/s1-no-1-style', type_name: 'S1 NO.1' },
    { type_id: 'label/madonna', type_name: 'Madonna' },
    { type_id: 'label/moodyz-diva', type_name: 'MOODYZ' },
    { type_id: 'label/sod-star', type_name: 'SOD star' },
    { type_id: 'label/hhh-group', type_name: 'HHH Group' },
    { type_id: 'label/oppai', type_name: 'OPPAI' },
    { type_id: 'label/glory-quest', type_name: 'GLORY QUEST' },
    { type_id: 'label/tissue', type_name: 'Tissue' },
    { type_id: 'label/honnaka', type_name: 'Honnaka' },
    { type_id: 'label/fitch', type_name: 'Fitch' },
    { type_id: 'label/das', type_name: 'Das' },
    { type_id: 'genre/amateur', type_name: '素人' },
    { type_id: 'genre/anal', type_name: '肛交' },
    { type_id: 'genre/av-idol', type_name: 'AV女优' },
    { type_id: 'genre/beautiful-girl', type_name: '美少女' },
    { type_id: 'genre/big-tits', type_name: '巨乳' },
    { type_id: 'genre/blowjob', type_name: '口交' },
    { type_id: 'genre/cosplay', type_name: 'Cosplay' },
    { type_id: 'genre/creampie', type_name: '中出' },
    { type_id: 'genre/cumshot', type_name: '颜射' },
    { type_id: 'genre/bondage', type_name: '束缚' },
];

const FILTER_CONFIG = [
    {
        key: 'sort',
        name: '排序',
        init: 'desc',
        value: [
            { n: '最新更新', v: 'desc' },
            { n: '发布日期', v: 'release' },
            { n: '最多观看', v: 'viewed' },
            { n: '最受喜欢', v: 'liked' },
            { n: '最多收藏', v: 'favorite' },
            { n: '最早更新', v: 'asc' },
        ],
    },
    {
        key: 'quality',
        name: '清晰度',
        init: 'all',
        value: [
            { n: '全部', v: 'all' },
            { n: '高清(HD)', v: 'hd' },
            { n: '普清(SD)', v: 'sd' },
        ],
    },
    {
        key: 'year',
        name: '年份',
        init: 'all',
        value: [
            { n: '全部', v: 'all' },
            { n: '2026', v: '2026' },
            { n: '2025', v: '2025' },
            { n: '2024', v: '2024' },
            { n: '2023', v: '2023' },
            { n: '2022', v: '2022' },
        ],
    },
];

const FILTERS = Object.fromEntries(
    CLASSES.filter((c) => c.type_id.startsWith('movies')).map((c) => [c.type_id, FILTER_CONFIG]),
);

function fetchHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${HOST}/`,
    };
}

async function fetchHtml(url, extraHeaders = {}) {
    if (!url) return '';
    try {
        const resp = await req.get(url, {
            headers: { ...fetchHeaders(), ...extraHeaders },
            timeout: 15000,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status === 200) {
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        }
    } catch {
        /* ignore */
    }
    return '';
}

async function postForm(url, data, extraHeaders = {}) {
    try {
        const body = new URLSearchParams(data).toString();
        const resp = await req.post(url, body, {
            headers: {
                ...fetchHeaders(extraHeaders.Referer || `${HOST}/`),
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                ...extraHeaders,
            },
            timeout: 15000,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status === 200) {
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        }
    } catch {
        /* ignore */
    }
    return '';
}

function parseExt(extend) {
    if (!extend) return {};
    if (typeof extend === 'string') {
        try {
            return JSON.parse(extend);
        } catch {
            return {};
        }
    }
    return typeof extend === 'object' ? extend : {};
}

function parseList(html) {
    const items = [];
    if (!html) return items;

    const blocks = String(html).split('class="ml-item"');
    for (const b of blocks.slice(1)) {
        const scope = b.slice(0, 1500);

        let mLink = scope.match(/href=["'](https?:\/\/[^"']*\/v\/[^"']+)["']/);
        if (!mLink) mLink = scope.match(/href=["'](\/v\/[^"']+)["']/);
        if (!mLink) continue;

        const link = mLink[1];
        const vid = link.replace(/\/$/, '').split('/v/').pop();

        const mTitle =
            scope.match(/data-title=["']([^"']+)["']/) || scope.match(/title=["']([^"']+)["']/);
        const name = mTitle ? mTitle[1].trim() : vid.toUpperCase();

        const mPic =
            scope.match(/data-original=["']([^"']+)["']/) ||
            scope.match(/<img[^>]+src=["']([^"']+)["']/);
        let pic = mPic ? mPic[1] : '';
        if (pic.startsWith('//')) pic = `https:${pic}`;
        else if (pic && !pic.startsWith('http')) pic = `${HOST}${pic.startsWith('/') ? '' : '/'}${pic}`;

        const mRem =
            scope.match(/class=["'][^"']*mli-runtimes[^"']*["'][^>]*>([^<]+)</) ||
            scope.match(/class=["'][^"']*mli-quality[^"']*["'][^>]*>([^<]+)</);
        const remark = mRem ? mRem[1].trim() : '';

        items.push({
            vod_id: vid,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
            style: { type: 'rect', ratio: 0.75 },
        });
    }
    return items;
}

function buildCatUrl(tid, page, extend = {}) {
    const p = parseInt(page, 10) || 1;
    const cleanTid = String(tid || 'movies').replace(/^\/+|\/+$/g, '');

    if (cleanTid.startsWith('movies')) {
        let basePath;
        const queryDict = {};

        if (cleanTid.includes('?')) {
            const [bp, oldQuery] = cleanTid.split('?', 2);
            basePath = bp;
            for (const part of oldQuery.split('&')) {
                if (!part) continue;
                const eq = part.indexOf('=');
                const k = eq >= 0 ? part.slice(0, eq) : part;
                const v = eq >= 0 ? part.slice(eq + 1) : '';
                if (k) queryDict[k] = [decodeURIComponent(v)];
            }
        } else {
            basePath = cleanTid;
        }

        queryDict.page = [String(p)];

        if (extend.sort) queryDict.sort = [String(extend.sort)];
        else delete queryDict.sort;

        if (extend.quality && extend.quality !== 'all') queryDict.quality = [String(extend.quality)];
        else delete queryDict.quality;

        if (extend.year && extend.year !== 'all') queryDict.year = [String(extend.year)];
        else delete queryDict.year;

        const parts = [];
        for (const [k, vals] of Object.entries(queryDict)) {
            for (const v of vals) {
                parts.push(`${k}=${encodeURIComponent(v)}`);
            }
        }
        return `${HOST}/${basePath.replace(/^\/+/, '')}?${parts.join('&')}`;
    }

    const base = `${HOST}/${cleanTid}`;
    return p > 1 ? `${base}/page/${p}` : base;
}

function parsePageCount(html, page, listLen) {
    const nums = [
        ...String(html || '').matchAll(/pg[-=](\d+)/g),
        ...String(html || '').matchAll(/page\/(\d+)/g),
        ...String(html || '').matchAll(/[?&]page=(\d+)/g),
    ]
        .map((m) => parseInt(m[1], 10))
        .filter((n) => Number.isFinite(n));

    let pagecount = nums.length ? Math.max(...nums) : 1;
    if (listLen > 0 && pagecount < page) pagecount = page + 1;
    return Math.max(pagecount, 1);
}

function cleanTail(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function skeleton(vid, title = '', pic = '', remarks = '解析中') {
    const pid = String(vid).split('|$|')[0].replace(/\$/g, '|');
    return {
        list: [
            {
                vod_id: vid,
                vod_name: title || '未知标题',
                vod_pic: pic || '',
                vod_remarks: remarks,
                vod_content: '',
                vod_actor: BRAND_ACTOR,
                vod_director: BRAND_DIRECTOR,
                vod_play_from: '播放',
                vod_play_url: `播放$${pid}`,
            },
        ],
    };
}

function decodePlayerEnc(enc, pk) {
    try {
        const raw = Buffer.from(enc, 'base64');
        const key = Buffer.from(pk, 'utf8');
        const out = Buffer.alloc(raw.length);
        for (let i = 0; i < raw.length; i++) {
            out[i] = raw[i] ^ key[i % key.length];
        }
        return out.toString('utf8');
    } catch {
        return '';
    }
}

function extractPlayUrl(iframeHtml) {
    if (!iframeHtml) return '';
    const pats = [
        /var\s+urlPlay\s*=\s*'([^']+)'/,
        /var\s+urlPlay\s*=\s*"([^"]+)"/,
        /"file"\s*:\s*"([^"]+)"/,
        /'file'\s*:\s*'([^']+)'/,
    ];
    for (const pat of pats) {
        const m = iframeHtml.match(pat);
        if (m?.[1]) return m[1].trim();
    }
    return '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(`${HOST}/movies`);
    return {
        class: CLASSES,
        filters: FILTERS,
        list: parseList(html),
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.tid ?? inReq.body.id ?? 'movies';
    const page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const ext = parseExt(inReq.body.filters || inReq.body.filter || inReq.body.extend || {});

    let url = buildCatUrl(tid, page, ext);
    let html = await fetchHtml(url);

    if (!html && !String(tid).startsWith('movies') && page > 1) {
        const fallback = `${HOST}/${String(tid).replace(/^\/+|\/+$/g, '')}/pg-${page}`;
        html = await fetchHtml(fallback);
    }

    const list = parseList(html);
    const pagecount = parsePageCount(html, page, list.length);

    return {
        list,
        page,
        pagecount,
        limit: list.length || 24,
        total: pagecount * (list.length || 24),
    };
}

async function detail(inReq, _outResp) {
    const raw = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (!raw) return { list: [] };

    const vid = raw.split('|$|')[0];
    try {
        const durl = vid.startsWith('http') ? vid : `${HOST}/v/${vid}`;
        const html = await fetchHtml(durl);
        if (!html || html.length < 500) return skeleton(raw, vid, '', '解析中');

        let name = '';
        let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        if (m) name = cleanTail(m[1].replace(/<[^>]+>/g, ''));
        if (!name) {
            m = html.match(/<title>([\s\S]*?)<\/title>/);
            if (m) {
                name = cleanTail(m[1]).replace(/\s*[-|]\s*FCJAV.*$/i, '');
            }
        }
        if (!name) name = vid;

        let pic = '';
        for (const pat of [
            /og:image"\s+content="([^"]+)"/,
            /data-poster="([^"]+)"/,
            /<img[^>]+class="cover"[^>]+src="([^"]+)"/,
        ]) {
            m = html.match(pat);
            if (m) {
                pic = m[1];
                break;
            }
        }

        let content = '';
        m = html.match(/name="description"\s+content="([^"]*)"/);
        if (m) content = m[1];
        if (!content) {
            m = html.match(/property="og:description"\s+content="([^"]*)"/);
            if (m) content = m[1];
        }

        let remark = '';
        m = html.match(/class="mli-runtimes"[^>]*>([^<]+)</);
        if (m) remark = m[1].trim();

        let eps = [...html.matchAll(/class="switch-source[^"]*"\s+data-source="(\d+)"\s+data-id="(\d+)"[^>]*>[\s\S]*?<\/button>/g)].map(
            (x) => [x[1], x[2]],
        );
        if (!eps.length) {
            eps = [...html.matchAll(/data-source="(\d+)"\s+data-id="(\d+)"/g)].map((x) => [x[1], x[2]]);
        }
        const names = [...html.matchAll(/class="switch-source[^"]*"[^>]*>[\s\S]*?<\/i>\s*([A-Za-z0-9]+)\s*<\/button>/g)].map(
            (x) => x[1],
        );

        if (!eps.length) return skeleton(raw, name, pic, remark || '解析中');

        const epList = [];
        const seen = new Set();
        eps.forEach(([src, eid], idx) => {
            if (seen.has(eid)) return;
            seen.add(eid);
            const epName = names[idx] || `线路${idx + 1}`;
            epList.push(`${epName}$${src}|${eid}|${vid}`);
        });
        if (!epList.length) return skeleton(raw, name, pic, remark || '解析中');

        const fullDesc = [
            `【🔥 官方交流群: ${TG_GROUP}】`,
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `番号: ${vid.toUpperCase()}`,
            `片名: ${name}`,
            `剧情介绍: ${content || '暂无简介'}`,
            '声明: 资源来源于网络，仅供交流学习。',
        ].join('\n');

        return {
            list: [
                {
                    vod_id: raw,
                    vod_name: name,
                    vod_pic: pic,
                    vod_remarks: remark || '超清正片',
                    vod_content: escapeHtml(fullDesc),
                    vod_actor: BRAND_ACTOR,
                    vod_director: BRAND_DIRECTOR,
                    vod_play_from: 'FCJAV极速专线',
                    vod_play_url: epList.join('#'),
                },
            ],
        };
    } catch {
        return skeleton(raw);
    }
}

async function play(inReq, _outResp) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').slice(1).join('$');

    let filmId = '';
    let eid = '';
    let slug = '';

    if (raw.includes('|') && !raw.startsWith('http')) {
        const parts = raw.split('|');
        filmId = parts[0] || '';
        eid = parts[1] || '';
        slug = parts[2] || '';
    } else if (raw.startsWith('http')) {
        if (raw.endsWith('.mp4') || raw.endsWith('.m3u8')) {
            return { parse: 0, url: raw, header: fetchHeaders() };
        }
        slug = raw.replace(/\/$/, '').split('/v/').pop();
    } else {
        slug = raw;
    }

    let pt = '';
    let pk = '';
    let det = '';
    if (slug) det = await fetchHtml(`${HOST}/v/${slug}`);

    if (det) {
        if (!filmId) {
            let m = det.match(/filmId\s*=\s*(\d+)/);
            if (m) filmId = m[1];
            m = det.match(/data-source="(\d+)"\s+data-id="(\d+)"/);
            if (m) {
                filmId = m[1];
                if (!eid) eid = m[2];
            }
        }
        const ptM = det.match(/__pt\s*=\s*"([^"]+)"/);
        const pkM = det.match(/__pk\s*=\s*"([^"]+)"/);
        pt = ptM ? ptM[1] : '';
        pk = pkM ? pkM[1] : '';
    }

    const fallback = {
        parse: 1,
        url: slug ? `${HOST}/v/${slug}` : `${HOST}/movies`,
        header: fetchHeaders(slug ? `${HOST}/v/${slug}` : `${HOST}/`),
    };

    if (!filmId || !pt || !pk) return fallback;

    const referer = slug ? `${HOST}/v/${slug}` : `${HOST}/`;
    const respText = await postForm(
        `${HOST}/ajax/player`,
        { episode: eid, filmId, pt },
        { Referer: referer },
    );
    if (!respText) return fallback;

    let j;
    try {
        j = JSON.parse(respText);
    } catch {
        return fallback;
    }
    if (j.error) return fallback;

    let iframeHtml = '';
    if (j.player_enc) iframeHtml = decodePlayerEnc(j.player_enc, pk);
    else if (j.player) iframeHtml = j.player;

    let iframeUrl = '';
    const srcM = String(iframeHtml || '').match(/src="([^"]+)"/);
    if (srcM) iframeUrl = srcM[1];

    let playUrl = '';
    if (iframeUrl) {
        const ih = await fetchHtml(iframeUrl, { Referer: `${HOST}/` });
        playUrl = extractPlayUrl(ih);
    }

    if (playUrl) {
        return { parse: 0, url: playUrl, header: fetchHeaders(`${HOST}/`) };
    }
    if (iframeUrl) {
        return { parse: 1, url: iframeUrl, header: fetchHeaders() };
    }
    return fallback;
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(String(inReq.body.wd || inReq.body.key || '').trim());
    const page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const url = page > 1 ? `${HOST}/search/${key}/page/${page}` : `${HOST}/search/${key}`;
    const html = await fetchHtml(url);
    return {
        list: parseList(html),
        page,
        pagecount: 10,
    };
}

export default {
    meta: {
        key: 'fcjav',
        name: '🌸FCJAV',
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
