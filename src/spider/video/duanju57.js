import req from '../../util/req.js';

/**
 * 57短剧 / 蜂蜜影视
 * https://57duanju.org + https://57cg4.com
 */

const SITE_URL = 'https://57duanju.org';
const CG_URL = 'https://57cg4.com';
const IMG_REFERER = 'https://57cg4.com/';
const TG_GROUP = 'https://t.me/tvshare23';
const BRAND_ACTOR = '🦋 TG群: @tvshare23';
const BRAND_DIRECTOR = '🦋 蝴蝶影视';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: 'cat_aichengduanju', type_name: '成人AI短剧' },
    { type_id: 'cat_hot', type_name: '热门精选' },
    { type_id: 'cat_jrcg', type_name: '今日吃瓜' },
    { type_id: 'cat_mrds', type_name: '每日大赛' },
    { type_id: 'cat_wanghong', type_name: '网红黑料' },
    { type_id: 'cat_video', type_name: '网黄合集' },
    { type_id: 'cat_cheating', type_name: '出轨劈腿' },
    { type_id: 'cat_live', type_name: '直播擦边' },
    { type_id: 'cat_society', type_name: '社会事件' },
    { type_id: 'cat_star', type_name: '明星八卦' },
    { type_id: 'cat_all', type_name: '全部短剧' },
];

const SORT_FILTER = [{
    key: 'sort',
    name: '排序',
    value: [
        { n: '最新发布', v: '' },
        { n: '全站最热', v: 'hot' },
        { n: '飙升热榜', v: 'trending' },
    ],
}];

const PORT = process.env.DEV_HTTP_PORT || 9988;

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
        try { options = JSON.parse(raw); } catch { /* ignore */ }
    }
}

function siteUrl() {
    return String(options.siteUrl || SITE_URL).replace(/\/$/, '');
}

function cgUrl() {
    return String(options.cgUrl || CG_URL).replace(/\/$/, '');
}

function imgReferer() {
    return String(options.imgReferer || IMG_REFERER);
}

function fetchHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || imgReferer(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function absUrl(url, base = siteUrl()) {
    if (!url) return '';
    url = String(url).trim();
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${base}${url}`;
    return `${base}/${url}`;
}

async function fetchHtml(targetUrl, referer = '') {
    if (!targetUrl) return '';
    let url = targetUrl;
    if (url.startsWith('//')) url = `https:${url}`;
    else if (url.startsWith('/')) url = absUrl(url);

    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(referer),
            timeout: 12000,
            validateStatus: () => true,
        });
        if (resp.status >= 400) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        console.warn('[duanju57] fetch err', e.message);
        return '';
    }
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/duanju57/3';
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

function wrapPic(picUrl, inReq) {
    if (!picUrl) return '';
    const pic = absUrl(picUrl);
    if (pic.includes('/img?url=') || pic.includes('@Referer=')) return pic;

    if (inReq && pic.startsWith('http')) {
        const b64 = Buffer.from(pic, 'utf8').toString('base64');
        return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(b64)}`;
    }

    if (pic.includes('s.chigua.media')) {
        return `${pic}@Referer=${encodeURIComponent(imgReferer())}@User-Agent=${encodeURIComponent(UA)}`;
    }
    return pic;
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').trim();
}

function parseCardList(html, inReq) {
    const vodList = [];
    const seen = new Set();
    if (!html) return vodList;

    let matches = [...html.matchAll(/<a[^>]+href=["'](?:https?:\/\/[^/]+)?\/events\/(\d+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)];
    if (!matches.length) {
        matches = [...html.matchAll(/<a[^>]+href=["'](?:https?:\/\/[^/]+)?\/(?:events\/)?(\d+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)];
    }

    for (const m of matches) {
        const eventId = m[1];
        const inner = m[2] || '';
        if (seen.has(eventId) || eventId.length < 2) continue;
        seen.add(eventId);

        let name = '';
        const titleMatch = inner.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
        if (titleMatch) {
            name = stripTags(titleMatch[1]);
        } else {
            const raw = stripTags(inner.replace(/\s+/g, ' '));
            name = raw.slice(0, 40) || `短剧/热点 ${eventId}`;
        }

        let pic = '';
        const imgMatches = [...inner.matchAll(/<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["']/gi)];
        for (const im of imgMatches) {
            const src = im[1];
            if (!src.endsWith('.svg') && !src.includes('logo')) {
                pic = src.trim();
                break;
            }
        }

        vodList.push({
            vod_id: eventId,
            vod_name: name,
            vod_pic: wrapPic(pic, inReq),
            vod_remarks: '蝴蝶影视',
            style: { type: 'rect', ratio: 1.78 },
        });
    }
    return vodList;
}

function buildCategoryUrl(tid, page, sortVal = '') {
    const slug = String(tid || 'cat_aichengduanju').replace(/^cat_/, '');
    const pg = Math.max(1, parseInt(page, 10) || 1);
    let targetUrl = '';

    if (slug === 'all') {
        const base = siteUrl();
        targetUrl = pg > 1 ? `${base}/page/${pg}/` : `${base}/`;
    } else if (slug === 'aichengduanju' || slug === 'hot') {
        const base = siteUrl();
        targetUrl = pg > 1 ? `${base}/${slug}/${pg}/` : `${base}/${slug}/`;
    } else {
        const base = cgUrl();
        targetUrl = pg > 1 ? `${base}/${slug}/${pg}/` : `${base}/${slug}/`;
    }

    if (sortVal) {
        targetUrl += targetUrl.includes('?') ? `&sort=${sortVal}` : `?sort=${sortVal}`;
    }
    return targetUrl;
}

function parseEpisodes(detailHtml) {
    const episodes = [];
    let cover = '';

    const videoBlocks = [...detailHtml.matchAll(/<video([^>]+)>/gi)];
    for (const vb of videoBlocks) {
        const attr = vb[1] || '';
        const hls = attr.match(/data-hls-src=["']([^"']+)["']/i);
        const src = attr.match(/\ssrc=["']([^"']+)["']/i);
        const streamUrl = (hls?.[1] || src?.[1] || '').trim();
        if (!cover) {
            const poster = attr.match(/poster=["']([^"']+)["']/i);
            if (poster) cover = poster[1].trim();
        }
        if (streamUrl) {
            episodes.push(`片段 ${String(episodes.length + 1).padStart(2, '0')}$${streamUrl}`);
        }
    }

    if (!episodes.length) {
        const schemas = [...detailHtml.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
        for (const sm of schemas) {
            const block = sm[1] || '';
            if (!block.includes('VideoObject')) continue;
            try {
                const data = JSON.parse(block);
                let vList = data.video || [];
                if (vList && !Array.isArray(vList)) vList = [vList];
                for (const item of vList) {
                    const cUrl = item?.contentUrl || '';
                    if (!cUrl) continue;
                    episodes.push(`第 ${String(episodes.length + 1).padStart(2, '0')} 集$${cUrl}`);
                    if (!cover && item.thumbnailUrl) cover = item.thumbnailUrl;
                }
            } catch { /* ignore */ }
        }
    }

    if (!episodes.length) {
        const seen = new Set();
        const media = [...detailHtml.matchAll(/["'](https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)["']/gi)];
        for (const mm of media) {
            const mUrl = mm[1];
            if (seen.has(mUrl)) continue;
            seen.add(mUrl);
            episodes.push(`播放 ${String(episodes.length + 1).padStart(2, '0')}$${mUrl}`);
        }
    }

    return { episodes, cover };
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return {};
}

async function home(inReq, _outResp) {
    const filters = {};
    for (const item of CLASSES) {
        filters[item.type_id] = SORT_FILTER;
    }
    const html = await fetchHtml(buildCategoryUrl('cat_aichengduanju', 1));
    const list = parseCardList(html, inReq).slice(0, 12);
    return { class: CLASSES, filters, list };
}

async function category(inReq, _outResp) {
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const tid = String(inReq.body.id || 'cat_aichengduanju');
    const extend = inReq.body.filter || inReq.body.extend || {};
    const sortVal = typeof extend === 'object' ? (extend.sort || '') : '';

    const html = await fetchHtml(buildCategoryUrl(tid, pg, sortVal));
    const list = parseCardList(html, inReq);

    return {
        page: pg,
        pagecount: list.length >= 10 ? pg + 1 : pg,
        limit: list.length,
        total: 9999,
        list,
    };
}

async function detail(inReq, _outResp) {
    const rawId = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const eventId = String(rawId || '').replace(/^\/+|\/+$/g, '');

    let detailHtml = await fetchHtml(`${cgUrl()}/events/${eventId}/`);
    if (!detailHtml || detailHtml.length < 500) {
        detailHtml = await fetchHtml(`${siteUrl()}/events/${eventId}/`);
    }

    let title = `AI短剧/热点 ${eventId}`;
    let desc = '暂无详细介绍';

    const mTitle = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (mTitle) title = stripTags(mTitle[1]);

    const mDesc = detailHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    if (mDesc) desc = mDesc[1].trim();

    const { episodes, cover: videoCover } = parseEpisodes(detailHtml);
    let cover = videoCover;
    if (!cover) {
        const og = detailHtml.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
        if (og) cover = og[1].trim();
    }

    const fullDesc = [
        `【🔥 官方交流群: ${TG_GROUP}】`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `本贴为您解析到【${episodes.length}】个现场视频片段，点击下方片段即可起播！`,
        '',
        desc,
    ].join('\n');

    return {
        list: [{
            vod_id: eventId,
            vod_name: title,
            vod_pic: wrapPic(cover, inReq),
            vod_actor: BRAND_ACTOR,
            vod_director: BRAND_DIRECTOR,
            vod_remarks: episodes.length > 1 ? `共 ${episodes.length} 个片段` : '蝴蝶影视',
            vod_content: fullDesc,
            vod_play_from: '57吃瓜在线',
            vod_play_url: episodes.length ? episodes.join('#') : '无可用视频流$http://127.0.0.1',
        }],
    };
}

async function play(inReq, _outResp) {
    const url = String(inReq.body.id || '').trim();
    return {
        parse: 0,
        playUrl: '',
        url,
        header: {
            'User-Agent': UA,
            Referer: imgReferer(),
            Origin: imgReferer().replace(/\/$/, ''),
        },
    };
}

async function imgProxy(inReq, reply) {
    try {
        let imgB64 = inReq.query.url || '';
        try { imgB64 = decodeURIComponent(imgB64); } catch { /* ignore */ }
        const pad = (4 - (imgB64.length % 4)) % 4;
        if (pad) imgB64 += '='.repeat(pad);
        const imgUrl = Buffer.from(imgB64, 'base64').toString('utf8');
        if (!imgUrl || !imgUrl.startsWith('http')) return reply.code(404).send('');

        const resp = await req.get(imgUrl, {
            headers: fetchHeaders(imgReferer()),
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data) return reply.code(404).send('');

        const body = Buffer.from(resp.data);
        return reply.code(200).header('Content-Type', imageMime(body)).send(body);
    } catch (e) {
        console.warn('[duanju57] imgProxy err', e.message);
        return reply.code(500).send('');
    }
}

async function search(inReq, _outResp) {
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    let searchUrl = `${siteUrl()}/search/?q=${encodeURIComponent(key)}`;
    if (pg > 1) searchUrl += `&page=${pg}`;

    const html = await fetchHtml(searchUrl);
    const list = parseCardList(html, inReq);

    return {
        page: pg,
        pagecount: list.length >= 10 ? pg + 1 : pg,
        limit: list.length,
        total: 9999,
        list,
    };
}

export default {
    meta: {
        key: 'duanju57',
        name: '🔥57短剧',
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
