import req from '../../util/req.js';

const site = 'https://xiaohuangniao.me';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: 'hot', type_name: '热门黄推' },
    { type_id: 'tweets', type_name: '最新黄推' },
    { type_id: 'tiktok', type_name: '抖推短视频' },
    { type_id: 'long', type_name: '高播长片' },
];

const FILTERS = [
    {
        key: 'tag',
        name: '标签',
        value: [
            { n: '全部', v: '' },
            { n: '福利姬', v: '福利姬' },
            { n: '探花', v: '探花' },
            { n: '吃瓜', v: '吃瓜' },
            { n: '网红', v: '网红' },
            { n: '熟女', v: '熟女' },
            { n: '巨乳', v: '巨乳' },
            { n: 'COS', v: 'COS' },
            { n: '露出', v: '露出' },
            { n: '自慰', v: '自慰' },
            { n: '黑丝', v: '黑丝' },
            { n: '人妻', v: '人妻' },
            { n: '偷拍', v: '偷拍' },
            { n: '绿帽', v: '绿帽' },
            { n: '裸舞', v: '裸舞' },
        ],
    },
    {
        key: 'view',
        name: '播放量',
        value: [
            { n: '不限', v: '' },
            { n: '1千+', v: '1000' },
            { n: '1万+', v: '10000' },
            { n: '10万+', v: '100000' },
        ],
    },
    {
        key: 'dur',
        name: '时长',
        value: [
            { n: '不限', v: '' },
            { n: '15秒+', v: '15000' },
            { n: '3分钟+', v: '180000' },
        ],
    },
];

function headers() {
    return {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        Referer: `${site}/`,
        Origin: site,
    };
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

async function apiGet(path) {
    try {
        const res = await req.get(path.startsWith('http') ? path : site + path, {
            headers: headers(),
            timeout: 25000,
            validateStatus: () => true,
        });
        const data = res.data;
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch {
                return {};
            }
        }
        return data || {};
    } catch {
        return {};
    }
}

function mediaList(tw) {
    const fromUrls = Array.isArray(tw?.mediaUrls) ? tw.mediaUrls : [];
    const fromExt = Array.isArray(tw?.extendedEntities?.media)
        ? tw.extendedEntities.media.flatMap((m) => {
              const variants = m.video_info?.variants || [];
              if (variants.length) {
                  return variants.map((v) => ({
                      type: v.content_type?.includes('mpegURL') ? 'm3u8' : m.type || 'video',
                      url: v.url,
                      bitrate: v.bitrate || 0,
                      thumb: m.media_url_https || m.media_url || '',
                  }));
              }
              return [
                  {
                      type: m.type || 'photo',
                      url: m.media_url_https || m.url || m.media_url || '',
                      bitrate: 0,
                      thumb: m.media_url_https || '',
                  },
              ];
          })
        : [];
    return [...fromUrls, ...fromExt];
}

function playUrls(tw) {
    const items = mediaList(tw);
    const videos = items
        .filter((m) => {
            const u = String(m.url || '');
            return /video|m3u8|mp4/i.test(m.type || '') || /\.(m3u8|mp4)(\?|$)/i.test(u);
        })
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const seen = new Set();
    const out = [];
    for (const v of videos) {
        const u = v.url;
        if (!u || seen.has(u)) continue;
        seen.add(u);
        out.push(u);
    }
    return out;
}

function coverOf(tw) {
    const items = mediaList(tw);
    const thumb = items.find((m) => m.thumb)?.thumb;
    if (thumb) return thumb;
    const photo = items.find((m) => /photo|image|jpg|png/i.test(m.type || m.url || ''));
    if (photo?.url && !/\.(m3u8|mp4)/i.test(photo.url)) return photo.url;
    return tw?.author?.profilePicture || '';
}

function titleOf(tw) {
    const text = String(tw?.text || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text) return text.slice(0, 60);
    const name = tw?.author?.name || tw?.author?.userName;
    return name ? `@${tw.author.userName || name}` : tw?.tweetId || '';
}

function toVod(tw) {
    if (!tw?.tweetId) return null;
    const plays = playUrls(tw);
    if (!plays.length) return null;
    const views = tw.viewCount ? `${tw.viewCount}播放` : '';
    const user = tw.author?.userName ? `@${tw.author.userName}` : '';
    return {
        vod_id: String(tw.tweetId),
        vod_name: titleOf(tw),
        vod_pic: coverOf(tw),
        vod_remarks: [user, views].filter(Boolean).join(' · '),
    };
}

function parseList(json) {
    const data = json?.data;
    const tweets = Array.isArray(data) ? data : data?.tweets || [];
    return tweets.map(toVod).filter(Boolean);
}

function pageMeta(json, page) {
    const data = json?.data || {};
    return {
        page,
        pagecount: data.totalPages || (data.tweets?.length ? page + 1 : page),
        limit: 16,
        total: data.total || 0,
    };
}

function listQuery(tid, page, ext) {
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const tag = String(ext.tag || '').trim();
    if (tag) {
        const q = new URLSearchParams({
            q: tag,
            page: String(pg),
            limit: '16',
        });
        return `/api/search/tweets?${q}`;
    }
    if (tid === 'hot' && pg === 1 && !ext.view && !ext.dur) {
        return '/api/requestdb?type=hot-tweets&limit=20';
    }
    const q = new URLSearchParams({ page: String(pg), limit: '16' });
    if (tid === 'tiktok') q.set('minDuration', ext.dur || '15000');
    else if (tid === 'long') {
        q.set('minDuration', ext.dur || '180000');
        q.set('minViewCount', ext.view || '10000');
    } else {
        if (ext.dur) q.set('minDuration', ext.dur);
        if (ext.view) q.set('minViewCount', ext.view);
    }
    return `/api/tweet?${q}`;
}

async function init() {
    return {};
}

async function home() {
    const json = await apiGet('/api/requestdb?type=hot-tweets&limit=20');
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = FILTERS;
    return { class: CLASSES, filters, list: parseList(json) };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = String(inReq.body.id || 'tweets');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const json = await apiGet(listQuery(tid, page, ext));
    return { list: parseList(json), ...pageMeta(json, page) };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };
    const json = await apiGet(`/api/tweet?tweetId=${encodeURIComponent(id)}`);
    const tw = json?.data?.tweets?.[0] || json?.data || {};
    const plays = playUrls(tw);
    const lines = plays.map((u, i) => {
        const label = /\.m3u8/i.test(u) ? 'HLS' : /720|1280/.test(u) ? '高清' : `线路${i + 1}`;
        return `${label}$${u}`;
    });
    return {
        list: [
            {
                vod_id: id,
                vod_name: titleOf(tw) || id,
                vod_pic: coverOf(tw),
                vod_actor: tw.author ? `${tw.author.name || ''} @${tw.author.userName || ''}`.trim() : '',
                vod_content: tw.text || '',
                vod_remarks: tw.viewCount ? `${tw.viewCount}播放` : '',
                vod_play_from: plays.length ? '小黄鸟' : '',
                vod_play_url: lines.join('#'),
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4)/i.test(raw)) {
        return { parse: 0, url: raw, header: { 'User-Agent': UA, Referer: 'https://x.com/' } };
    }
    const json = await apiGet(`/api/tweet?tweetId=${encodeURIComponent(raw)}`);
    const tw = json?.data?.tweets?.[0] || {};
    const plays = playUrls(tw);
    return {
        parse: 0,
        url: plays[0] || '',
        header: { 'User-Agent': UA, Referer: 'https://x.com/' },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const q = new URLSearchParams({ q: kw, page: String(page), limit: '16' });
    const json = await apiGet(`/api/search/tweets?${q}`);
    return { list: parseList(json), ...pageMeta(json, page) };
}

export default {
    meta: { key: 'xhn', name: '🐥小黄鸟', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
