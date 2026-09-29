import axios from 'axios';
import { load } from 'cheerio';
import https from 'https';

const host = 'https://172608.zzxiaohua1.top';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${host}/`,
    'sec-ch-ua': 'Not_A Brand;v=8, Chromium;v=120',
    'Upgrade-Insecure-Requests': '1',
};


const http = axios.create({
    timeout: 15000,
    validateStatus: () => true,
    headers,
});

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return new URL(url, `${host}/`).href;
    if (url.startsWith('http')) return url;
    return new URL(`/${url}`, `${host}/`).href;
}

function cleanText(text) {
    if (!text) return '';
    return String(text)
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, '')
        .trim();
}

async function fetchHtml(url) {
    try {
        const r = await http.get(url, { headers, timeout: 15000 });
        if (r.status < 200 || r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch (e) {
        console.log(`[专草校花] 请求失败: ${url} - ${e.message}`);
        return '';
    }
}

async function extractPlay(htmlText, depth = 0) {
    if (!htmlText || depth > 2) return '';

    let m = htmlText.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
    if (m) return m[1];
    m = htmlText.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/);
    if (m) return m[1];
    m = htmlText.match(/var\s+now\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];

    m = htmlText.match(/player_data\s*=\s*(\{[\s\S]*?\})/);
    if (m) {
        try {
            const u = JSON.parse(m[1]).url;
            if (u) return u;
        } catch {
            /* ignore */
        }
    }

    m = htmlText.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})/);
    if (m) {
        try {
            const u = JSON.parse(m[1]).url;
            if (u) return u;
        } catch {
            /* ignore */
        }
    }

    m = htmlText.match(/<iframe[^>]+src\s*=\s*['"]([^'"]+)['"]/i);
    if (m) {
        const iframe = fixUrl(m[1]);
        const iframeHtml = await fetchHtml(iframe);
        if (iframeHtml) {
            const nested = await extractPlay(iframeHtml, depth + 1);
            if (nested) return nested;
        }
    }

    m = htmlText.match(/videoSources\s*:\s*(\[[\s\S]*?\])/);
    if (m) {
        try {
            const u = JSON.parse(m[1])[0]?.file;
            if (u) return u;
        } catch {
            /* ignore */
        }
    }

    m = htmlText.match(/wvPlayer\.play\s*\(\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    m = htmlText.match(/url\s*:\s*['"]([^'"]+\.m3u8)['"]/);
    if (m) return m[1];
    m = htmlText.match(/var\s+playurl\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    if (/eval\([\s\S]*?\)/.test(htmlText)) return 'eval_encrypted';
    return '';
}

function extractContent(htmlText) {
    const patterns = [
        /<div[^>]+class=['"][^'"]*(?:content|description|intro|summary|plot)[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i,
        /<p[^>]+class=['"][^'"]*(?:content|description|intro|summary)[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i,
        /<section[^>]*>([\s\S]*?)<\/section>/i,
    ];
    for (const pat of patterns) {
        const m = htmlText.match(pat);
        if (m) {
            const txt = cleanText(m[1]);
            if (txt.length > 10) return txt;
        }
    }
    let m = htmlText.match(/<meta[^>]+name=['"]description['"][^>]+content=['"]([^'"]+)['"]/i);
    if (m) return cleanText(m[1]);
    m = htmlText.match(/<meta[^>]+content=['"]([^'"]+)['"][^>]+name=['"]description['"]/i);
    if (m) return cleanText(m[1]);
    const texts = [...htmlText.matchAll(/<p[^>]*>([^<]{30,})<\/p>/g)].map((x) => x[1]);
    if (texts.length) return cleanText(texts[0]);
    return '';
}

function isVideoFormat(url) {
    return /\.(m3u8|mp4|flv|ts)/i.test(url || '');
}

function parseList(html) {
    const $ = load(html || '');
    let items = $('#list_videos_videos_watched_right_now_items > div.item').toArray();
    if (!items.length) items = $('div.item').toArray();

    const videos = [];
    const seen = new Set();

    for (const el of items) {
        try {
            const item = $(el);
            const link = item.find('a[href*="/player/"]').first();
            const href = link.attr('href') || '';
            if (!href || seen.has(href)) continue;
            seen.add(href);

            let title = '';
            const bold = item.find('a.font-bold').first().text();
            if (bold) {
                title = cleanText(bold);
            } else {
                link.find('*').addBack().contents().each((_, node) => {
                    if (title) return;
                    const txt = cleanText($(node).text());
                    if (txt && !txt.startsWith('http') && txt.length > 3) title = txt;
                });
            }

            let pic =
                item.find('img').first().attr('data-original') ||
                item.find('img').first().attr('src') ||
                '';
            if (pic) pic = fixUrl(pic);

            const remark = cleanText(item.find('div.text-xs').first().text());

            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark,
            });
        } catch (e) {
            console.log(`[专草校花] 单条解析失败: ${e.message}`);
        }
    }
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_name: '日韩', type_id: '1' },
            { type_name: '国产', type_id: '2' },
            { type_name: '欧美', type_id: '3' },
            { type_name: '动漫', type_id: '4' },
        ],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || '1';
    const pg = parseInt(inReq.body.page, 10) || 1;
    const result = { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
    try {
        const html = await fetchHtml(`${host}/list.php?cid=${tid}&page=${pg}`);
        if (!html) return result;
        result.list = parseList(html);
        result.pagecount = result.list.length >= 24 ? pg + 1 : pg;
        const pm =
            html.match(/(?:page|pg)[/=]\s*(\d+)/i) || html.match(/共\s*(\d+)\s*页/);
        if (pm) result.pagecount = parseInt(pm[1], 10);
        return result;
    } catch (e) {
        console.log(`[专草校花] 分类失败: ${e.message}`);
        return result;
    }
}

async function detail(inReq, _outResp) {
    const result = { list: [] };
    try {
        const vid = inReq.body.id || '';
        const url = fixUrl(vid);
        const html = await fetchHtml(url);
        if (!html) return result;

        const $ = load(html);
        let title = cleanText($('h1').first().text());
        if (!title) {
            const m = html.match(/<title>([^<]+)<\/title>/i);
            if (m) title = cleanText(m[1].split('-')[0]);
        }
        if (!title) title = vid;

        let pic =
            $('img.thumb, img.poster, img.cover').first().attr('src') ||
            $('img.thumb').first().attr('data-original') ||
            '';
        if (pic) pic = fixUrl(pic);
        if (!pic) {
            const m = html.match(/<img[^>]+src=['"](https?:\/\/[^'"]+\.(?:jpg|jpeg|png|webp))['"]/i);
            if (m) pic = m[1];
        }

        const content = extractContent(html);
        let playUrl = await extractPlay(html);
        const playFrom = playUrl && playUrl !== 'eval_encrypted' ? '直链' : '嗅探';
        if (!playUrl || playUrl === 'eval_encrypted') playUrl = url;

        result.list.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_content: content,
            vod_play_from: playFrom,
            vod_play_url: `正片$${playUrl}`,
        });
        return result;
    } catch (e) {
        console.log(`[专草校花] 详情失败: ${e.message}`);
        return result;
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const playHeader = {
        Referer: `${host}/`,
        'User-Agent': UA,
    };
    try {
        if (isVideoFormat(id)) {
            return { parse: 0, url: id, header: playHeader };
        }
        if (id.startsWith('http')) {
            const html = await fetchHtml(id);
            if (html) {
                const pu = await extractPlay(html);
                if (pu && pu !== 'eval_encrypted') {
                    return { parse: 0, url: pu, header: playHeader };
                }
            }
        }
        return { parse: 1, url: id, header: playHeader };
    } catch (e) {
        console.log(`[专草校花] 播放失败: ${e.message}`);
        return { parse: 1, url: id, header: playHeader };
    }
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const result = { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
    try {
        const html = await fetchHtml(`${host}/search.php?keyword=${encodeURIComponent(key)}&page=${pg}`);
        if (!html) return result;
        result.list = parseList(html);
        result.pagecount = result.list.length >= 24 ? pg + 1 : pg;
        return result;
    } catch (e) {
        console.log(`[专草校花] 搜索失败: ${e.message}`);
        return result;
    }
}

export default {
    meta: {
        key: 'zcxh',
        name: '🌸专草校花',
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
