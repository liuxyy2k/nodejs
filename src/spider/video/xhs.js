import axios from 'axios';

/**
 * 小黄书 - https://xchina001.site
 */

const DEFAULT_HOST = 'https://xchina001.site';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MOBILE_UA =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const CLASSES = [
    { type_name: '麻豆传媒', type_id: '/videos/series-5f904550b8fcc.html' },
    { type_name: '独立创作者', type_id: '/videos/series-61bf6e439fed6.html' },
    { type_name: '糖心Vlog', type_id: '/videos/series-61014080dbfde.html' },
    { type_name: '蜜桃传媒', type_id: '/videos/series-5fe8403919165.html' },
    { type_name: '星空传媒', type_id: '/videos/series-6054e93356ded.html' },
    { type_name: '天美传媒', type_id: '/videos/series-60153c49058ce.html' },
    { type_name: '果冻传媒', type_id: '/videos/series-5fe840718d665.html' },
    { type_name: '香蕉视频', type_id: '/videos/series-65e5f74e4605c.html' },
    { type_name: '精东影业', type_id: '/videos/series-60126bcfb97fa.html' },
    { type_name: '爱豆传媒', type_id: '/videos/series-63d134c7a0a15.html' },
    { type_name: '杏吧原版', type_id: '/videos/series-6072997559b46.html' },
    { type_name: 'IBiZa Media', type_id: '/videos/series-64e9cce89da21.html' },
    { type_name: '性视界', type_id: '/videos/series-63490362dac45.html' },
    { type_name: 'ED Mosaic', type_id: '/videos/series-63732f5c3d36b.html' },
    { type_name: '大象传媒', type_id: '/videos/series-65bcaa9688514.html' },
    { type_name: '扣扣传媒', type_id: '/videos/series-6230974ada989.html' },
    { type_name: '萝莉社', type_id: '/videos/series-6360ca9706ecb.html' },
    { type_name: 'SA国际传媒', type_id: '/videos/series-633ef3ef07d33.html' },
    { type_name: '其他中文AV', type_id: '/videos/series-63986aec205d8.html' },
];

let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 10_000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        Referer: referer || `${host}/`,
    };
}

function fullUrl(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    try {
        return new URL(v, host.endsWith('/') ? host : `${host}/`).href;
    } catch {
        return `${host.replace(/\/$/, '')}/${v.replace(/^\//, '')}`;
    }
}

async function fetchHtml(url, referer) {
    try {
        const resp = await http.get(url, {
            headers: getHeaders(referer),
            responseType: 'text',
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function extractVideoItems(htmlContent) {
    const vods = [];
    if (!htmlContent) return vods;

    const videoItems = htmlContent.match(/<div[^>]*class="item video[^>]*>([\s\S]*?)<\/div>/gi) || [];
    for (const item of videoItems) {
        const linkMatch = item.match(/<a[^>]*href="(.*?)"[^>]*title="(.*?)"[^>]*>/);
        if (!linkMatch) continue;

        const href = fullUrl(linkMatch[1]);
        const title = linkMatch[2].trim();
        let img = '';
        const imgMatch = item.match(/background-image:url\((.*?)\)/);
        if (imgMatch) {
            img = imgMatch[1].trim().replace(/^['"]|['"]$/g, '');
            if (!img.startsWith('http://') && !img.startsWith('https://')) {
                img = fullUrl(img);
            }
        }

        vods.push({
            vod_id: href,
            vod_name: title,
            vod_pic: img,
            vod_remarks: '',
        });
    }

    if (!vods.length) {
        const generalItems = [...htmlContent.matchAll(/<a[^>]*href="(\/videos\/.*?)"[^>]*title="(.*?)"[^>]*>/gi)];
        for (const [, href, title] of generalItems) {
            vods.push({
                vod_id: fullUrl(href),
                vod_name: title.trim(),
                vod_pic: '',
                vod_remarks: '',
            });
        }
    }

    return vods;
}

function categoryUrl(tid, pg) {
    let url = String(tid || '').startsWith('http') ? tid : fullUrl(tid);
    const page = Math.max(1, parseInt(pg, 10) || 1);
    if (page > 1) {
        url += url.includes('?') ? `&page=${page}` : `?page=${page}`;
    }
    return { url, page };
}

function pageInfo(html, pg, count) {
    const page = Math.max(1, parseInt(pg, 10) || 1);
    const hasNext =
        html.includes('下一页') ||
        html.toLowerCase().includes('next') ||
        html.includes(`page=${page + 1}`);

    if (hasNext) {
        const pagecount = page + 1;
        return { page, pagecount, limit: count, total: pagecount * count };
    }
    return { page, pagecount: page, limit: count, total: count };
}

async function init(inReq, _outResp) {
    let cfg = inReq.body?.extend ?? {};
    if (typeof cfg === 'string') {
        try {
            cfg = JSON.parse(cfg || '{}');
        } catch {
            cfg = {};
        }
    }

    const h = String(cfg.host || cfg.site || '').trim().replace(/\/$/, '');
    if (h.startsWith('http://') || h.startsWith('https://')) host = h;
    else host = DEFAULT_HOST;

    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(host);
    return {
        class: CLASSES,
        filters: {},
        list: extractVideoItems(html),
    };
}

async function category(inReq, _outResp) {
    const { url, page } = categoryUrl(inReq.body.id, inReq.body.page || inReq.body.pg || 1);

    try {
        const html = await fetchHtml(url);
        const vods = extractVideoItems(html);
        const info = pageInfo(html, page, vods.length);
        return { list: vods, ...info };
    } catch {
        return { list: [], page: 1, pagecount: 1, limit: 30, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    const rawId = inReq.body.id;
    const vid = String(Array.isArray(rawId) ? rawId[0] : rawId || '').trim();
    const url = vid.includes('http') ? vid : fullUrl(vid);

    const vod = {
        vod_id: vid,
        vod_name: '小黄书视频',
        vod_pic: '',
        type_name: '',
        vod_year: '',
        vod_area: '',
        vod_remarks: '',
        vod_actor: '',
        vod_director: '',
        vod_content: '',
        vod_play_from: '瑟佬在线',
        vod_play_url: `开撸$${url}`,
    };

    try {
        const html = await fetchHtml(url);
        if (!html) return { list: [vod] };

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        if (titleMatch) {
            vod.vod_name = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        } else {
            const titleAlt = html.match(/<title>([\s\S]*?)<\/title>/);
            if (titleAlt) {
                const fullTitle = titleAlt[1].trim();
                vod.vod_name = fullTitle.includes(' - ') ? fullTitle.split(' - ')[0] : fullTitle;
            }
        }

        const coverMatch = html.match(/<meta property="og:image" content="(.*?)"/);
        if (coverMatch) {
            let coverImg = coverMatch[1].trim();
            if (!coverImg.startsWith('http://') && !coverImg.startsWith('https://')) {
                coverImg = fullUrl(coverImg);
            }
            vod.vod_pic = coverImg;
        }

        const descMatch = html.match(/<meta name="description" content="(.*?)">/);
        if (descMatch) {
            vod.vod_content = descMatch[1].trim();
        } else {
            const jsonldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
            if (jsonldMatch) {
                try {
                    const jsonldData = JSON.parse(jsonldMatch[1]);
                    const items = Array.isArray(jsonldData) ? jsonldData : [jsonldData];
                    for (const item of items) {
                        if (item && typeof item === 'object' && item.description) {
                            vod.vod_content = item.description;
                            break;
                        }
                    }
                } catch {
                    /* ignore */
                }
            }
        }
    } catch {
        /* keep defaults */
    }

    return { list: [vod] };
}

async function play(inReq, _outResp) {
    const url = String(inReq.body.id || '').trim();

    try {
        const html = await fetchHtml(url, url);
        const match = html.match(/const player = new VideoPlayer\([\s\S]*?src:\s*["']([^"']+?)["']/);
        if (match) {
            const videoUrl = match[1];
            if (/\.(m3u8|mp4|ts)/i.test(videoUrl)) {
                return {
                    jx: 0,
                    parse: 0,
                    url: videoUrl,
                    header: {
                        'User-Agent': MOBILE_UA,
                        Referer: url,
                    },
                };
            }
        }
    } catch {
        /* fallback */
    }

    return { parse: 1, url, header: getHeaders(url) };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    if (!key) return { list: [] };

    try {
        const searchUrl = `${host}/search?q=${encodeURIComponent(key)}`;
        const html = await fetchHtml(searchUrl);
        return { list: extractVideoItems(html) };
    } catch {
        return { list: [] };
    }
}

export default {
    meta: {
        key: 'xhs',
        name: '小黄书',
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
