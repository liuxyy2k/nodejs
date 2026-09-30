import axios from 'axios';

/**
 * 熟女汇 - https://shunvhzuna.lol/
 * 基于站点公开 HTML 页面解析；详情/播放结构可能随站点改版变化。
 */

const DEFAULT_HOST = 'https://shunvhzuna.lol';
const PAGE_SIZE = 30;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const CATEGORIES = [
    ['亚洲情色', '374'], ['主播自拍', '375'], ['国产偷拍', '376'],
    ['无码系列', '377'], ['欧美性爱', '378'], ['熟女专区', '379'],
    ['强奸系列', '380'], ['巨乳系列', '381'], ['中文大全', '382'],
    ['制服学生', '383'], ['女同蕾丝', '384'], ['卡通动画', '385'],
    ['视频伦理', '386'], ['少女裸体', '387'], ['重口色情', '388'],
    ['人兽性交', '389'], ['福利姬', '473'], ['精品推荐', '224'],
    ['国产色情', '225'], ['主播直播', '227'], ['亚洲无码', '229'],
    ['亚洲有码', '231'], ['中文有码', '233'], ['巨乳美乳', '235'],
    ['人妻系列', '237'], ['强奸精品', '239'], ['欧美精品', '241'],
    ['萝莉少女', '243'], ['伦理三级', '245'], ['自拍偷拍', '249'],
    ['制服丝袜', '251'], ['口交颜射', '253'], ['日本精品', '255'],
    ['Cosplay', '257'], ['素人自拍', '259'], ['台湾辣妹', '261'],
    ['韩国御姐', '263'], ['唯美港姐', '265'], ['东南亚AV', '267'],
    ['欺辱凌辱', '269'], ['剧情介绍', '271'], ['多人多P', '273'],
    ['91探花', '275'], ['网红流出', '276'], ['野外露出', '277'],
    ['古装扮演', '278'], ['女优系列', '279'], ['可爱学生', '280'],
    ['风情旗袍', '281'], ['兽耳系列', '282'], ['瑜伽裤', '283'],
    ['闷骚护士', '284'], ['过膝袜', '285'], ['网曝门', '286'],
    ['传媒出品', '287'], ['女同性恋', '288'], ['男同性恋', '289'],
    ['恋腿狂魔', '290'], ['最新视频', 'newest'],
];

let host = DEFAULT_HOST;
let headers = {
    'User-Agent': UA,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const http = axios.create({
    timeout: 20_000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        ...headers,
        Referer: referer || `${host}/`,
    };
}

function fixUrl(url, base) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    try {
        return new URL(url, base.endsWith('/') ? base : `${base}/`).href;
    } catch {
        return url;
    }
}

function clean(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function isVideoFormat(url) {
    const value = String(url || '').toLowerCase();
    return ['.m3u8', '.mp4', '.m3u', '.mpd', '.flv', '.webm'].some((x) => value.includes(x));
}

async function fetchPage(path, referer) {
    const url = String(path).startsWith('http') ? path : fixUrl(String(path).replace(/^\//, ''), host);
    try {
        const resp = await http.get(url, { headers: getHeaders(referer), responseType: 'text' });
        if (resp.status !== 200) return null;
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        const finalUrl = resp.request?.res?.responseUrl || url;
        return { text, url: finalUrl };
    } catch {
        return null;
    }
}

function parseCards(html, baseUrl) {
    const result = [];
    if (!html) return result;

    const pattern =
        /<div[^>]+class=["'][^"']*video-item[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*video-item|<\/div>\s*<\/div>\s*<\/div>)/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
        const block = match[1];
        const link = block.match(/<a[^>]+href=["']([^"']*\/info\/id\/[^"']+)["'][^>]*/i);
        if (!link) continue;

        const href = fixUrl(link[1], baseUrl);
        let title = block.match(/<(?:h[1-6]|a)[^>]+title=["']([^"']+)/i);
        if (!title) title = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        const image = block.match(/<img[^>]+(?:src|data-original|data-src)=["']([^"']+)/i);
        const remark = block.match(/<(?:time|span)[^>]*>([\s\S]*?)<\/(?:time|span)>/i);

        result.push({
            vod_id: href,
            vod_name: clean(title?.[1] || ''),
            vod_pic: image ? fixUrl(image[1], baseUrl) : '',
            vod_remarks: clean(remark?.[1] || ''),
        });
    }

    if (!result.length) {
        const fallback = /<a[^>]+href=["']([^"']*\/info\/id\/[^"']+)["'][^>]*title=["']([^"']+)/gi;
        while ((match = fallback.exec(html)) !== null) {
            const href = fixUrl(match[1], baseUrl);
            if (!result.some((x) => x.vod_id === href)) {
                result.push({
                    vod_id: href,
                    vod_name: clean(match[2]),
                    vod_pic: '',
                    vod_remarks: '',
                });
            }
        }
    }

    return result;
}

function parseSectionCards(html, baseUrl, sectionName) {
    if (!html || !sectionName) return [];

    const starts = [...html.matchAll(/<div[^>]+class=["'][^"']*video-section[^"']*["']/gi)];
    for (let pos = 0; pos < starts.length; pos++) {
        const start = starts[pos].index;
        const end = pos + 1 < starts.length ? starts[pos + 1].index : html.length;
        const section = html.slice(start, end);
        const heading = section.match(
            /<(?:h[1-6]|div)[^>]+class=["'][^"']*section-title[^"']*["'][^>]*>([\s\S]*?)</i,
        );
        if (heading && clean(heading[1]).includes(sectionName)) {
            return parseCards(section, baseUrl);
        }
    }

    return [];
}

function pageCount(html, current = 1) {
    const nums = [...(html || '').matchAll(
        /\/(?:type\/id\/[^/]+|show\/newest|lookup\/[^/]+)(?:\/L)?\/([0-9]+)\.html/gi,
    )].map((m) => parseInt(m[1], 10));
    return Math.max(...nums, current);
}

function extractPlayUrls(playHtml) {
    const urls = [];
    let m;

    const re1 = /\bplayUrl\s*=\s*['"]([^'"]+)/gi;
    while ((m = re1.exec(playHtml)) !== null) urls.push(m[1]);

    if (!urls.length) {
        const re2 = /\bplayUrl\s*[:=]\s*['"]([^'"]+)/gi;
        while ((m = re2.exec(playHtml)) !== null) urls.push(m[1]);
    }

    if (!urls.length) {
        const re3 = /(?<![\w.-])https?:\/\/[^"'\s<>]+(?:m3u8|mp4|m3u|mpd)(?:\?[^"'\s<>]*)?/gi;
        while ((m = re3.exec(playHtml)) !== null) urls.push(m[0]);
    }

    return [...new Set(urls)];
}

async function init(inReq, _outResp) {
    let config = inReq.body?.extend ?? {};
    if (typeof config === 'string') {
        try {
            config = JSON.parse(config || '{}');
        } catch {
            config = {};
        }
    }

    const h = String(config.host || '').trim().replace(/\/$/, '');
    if (h.startsWith('http://') || h.startsWith('https://')) host = h;
    else host = DEFAULT_HOST;

    const ua = String(config.userAgent || config.ua || '').trim();
    if (ua) headers['User-Agent'] = ua;

    const cookie = String(config.cookie || '').trim();
    if (cookie) headers.Cookie = cookie;
    else delete headers.Cookie;

    return {};
}

async function home(_inReq, _outResp) {
    const classes = CATEGORIES.map(([n, i]) => ({ type_name: n, type_id: String(i) }));
    const resp = await fetchPage('/');
    const list = resp ? parseCards(resp.text, resp.url) : [];
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    let path;
    if (tid === 'newest') {
        path = page > 1 ? `/show/newest/${page}.html` : '/show/newest/1.html';
    } else {
        path = page > 1 ? `/type/id/${tid}/${page}.html` : `/type/id/${tid}/1.html`;
    }

    const resp = await fetchPage(path);
    let videos = resp ? parseCards(resp.text, resp.url) : [];
    const pagecount = resp ? pageCount(resp.text, page) : page;

    if (!videos.length && page === 1) {
        const homeResp = await fetchPage('/');
        if (homeResp) {
            const names = Object.fromEntries(CATEGORIES);
            videos = parseSectionCards(homeResp.text, homeResp.url, names[tid] || '');
        }
    }

    return {
        list: videos,
        page,
        pagecount,
        limit: videos.length || PAGE_SIZE,
        total: 0,
    };
}

async function search(inReq, _outResp) {
    const keyword = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!keyword) {
        return { list: [], page, pagecount: 0, limit: PAGE_SIZE, total: 0 };
    }

    const encoded = encodeURIComponent(keyword);
    const path = page > 1 ? `/lookup/${encoded}/L/${page}.html` : `/lookup/${encoded}/L/1.html`;
    const resp = await fetchPage(path);
    const videos = resp ? parseCards(resp.text, resp.url) : [];
    const pagecount = resp ? pageCount(resp.text, page) : page;

    return {
        list: videos,
        page,
        pagecount,
        limit: videos.length || PAGE_SIZE,
        total: 0,
    };
}

async function detail(inReq, _outResp) {
    const rawId = inReq.body.id;
    const vodId = String(Array.isArray(rawId) ? rawId[0] : rawId || '').trim();

    let playPath = vodId;
    if (/\/info\/id\/[^/]+\.html/i.test(vodId)) {
        playPath = vodId.replace(/\/info\/id\/([^/]+)\.html/i, '/play/id/$1.html');
    }

    const detailResp = await fetchPage(vodId);
    if (!detailResp) return { list: [] };

    const html = detailResp.text;
    const playPage = await fetchPage(playPath, detailResp.url || vodId);
    const playHtml = playPage?.text || '';

    const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>|<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = clean(titleM?.[1] || titleM?.[2] || '');
    const picM = html.match(/<img[^>]+(?:src|data-original|data-src)=["']([^"']+)/i);
    const contentM = html.match(/(?:剧情简介|影片简介|简介)[：:\s]*([\s\S]{0,1000})/i);

    const episodes = [];
    const playUrls = extractPlayUrls(playHtml);
    playUrls.forEach((url, index) => {
        episodes.push(`正片${index + 1}$${url}`);
    });

    if (!episodes.length) {
        const iframes = [...(playHtml || html).matchAll(/<iframe[^>]+src=["']([^"']+)/gi)];
        iframes.forEach((m, index) => {
            episodes.push(`播放${index + 1}$${fixUrl(m[1], detailResp.url)}`);
        });
    }

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title || vodId,
                vod_pic: picM ? fixUrl(picM[1], detailResp.url) : '',
                vod_content: contentM ? clean(contentM[1]) : '',
                vod_play_from: episodes.length ? '默认线路' : '',
                vod_play_url: episodes.join('#'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '').trim();

    if (isVideoFormat(url)) {
        return {
            parse: 0,
            url,
            header: {
                'User-Agent': headers['User-Agent'] || UA,
                Referer: `${host}/`,
            },
        };
    }

    if (url.includes('/info/id/')) {
        url = url.replace(/\/info\/id\/([^/]+)\.html/i, '/play/id/$1.html');
    }

    if (url.includes('/play/id/')) {
        const page = await fetchPage(url, `${host}/`);
        if (page) {
            const found =
                page.text.match(/\bplayUrl\s*[:=]\s*['"]([^'"]+)/i) ||
                page.text.match(
                    /(?<![\w.-])(https?:\/\/[^"'\s<>]+(?:m3u8|mp4|m3u|mpd)(?:\?[^"'\s<>]*)?)/i,
                );
            if (found) {
                return {
                    parse: 0,
                    url: found[1],
                    header: {
                        'User-Agent': headers['User-Agent'] || UA,
                        Referer: url,
                    },
                };
            }
        }
    }

    return { parse: 1, url, header: getHeaders() };
}

export default {
    meta: {
        key: 'shunvh',
        name: '💋熟女汇',
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
