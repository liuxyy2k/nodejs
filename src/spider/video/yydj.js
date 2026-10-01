import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/yydj/3';
const SITE = 'https://sejie.papafilm.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;

const HEADERS = {
    'User-Agent': UA,
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${SITE}/`,
    Origin: SITE,
    'X-Age-Confirmed': '1',
};

let guestToken = '';
let guestAt = 0;

function fmtDur(sec) {
    const n = Number(sec) || 0;
    if (n <= 0) return '';
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function proxyPic(url, inReq) {
    if (!url) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    const enc = Buffer.from(String(url), 'utf8').toString('base64url');
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(enc)}`;
}

function vodFilm(it, inReq) {
    if (!it?.id) return null;
    return {
        vod_id: `f:${it.id}`,
        vod_name: String(it.title || it.id),
        vod_pic: proxyPic(it.cover_url, inReq),
        vod_remarks: [it.category, fmtDur(it.duration_sec)].filter(Boolean).join(' · '),
    };
}

function vodAi(it, inReq) {
    if (!it?.id) return null;
    const eps = it.published_episode_count || it.episodes?.length;
    return {
        vod_id: `a:${it.id}`,
        vod_name: String(it.title || it.id),
        vod_pic: proxyPic(it.cover_url, inReq),
        vod_remarks: eps ? `${eps}集` : 'AI短剧',
    };
}

async function api(method, path, body) {
    const headers = { ...HEADERS };
    if (guestToken) headers.Authorization = `Bearer ${guestToken}`;
    const url = path.startsWith('http') ? path : `${SITE}${path}`;
    try {
        const resp = await axios({
            method,
            url,
            data: method === 'GET' ? undefined : body ?? {},
            headers: {
                ...headers,
                ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
            },
            timeout: 15000,
            validateStatus: () => true,
        });
        const data = resp.data;
        if (resp.status >= 400 || data?.code !== 200) return null;
        return data.data ?? null;
    } catch {
        return null;
    }
}

async function ensureGuest() {
    if (guestToken && Date.now() - guestAt < 6 * 60 * 60 * 1000) return;
    const data = await api('POST', '/api/v1/auth/guest', {
        creation_key: crypto.randomBytes(32).toString('hex'),
        platform: 'H5',
    });
    if (data?.access_token) {
        guestToken = data.access_token;
        guestAt = Date.now();
    }
}

async function loadClasses() {
    const [cats, tags, channel] = await Promise.all([
        api('GET', '/api/v1/categories'),
        api('GET', '/api/v1/tags'),
        api('GET', '/api/v1/ai-adult/channel'),
    ]);
    const list = [
        { type_id: 'all', type_name: '全部' },
        { type_id: 'ai', type_name: 'AI短剧' },
    ];
    const seen = new Set(['全部', 'AI短剧']);
    for (const c of cats || []) {
        if (!c?.id || !c.name || seen.has(c.name) || !(Number(c.film_count) > 0)) continue;
        seen.add(c.name);
        list.push({ type_id: `c:${c.id}`, type_name: String(c.name) });
    }
    for (const t of tags || []) {
        if (!t?.slug || !t.name || seen.has(t.name) || !(Number(t.film_count) > 0)) continue;
        seen.add(t.name);
        list.push({ type_id: `t:${t.slug}`, type_name: String(t.name) });
    }
    for (const sec of channel?.sections || []) {
        const slug = sec.key || sec.tag?.slug;
        const name = sec.title || sec.tag?.name;
        if (!slug || !name || seen.has(name)) continue;
        seen.add(name);
        list.push({ type_id: `ai:${slug}`, type_name: String(name) });
    }
    return list;
}

function pageMeta(total, page, size, count) {
    const t = Number(total) || 0;
    const pagecount = t > 0 ? Math.max(1, Math.ceil(t / size)) : count >= size ? page + 1 : page;
    return { page, pagecount, limit: size, total: t || count };
}

async function listFilms(page, extra = '') {
    const q = new URLSearchParams({ page_no: String(page), page_size: String(PAGE_SIZE) });
    if (extra) {
        const more = new URLSearchParams(extra);
        for (const [k, v] of more) q.set(k, v);
    }
    const data = await api('GET', `/api/v1/films?${q.toString()}`);
    return {
        items: data?.items || [],
        total: Number(data?.total) || 0,
    };
}

async function init() {
    await ensureGuest();
    return {};
}

async function home(inReq) {
    await ensureGuest();
    const [cls, films] = await Promise.all([loadClasses(), listFilms(1)]);
    return {
        class: cls,
        filters: {},
        list: films.items.map((x) => vodFilm(x, inReq)).filter(Boolean),
    };
}

async function category(inReq) {
    await ensureGuest();
    const id = String(inReq.body.id || 'all');
    const page = Math.max(1, parseInt(inReq.body.page, 10) || 1);
    if (id === 'all' || id === 'home') {
        const r = await listFilms(page);
        return {
            list: r.items.map((x) => vodFilm(x, inReq)).filter(Boolean),
            ...pageMeta(r.total, page, PAGE_SIZE, r.items.length),
        };
    }
    if (id === 'ai') {
        const arr = (await api('GET', '/api/v1/ai-adult/films')) || [];
        const list = Array.isArray(arr) ? arr : arr.items || [];
        const start = (page - 1) * PAGE_SIZE;
        const slice = list.slice(start, start + PAGE_SIZE);
        return {
            list: slice.map((x) => vodAi(x, inReq)).filter(Boolean),
            ...pageMeta(list.length, page, PAGE_SIZE, slice.length),
        };
    }
    if (id.startsWith('ai:')) {
        const tag = id.slice(3);
        const data = await api(
            'GET',
            `/api/v1/ai-adult/channel/films?tag=${encodeURIComponent(tag)}&page_no=${page}&page_size=${PAGE_SIZE}`,
        );
        const items = data?.items || [];
        return {
            list: items.map((x) => vodAi(x, inReq)).filter(Boolean),
            ...pageMeta(data?.total, page, PAGE_SIZE, items.length),
        };
    }
    if (id.startsWith('t:')) {
        const slug = id.slice(2);
        const data = await api(
            'GET',
            `/api/v1/tags/${encodeURIComponent(slug)}/films?page_no=${page}&page_size=${PAGE_SIZE}`,
        );
        const items = data?.items || [];
        return {
            list: items.map((x) => vodFilm(x, inReq)).filter(Boolean),
            ...pageMeta(data?.total, page, PAGE_SIZE, items.length),
        };
    }
    const cid = id.startsWith('c:') ? id.slice(2) : id;
    const r = await listFilms(page, `category_id=${encodeURIComponent(cid)}`);
    return {
        list: r.items.map((x) => vodFilm(x, inReq)).filter(Boolean),
        ...pageMeta(r.total, page, PAGE_SIZE, r.items.length),
    };
}

async function detail(inReq) {
    await ensureGuest();
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };

    if (id.startsWith('a:')) {
        const fid = id.slice(2);
        const d = await api('GET', `/api/v1/ai-adult/films/${encodeURIComponent(fid)}`);
        console.log(d)
        if (!d?.id) return { list: [] };
        const tracks = [];
        for (const ep of d.episodes || []) {
            if (!ep?.id) continue;
            const name = String(ep.title || `第${ep.sort || tracks.length + 1}集`).replace(/[#$]/g, ' ');
            tracks.push(`${name}$e:${ep.id}`);
        }
        return {
            list: [
                {
                    vod_id: `a:${d.id}`,
                    vod_name: String(d.title || fid),
                    vod_pic: proxyPic(d.cover_url, inReq),
                    vod_content: String(d.description || ''),
                    vod_remarks: d.published_episode_count ? `${d.published_episode_count}集` : '',
                    vod_play_from: 'YY短剧',
                    vod_play_url: tracks.join('#'),
                },
            ],
        };
    }

    const fid = id.startsWith('f:') ? id.slice(2) : id;
    const d = await api('GET', `/api/v1/films/${encodeURIComponent(fid)}`);
    console.log(d)
    if (!d?.id) return { list: [] };
    return {
        list: [
            {
                vod_id: `f:${d.id}`,
                vod_name: String(d.title || fid),
                vod_pic: proxyPic(d.cover_url, inReq),
                vod_content: String(d.description || ''),
                vod_remarks: [d.category, fmtDur(d.duration_sec)].filter(Boolean).join(' · '),
                vod_play_from: 'YY短剧',
                vod_play_url: `正片$f:${d.id}`,
            },
        ],
    };
}

async function play(inReq) {
    await ensureGuest();
    let raw = String(inReq.body.id || '');
    let path = '';
    if (raw.startsWith('e:')) {
        path = `/api/v1/ai-adult/episodes/${encodeURIComponent(raw.slice(2))}/play-auth`;
    } else {
        const fid = raw.startsWith('f:') ? raw.slice(2) : raw;
        path = `/api/v1/films/${encodeURIComponent(fid)}/play-auth`;
    }
    const data = await api('POST', path, {});
    console.log(data)
    let url = data?.url || '';
    if (url.startsWith('/')) url = SITE + url;
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            Referer: `${SITE}/`,
            Origin: SITE,
            'X-Age-Confirmed': '1',
        },
    };
}

async function search(inReq) {
    await ensureGuest();
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const q = new URLSearchParams({
        keyword: kw,
        sort: 'relevance',
        page_no: '1',
        page_size: String(PAGE_SIZE),
    });
    const data = await api('GET', `/api/v1/search?${q.toString()}`);
    const list = [];
    for (const it of data?.ai_items || []) {
        const v = vodAi(it, inReq);
        if (v) list.push(v);
    }
    for (const it of data?.items || []) {
        const v = vodFilm(it, inReq);
        if (v) list.push(v);
    }
    return { list, page: 1 };
}

async function imgProxy(inReq, reply) {
    try {
        let u = decodeURIComponent(String(inReq.query.url || ''));
        try {
            const decoded = Buffer.from(u, 'base64url').toString('utf8');
            if (/^https?:\/\//i.test(decoded)) u = decoded;
        } catch {
            /* keep */
        }
        if (!/^https?:\/\//i.test(u)) return reply.code(400).send('');
        const resp = await axios.get(u, {
            headers: { 'User-Agent': UA, Referer: `${SITE}/` },
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status >= 400) return reply.code(resp.status).send('');
        const buf = Buffer.from(resp.data);
        const ct = String(resp.headers['content-type'] || 'image/jpeg').split(';')[0];
        reply.header('Content-Type', ct).send(buf);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'yydj',
        name: '📖YY短剧',
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
