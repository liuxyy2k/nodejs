import axios from 'axios';
import https from 'https';

/**
 * 91大赛 - 列表/详情/剧集聚合 + XOR 图片解密代理
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const site = 'https://alone.cmxzettb.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 常见密钥 6/7/9，按站点 zzz.js 调整 */
const XOR_KEY = 7;

const MANUAL_CLASSES = [
    ['/category/jrds/', '今日大赛', 'iconfont icon-jrds'],
    ['/category/rsds/', '热搜大赛', 'iconfont icon-rsds'],
    ['/category/mrds/', '每日大赛', 'iconfont icon-mrds'],
    ['/category/aidj/', 'AI短剧', 'iconfont icon-aidj'],
    ['/category/nsds/', '女神大赛', 'iconfont icon-nsds'],
    ['/category/llds/', '乱伦大赛', 'iconfont icon-llds'],
    ['/category/xyds/', '学院大赛', 'iconfont icon-xyds'],
    ['/category/whds/', '网红大赛', 'iconfont icon-whds'],
    ['/category/lyds/', '撸友看片', 'iconfont icon-lyds'],
    ['/category/sjbzq/', '优选投放区', 'iconfont icon-sjbzq'],
    ['/category/qwds/', '奇闻大赛', 'iconfont icon-qwds'],
    ['/category/mxds/', '明星吃瓜', 'iconfont icon-mxds'],
    ['/category/ntds/', '女同大赛', 'iconfont icon-ntds'],
    ['/category/wmds/', '污漫大赛', 'iconfont icon-wmds'],
];

const CLASS_ICON_MAP = Object.fromEntries(MANUAL_CLASSES.map(([id, name, icon]) => [name, icon]));

const HOT_TAGS = [
    ['/tag/91大赛/', '91大赛', '🔥'],
    ['/tag/吃瓜/', '吃瓜', '🍉'],
    ['/tag/反差/', '反差', '😈'],
    ['/tag/自慰/', '自慰', '💧'],
    ['/tag/口交/', '口交', '👄'],
    ['/tag/巨乳/', '巨乳', '🍈'],
    ['/tag/后入/', '后入', '🐕'],
    ['/tag/母狗/', '母狗', '🐶'],
    ['/tag/反差婊/', '反差婊', '💋'],
    ['/tag/高颜值/', '高颜值', '✨'],
    ['/tag/美乳/', '美乳', '🍒'],
    ['/tag/黑丝/', '黑丝', '🖤'],
];

const EPISODE_RE = /^(.*?)(第\d+集)\s*(.*)$/;
const SERIES_CLEAN_RE = /^(.*?)(第\d+集|\d+集|完整版|无码版|爆燃来袭|重磅流出|高能开场|重磅来袭|已完结).*/;


const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: `${site}/`,
    },
    validateStatus: () => true,
});

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('data:')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('http')) return u;
    try {
        return new URL(u, site.endsWith('/') ? site : `${site}/`).href;
    } catch {
        return u.startsWith('/') ? `${site.replace(/\/$/, '')}${u}` : `${site}/${u}`;
    }
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/ds91/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function proxyImageUrl(raw, inReq) {
    if (!raw) return '';
    return `${getProxyBase(inReq)}?type=image&url=${encodeURIComponent(raw)}`;
}

function proxyM3u8Url(url, referer, inReq) {
    return `${getProxyBase(inReq)}?type=m3u8&url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer || site)}`;
}

async function getHtml(url, timeout = 15_000) {
    try {
        await sleep(300 + Math.random() * 500);
        const resp = await http.get(url, { timeout, responseType: 'text' });
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        if (resp.status === 200 && text.length > 500) return text;
        console.log(`[91ds] 获取失败：${url} 状态码 ${resp.status} 长度 ${text.length}`);
    } catch (e) {
        console.log(`[91ds] 请求异常：${url} ${e.message}`);
    }
    return null;
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function fixImageUrl(pic) {
    return absUrl(pic);
}

function extractListImage(block, inReq) {
    const xk = block.match(/data-xkrkllgl="([^"]+)"/);
    if (xk) {
        const raw = fixImageUrl(xk[1]);
        return raw ? proxyImageUrl(raw, inReq) : '';
    }
    const ds = block.match(/data-src="([^"]+)"/);
    if (ds) {
        const raw = fixImageUrl(ds[1]);
        if (/\/new\/|\/xiao\/|\/upload\//.test(raw)) {
            return raw ? proxyImageUrl(raw, inReq) : '';
        }
        return raw;
    }
    const src = block.match(/<img[^>]*src="([^"]+)"/);
    if (src && !src[1].includes('zw.png') && !src[1].includes('lazyload')) {
        return fixImageUrl(src[1]);
    }
    return '';
}

function parseListHtml(html, inReq) {
    if (!html) return [];
    const videos = [];

    let items = [...html.matchAll(/<li class="(?:Xc_home_article-si|Xc_archive-si)[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map(
        (m) => m[1],
    );
    if (!items.length) {
        items = [
            ...html.matchAll(
                /<(?:article|div)\s[^>]*class="[^"]*(?:post|article|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/g,
            ),
        ].map((m) => m[1]);
    }

    if (!items.length) {
        for (const m of html.matchAll(/(<a\s[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>)/g)) {
            const block = m[1];
            const href = m[2];
            const titleM = block.match(/title="([^"]*)"/) || block.match(/alt="([^"]*)"/);
            const title = titleM?.[1] || '';
            if (!title) continue;
            const pic = extractListImage(block, inReq) || '';
            const vidM = href.match(/\/archives\/(\d+)\//);
            const vid = vidM ? vidM[1] : href;
            const remarksM = block.match(/<time[^>]*>([\s\S]*?)<\/time>/);
            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remarksM ? stripTags(remarksM[1]) : '',
            });
        }
        return videos;
    }

    for (const item of items) {
        let href = '';
        let title = '';

        let aMatch = item.match(/<a\s[^>]*href="([^"]+)"[^>]*title="([^"]*)"/);
        if (aMatch) {
            href = aMatch[1];
            title = aMatch[2].trim();
        } else {
            aMatch = item.match(/<a\s[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*alt="([^"]*)"/);
            if (aMatch) {
                href = aMatch[1];
                title = aMatch[2].trim();
            } else {
                aMatch = item.match(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
                if (aMatch) {
                    href = aMatch[1];
                    title = stripTags(aMatch[2]);
                }
            }
        }
        if (!href || !title) continue;

        const pic = extractListImage(item, inReq) || '';
        const vidM = href.match(/\/archives\/(\d+)\//);
        const vid = vidM ? vidM[1] : href;
        const remarksM =
            item.match(/<div class="last">([\s\S]*?)<\/div>/) || item.match(/<time[^>]*>([\s\S]*?)<\/time>/);

        videos.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarksM ? stripTags(remarksM[1]) : '',
        });
    }
    return videos;
}

async function fetchDynamicClasses() {
    const html = await getHtml(site);
    if (!html) return [];
    const classes = [];
    const seen = new Set();

    for (const re of [
        /<a class="item[^"]*" href="(\/category\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
        /<li><a class="link[^"]*" href="(\/category\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
    ]) {
        for (const m of html.matchAll(re)) {
            const tid = m[1];
            const name = stripTags(m[2]);
            if (name && !seen.has(tid)) {
                seen.add(tid);
                classes.push({ type_id: tid, type_name: name });
            }
        }
    }
    return classes;
}

function buildHotSubclass() {
    return HOT_TAGS.map(([id, name, emoji]) => ({
        type_id: id,
        type_name: `${emoji} ${name}`,
    }));
}

function buildTagFilter() {
    return {
        key: 'tag',
        name: '热门标签',
        value: [{ n: '默认', v: '' }, ...HOT_TAGS.map(([id, name, emoji]) => ({ n: `${emoji} ${name}`, v: id }))],
    };
}

function classEntry(typeId, typeName, typeIcon) {
    return {
        type_id: typeId,
        type_name: typeName,
        type_icon: typeIcon || CLASS_ICON_MAP[typeName] || 'iconfont icon-default',
        subclass: buildHotSubclass(),
    };
}

function extractVideoFromConfig(html) {
    let purl = '';
    let pic = '';
    for (const pattern of [/data-config="([^"]*)"/, /data-config=\s*"([^"]*?)"/, /data-config='([^']*)'/]) {
        const match = html.match(pattern);
        if (!match) continue;
        try {
            const configStr = match[1].replace(/&quot;/g, '"').replace(/\\\//g, '/');
            const config = JSON.parse(configStr);
            const video = config.video || {};
            purl = video.url || '';
            pic = video.pic || '';
            if (purl) break;
        } catch {
            /* continue */
        }
    }
    if (pic) pic = fixImageUrl(pic);
    return { purl, pic };
}

function extractVideoStrategies(html) {
    const fromCfg = extractVideoFromConfig(html);
    if (fromCfg.purl) return fromCfg.purl;

    const strategies = [
        () => html.match(/new\s+DPlayer\s*\(\s*\{[^}]*url\s*:\s*["']([^"']+)/)?.[1],
        () => {
            const m = html.match(/var player_[^=]+=\s*(\{[\s\S]*?\})/);
            if (!m) return '';
            try {
                return JSON.parse(m[1])?.url || '';
            } catch {
                return '';
            }
        },
        () => html.match(/"","url":"(.*?)"/)?.[1]?.replace(/\\/g, ''),
        () => html.match(/<video[^>]+src="([^"]+)"/)?.[1],
        () => html.match(/<source[^>]+src="([^"]+)"/)?.[1],
        () => html.match(/<iframe[^>]+src="([^"]+)"/)?.[1],
        () => html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)?.[1],
        () => html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/)?.[1],
        () => html.match(/data-url="([^"]+)"/)?.[1],
        () => html.match(/data-src="([^"]+\.(?:m3u8|mp4))"/)?.[1],
        () => {
            const m = html.match(/playerConfig\s*=\s*(\{[\s\S]*?\})/);
            if (!m) return '';
            try {
                const conf = JSON.parse(m[1]);
                return conf.url || conf.video?.url || '';
            } catch {
                return '';
            }
        },
        () => {
            const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
            if (!m) return '';
            try {
                const data = JSON.parse(m[1]);
                const items = data['@graph'] || [data];
                for (const item of items) {
                    if (item['@type'] === 'VideoObject') {
                        return item.contentUrl || item.embedUrl || '';
                    }
                }
            } catch {
                /* ignore */
            }
            return '';
        },
        () => {
            const all = [...html.matchAll(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/g)].map((x) => x[1]);
            return all[0] || '';
        },
    ];

    for (const fn of strategies) {
        try {
            const u = fn();
            if (u) return u;
        } catch {
            /* continue */
        }
    }
    return '';
}

function detailUrlOf(vid) {
    if (/^\d+$/.test(String(vid))) return `${site}/archives/${vid}/`;
    if (String(vid).startsWith('/archives/')) return absUrl(vid);
    return absUrl(vid);
}

function singleVideo(vid, title, pic, purl) {
    return {
        vod_id: vid,
        vod_name: title,
        vod_pic: pic,
        vod_play_from: '直链播放',
        vod_play_url: `播放$${purl}`,
    };
}

async function searchSeries(name, excludeVid) {
    const series = [];
    try {
        const html = await getHtml(`${site}/?s=${encodeURIComponent(name)}`);
        if (!html) return series;
        const videos = parseListHtml(html, null);

        for (const v of videos) {
            if (String(v.vod_id) === String(excludeVid)) continue;
            const ep = EPISODE_RE.exec(v.vod_name);
            if (!ep) continue;
            let vSeries = ep[1].trim();
            vSeries = vSeries.replace(SERIES_CLEAN_RE, '$1').trim() || vSeries;
            if (!(name.includes(vSeries) || vSeries.includes(name) || v.vod_name.includes(name))) continue;

            const epNumM = v.vod_name.match(/第(\d+)集/);
            const epNum = epNumM ? parseInt(epNumM[1], 10) : 0;
            const dhtml = await getHtml(detailUrlOf(v.vod_id));
            if (!dhtml) continue;
            const purl = extractVideoFromConfig(dhtml).purl || extractVideoStrategies(dhtml);
            if (!purl) continue;
            series.push({
                vod_id: v.vod_id,
                vod_name: v.vod_name,
                episode_name: ep[2],
                episode_num: epNum,
                vod_play_url: purl,
            });
        }

        const selfHtml = await getHtml(detailUrlOf(excludeVid));
        if (selfHtml) {
            const titleM = selfHtml.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
            const title = titleM ? stripTags(titleM[1]) : '';
            const purl = extractVideoFromConfig(selfHtml).purl || extractVideoStrategies(selfHtml);
            if (purl && title) {
                const epM = EPISODE_RE.exec(title);
                const epNumM = title.match(/第(\d+)集/);
                const epNum = epNumM ? parseInt(epNumM[1], 10) : 0;
                series.push({
                    vod_id: excludeVid,
                    vod_name: title,
                    episode_name: epM ? epM[2] : `第${epNum}集`,
                    episode_num: epNum,
                    vod_play_url: purl,
                });
            }
        }
    } catch (e) {
        console.log(`[91ds] 系列聚合出错: ${e.message}`);
    }
    return series;
}

// ─── m3u8 简单清洗（去相对路径 + master 代理） ────────────────────────────────

function cleanM3u8(text, m3u8Url, referer, inReq) {
    const lines = String(text || '')
        .replace(/\r/g, '')
        .split('\n');
    const out = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            out.push(
                line.replace(/URI="([^"]+)"/, (_, u) => {
                    try {
                        return `URI="${new URL(u, m3u8Url).href}"`;
                    } catch {
                        return `URI="${u}"`;
                    }
                }),
            );
            continue;
        }
        try {
            const abs = new URL(line, m3u8Url).href;
            out.push(line.toLowerCase().includes('.m3u8') ? proxyM3u8Url(abs, referer, inReq) : abs);
        } catch {
            out.push(line);
        }
    }
    return `${out.join('\n')}\n`;
}

function xorDecryptImage(buf) {
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ XOR_KEY;
    return out;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    const dynamic = await fetchDynamicClasses();
    const seen = new Set();
    const classes = [];
    const tagFilter = buildTagFilter();

    for (const c of dynamic) {
        if (seen.has(c.type_id)) continue;
        seen.add(c.type_id);
        classes.push(classEntry(c.type_id, c.type_name));
    }
    for (const [tid, name, icon] of MANUAL_CLASSES) {
        if (seen.has(tid)) continue;
        seen.add(tid);
        classes.push(classEntry(tid, name, icon));
    }

    const filters = {};
    for (const c of classes) {
        if (String(c.type_id).startsWith('/category/')) {
            filters[c.type_id] = [tagFilter];
        }
    }

    const html = await getHtml(site);
    const list = html ? parseListHtml(html, inReq) : [];
    return { class: classes, filters, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const page = String(inReq.body.page || inReq.body.pg || '1');
    const extend = inReq.body.extend || {};
    const tag = extend.tag || '';

    const cid = tag || tid;
    const baseUrl = absUrl(cid);
    const urls =
        page === '1'
            ? [baseUrl]
            : [
                  `${baseUrl.replace(/\/$/, '')}/${page}/`,
                  `${baseUrl.replace(/\/$/, '')}/page/${page}/`,
                  `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`,
              ];

    let html = null;
    for (const url of urls) {
        html = await getHtml(url);
        if (html) break;
    }
    const videos = html ? parseListHtml(html, inReq) : [];
    return {
        list: videos,
        page: parseInt(page, 10) || 1,
        pagecount: 9999,
        limit: 90,
        total: videos.length,
    };
}

async function detail(inReq, _outResp) {
    const did = String(inReq.body.id || '');
    const vid = (/^\d+$/.test(did) ? did : did.match(/\/archives\/(\d+)\//)?.[1]) || did;
    const detailUrl = detailUrlOf(did);

    const html = await getHtml(detailUrl, 20_000);
    if (!html) return { list: [] };

    try {
        let title = '';
        for (const p of [
            /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/,
            /<meta[^>]*property="og:title"[^>]*content="([^"]*)"/,
            /<title>([\s\S]*?)<\/title>/,
        ]) {
            const m = html.match(p);
            if (m) {
                title = stripTags(m[1]);
                break;
            }
        }

        let { purl, pic } = extractVideoFromConfig(html);
        if (!purl) purl = extractVideoStrategies(html);

        if (!pic) {
            const picM = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/);
            if (picM) pic = fixImageUrl(picM[1]);
        }
        if (!pic) {
            const imgM = html.match(/<img[^>]*data-xkrkllgl="([^"]+)"/);
            if (imgM) pic = proxyImageUrl(fixImageUrl(imgM[1]), inReq);
        }

        const epInfo = title ? EPISODE_RE.exec(title) : null;
        if (epInfo && purl) {
            let seriesName = epInfo[1].trim();
            seriesName = seriesName.replace(SERIES_CLEAN_RE, '$1').trim() || seriesName;
            const seriesVideos = await searchSeries(seriesName, vid);
            if (seriesVideos.length > 1) {
                seriesVideos.sort((a, b) => (a.episode_num || 0) - (b.episode_num || 0));
                const playList = seriesVideos
                    .filter((v) => v.vod_play_url)
                    .map((v) => `${v.episode_name}$${v.vod_play_url}`);
                return {
                    list: [
                        {
                            vod_id: vid,
                            vod_name: title,
                            vod_pic: pic,
                            vod_remarks: `共${seriesVideos.length}集`,
                            vod_play_from: '剧集连播',
                            vod_play_url: playList.join('#'),
                        },
                    ],
                };
            }
        }

        return { list: [singleVideo(vid, title, pic, purl)] };
    } catch (e) {
        console.log(`[91ds] 详情解析出错: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const videoUrl = id.startsWith('http') ? id : absUrl(id);
    const header = { 'User-Agent': UA, Referer: `${site}/`, Origin: site };

    // m3u8 走代理清洗；mp4 直链
    if (/\.m3u8(\?|$)/i.test(videoUrl)) {
        return { parse: 0, url: proxyM3u8Url(videoUrl, site, inReq), header };
    }
    return { parse: 0, url: videoUrl, header };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const page = String(inReq.body.pg || inReq.body.page || '1');
    let url = `${site}/?s=${encodeURIComponent(key)}`;
    if (page !== '1') url = `${site}/page/${page}/?s=${encodeURIComponent(key)}`;
    const html = await getHtml(url);
    const videos = html ? parseListHtml(html, inReq) : [];
    return {
        list: videos,
        page: parseInt(page, 10) || 1,
        pagecount: 9999,
        limit: 90,
        total: videos.length,
    };
}

async function proxyHandler(inReq, outResp) {
    const type = inReq.query.type || '';

    if (type === 'm3u8') {
        const url = inReq.query.url || '';
        const referer = inReq.query.referer || site;
        if (!url) return outResp.code(404).type('text/plain').send('no url');
        try {
            const resp = await http.get(url, {
                headers: { Referer: referer, Origin: site, 'User-Agent': UA },
                responseType: 'text',
                timeout: 10_000,
            });
            if (resp.status !== 200) return outResp.code(404).type('text/plain').send('download failed');
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            const cleaned = cleanM3u8(text, url, referer, inReq);
            return outResp.type('application/vnd.apple.mpegurl').send(cleaned);
        } catch (e) {
            console.log(`[91ds] m3u8 代理异常: ${e.message}`);
            return outResp.code(404).type('text/plain').send('proxy error');
        }
    }

    if (type === 'image') {
        const url = inReq.query.url || '';
        if (!url) return outResp.code(404).type('text/plain').send('no url');
        try {
            const resp = await http.get(url, {
                headers: { Referer: `${site}/`, 'User-Agent': UA },
                responseType: 'arraybuffer',
                timeout: 15_000,
            });
            if (resp.status !== 200) return outResp.code(404).type('text/plain').send('fetch failed');
            const decrypted = xorDecryptImage(Buffer.from(resp.data));
            let ct = 'image/jpeg';
            if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
            else if (decrypted.slice(0, 3).toString() === 'GIF') ct = 'image/gif';
            else if (decrypted[0] === 0xff && decrypted[1] === 0xd8) ct = 'image/jpeg';
            return outResp.type(ct).send(decrypted);
        } catch (e) {
            console.log(`[91ds] 图片代理异常: ${e.message}`);
            return outResp.code(500).type('text/plain').send('proxy error');
        }
    }

    return outResp.code(404).type('text/plain').send('unsupported type');
}

export default {
    meta: {
        key: 'ds91',
        name: '🍉91大赛',
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
