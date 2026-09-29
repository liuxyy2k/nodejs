import axios from 'axios';
import https from 'https';

const HOST = 'https://ai.dramarush.tv';
const UA = 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

const FALLBACK = [
    {
        vod_id: 'cms5gkpmm08ic016polf4lbnq',
        vod_name: '鸭王争霸【已更新】',
        vod_pic: 'https://raw.shorttv.online/images/2026-08-08/aa93208f-c3db-46f9-8a1b-8ac55fcc6298.jpg',
        vod_remarks: '8集',
        trailerUrl: 'https://raw.shorttv.online/uploads/direct/cms5gkpmr08id016p43cfqk20/video.mp4',
    },
    {
        vod_id: 'cmsgx8rgr00lj010fi6lttg9c',
        vod_name: '斗破苍穹',
        vod_pic: 'https://cdn.shorttv.online/images/2026-08-06/fca26c04-5a77-492c-a505-fa7440886090.jpg',
        vod_remarks: '7集',
        trailerUrl:
            '/api/media/centaurus/hls/cmsgx8rgu00lk010fjy2kas6p/h264/master.m3u8?tok=69dc75cf2fa24f54fe841a45a7768db4&ep=cmsgx8rgu00lk010fjy2kas6p',
    },
    {
        vod_id: 'cmse0xyci0d300130psgoy5c5',
        vod_name: '魔毒圣缘',
        vod_pic: 'https://cdn.shorttv.online/images/2026-08-04/2a3f6dc2-7491-4d7e-a2bd-a4d88c092d0f.png',
        vod_remarks: '4集',
        trailerUrl: 'https://raw.shorttv.online/uploads/direct/cmse0xycl0d310130rev3nav1/video.mp4',
    },
    {
        vod_id: 'cmscmdvbu0ddb0173a71sc57c',
        vod_name: '萌新三人行',
        vod_pic: 'https://raw.shorttv.online/images/2026-08-03/7be24fc7-0e0c-4587-b0ae-6b38d93aa5ec.jpg',
        vod_remarks: '4集',
        trailerUrl: 'https://raw.shorttv.online/uploads/direct/cmscmdvbx0ddc0173yd1b2t9z/video.mp4',
    },
    {
        vod_id: 'cms6za7vq05sh010edvz48iun',
        vod_name: '精液救世，丧尸围城',
        vod_pic: 'https://raw.shorttv.online/images/2026-07-30/e1c33bf0-db83-45ce-8213-4a274a9c5b48.jpg',
        vod_remarks: '4集',
        trailerUrl: '',
    },
    {
        vod_id: 'cms8rjowz00qo01cu1t7z6d8x',
        vod_name: '等不到的她',
        vod_pic: 'https://raw.shorttv.online/images/2026-07-31/e04ce57f-2e01-455c-8357-4f4e2de5fc30.jpg',
        vod_remarks: '5集',
        trailerUrl: '',
    },
];

const LIST_MAP = {
    't-5jxcit': { categorySlug: 't-5jxcit' },
    adult_short: { tagSlug: 'adult' },
    normal_short: { contentKind: 'SHORT_DRAMA' },
    short_kind: { contentKind: 'SHORT_DRAMA' },
};


const http = axios.create({
    timeout: 12000,
    validateStatus: () => true,
});

const cache = {};
const cursor = {};
const seenPage = {};
const epsCache = {};

function headers(extra = {}) {
    return {
        'User-Agent': UA,
        Referer: `${HOST}/zh/`,
        Accept: 'application/json,text/plain,*/*',
        ...extra,
    };
}

function enc(obj) {
    return encodeURIComponent(JSON.stringify({ json: obj }));
}

async function api(name, data = undefined) {
    try {
        const url =
            data !== undefined
                ? `${HOST}/api/trpc/${name}?input=${enc(data)}`
                : `${HOST}/api/trpc/${name}`;
        const r = await http.get(url, { headers: headers() });
        const payload = typeof r.data === 'object' ? r.data : JSON.parse(String(r.data || '{}'));
        return payload?.result?.data?.json ?? (data !== undefined ? {} : []);
    } catch {
        return data !== undefined ? {} : [];
    }
}

function fixUrl(u) {
    if (!u) return '';
    return u.startsWith('/') ? `${HOST}${u}` : u;
}

function imgMin(u) {
    if (!u || u.includes('_minimize.')) return u || '';
    let q = '';
    let p = u;
    if (u.includes('?')) [p, q] = u.split('?', 2);
    q = q ? `?${q}` : '';
    const i = p.lastIndexOf('.');
    return i > p.lastIndexOf('/') ? `${p.slice(0, i)}_minimize.webp${q}` : u;
}

function pickPic(v, x) {
    const candidates = [v.cover, v.poster, x.vod_pic];
    const out = [];
    for (let u of candidates) {
        if (!u || u.includes('dc/img/828ed491f008e85d9caef01a.jpg')) continue;
        if (u.includes('cdn.shorttv.online/lsj/')) {
            u = u.replace('https://cdn.shorttv.online/lsj/', 'https://raw.shorttv.online/lsj/');
        }
        out.push(imgMin(u));
    }
    return out[0] || '';
}

function normalizeItem(x) {
    if (!x || typeof x !== 'object') return {};
    const v = x.drama || x;
    const vid = String(v.id || x.id || '');
    if (!vid) return {};
    const total = v.totalEpisodes;
    return {
        vod_id: vid,
        vod_name: v.title || x.vod_name || vid,
        vod_pic: pickPic(v, x),
        vod_remarks: total ? `${String(total).trim()}集` : x.vod_remarks || '',
        vod_content: v.description || x.vod_content || '',
        trailerUrl: fixUrl(x.trailerUrl || ''),
        firstEpisodeId: x.firstEpisodeId || '',
    };
}

function extractItems(d, mode = 'all', needPic = false) {
    const arr = typeof d === 'object' && !Array.isArray(d) ? d.items || [] : Array.isArray(d) ? d : [];
    const out = [];
    const seenId = new Set();
    const seenName = new Set();
    for (const x of arr) {
        const v = x?.drama || {};
        const tags = Array.isArray(v.tags)
            ? v.tags.map((t) => String(t?.name || '')).filter(Boolean)
            : [];
        const adult = tags.some((t) => t.startsWith('adult-') || t.includes('不伦') || t.includes('偷情'));
        if ((mode === 'adult' && !adult) || (mode === 'normal' && adult)) continue;
        const it = normalizeItem(x);
        const name = String(it.vod_name || '').replace(/\s+/g, '');
        if (needPic && !it.vod_pic) continue;
        if (it.vod_id && name && !seenId.has(it.vod_id) && !seenName.has(name)) {
            seenId.add(it.vod_id);
            seenName.add(name);
            cache[it.vod_id] = it;
            out.push({
                vod_id: it.vod_id,
                vod_name: it.vod_name,
                vod_pic: it.vod_pic,
                vod_remarks: it.vod_remarks,
            });
        }
    }
    return out;
}

function fallbackItems() {
    const out = [];
    const seen = new Set();
    for (const x of FALLBACK) {
        const name = x.vod_name.replace(/\s+/g, '');
        if (seen.has(name)) continue;
        seen.add(name);
        cache[x.vod_id] = x;
        out.push({
            vod_id: x.vod_id,
            vod_name: x.vod_name,
            vod_pic: x.vod_pic,
            vod_remarks: x.vod_remarks,
        });
    }
    return out;
}

async function fetchList(tid = 't-5jxcit', pg = 1) {
    pg = parseInt(pg, 10) || 1;
    if (pg === 1) {
        cursor[tid] = {};
        seenPage[tid] = new Set();
    }
    const cur = cursor[tid]?.[pg];
    if (pg > 1 && !cur) return [];

    const mode = tid === 'adult_short' ? 'all' : tid === 'normal_short' ? 'normal' : 'all';
    const seen = seenPage[tid] || new Set();
    seenPage[tid] = seen;
    let out = [];
    let nxt = '';

    if (['recommend', 'all', ''].includes(tid)) {
        const d = await api('feed.recommend', { limit: 12 });
        nxt = typeof d === 'object' && d ? d.nextCursor || '' : '';
        for (const x of extractItems(d)) {
            const k = x.vod_id || x.vod_name.replace(/\s+/g, '');
            if (k && !seen.has(k)) {
                seen.add(k);
                out.push(x);
            }
        }
    } else {
        const data = { limit: 12, ...(LIST_MAP[tid] || { categorySlug: tid }) };
        if (cur) data.cursor = cur;
        const loops = ['adult_short', 'normal_short'].includes(tid) ? 8 : 1;
        for (let i = 0; i < loops; i++) {
            const d = await api('feed.browse', data);
            nxt = typeof d === 'object' && d ? d.nextCursor || '' : '';
            for (const x of extractItems(d, mode, tid === 'normal_short')) {
                const k = x.vod_id || x.vod_name.replace(/\s+/g, '');
                if (k && !seen.has(k)) {
                    seen.add(k);
                    out.push(x);
                }
                if (out.length >= 12) break;
            }
            if (out.length >= 12 || !nxt) break;
            data.cursor = nxt;
        }
    }

    if (nxt) {
        if (!cursor[tid]) cursor[tid] = {};
        cursor[tid][pg + 1] = nxt;
    }
    return out;
}

async function getEpisodes(vid) {
    if (epsCache[vid]) return epsCache[vid];
    const d = await api('episode.watch', { dramaId: vid, episodeNumber: 1 });
    const arr = typeof d === 'object' && d ? d.episodes || [] : [];
    epsCache[vid] = arr;
    return arr;
}

function unesc(s) {
    return String(s || '')
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/');
}

function extractMedia(html) {
    const h = unesc(html);
    let m = h.match(/<video[^>]+src="([^"]+)/);
    if (m) return fixUrl(m[1]);
    m = h.match(/"(?:hlsUrl|playUrl|videoUrl|sourceUrl|mediaUrl|trailerUrl)"\s*:\s*"([^"]+?\.(?:m3u8|mp4)[^"]*)"/);
    if (m) return fixUrl(m[1]);
    m = h.match(/https?:\/\/[^"\\\s<>]+?\.(?:mp4|m3u8)[^"\\\s<>]*/);
    return m ? fixUrl(m[0]) : '';
}

function extractEpisodeId(html) {
    const h = unesc(html);
    let m = h.match(/"episode"\s*:\s*\{[^{}]*"id"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    m = h.match(/"(?:episodeId|id)"\s*:\s*"(cms[a-z0-9]{10,})"/);
    return m ? m[1] : '';
}

async function isAlive(url) {
    try {
        const r = await http.get(url, {
            headers: {
                'User-Agent': UA,
                Referer: `${HOST}/`,
                Origin: HOST,
                Range: 'bytes=0-0',
            },
            timeout: 4000,
            validateStatus: () => true,
        });
        return r.status === 200 || r.status === 206;
    } catch {
        return false;
    }
}

function playHeader() {
    return {
        'User-Agent': UA,
        Referer: `${HOST}/zh/`,
        Origin: HOST,
    };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = await fetchList('recommend');
    if (!list.length) list = await fetchList('t-5jxcit');
    if (!list.length) list = fallbackItems();
    return {
        class: [
            { type_id: 'adult_short', type_name: '成人短剧' },
            { type_id: 'normal_short', type_name: '正规短剧' },
            { type_id: 't-5jxcit', type_name: '短剧' },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 't-5jxcit');
    const pg = parseInt(inReq.body.page, 10) || 1;
    const list = await fetchList(tid, pg);
    const hasNext = Boolean(cursor[tid]?.[pg + 1]);
    return {
        page: pg,
        pagecount: hasNext ? pg + 1 : pg,
        limit: 12,
        total: pg * 12 + (hasNext ? 12 : 0),
        count: list.length,
        list,
    };
}

async function detail(inReq, _outResp) {
    const ids = Array.isArray(inReq.body.id) ? inReq.body.id : [inReq.body.id];
    if (!Object.keys(cache).length) await fetchList('t-5jxcit');

    const out = [];
    for (let vid of ids) {
        vid = String(vid || '');
        const it =
            cache[vid] ||
            FALLBACK.find((x) => x.vod_id === vid) || {
                vod_id: vid,
                vod_name: vid,
                vod_pic: '',
                vod_remarks: '12集',
                vod_content: '',
            };
        const m = String(it.vod_remarks || '').match(/(\d+)/);
        const total = Math.max(1, Math.min(m ? parseInt(m[1], 10) : 12, 80));
        const eps = await getEpisodes(vid);
        let play;
        if (eps.length) {
            play = Array.from({ length: total }, (_, i) => {
                const n = i + 1;
                const eid =
                    n - 1 < eps.length && typeof eps[n - 1] === 'object'
                        ? eps[n - 1].id || ''
                        : '';
                return `第${n}集$${vid}/${n}/${eid}`;
            }).join('#');
        } else {
            play = `第1集$${vid}/1/${it.firstEpisodeId || ''}`;
        }
        out.push({
            vod_id: vid,
            vod_name: it.vod_name || vid,
            vod_pic: it.vod_pic || '',
            vod_remarks: it.vod_remarks || '',
            vod_content: it.vod_content || '',
            vod_play_from: '直连',
            vod_play_url: play,
        });
    }
    return { list: out };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || '');
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const list = (await fetchList('t-5jxcit')).filter((x) => x.vod_name.includes(key));
    return { page: pg, list };
}

async function play(inReq, _outResp) {
    const parts = String(inReq.body.id || '').split('/');
    const vid = parts[0] || '';
    const ep = parts[1] || '1';
    const eid = parts[2] || '';
    let url = '';
    let html = '';

    if (eid) url = `https://raw.shorttv.online/uploads/direct/${eid}/video.mp4`;

    if (!url) {
        try {
            const watchUrl = `${HOST}/zh/watch/${vid}/${ep}`;
            const r = await http.get(watchUrl, {
                headers: {
                    'User-Agent': UA,
                    Referer: watchUrl,
                },
            });
            html = typeof r.data === 'string' ? r.data : String(r.data || '');
            url = extractMedia(html);
        } catch {
            /* ignore */
        }
    }

    if (!url) {
        const foundEid = extractEpisodeId(html);
        const candidates = [];
        if (foundEid) {
            candidates.push(
                `https://raw.shorttv.online/uploads/direct/${foundEid}/video.mp4`,
                `https://cdn.shorttv.online/uploads/direct/${foundEid}/video.mp4`,
                `https://cdn.shorttv.online/uploads/hls/${foundEid}/master.m3u8`,
                `https://cdn.shorttv.online/lsj/hls/${foundEid}/master.m3u8`,
                `https://cdn.shorttv.online/dc/hls/${foundEid}/master.m3u8`,
            );
        }
        for (const u of candidates) {
            if (await isAlive(u)) {
                url = u;
                break;
            }
        }
    }

    if (!url) {
        const it = cache[vid] || FALLBACK.find((x) => x.vod_id === vid) || {};
        url = fixUrl(it.trailerUrl || '');
    }

    return {
        parse: url ? 0 : 1,
        url: unesc(url),
        header: playHeader(),
    };
}

export default {
    meta: {
        key: 'kbduanju',
        name: '📖狂飙短剧',
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
