import axios from 'axios';

/**
 * PornCloud - https://porncloud.tv
 * NUXT 列表付费标记 + 写真套图 / 视频嗅探
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const site = 'https://porncloud.tv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const CLASSES = [
    { type_id: 'jav', type_name: 'JAV视频' },
    { type_id: 'global', type_name: '全球资源' },
    { type_id: 'domestic', type_name: '国产资源' },
    { type_id: 'domestic-spy', type_name: '国产偷拍' },
    { type_id: 'influencer', type_name: '网红福利姬' },
    { type_id: 'photo-sets', type_name: '写真套图' },
    { type_id: 'onlyfans', type_name: 'OnlyFans' },
    { type_id: 'black-stockings', type_name: '黑丝' },
    { type_id: 'coser', type_name: 'Coser' },
    { type_id: 'private-video', type_name: '私拍' },
    { type_id: 'one-to-one', type_name: '1对1' },
];

const TYPE_MAP = {
    'photo-sets': 'photo_set',
    jav: 'video',
    global: 'video',
    domestic: 'video',
    'domestic-spy': 'video',
    influencer: 'video',
    onlyfans: 'video',
    'black-stockings': 'video',
    coser: 'video',
    'private-video': 'video',
    'one-to-one': 'video',
};

const URL_MAP = {
    jav: '/jav-list',
    global: '/media',
    domestic: '/media/category/domestic',
    'domestic-spy': '/media/category/domestic-spy',
    influencer: '/media/category/influencer',
    'photo-sets': '/media/category/photo-sets',
    onlyfans: '/media/tag/onlyfans',
    'black-stockings': '/media/tag/black-stockings',
    coser: '/media/tag/coser',
    'private-video': '/media/tag/private-video',
    'one-to-one': '/media/tag/one-to-one',
};

const http = axios.create({
    timeout: 15_000,
    headers: { 'User-Agent': UA },
    validateStatus: () => true,
});

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return site + url;
    if (!url.startsWith('http')) return `${site}/${url}`;
    return url;
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/porncloud/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

async function fetchText(url) {
    try {
        const resp = await http.get(url, { responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function findItemsInNuxt(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = findItemsInNuxt(item);
            if (r) return r;
        }
        return null;
    }
    if (Array.isArray(obj.items)) return obj.items;
    for (const v of Object.values(obj)) {
        const r = findItemsInNuxt(v);
        if (r) return r;
    }
    return null;
}

function findVideoInNuxt(obj, targetId) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = findVideoInNuxt(item, targetId);
            if (r) return r;
        }
        return null;
    }
    if ('id' in obj && String(obj.id) === String(targetId)) return obj;
    for (const v of Object.values(obj)) {
        const r = findVideoInNuxt(v, targetId);
        if (r) return r;
    }
    return null;
}

function parsePayStatus(html, targetId = null) {
    const payMap = {};
    try {
        const nuxtMatch = html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([^<]+)<\/script>/);
        if (!nuxtMatch) return targetId ? false : payMap;
        const nuxtData = JSON.parse(nuxtMatch[1]);
        const items = findItemsInNuxt(nuxtData);
        if (items && Array.isArray(items)) {
            for (const item of items) {
                if (!item || typeof item !== 'object') continue;
                const vid = item.id;
                const isFree = item.isFree;
                if (vid != null && isFree != null) {
                    payMap[`/media/${vid}`] = isFree;
                    payMap[`/play/${vid}`] = isFree;
                    if (targetId && String(vid) === String(targetId)) {
                        return !isFree;
                    }
                }
            }
        }
    } catch {
        /* ignore */
    }
    return targetId != null ? false : payMap;
}

function extractImages(html) {
    const images = [];
    const seen = new Set();
    const patterns = [
        /<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|gif|webp)[^"]*)"/gi,
        /<img[^>]+data-src="([^"]+\.(?:jpg|jpeg|png|gif|webp)[^"]*)"/gi,
        /<img[^>]+data-original="([^"]+\.(?:jpg|jpeg|png|gif|webp)[^"]*)"/gi,
        /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi,
    ];
    for (const pattern of patterns) {
        for (const m of html.matchAll(pattern)) {
            const url = m[1];
            if (!url || url.startsWith('data:')) continue;
            if (/logo|icon/i.test(url)) continue;
            if (seen.has(url)) continue;
            seen.add(url);
            images.push(fixUrl(url));
        }
    }
    return images;
}

function parseVideos(html, contentType = 'video') {
    const videos = [];
    const payMap = parsePayStatus(html);
    const pattern = /<a[^>]+href="(\/(?:play|media)\/[^"]+)"[^>]*>/g;

    for (const match of html.matchAll(pattern)) {
        const href = match[1];
        if (!href || href === '/play/' || href === '/media/') continue;
        if (href.includes('/category/') || href.includes('/tag/')) continue;

        const blockStart = Math.max(0, match.index - 1000);
        const blockEnd = Math.min(html.length, match.index + match[0].length + 1000);
        const block = html.slice(blockStart, blockEnd);

        let title = '';
        const altMatch = block.match(/alt="([^"]+)"/);
        if (altMatch) title = altMatch[1];
        if (!title) {
            const textMatch = match[0].match(/>([^<]+)</);
            if (textMatch) title = textMatch[1].trim();
        }
        if (!title) title = href.split('/').pop() || '';

        let pic = '';
        for (const p of [/<img[^>]+src="([^"]+)"/i, /<img[^>]+data-src="([^"]+)"/i, /<img[^>]+data-original="([^"]+)"/i]) {
            const imgMatch = block.match(p);
            if (imgMatch) {
                pic = imgMatch[1].replace(/^["']|["']$/g, '');
                if (pic && !pic.startsWith('data:')) break;
            }
        }

        let isPay = false;
        if (href in payMap) isPay = !payMap[href];
        if (!isPay && (block.includes('付费会员') || block.includes('lock-badge') || block.includes('登录查看'))) {
            isPay = true;
        }

        if (title) {
            videos.push({
                vod_id: `${contentType}@@${href}`,
                vod_name: title.trim(),
                vod_pic: fixUrl(pic),
                vod_remarks: isPay ? '🔒 VIP付费' : '免费',
            });
        }
    }

    const seen = new Set();
    return videos.filter((v) => {
        if (seen.has(v.vod_id)) return false;
        seen.add(v.vod_id);
        return true;
    });
}

function buildFilters() {
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = [];
    return filters;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchText(site);
    const videos = parseVideos(html, 'video');
    return {
        class: CLASSES,
        filters: buildFilters(),
        list: videos.slice(0, 40),
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'global');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const path = URL_MAP[tid] || '/media';
    const url = `${site}${path}?page=${pg}`;
    const html = await fetchText(url);
    const contentType = TYPE_MAP[tid] || 'video';
    const videos = parseVideos(html, contentType);
    return {
        list: videos,
        page: pg,
        pagecount: 100,
        limit: 20,
        total: videos.length,
    };
}

async function detail(inReq, _outResp) {
    const result = [];
    const rawId = String(inReq.body.id || '');
    const ids = [rawId];

    for (const vidWithType of ids) {
        let contentType = 'video';
        let vid = vidWithType;
        if (vidWithType.includes('@@')) {
            [contentType, vid] = vidWithType.split('@@', 2);
        }
        if (!vid.startsWith('/')) vid = `/${vid}`;

        const url = fixUrl(vid);
        const html = await fetchText(url);
        let title = '';
        let desc = '';
        let pic = '';
        let playUrl = '';
        const currentId = vid.split('/').pop();

        let isPay = false;
        try {
            const nuxtMatch = html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([^<]+)<\/script>/);
            if (nuxtMatch) {
                const nuxtData = JSON.parse(nuxtMatch[1]);
                const videoData = findVideoInNuxt(nuxtData, currentId);
                if (videoData && typeof videoData === 'object' && videoData.isFree != null) {
                    isPay = !videoData.isFree;
                }
            }
        } catch {
            /* ignore */
        }

        for (const match of html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)) {
            try {
                const data = JSON.parse(match[1]);
                if (data && typeof data === 'object' && data['@type'] === 'VideoObject') {
                    playUrl = data.contentUrl || '';
                    if (!pic) {
                        const thumbs = data.thumbnailUrl;
                        if (Array.isArray(thumbs) && thumbs[0]) pic = thumbs[0];
                    }
                    if (!title) title = data.name || '';
                    if (!desc) desc = data.description || '';
                }
            } catch {
                /* ignore */
            }
        }

        if (!playUrl) {
            const og = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/);
            if (og) playUrl = og[1];
        }
        if (!title) {
            const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
            if (h1) title = h1[1].trim();
        }
        if (!title) {
            const tm = html.match(/<title>色情云 PornCloud - ([^<]+)<\/title>/);
            if (tm) title = tm[1].trim();
        }
        if (!pic) {
            const ogImg = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
            if (ogImg) pic = ogImg[1];
        }
        if (!desc) {
            const dm = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/);
            if (dm) desc = dm[1];
        }

        let isPhotoSet = contentType === 'photo_set' || vid.includes('/photo-sets');
        if (!isPhotoSet && !playUrl) {
            if (/套图|写真|图集|图片|图库/.test(html)) {
                const imgUrls = [...html.matchAll(/<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)].map(
                    (x) => x[1],
                );
                const large = imgUrls.filter(
                    (u) => !/cover|logo|icon/i.test(u),
                );
                if (large.length >= 5) isPhotoSet = true;
            }
        }

        const remark = isPay ? '🔒 VIP付费' : '免费';

        if (isPhotoSet) {
            let images = extractImages(html);
            if (!images.length && pic) images = [fixUrl(pic)];
            if (images.length) {
                result.push({
                    vod_id: vid,
                    vod_name: title || vid.split('/').pop(),
                    vod_pic: fixUrl(pic),
                    vod_content: desc || '',
                    vod_remarks: remark,
                    vod_play_from: '写真套图',
                    vod_play_url: `全集$pics@@${images.join('&&')}`,
                });
                continue;
            }
        }

        if (!playUrl) {
            const m3u8 = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
            if (m3u8) playUrl = m3u8[0];
        }

        const displayTitle = title || vid.split('/').pop();
        const finalPlay = playUrl ? `播放$${playUrl}` : `播放$sniff@@${vid}`;

        result.push({
            vod_id: vid,
            vod_name: displayTitle,
            vod_pic: fixUrl(pic),
            vod_content: desc || '',
            vod_remarks: remark,
            vod_play_from: 'PornCloud',
            vod_play_url: finalPlay,
        });
    }

    return { list: result };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const header = { 'User-Agent': UA, Referer: `${site}/` };

    if (id.startsWith('pics@@')) {
        return {
            parse: 0,
            url: `pics://${id.replace('pics@@', '')}`,
            header,
        };
    }

    if (id.startsWith('sniff@@')) {
        let url = id.replace('sniff@@', '');
        if (!url.startsWith('http')) url = site + url;
        return { parse: 1, url, header };
    }

    if (id.startsWith('http')) {
        // m3u8 走代理补全相对分片
        if (/\.m3u8/i.test(id)) {
            return {
                parse: 0,
                url: `${getProxyBase(inReq)}?url=${encodeURIComponent(id)}`,
                header,
            };
        }
        return { parse: 0, url: id, header };
    }

    const vid = id.split('/').pop();
    const playPageUrl = `${site}/play/${vid}`;
    const html = await fetchText(playPageUrl);
    let playUrl = '';

    for (const match of html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)) {
        try {
            const data = JSON.parse(match[1]);
            if (data && data['@type'] === 'VideoObject') {
                playUrl = data.contentUrl || '';
                if (playUrl) break;
            }
        } catch {
            /* ignore */
        }
    }

    if (!playUrl) {
        const m3u8 = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
        if (m3u8) playUrl = m3u8[0];
    }

    if (playUrl) {
        if (/\.m3u8/i.test(playUrl)) {
            return {
                parse: 0,
                url: `${getProxyBase(inReq)}?url=${encodeURIComponent(playUrl)}`,
                header,
            };
        }
        return { parse: 0, url: playUrl, header };
    }

    return { parse: 1, url: playPageUrl, header };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || '');
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    let searchUrl = `${site}/search/${key.replace(/ /g, '+')}`;
    if (pg > 1) searchUrl += `?page=${pg}`;
    const html = await fetchText(searchUrl);
    const videos = parseVideos(html, 'video');
    let pagecount = 1;
    const pageMatch = html.match(/pagecount["']?\s*[:=]\s*(\d+)/);
    if (pageMatch) pagecount = parseInt(pageMatch[1], 10);
    return {
        list: videos,
        page: pg,
        pagecount,
        limit: 20,
        total: videos.length,
    };
}

async function proxyHandler(inReq, outResp) {
    const url = inReq.query.url || inReq.query.src || '';
    if (!url || !/\.m3u8/i.test(url)) {
        return outResp.code(404).type('text/plain').send('not m3u8');
    }
    try {
        const resp = await http.get(url, {
            headers: { 'User-Agent': UA, Referer: `${site}/` },
            responseType: 'text',
            timeout: 15_000,
        });
        if (resp.status !== 200) {
            return outResp.code(resp.status).type('text/plain').send('fetch failed');
        }
        const content = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        const baseUrl = `${url.replace(/\/[^/]*$/, '')}/`;
        const newLines = [];

        for (const raw of content.split('\n')) {
            const line = raw.trim();
            if (line.startsWith('#EXT-X-MAP:URI=')) {
                const m = line.match(/URI="([^"]+)"/);
                if (m) {
                    let mapUrl = m[1];
                    if (!mapUrl.startsWith('http')) mapUrl = baseUrl + mapUrl;
                    newLines.push(`#EXT-X-MAP:URI="${mapUrl}"`);
                } else {
                    newLines.push(line);
                }
            } else if (line.startsWith('#')) {
                newLines.push(line);
            } else if (line) {
                newLines.push(line.startsWith('http') ? line : baseUrl + line);
            } else {
                newLines.push(line);
            }
        }

        return outResp
            .type('application/vnd.apple.mpegurl')
            .send(`${newLines.join('\n')}\n`);
    } catch (e) {
        console.log('porncloud localProxy error:', e.message);
        return outResp.code(500).type('text/plain').send('proxy error');
    }
}

export default {
    meta: {
        key: 'porncloud',
        name: '🌸PornCloud',
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
