import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import https from 'https';

const siteUrl = 'https://hstream.moe';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const headers = {
    'User-Agent': UA,
    Referer: `${siteUrl}/`,
    Origin: siteUrl,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const jar = new CookieJar();

const session = wrapper(
    axios.create({
        jar,
        timeout: 10000,
        validateStatus: () => true,
        headers,
        maxRedirects: 5,
    }),
);

async function fetch(url) {
    try {
        return await session.get(url, { headers, timeout: 10000 });
    } catch {
        return null;
    }
}

async function getCookie(name) {
    try {
        const cookies = await jar.getCookies(`${siteUrl}/`);
        const found = cookies.find((c) => c.key === name);
        return found ? found.value : '';
    } catch {
        return '';
    }
}

function postList(html, pg) {
    const list = [];
    if (!html) {
        return { list, page: pg, pagecount: pg, limit: 24, total: 9999 };
    }

    const re = /<a[^>]*href=["'][^"']*\/hentai\/([^"']+)["'][^>]*>(.*?)<\/a>/gs;
    const seen = new Set();
    let m;
    while ((m = re.exec(html))) {
        const vodId = m[1];
        if (seen.has(vodId)) continue;
        seen.add(vodId);

        const inner = m[2];
        const picMatch = inner.match(/src=["']([^"']+)["']/);
        let vodPic = picMatch ? picMatch[1] : `${siteUrl}/images/default-avatar.webp`;
        if (!vodPic.startsWith('http')) vodPic = `${siteUrl}${vodPic}`;

        const tMatch = inner.match(/alt=["']([^"']+)["']/);
        let vodName = tMatch
            ? tMatch[1]
            : inner.replace(/<[^>]+>/g, '').trim();
        if (!vodName) vodName = vodId;

        list.push({
            vod_id: `${vodId}@@@${vodName}@@@${vodPic}`,
            vod_name: vodName,
            vod_pic: vodPic,
            vod_remarks: '4K/FHD',
            style: { type: 'rect', ratio: 1.33 },
        });
    }

    return {
        list,
        page: pg,
        pagecount: list.length === 24 ? pg + 1 : pg,
        limit: 24,
        total: 9999,
    };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: 'recently-uploaded', type_name: '最近上传' },
            { type_id: 'recently-released', type_name: '最新发布' },
            { type_id: 'view-count', type_name: '最多观看' },
            { type_id: 'tag_uncensored', type_name: '步兵无码' },
            { type_id: 'tag_milf', type_name: '人妻(Milf)' },
            { type_id: 'tag_school-girl', type_name: '学生妹' },
            { type_id: 'tag_big-boobs', type_name: '巨乳(Boobs)' },
            { type_id: 'tag_succubus', type_name: '魅魔' },
            { type_id: 'tag_tentacle', type_name: '触手' },
            { type_id: 'tag_maid', type_name: '女仆' },
            { type_id: 'tag_bdsm', type_name: '调教(BDSM)' },
            { type_id: 'tag_elf', type_name: '精灵(Elf)' },
            { type_id: 'tag_4k-48fps', type_name: '4K专区' },
        ],
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || '';
    const pg = parseInt(inReq.body.page, 10) || 1;
    let url;
    if (tid.startsWith('tag_')) {
        const tagSlug = tid.replace('tag_', '');
        url = `${siteUrl}/search?order=recently-uploaded&tags%5B0%5D=${tagSlug}&page=${pg}`;
    } else {
        url = `${siteUrl}/search?order=${tid}&page=${pg}`;
    }
    const r = await fetch(url);
    const html = r && r.status >= 200 && r.status < 300 ? r.data : '';
    return postList(typeof html === 'string' ? html : '', pg);
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const url = `${siteUrl}/search?search=${encodeURIComponent(key)}&page=${pg}`;
    const r = await fetch(url);
    const html = r && r.status >= 200 && r.status < 300 ? r.data : '';
    return postList(typeof html === 'string' ? html : '', pg);
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id || '';
    let name = vid;
    let pic = '';

    if (vid.includes('@@@')) {
        const parts = vid.split('@@@');
        vid = parts[0];
        name = parts[1] || name;
        pic = parts[2] || pic;
    }

    const playList = [`4K画质$${vid}|2160/manifest.mpd`];

    return {
        list: [
            {
                vod_id: inReq.body.id,
                vod_name: name,
                vod_pic: pic,
                type_name: '动漫',
                vod_play_from: 'HStream',
                vod_play_url: playList.join('#'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id || '';
    const idParts = id.split('|');
    const vid = idParts[0];
    const mode = idParts[1] || '2160/manifest.mpd';
    const pageUrl = `${siteUrl}/hentai/${vid}`;

    try {
        const r = await session.get(pageUrl, { headers, timeout: 10000 });
        const html = typeof r.data === 'string' ? r.data : String(r.data || '');

        let xsrfCookie = await getCookie('XSRF-TOKEN');
        if (xsrfCookie) {
            try {
                xsrfCookie = decodeURIComponent(xsrfCookie);
            } catch {
                /* keep */
            }
        }

        let metaToken = '';
        const tokenMatch = html.match(/<meta name="csrf-token" content="([^"]+)">/);
        if (tokenMatch) metaToken = tokenMatch[1];

        if (!xsrfCookie && !metaToken) {
            return { parse: 0, url: 'error://token_not_found' };
        }

        const apiHeaders = {
            ...headers,
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: pageUrl,
        };
        if (xsrfCookie) apiHeaders['X-XSRF-TOKEN'] = xsrfCookie;
        if (metaToken) apiHeaders['X-CSRF-TOKEN'] = metaToken;

        let episodeId = null;
        const eIdMatch = html.match(
            /id=["']e_id["'][^>]*value=["'](\d+)["']|value=["'](\d+)["'][^>]*id=["']e_id["']/i,
        );
        if (eIdMatch) {
            episodeId = eIdMatch[1] || eIdMatch[2];
        } else {
            const lwMatch = html.match(/"class":"App\\\\Models\\\\Episode","key":(\d+)/);
            if (lwMatch) episodeId = lwMatch[1];
        }

        if (!episodeId) {
            return { parse: 0, url: 'error://episode_id_not_found' };
        }

        const apiUrl = `${siteUrl}/player/api`;
        const res = await session.post(
            apiUrl,
            { episode_id: episodeId },
            { headers: apiHeaders, timeout: 10000 },
        );

        if (res.status >= 200 && res.status < 300) {
            const data = typeof res.data === 'object' ? res.data : JSON.parse(res.data);
            let domains = data.stream_domains || [];
            if (!domains.length) domains = data.asia_stream_domains || [];

            if (domains.length && data.stream_url) {
                const domain = String(domains[0]).replace(/\/$/, '');
                const streamUrl = String(data.stream_url).replace(/^\/+|\/+$/g, '');
                const playUrl = `${domain}/${streamUrl}/${mode}`;
                return {
                    parse: 0,
                    url: playUrl,
                    header: {
                        Referer: `${siteUrl}/`,
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                };
            }
            return { parse: 0, url: 'error://json_missing_domains' };
        }
        return { parse: 0, url: `error://post_api_failed_status_${res.status}` };
    } catch (e) {
        return { parse: 0, url: `error://exception_${String(e.message || e).slice(0, 20)}` };
    }
}

export default {
    meta: {
        key: 'hstream',
        name: '🔥Hstream',
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
