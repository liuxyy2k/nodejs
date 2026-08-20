import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/xigua51/3';

const DEFAULT_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
};

const DYNAMIC_HOSTS = [
    'https://artist.vgwtswi.xyz',
    'https://ability.vgwtswi.xyz',
    'https://51chiguada.com',
    'https://am.vgwtswi.xyz',
];

const CATEGORY_SELECTORS = ['.category-list ul li', '.nav-menu li', '.menu li', 'nav ul li'];
const AES_KEY = Buffer.from('f5d965df75336270');
const AES_IV = Buffer.from('97b60394abc2fbe1');

let host = DYNAMIC_HOSTS[0];
let hostChecked = false;
let headers = { ...DEFAULT_HEADERS, Origin: host, Referer: `${host}/` };

function log(msg) {
    console.log(`[51吸瓜] ${msg}`);
}

function e64(s) {
    try {
        return Buffer.from(s || '').toString('base64');
    } catch {
        return '';
    }
}

function d64(s) {
    try {
        return Buffer.from(s || '', 'base64').toString('utf-8');
    } catch {
        return '';
    }
}

function aesDecrypt(buf) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    if (!raw) return '';
    return `http://127.0.0.1:${PORT}${PREFIX}/img?url=${encodeURIComponent(e64(raw))}`;
}

function isVideoFormat(url) {
    return ['.m3u8', '.mp4', '.ts'].some((ext) => String(url || '').includes(ext));
}

async function safeRequest(url, timeout = 15000) {
    try {
        const resp = await axios.get(url, {
            headers,
            timeout,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status === 200) return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        return '';
    } catch (e) {
        log(`请求失败 ${url}: ${e.message}`);
        return '';
    }
}

async function ensureHost() {
    if (hostChecked) return;
    for (const url of DYNAMIC_HOSTS) {
        try {
            const html = await safeRequest(url, 10000);
            if (!html) continue;
            const $ = load(html);
            if ($('#index article a').length > 0) {
                host = url;
                headers = { ...DEFAULT_HEADERS, Origin: host, Referer: `${host}/` };
                log(`选用可用站点: ${url}`);
                hostChecked = true;
                return;
            }
        } catch {
            /* next */
        }
    }
    host = DYNAMIC_HOSTS[0];
    headers = { ...DEFAULT_HEADERS, Origin: host, Referer: `${host}/` };
    log(`未检测到可用站点，回退: ${host}`);
    hostChecked = true;
}

function getCategories($) {
    for (const selector of CATEGORY_SELECTORS) {
        const categories = [];
        $(selector).each((_, el) => {
            const $a = $(el).find('a');
            const href = ($a.attr('href') || '').trim();
            const name = $a.text().trim();
            if (href && href !== '#' && name) {
                categories.push({ type_name: name, type_id: href });
            }
        });
        if (categories.length) return categories;
    }
    return [
        { type_name: '首页', type_id: '/' },
        { type_name: '最新', type_id: '/latest/' },
        { type_name: '热门', type_id: '/hot/' },
    ];
}

function getImageUrl(scriptText) {
    const m = String(scriptText || '').match(/loadBannerDirect\('([^']+)'/);
    return m ? proxyImgUrl(m[1]) : '';
}

function getVideoList($, nodes, tid = '') {
    const videos = [];
    const isFolder = String(tid).includes('/mrdg');
    nodes.each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = $el.find('h2').text();
        const date =
            $el.find('span[itemprop="datePublished"]').text() ||
            $el.find('.post-meta, .entry-meta, time').text();
        if (href && title) {
            videos.push({
                vod_id: href + (isFolder ? '@folder' : ''),
                vod_name: title.replace(/\n/g, ' '),
                vod_pic: getImageUrl($el.find('script').text()),
                vod_remarks: date || '',
                vod_tag: isFolder ? 'folder' : '',
                style: { type: 'rect', ratio: 1.33 },
            });
        }
    });
    return videos;
}

async function getFolderContent(folderId) {
    const html = await safeRequest(`${host}${folderId}`);
    if (!html) return [];
    const $ = load(html);
    const vdata = $('.post-content[itemprop="articleBody"]').clone();
    vdata.find('.txt-apps, .line, blockquote, .tags, .content-tabs').remove();
    const paragraphs = vdata.find('p');
    const videos = [];
    vdata.find('h2').each((i, el) => {
        const idx = i * 2;
        const $p0 = paragraphs.eq(idx);
        const $p1 = paragraphs.eq(idx + 1);
        videos.push({
            vod_id: $p0.find('a').attr('href') || '',
            vod_name: $p0.text(),
            vod_pic: proxyImgUrl($p1.find('img').attr('data-xkrkllgl') || ''),
            vod_remarks: $(el).text(),
        });
    });
    return videos;
}

function parseContent($) {
    try {
        const tags = $('.tags .keywords a');
        if (tags.length) {
            const parts = [];
            tags.each((_, el) => {
                const title = $(el).text();
                const href = $(el).attr('href');
                if (title && href) {
                    const tagData = JSON.stringify({ id: href, name: title });
                    parts.push(`[a=cr:${tagData}/]${title}[/a]`);
                }
            });
            if (parts.length) return parts.join(' ');
        }
    } catch {
        /* ignore */
    }
    return $('.post-title').text();
}

function episodeName($player, idx, usedNames) {
    let baseName = `视频${idx}`;
    try {
        let parent = $player.parent();
        for (let i = 0; i < 3 && parent.length; i++) {
            const heading = parent.find('h2, h3, h4').first().text().trim();
            if (heading) {
                baseName = heading;
                break;
            }
            parent = parent.parent();
        }
    } catch {
        /* keep default */
    }
    let name = baseName;
    let count = 2;
    while (usedNames.has(name)) {
        name = `${baseName} ${count}`;
        count += 1;
    }
    return name;
}

function parsePlayUrl($, url) {
    const players = $('.dplayer');
    if (!players.length) return `未找到视频源$${url}`;
    const playList = [];
    const usedNames = new Set();
    players.each((i, el) => {
        const configAttr = $(el).attr('data-config');
        if (!configAttr) return;
        try {
            const config = JSON.parse(configAttr);
            const videoUrl = config?.video?.url || '';
            if (!videoUrl) return;
            const name = episodeName($(el), i + 1, usedNames);
            usedNames.add(name);
            playList.push(`${name}$${videoUrl}`);
        } catch {
            /* skip */
        }
    });
    if (playList.length) {
        log(`拼装播放列表，共${playList.length}个`);
        return playList.join('#');
    }
    return `未找到视频源$${url}`;
}

function buildCategoryUrl(tid, pg) {
    if (String(tid).startsWith('/')) {
        return String(pg) !== '1' ? `${host}${tid}page/${pg}/` : `${host}${tid}`;
    }
    return `${host}/${tid}`;
}

async function init() {
    hostChecked = false;
    await ensureHost();
    return {};
}

async function home() {
    const classes = [
        { type_id: '',     type_name: '首页' },
        { type_id: '/category/wpcz/', type_name: '今日吃瓜' },
        { type_id: '/category/mrdg/', type_name: '吃瓜榜单' },
        { type_id: '/category/rdsj/', type_name: '热门吃瓜' },
        { type_id: '/category/bkdg/', type_name: '必看大瓜' },
        { type_id: '/category/whhl/', type_name: '网红黑料' },
        { type_id: '/category/xsxy/', type_name: '学生学校' },
        { type_id: '/category/ysyl/', type_name: '看片娱乐' },
        { type_id: '/category/whmx/', type_name: '明星黑料' },
        { type_id: '/category/thjx/', type_name: '探花精选' },
        { type_id: '/category/gcjq/', type_name: '国产剧情' },
        { type_id: '/category/whhj/', type_name: '网黄合集' },
        { type_id: '/category/lldd/', type_name: '伦理道德' },
        { type_id: '/category/snsn/', type_name: '骚男骚女' },
        { type_id: '/category/whmx/', type_name: '明星黑料' },
        { type_id: '/category/51by/', type_name: '51品茶' },
        { type_id: '/category/yczq/', type_name: '原创博主' },
        { type_id: '/category/51djc/', type_name: '51剧场' },
    ];

    return { class: classes,  filters: {} };
}

async function category(inReq) {
    await ensureHost();
    const tid = String(inReq.body.id || '');
    const pg = String(inReq.body.page || 1);
    try {
        let videos = [];
        let pagecount = 99999;
        if (tid.includes('@folder')) {
            videos = await getFolderContent(tid.replace('@folder', ''));
            pagecount = 1;
        } else {
            const html = await safeRequest(buildCategoryUrl(tid, pg));
            if (!html) return { list: [], page: pg, pagecount: 1, limit: 90, total: 0 };
            const $ = load(html);
            videos = getVideoList($, $('#archive article a, #index article a'), tid);
        }
        return { list: videos, page: pg, pagecount, limit: 90, total: 999999 };
    } catch (e) {
        log(`categoryContent error: ${e.message}`);
        return { list: [], page: pg, pagecount: 1, limit: 90, total: 0 };
    }
}

async function detail(inReq) {
    await ensureHost();
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').replace(/@folder$/, '');
    const url = /^https?:\/\//i.test(id) ? id : `${host}${id}`;
    try {
        const html = await safeRequest(url);
        if (!html) {
            return { list: [{ vod_play_from: '51吸瓜', vod_play_url: `页面加载失败$${url}` }] };
        }
        const $ = load(html);
        return {
            list: [
                {
                    vod_play_from: '51吸瓜',
                    vod_content: parseContent($) || '51吸瓜视频',
                    vod_play_url: parsePlayUrl($, url),
                },
            ],
        };
    } catch (e) {
        log(`detailContent error: ${e.message}`);
        return { list: [{ vod_play_from: '51吸瓜', vod_play_url: `详情页加载失败$${id}` }] };
    }
}

async function search(inReq) {
    await ensureHost();
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const pg = String(inReq.body.page || 1);
    try {
        const url = pg === '1' ? `${host}/search/${key}/` : `${host}/search/${key}/${pg}`;
        const html = await safeRequest(url);
        if (!html) return { list: [], page: pg };
        const $ = load(html);
        return { list: getVideoList($, $('#archive article a, #index article a')), page: pg };
    } catch (e) {
        log(`searchContent error: ${e.message}`);
        return { list: [], page: pg };
    }
}

async function play(inReq) {
    await ensureHost();
    const url = String(inReq.body.id || '');
    const parseType = isVideoFormat(url) ? 0 : 1;
    log(`播放请求: parse=${parseType}, url=${url}`);
    return { parse: parseType, url, header: headers };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');
        const resp = await axios.get(raw, {
            headers,
            responseType: 'arraybuffer',
            timeout: 10000,
        });
        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';
        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'xigua51',
        name: '🔥51吸瓜',
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
