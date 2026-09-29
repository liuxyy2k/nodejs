import axios from 'axios';
import crypto from 'crypto';
import https from 'https';
import { load } from 'cheerio';

const HOST = 'https://hjsqn.com';
const PORT = process.env.DEV_HTTP_PORT || 9988;

const IMAGE_KEY = Buffer.from('f5d965df75336270');
const IMAGE_IV = Buffer.from('97b60394abc2fbe1');

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
};

const CLASSES = [
    { type_name: '全部更新', type_id: '/' },
    { type_name: '海角原创', type_id: '/category/hjyc/' },
    { type_name: '海角乱伦', type_id: '/category/hjll/' },
    { type_name: '海角吃瓜', type_id: '/category/hjcg/' },
    { type_name: '海角探花', type_id: '/category/hjth/' },
    { type_name: '海角网黄', type_id: '/category/hjwh/' },
];

let host = HOST;
let proxyConfig = null;
let proxyRetryAfter = 0;
const coverCache = new Map();

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/hjsqn/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function log(msg) {
    console.log(`[HJSQN] ${msg}`);
}

function clean(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function toInt(value, defaultValue = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : defaultValue;
}

function parseConfig(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    const text = String(value || '').trim();
    if (text.startsWith('{')) {
        try {
            const data = JSON.parse(text);
            return data && typeof data === 'object' ? data : {};
        } catch {
            return {};
        }
    }
    if (text.startsWith('http')) return { host: text };
    return {};
}

function setProxy(value) {
    const proxy = String(value || '').trim();
    proxyConfig = null;
    proxyRetryAfter = 0;
    if (!proxy) return;
    const url = proxy.includes('://') ? proxy : `http://${proxy}`;
    try {
        const parsed = new URL(url);
        proxyConfig = {
            protocol: parsed.protocol.replace(':', ''),
            host: parsed.hostname,
            port: parseInt(parsed.port || (parsed.protocol === 'https:' ? 443 : 80), 10),
        };
    } catch {
        proxyConfig = null;
    }
}

async function httpGet(url, options = {}) {
    const config = {
        timeout: options.timeout || 22_000,
        headers: options.headers || HEADERS,
        proxy: false,
        validateStatus: () => true,
        ...options,
    };

    if (!proxyConfig || Date.now() < proxyRetryAfter) {
        return axios.get(url, config);
    }

    try {
        const resp = await axios.get(url, { ...config, proxy: proxyConfig });
        proxyRetryAfter = 0;
        return resp;
    } catch (e) {
        proxyRetryAfter = Date.now() + 30_000;
        log(`代理不可用，改用直连: ${e.message}`);
        return axios.get(url, config);
    }
}

async function fetchPage(url, timeout = 22_000) {
    const resp = await httpGet(url, { timeout, responseType: 'text' });
    if (resp.status < 200 || resp.status >= 400) {
        throw new Error(`HTTP ${resp.status}`);
    }
    return resp;
}

function postId(value) {
    const m = String(value || '').match(/\/archives\/(\d+)/);
    return m ? m[1] : '';
}

function parseJson(value) {
    try {
        return JSON.parse(
            String(value || '')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>'),
        );
    } catch {
        return {};
    }
}

function cleanUrl(value, pageUrl) {
    const url = String(value || '')
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&')
        .trim();
    if (!url) return '';
    try {
        return new URL(url, pageUrl).href;
    } catch {
        return url;
    }
}

function validContentImage(url) {
    const low = String(url || '').toLowerCase();
    return (
        low.startsWith('http') &&
        !['default-avatar', '/logo', '/icon', 'loading', 'qrcode'].some((x) => low.includes(x))
    );
}

function proxyImage(url, inReq) {
    if (!String(url || '').startsWith('http')) return '';
    return `${getProxyBase(inReq)}?type=img&url=${encodeURIComponent(String(url))}`;
}

function stableCover(postIdValue, fallback, inReq) {
    if (postIdValue) {
        if (fallback) coverCache.set(String(postIdValue), String(fallback));
        return `${getProxyBase(inReq)}?type=himg&id=${encodeURIComponent(String(postIdValue))}`;
    }
    return proxyImage(fallback, inReq);
}

function decryptImage(encrypted) {
    if (!encrypted?.length || encrypted.length % 16 !== 0) {
        throw new Error('图片密文长度无效');
    }
    try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', IMAGE_KEY, IMAGE_IV);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch {
        const decipher = crypto.createDecipheriv('aes-128-cbc', IMAGE_KEY, IMAGE_IV);
        decipher.setAutoPadding(false);
        const raw = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return raw.toString('hex').endsWith('00') ? raw.filter((b) => b !== 0) : raw;
    }
}

function imageMime(data) {
    if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
    if (data.slice(0, 3).toString() === 'GIF') return 'image/gif';
    if (data.length > 11 && data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
    return 'application/octet-stream';
}

function contentImageUrls($, pageUrl) {
    const result = [];
    $('.text.text-content img[z-image-loader-url]').each((_, el) => {
        const raw = String($(el).attr('z-image-loader-url') || '').trim().replace(/^`|`$/g, '');
        const absolute = raw ? cleanUrl(raw, pageUrl) : '';
        if (validContentImage(absolute) && !result.includes(absolute)) {
            result.push(absolute);
        }
    });
    return result;
}

function parseCards(html, inReq) {
    const $ = load(html || '');
    const videos = [];
    const seen = new Set();

    $('.xqbj-list-rows').each((_, row) => {
        const anchor = $(row).find('.xqbj-list-rows-image > a[title]').first();
        const href = String(anchor.attr('href') || '').trim();
        const title = clean(anchor.attr('title') || anchor.find('.xqbj-list-rows-image-title').text());
        const pid = postId(href);
        if (!href || !title || !pid || seen.has(pid)) return;
        seen.add(pid);

        const image = anchor.find('img[z-image-loader-url]').first();
        const rawPic = String(image.attr('z-image-loader-url') || '').trim();
        const category = clean($(row).find('a[href*="/category/"]').first().text());
        const date = clean($(row).find('.xqbj-icon-time').parent().find('.is-desktop').text());
        const count = clean($(row).find('.list-text-play').first().text());

        let remark = category;
        if (count && /^\d+$/.test(count)) {
            remark = `${category ? `${category} · ` : ''}${count}项`;
        } else if (date) {
            remark = `${category ? `${category} · ` : ''}${date}`;
        }

        videos.push({
            vod_id: new URL(href.replace(/^\//, ''), host.endsWith('/') ? host : `${host}/`).href,
            vod_name: title,
            vod_pic: stableCover(pid, rawPic, inReq),
            vod_remarks: remark,
            style: { type: 'rect', ratio: 1.33 },
        });
    });

    return videos;
}

function categoryUrl(path, page) {
    const normalized = `/${String(path || '/').replace(/^\/+|\/+$/g, '')}/`;
    if (page <= 1) return `${host.replace(/\/$/, '')}${normalized}`;
    return `${host.replace(/\/$/, '')}${normalized}page/${page}/`;
}

function pageCount(html, current) {
    const $ = load(html || '');
    const values = [current];
    $('a[href*="/page/"]').each((_, el) => {
        const m = String($(el).attr('href') || '').match(/\/page\/(\d+)\/?/);
        if (m) values.push(toInt(m[1], current));
    });
    return Math.max(...values);
}

function decodeHlsManifest(content) {
    let value = Buffer.isBuffer(content) ? content : Buffer.from(content || []);
    for (let i = 0; i < 3; i++) {
        const trimmed = value.toString('utf8').trimStart();
        if (trimmed.startsWith('#EXTM3U')) return Buffer.from(trimmed, 'utf8');

        const ascii = value.toString('ascii');
        const match = ascii.match(/^[A-Za-z0-9+/]+={0,2}/);
        if (!match) break;

        let encoded = match[0];
        if (encoded.length < 16 || encoded.length < value.length * 0.9) break;
        encoded += '='.repeat((4 - (encoded.length % 4)) % 4);

        try {
            const decoded = Buffer.from(encoded, 'base64');
            if (!decoded.length || decoded.equals(value)) break;
            value = decoded;
        } catch {
            break;
        }
    }
    return value;
}

function mediaHeaders() {
    return {
        'User-Agent': HEADERS['User-Agent'],
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Referer: `${host.replace(/\/$/, '')}/`,
        Origin: host.replace(/\/$/, ''),
    };
}

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend ?? inReq.body?.ext ?? '';
    const config = parseConfig(extend);
    const cfgHost = String(config.host || '').trim().replace(/\/$/, '');
    if (cfgHost.startsWith('http')) host = cfgHost;
    setProxy(config.proxy);
    return {};
}

async function home(inReq, _outResp) {
    let list = [];
    try {
        const resp = await fetchPage(`${host.replace(/\/$/, '')}/`);
        list = parseCards(resp.data, inReq);
    } catch (e) {
        log(`首页加载失败: ${e.message}`);
    }
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const page = Math.max(1, toInt(inReq.body.page, 1));
    const path = String(inReq.body.id || '/').trim();

    try {
        const resp = await fetchPage(categoryUrl(path, page));
        const videos = parseCards(resp.data, inReq);
        const pagecount = pageCount(resp.data, page);
        return {
            list: videos,
            page,
            pagecount,
            limit: videos.length || 20,
            total: pagecount * (videos.length || 20),
        };
    } catch (e) {
        log(`分类加载失败: ${e.message}`);
        return { list: [], page, pagecount: page, limit: 20, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    const rawId = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (!rawId) return { list: [] };

    try {
        const url = rawId.startsWith('http')
            ? rawId
            : new URL(rawId.replace(/^\//, ''), host.endsWith('/') ? host : `${host}/`).href;
        const resp = await fetchPage(url);
        const pageUrl = resp.request?.res?.responseUrl || url;
        const $ = load(resp.data || '');

        const title = clean($('h1.novel-title, h1').first().text()) || '海角帖子';
        const pid = postId(pageUrl);
        const images = contentImageUrls($, pageUrl);

        const videoPlays = [];
        const usedUrls = new Set();
        const players = $('.dplayer[data-config]').toArray();

        players.forEach((node, index) => {
            const config = parseJson($(node).attr('data-config'));
            const video = config?.video;
            if (!video || typeof video !== 'object') return;

            const h264 = cleanUrl(video.url, pageUrl);
            const h265 = cleanUrl(video.h_265 || video.h265, pageUrl);
            const multi = players.length > 1;

            if (h264 && !usedUrls.has(h264)) {
                usedUrls.add(h264);
                videoPlays.push(`${multi ? `视频${index + 1} H264` : 'H264原画'}$${h264}`);
            }
            if (h265 && !usedUrls.has(h265)) {
                usedUrls.add(h265);
                videoPlays.push(`${multi ? `视频${index + 1} H265` : 'H265原画'}$${h265}`);
            }
        });

        if (!videoPlays.length) return { list: [] };

        const category = clean($('.detail-info-desc a[href*="/category/"]').first().text());
        const author = clean($('.novel-info h2').first().text());
        const remark = clean($('.detail-info-desc').text());

        return {
            list: [{
                vod_id: pageUrl,
                vod_name: title,
                vod_pic: stableCover(pid, images[0] || '', inReq),
                vod_remarks: category || '视频',
                vod_actor: author,
                vod_content: remark || title,
                vod_play_from: '海角视频',
                vod_play_url: videoPlays.join('#'),
            }],
        };
    } catch (e) {
        log(`详情加载失败: ${e.message}`);
        return { list: [] };
    }
}

async function search(inReq, _outResp) {
    const page = Math.max(1, toInt(inReq.body.pg || inReq.body.page, 1));
    const keyword = String(inReq.body.wd || '').trim();
    const limit = 20;

    if (!keyword) {
        return { list: [], page, pagecount: page, limit, total: 0 };
    }

    try {
        const searchUrl = `${host.replace(/\/$/, '')}/Searchs/searchpagination/`;
        const resp = await httpGet(searchUrl, {
            params: { keyword, type: 'posts', page, limit },
            headers: {
                ...HEADERS,
                Referer: `${host.replace(/\/$/, '')}/search/${encodeURIComponent(keyword)}/`,
            },
            timeout: 22_000,
        });
        if (resp.status < 200 || resp.status >= 400) throw new Error(`HTTP ${resp.status}`);

        const payload = resp.data && typeof resp.data === 'object' ? resp.data : {};
        let rawList = payload.list;
        if (rawList && typeof rawList === 'object' && !Array.isArray(rawList)) {
            rawList = rawList.posts || [];
        }
        if (!Array.isArray(rawList)) rawList = [];

        const videos = [];
        for (const item of rawList) {
            const pid = String(item?.cid || '').trim();
            const title = clean(item?.title);
            if (!pid || !title) continue;

            let rawPic = '';
            const thumbnails = item?.thumbnails;
            if (Array.isArray(thumbnails) && thumbnails[0] && typeof thumbnails[0] === 'object') {
                rawPic = String(thumbnails[0].url || '');
            }

            const category = clean(item?.category_name);
            const views = toInt(item?.view ?? item?.viewsNum, 0);
            const remark = category + (views ? ` · ${views}浏览` : '');

            videos.push({
                vod_id: `${host.replace(/\/$/, '')}/archives/${pid}/`,
                vod_name: title,
                vod_pic: stableCover(pid, rawPic, inReq),
                vod_remarks: remark,
                style: { type: 'rect', ratio: 1.33 },
            });
        }

        const total = Math.max(0, toInt(payload.total, videos.length));
        const pagecount = total ? Math.max(page, Math.ceil(total / limit)) : page;

        return { list: videos, page, pagecount, limit, total };
    } catch (e) {
        log(`搜索失败: ${e.message}`);
        return { list: [], page, pagecount: page, limit, total: 0 };
    }
}

async function play(inReq, _outResp) {
    const value = String(inReq.body.id || '').trim();
    if (!value.startsWith('http')) {
        return { parse: 1, playUrl: '', url: `${host.replace(/\/$/, '')}/`, header: HEADERS };
    }

    const result = {
        parse: 0,
        playUrl: '',
        url: value,
        header: {
            'User-Agent': HEADERS['User-Agent'],
            'Accept-Encoding': 'identity',
            Referer: `${host.replace(/\/$/, '')}/`,
            Origin: host.replace(/\/$/, ''),
        },
    };

    if (value.toLowerCase().includes('.m3u8')) {
        result.url = `${getProxyBase(inReq)}?type=hjsqn_m3u8&url=${encodeURIComponent(value)}`;
        result.type = 'm3u8';
        result.format = 'application/x-mpegURL';
        result.contentType = 'application/x-mpegURL';
    }

    return result;
}

async function proxyHandler(inReq, reply) {
    const type = String(inReq.query.type || '');

    if (type === 'hjsqn_m3u8' || type === 'hjsqn_media') {
        return mediaProxy(inReq, reply, type);
    }

    if (type !== 'img' && type !== 'himg') {
        return reply.code(404).type('text/plain; charset=utf-8').send('not found');
    }

    try {
        let imageUrl = String(inReq.query.url || '').trim();

        if (type === 'himg') {
            const pid = String(inReq.query.id || '').replace(/\D+/g, '');
            if (!pid) throw new Error('缺少帖子 ID');
            imageUrl = coverCache.get(pid) || '';
            if (!imageUrl) {
                const archiveUrl = `${host.replace(/\/$/, '')}/archives/${pid}/`;
                const resp = await fetchPage(archiveUrl);
                const pageUrl = resp.request?.res?.responseUrl || archiveUrl;
                const $ = load(resp.data || '');
                const urls = contentImageUrls($, pageUrl);
                if (!urls.length) throw new Error('帖子没有封面');
                imageUrl = urls[0];
                coverCache.set(pid, imageUrl);
            }
        }

        if (!imageUrl) throw new Error('缺少图片地址');

        const encrypted = await httpGet(imageUrl, {
            headers: {
                'User-Agent': HEADERS['User-Agent'],
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                Referer: `${host.replace(/\/$/, '')}/`,
            },
            responseType: 'arraybuffer',
            timeout: 25_000,
        });
        if (encrypted.status < 200 || encrypted.status >= 400) {
            throw new Error(`HTTP ${encrypted.status}`);
        }

        const image = decryptImage(Buffer.from(encrypted.data));
        return reply.code(200).type(imageMime(image)).send(image);
    } catch (e) {
        log(`图片代理失败: ${e.message}`);
        return reply.code(500).type('text/plain; charset=utf-8').send('image proxy failed');
    }
}

async function mediaProxy(inReq, reply, mediaType) {
    const mediaUrl = String(inReq.query.url || '').trim();
    if (!mediaUrl.startsWith('http')) {
        return reply.code(500).type('text/plain; charset=utf-8').send('invalid media url');
    }

    try {
        const response = await httpGet(mediaUrl, {
            headers: mediaHeaders(),
            responseType: 'arraybuffer',
            timeout: 35_000,
            maxRedirects: 5,
        });
        if (response.status < 200 || response.status >= 400) {
            throw new Error(`HTTP ${response.status}`);
        }

        let content = Buffer.from(response.data);
        const finalUrl = response.request?.res?.responseUrl || mediaUrl;

        if (mediaType === 'hjsqn_m3u8') {
            content = decodeHlsManifest(content);
            const text = content.toString('utf-8').replace(/^\uFEFF/, '').trimStart();
            if (!text.startsWith('#EXTM3U')) {
                log(`HLS 清单解码失败: bytes=${content.length} head=${content.slice(0, 32).toString()}`);
                return reply.code(500).type('text/plain; charset=utf-8').send('invalid hls manifest');
            }

            const lines = text.split(/\r?\n/).map((line) => {
                const value = line.trim();
                if (value.startsWith('#') && value.includes('URI="')) {
                    return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${new URL(uri, finalUrl).href}"`);
                }
                if (value && !value.startsWith('#')) {
                    return new URL(value, finalUrl).href;
                }
                return line;
            });

            return reply
                .code(200)
                .header('Content-Type', 'application/vnd.apple.mpegurl')
                .header('Cache-Control', 'no-cache')
                .header('Access-Control-Allow-Origin', '*')
                .send(`${lines.join('\n')}\n`);
        }

        let contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (content[0] === 0x47) contentType = 'video/mp2t';
        else if (!contentType || contentType === 'image/jpeg') contentType = 'application/octet-stream';

        return reply
            .code(200)
            .type(contentType)
            .header('Cache-Control', 'no-cache')
            .header('Access-Control-Allow-Origin', '*')
            .send(content);
    } catch (e) {
        log(`视频代理失败: ${e.message}`);
        return reply.code(500).type('text/plain; charset=utf-8').send('media proxy failed');
    }
}

export default {
    meta: {
        key: 'hjsqn',
        name: '💋海角社区',
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
