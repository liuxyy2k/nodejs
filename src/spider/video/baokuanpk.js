import axios from 'axios';
import { URL } from 'url';

/**
 * 爆款片库 - https://bkpk82.baokuanpk.cc
 * API / HTML 双模式 + m3u8 广告清洗
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const site = 'https://bkpk82.baokuanpk.cc';
const apiUrl = `${site}/api.php/provide/vod/`;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const AD_KEYWORDS = [
    '新葡京', '澳门赌场', '老虎机', 'pg电子', 'cq9', '棋牌', '百家乐', '投注',
    '充值送', '首存', '返水', '赌场', 'casino', '娱乐城', '博彩', '彩票',
];

const CLASS_LIST = [
    { type_id: '/bb/index.php/vod/type/id/29.html', type_name: '国产自拍' },
    { type_id: '/bb/index.php/vod/type/id/30.html', type_name: '国产偷拍' },
    { type_id: '/bb/index.php/vod/type/id/33.html', type_name: '短视频' },
    { type_id: '/bb/index.php/vod/type/id/35.html', type_name: '国产主播' },
    { type_id: '/bb/index.php/vod/type/id/80.html', type_name: '国产女王' },
    { type_id: '/bb/index.php/vod/type/id/81.html', type_name: '国产女奴' },
    { type_id: '/bb/index.php/vod/type/id/83.html', type_name: '福利姬' },
    { type_id: '/bb/index.php/vod/type/id/84.html', type_name: '抖阴视频' },
    { type_id: '/bb/index.php/vod/type/id/85.html', type_name: '国模私拍' },
    { type_id: '/bb/index.php/vod/type/id/88.html', type_name: '国产乱伦' },
    { type_id: '/bb/index.php/vod/type/id/91.html', type_name: '网曝系列' },
    { type_id: '/bb/index.php/vod/type/id/107.html', type_name: '台湾辣妹' },
    { type_id: '/bb/index.php/vod/type/id/108.html', type_name: '唯美港姐' },
    { type_id: '/bb/index.php/vod/type/id/109.html', type_name: '国产探花' },
    { type_id: '/bb/index.php/vod/type/id/110.html', type_name: '野外露出' },
    { type_id: '/bb/index.php/vod/type/id/26.html', type_name: '国产精品' },
    { type_id: '/bb/index.php/vod/type/id/27.html', type_name: '国产传媒' },
    { type_id: '/bb/index.php/vod/type/id/101.html', type_name: '有码精品' },
    { type_id: '/bb/index.php/vod/type/id/116.html', type_name: '欺辱凌辱' },
    { type_id: '/bb/index.php/vod/type/id/117.html', type_name: 'AV解说' },
    { type_id: '/bb/index.php/vod/type/id/118.html', type_name: '有码VR' },
    { type_id: '/bb/index.php/vod/type/id/48.html', type_name: '美乳巨乳' },
    { type_id: '/bb/index.php/vod/type/id/59.html', type_name: '丝袜美腿' },
    { type_id: '/bb/index.php/vod/type/id/46.html', type_name: '口爆颜射' },
    { type_id: '/bb/index.php/vod/type/id/50.html', type_name: '强奸乱伦' },
    { type_id: '/bb/index.php/vod/type/id/93.html', type_name: '多人运动' },
    { type_id: '/bb/index.php/vod/type/id/52.html', type_name: '制服诱惑' },
    { type_id: '/bb/index.php/vod/type/id/43.html', type_name: '女仆' },
    { type_id: '/bb/index.php/vod/type/id/31.html', type_name: '人妻熟女' },
    { type_id: '/bb/index.php/vod/type/id/58.html', type_name: 'cosplay' },
    { type_id: '/bb/index.php/vod/type/id/34.html', type_name: '潮吹喷射' },
    { type_id: '/bb/index.php/vod/type/id/47.html', type_name: '萝莉少女' },
    { type_id: '/bb/index.php/vod/type/id/44.html', type_name: '素人' },
    { type_id: '/bb/index.php/vod/type/id/53.html', type_name: '女同性恋' },
    { type_id: '/bb/index.php/vod/type/id/32.html', type_name: 'SM重口味' },
    { type_id: '/bb/index.php/vod/type/id/45.html', type_name: '熟女' },
    { type_id: '/bb/index.php/vod/type/id/55.html', type_name: '教师' },
    { type_id: '/bb/index.php/vod/type/id/62.html', type_name: '无码VR' },
    { type_id: '/bb/index.php/vod/type/id/76.html', type_name: '制服无码' },
    { type_id: '/bb/index.php/vod/type/id/86.html', type_name: '女优明星' },
    { type_id: '/bb/index.php/vod/type/id/102.html', type_name: '无码精品' },
    { type_id: '/bb/index.php/vod/type/id/51.html', type_name: '日本中字' },
    { type_id: '/bb/index.php/vod/type/id/104.html', type_name: '欧美精品' },
    { type_id: '/bb/index.php/vod/type/id/103.html', type_name: '动漫精品' },
    { type_id: '/bb/index.php/vod/type/id/39.html', type_name: '综合三级' },
    { type_id: '/bb/index.php/vod/type/id/82.html', type_name: '韩国精品' },
    { type_id: '/bb/index.php/vod/type/id/42.html', type_name: '恐怖色情' },
    { type_id: '/bb/index.php/vod/type/id/54.html', type_name: '人兽性交' },
    { type_id: '/bb/index.php/vod/type/id/61.html', type_name: 'AI换脸' },
];

const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Connection: 'keep-alive',
};

const http = axios.create({
    timeout: 10_000,
    headers,
    validateStatus: () => true,
});

let useApi = false;

function log(msg) {
    console.log(`[baokuanpk] ${msg}`);
}

function absUrl(u, base = site) {
    if (!u) return '';
    if (u.startsWith('//')) return `http:${u}`;
    if (u.startsWith('http')) return u;
    try {
        return new URL(u, base.endsWith('/') ? base : `${base}/`).href;
    } catch {
        return u.startsWith('/') ? site + u : `${site}/${u}`;
    }
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/baokuanpk/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function proxyM3u8Url(url, referer, inReq) {
    return `${getProxyBase(inReq)}?type=m3u8&url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer || site)}`;
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

async function fetchJson(url) {
    try {
        const resp = await http.get(url, { responseType: 'json', timeout: 5_000 });
        if (resp.status !== 200) return null;
        return resp.data;
    } catch {
        return null;
    }
}

async function checkApiAvailable() {
    try {
        const data = await fetchJson(`${apiUrl}?ac=list&t=1&pg=1`);
        if (data?.code === 1 && data?.list?.length) {
            useApi = true;
            log('API可用，切换到API模式');
            return;
        }
    } catch (e) {
        log(`API检测失败: ${e.message}`);
    }
    useApi = false;
    log('API不可用，使用HTML解析模式');
}

function extractVideosFromHtml(html) {
    const videos = [];
    if (!html || html.length < 500) return videos;

    const precise =
        /<div[^>]*class=["'][^"']*vod[^"']*["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*vod-img[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]*data-original=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<div[^>]*class=["'][^"']*vod-txt[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;

    for (const m of html.matchAll(precise)) {
        const href = m[1];
        let img = m[2];
        const title = stripTags(m[3]);
        if (!title || title.length < 2) continue;
        img = absUrl(img);
        if (!videos.some((v) => v.vod_id === href)) {
            videos.push({ vod_id: href, vod_name: title, vod_pic: img, vod_remarks: '' });
        }
    }

    if (!videos.length) {
        for (const link of html.matchAll(/<a[^>]*href=["']([^"']*(?:\/detail\/id\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
            const href = link[1];
            const inner = link[2];
            const start = Math.max(link.index - 1000, 0);
            const end = Math.min(link.index + link[0].length + 1000, html.length);
            const context = html.slice(start, end);
            const imgM = context.match(/data-original=["']([^"']+)["']/i);
            let img = imgM ? absUrl(imgM[1]) : '';
            const title = stripTags(inner);
            if (!title) continue;
            if (!videos.some((v) => v.vod_id === href)) {
                videos.push({ vod_id: href, vod_name: title, vod_pic: img, vod_remarks: '' });
            }
        }
    }
    return videos;
}

function buildPageUrl(cid, pg) {
    if (!cid) return `${site}/bb/`;
    let base = cid.startsWith('http') ? cid : site + (cid.startsWith('/') ? cid : `/${cid}`);
    const page = parseInt(pg, 10) || 1;
    if (page <= 1) return base;
    if (base.endsWith('.html')) return `${base.slice(0, -5)}-${page}.html`;
    return `${base}${base.includes('?') ? '&' : '?'}page=${page}`;
}

function decryptObfuscatedUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    let url = rawUrl.trim();
    if (/^[A-Za-z0-9+/=]+$/.test(url) && url.length % 4 === 0) {
        try {
            const decoded = Buffer.from(url, 'base64').toString('utf-8');
            if (decoded.startsWith('http')) return decoded;
        } catch {
            /* ignore */
        }
    }
    try {
        const decoded = decodeURIComponent(url);
        if (decoded !== url && decoded.startsWith('http')) return decoded;
    } catch {
        /* ignore */
    }
    return url.replace(/\\\//g, '/');
}

function extractBalancedJson(start) {
    let brace = 0;
    let jsonStr = '';
    for (const ch of start) {
        jsonStr += ch;
        if (ch === '{') brace++;
        else if (ch === '}') {
            brace--;
            if (brace === 0) break;
        }
    }
    if (!jsonStr.endsWith('}')) jsonStr += '}';
    return jsonStr.replace(/\\\//g, '/');
}

async function getM3u8FromPlayPage(playPagePath) {
    try {
        const playUrlFull = playPagePath.startsWith('http') ? playPagePath : site + playPagePath;
        log(`请求播放页: ${playUrlFull}`);
        const html = await fetchText(playUrlFull);
        if (!html || html.length < 500) return { url: '', from: 'naixx' };

        // 策略1: player_XXXX
        for (const m of html.matchAll(/var\s+(player_\w+)\s*=\s*(\{)/g)) {
            const startIdx = m.index + m[0].length - 1;
            const jsonStr = extractBalancedJson(html.slice(startIdx));
            try {
                const data = JSON.parse(jsonStr);
                const rawUrl = data.url || '';
                if (rawUrl && !rawUrl.includes('baokuanpk.cc')) {
                    const url = decryptObfuscatedUrl(rawUrl);
                    if (url.startsWith('http')) {
                        log(`策略1 ${m[1]}: ${url.slice(0, 60)}`);
                        return { url, from: data.from || 'naixx' };
                    }
                }
            } catch {
                /* continue */
            }
        }

        // 策略2: player 附近
        for (const m of html.matchAll(/var\s+player_\w+\s*=/g)) {
            const window = html.slice(m.index, m.index + 3000);
            const urlMatch = window.match(/"url"\s*:\s*"(https?[^"]+)"/);
            if (urlMatch) {
                let rawUrl = urlMatch[1].replace(/\\\//g, '/');
                if (!rawUrl.includes('baokuanpk.cc')) {
                    const url = decryptObfuscatedUrl(rawUrl);
                    if (url.startsWith('http')) {
                        const fromM = window.match(/"from"\s*:\s*"([^"]+)"/);
                        return { url, from: fromM?.[1] || 'naixx' };
                    }
                }
            }
        }

        // 策略3: 全局 url
        for (const urlMatch of html.matchAll(/"url"\s*:\s*"(https?[^"]+)"/g)) {
            let rawUrl = urlMatch[1].replace(/\\\//g, '/');
            if (rawUrl.includes('baokuanpk.cc')) continue;
            const url = decryptObfuscatedUrl(rawUrl);
            if (url.startsWith('http') && (/\.m3u8|\.mp4|vostrely|stream/.test(url))) {
                const fromM = html.match(/"from"\s*:\s*"([^"]+)"/);
                return { url, from: fromM?.[1] || 'naixx' };
            }
        }

        // 策略4-7
        for (const tag of ['video', 'source']) {
            const m = html.match(new RegExp(`<${tag}[^>]*src=["']([^"']+)["']`, 'i'));
            if (m) {
                const url = decryptObfuscatedUrl(m[1]);
                if (url.startsWith('http') && !url.includes('baokuanpk.cc')) return { url, from: 'naixx' };
            }
        }

        const iframe = html.match(/<iframe[^>]*src=["']([^"']+)["']/i);
        if (iframe) {
            const url = decryptObfuscatedUrl(iframe[1]);
            if (/\.m3u8|\.mp4/.test(url)) return { url, from: 'naixx' };
        }

        const m3u8 = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8) return { url: decryptObfuscatedUrl(m3u8[1]), from: 'naixx' };

        const mp4 = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
        if (mp4) return { url: decryptObfuscatedUrl(mp4[1]), from: 'naixx' };

        const b64 = html.match(/(?:atob|btoa|base64Decode)\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/);
        if (b64) {
            try {
                const decoded = Buffer.from(b64[1], 'base64').toString('utf-8');
                if (decoded.startsWith('http') && !decoded.includes('baokuanpk.cc')) {
                    return { url: decoded, from: 'naixx' };
                }
            } catch {
                /* ignore */
            }
        }

        return { url: '', from: 'naixx' };
    } catch (e) {
        log(`getM3u8 错误: ${e.message}`);
        return { url: '', from: 'naixx' };
    }
}

// ─── m3u8 清洗 ────────────────────────────────────────────────────────────────

function segmentHostKey(uri, baseUrl) {
    try {
        const full = new URL(uri, baseUrl);
        return `${full.host.toLowerCase()}|${full.pathname.replace(/\/[^/]*$/, '/').toLowerCase()}`;
    } catch {
        return '|';
    }
}

function mainPathMarker(m3u8Url) {
    try {
        const p = new URL(m3u8Url).pathname;
        let m = p.match(/(\/\d{8}\/[^/]+\/\d+kb\/hls\/)/);
        if (m) return m[1].toLowerCase();
        m = p.match(/(\/\d{8}\/[^/]+\/)/);
        if (m) return m[1].toLowerCase();
    } catch {
        /* ignore */
    }
    return '';
}

function isAdSegment(uri, dur) {
    const u = String(uri || '').toLowerCase();
    if (!u) return false;
    if (AD_KEYWORDS.some((kw) => u.includes(kw.toLowerCase()))) return true;
    if (['ad', 'ads', 'advert', 'sponsor', 'preroll', '/gg/', '/adv/', 'banner', 'promo'].some((p) => u.includes(p))) {
        return true;
    }
    const d = Number(dur);
    return d > 0 && d <= 1.2;
}

function parseM3u8Segments(text) {
    const lines = String(text || '')
        .replace(/\r/g, '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
    const header = [];
    const segments = [];
    const tail = [];
    let pendingTags = [];
    let mediaSequence = 0;
    let targetDuration = 0;
    let started = false;
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
            mediaSequence = parseInt(line.split(':')[1], 10) || 0;
            (started ? pendingTags : header).push(line);
        } else if (line.startsWith('#EXT-X-TARGETDURATION')) {
            targetDuration = parseFloat(line.split(':')[1]) || 0;
            (started ? pendingTags : header).push(line);
        } else if (line.startsWith('#EXTINF')) {
            started = true;
            let dur = targetDuration || 3;
            const dm = line.match(/#EXTINF:\s*([\d.]+)/);
            if (dm) dur = parseFloat(dm[1]) || dur;
            const tags = [...pendingTags, line];
            pendingTags = [];
            let uri = '';
            let j = i + 1;
            while (j < lines.length) {
                if (lines[j].startsWith('#')) {
                    tags.push(lines[j]);
                    j++;
                    continue;
                }
                uri = lines[j];
                break;
            }
            if (uri) {
                segments.push({ tags, uri, dur });
                i = j;
            } else tail.push(...tags);
        } else if (line.startsWith('#EXT-X-ENDLIST')) {
            tail.push(line);
        } else if (line.startsWith('#')) {
            (started ? pendingTags : header).push(line);
        } else {
            started = true;
            segments.push({ tags: pendingTags, uri: line, dur: targetDuration || 3 });
            pendingTags = [];
        }
        i++;
    }
    return { header, segments, tail, mediaSequence, targetDuration };
}

function cleanM3u8(m3u8Text, m3u8Url = '', referer = '', skipSeconds = 25, inReq) {
    const text = String(m3u8Text || '').replace(/\r/g, '');
    if (text.includes('#EXT-X-STREAM-INF')) {
        const out = [];
        let lastStream = false;
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith('#')) {
                out.push(line);
                lastStream = line.startsWith('#EXT-X-STREAM-INF');
            } else {
                const abs = new URL(line, m3u8Url).href;
                out.push(lastStream || /\.m3u8/i.test(line) ? proxyM3u8Url(abs, referer, inReq) : abs);
                lastStream = false;
            }
        }
        return `${out.join('\n')}\n`;
    }

    const { header, segments, tail, mediaSequence, targetDuration } = parseM3u8Segments(text);
    if (!segments.length) {
        return text
            .split('\n')
            .map((line) => {
                const s = line.trim();
                if (!s || s.startsWith('#')) return line;
                try {
                    return new URL(s, m3u8Url).href;
                } catch {
                    return line;
                }
            })
            .join('\n');
    }

    const marker = mainPathMarker(m3u8Url);
    const stat = {};
    for (const seg of segments) {
        const key = segmentHostKey(seg.uri, m3u8Url);
        stat[key] = (stat[key] || 0) + Number(seg.dur || 0);
    }
    const mainKey = Object.entries(stat).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const totalDur = Object.values(stat).reduce((a, b) => a + b, 0) || 0;
    const mainDur = stat[mainKey] || 0;

    let cleaned = [];
    let removed = 0;
    segments.forEach((seg, idx) => {
        const key = segmentHostKey(seg.uri, m3u8Url);
        const isFront = idx < 12;
        let absUri = '';
        try {
            absUri = new URL(seg.uri, m3u8Url).href;
        } catch {
            absUri = seg.uri;
        }
        let isAd = isAdSegment(seg.uri, seg.dur);
        try {
            const path = new URL(absUri).pathname.toLowerCase();
            if (marker && !path.includes(marker)) isAd = true;
        } catch {
            /* ignore */
        }
        if (!isAd && isFront && totalDur > 0 && mainDur >= totalDur * 0.6) {
            if (key !== mainKey && (stat[key] || 0) <= 90) isAd = true;
        }
        if (isAd) {
            removed++;
            return;
        }
        cleaned.push({ ...seg, _idx: idx });
    });

    if (removed === 0 && segments.length > 4) {
        let acc = 0;
        let cut = 0;
        for (let idx = 0; idx < Math.min(12, segments.length); idx++) {
            const key = segmentHostKey(segments[idx].uri, m3u8Url);
            if (key === mainKey && acc >= 3) break;
            acc += Number(segments[idx].dur || targetDuration || 3);
            cut = idx + 1;
            if (acc >= skipSeconds) break;
        }
        if (cut > 0 && cut < segments.length) {
            const firstKey = segmentHostKey(segments[0].uri, m3u8Url);
            if (firstKey !== mainKey) {
                cleaned = segments.slice(cut).map((s, i) => ({ ...s, _idx: cut + i }));
                removed = cut;
            }
        }
    }
    if (!cleaned.length) {
        cleaned = segments.map((s, i) => ({ ...s, _idx: i }));
        removed = 0;
    }

    const newLines = [];
    let hasM3u = false;
    for (const line of header) {
        if (line.startsWith('#EXTM3U')) hasM3u = true;
        if (line.startsWith('#EXT-X-MEDIA-SEQUENCE') || line.startsWith('#EXT-X-START')) continue;
        if (line.startsWith('#EXT-X-KEY') && line.toUpperCase().includes('METHOD=NONE') && removed > 0) continue;
        newLines.push(line);
    }
    if (!hasM3u) newLines.unshift('#EXTM3U');
    newLines.push(`#EXT-X-MEDIA-SEQUENCE:${mediaSequence + (cleaned[0]?._idx ?? removed)}`);
    for (const seg of cleaned) {
        for (let tag of seg.tags || []) {
            if (tag.startsWith('#EXT-X-KEY') || tag.startsWith('#EXT-X-MAP')) {
                tag = tag.replace(/URI="([^"]+)"/, (_, u) => `URI="${new URL(u, m3u8Url).href}"`);
            }
            newLines.push(tag);
        }
        newLines.push(new URL(seg.uri, m3u8Url).href);
    }
    if (tail.some((l) => l.startsWith('#EXT-X-ENDLIST')) || text.includes('#EXT-X-ENDLIST')) {
        newLines.push('#EXT-X-ENDLIST');
    }
    log(`m3u8清洗: 原${segments.length} → 删${removed} 留${cleaned.length}`);
    return `${newLines.join('\n')}\n`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    await checkApiAvailable();
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    if (useApi) {
        const data = await fetchJson(`${apiUrl}?ac=list&pg=1`);
        if (data?.code === 1) {
            list = (data.list || []).slice(0, 30).map((item) => ({
                vod_id: String(item.vod_id || ''),
                vod_name: item.vod_name || '',
                vod_pic: item.vod_pic || '',
                vod_remarks: item.vod_remarks || '',
            }));
        }
    } else {
        const html = await fetchText(`${site}/bb/`);
        list = extractVideosFromHtml(html).slice(0, 30);
    }
    return { class: CLASS_LIST, filters: {}, list };
}

async function category(inReq, _outResp) {
    let cid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;

    if (useApi) {
        let tid = cid;
        const m = cid.match(/id\/(\d+)/);
        if (m) tid = m[1];
        const data = await fetchJson(`${apiUrl}?ac=list&t=${tid}&pg=${pg}`);
        const videos = [];
        let page = pg;
        let pagecount = 9999;
        let limit = 20;
        let total = 999999;
        if (data?.code === 1) {
            for (const item of data.list || []) {
                videos.push({
                    vod_id: String(item.vod_id || ''),
                    vod_name: item.vod_name || '',
                    vod_pic: item.vod_pic || '',
                    vod_remarks: item.vod_remarks || '',
                });
            }
            page = data.page || pg;
            pagecount = data.pagecount || 9999;
            limit = data.limit || 20;
            total = data.total || 999999;
        }
        return { list: videos, page, pagecount, limit, total };
    }

    if (/^\d+$/.test(cid)) cid = `/bb/index.php/vod/type/id/${cid}.html`;
    const url = buildPageUrl(cid, pg);
    const html = await fetchText(url);
    const videos = html.length >= 500 ? extractVideosFromHtml(html) : [];
    return { list: videos, page: pg, pagecount: 9999, limit: 90, total: 999999 };
}

async function detail(inReq, _outResp) {
    let did = String(inReq.body.id || '');

    if (useApi && /^\d+$/.test(did)) {
        const data = await fetchJson(`${apiUrl}?ac=detail&ids=${did}`);
        if (data?.code === 1 && data.list?.[0]) {
            const item = data.list[0];
            return {
                list: [
                    {
                        vod_id: String(item.vod_id || ''),
                        vod_name: item.vod_name || '',
                        vod_pic: item.vod_pic || '',
                        vod_remarks: item.vod_remarks || '',
                        vod_content: item.vod_content || '',
                        vod_play_from: item.vod_play_from || '直链播放',
                        vod_play_url: item.vod_play_url || '',
                    },
                ],
            };
        }
        return { list: [] };
    }

    try {
        if (/^\d+$/.test(did)) did = `/bb/index.php/vod/detail/id/${did}.html`;
        else if (!did.startsWith('/') && !did.startsWith('http')) did = `/${did}`;
        const detailUrl = did.startsWith('http') ? did : site + did;
        const html = await fetchText(detailUrl);
        if (!html || html.length < 500) return { list: [] };

        let title = '';
        let m = html.match(/<h3[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
        if (m) title = stripTags(m[1]);
        if (!title) {
            m = html.match(/<title>([\s\S]*?)<\/title>/i);
            if (m) title = m[1].split('-')[0].trim();
        }

        let pic = '';
        m = html.match(/<img[^>]*class=["'][^"']*lazy[^"']*["'][^>]*data-original=["']([^"']+)["']/i);
        if (m) pic = m[1];
        if (!pic) {
            m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            if (m) pic = m[1];
        }
        if (pic) pic = absUrl(pic, detailUrl);

        const episodes = [];
        const plM = html.match(
            /<ul[^>]*class=["'][^"']*(?:playlist|play.list|play.url)[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i,
        );
        if (plM) {
            for (const item of plM[1].matchAll(/<a[^>]*href=["']([^"']*vod\/play\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
                episodes.push([stripTags(item[2]) || '正片', item[1]]);
            }
        } else {
            const seen = new Set();
            for (const item of html.matchAll(
                /href=["']([^"']*\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi,
            )) {
                if (seen.has(item[1])) continue;
                seen.add(item[1]);
                episodes.push([stripTags(item[2]) || `第${episodes.length + 1}集`, item[1]]);
            }
        }

        if (!episodes.length) {
            const idM = did.match(/id\/(\d+)/);
            if (idM) {
                episodes.push(['正片', `/bb/index.php/vod/play/id/${idM[1]}/sid/1/nid/1.html`]);
            }
        }

        let vodPlayUrl = '';
        if (episodes.length) {
            vodPlayUrl = episodes.map(([name, path]) => `${name}$${path}`).join('#');
        } else {
            const playM = html.match(/href=["']([^"']*\/vod\/play\/[^"']*)["'][^>]*>立即播放/i);
            if (playM) vodPlayUrl = `正片$${playM[1]}`;
        }

        return {
            list: [
                {
                    vod_id: did,
                    vod_name: title,
                    vod_pic: pic,
                    vod_play_from: 'naixx',
                    vod_play_url: vodPlayUrl,
                },
            ],
        };
    } catch (e) {
        log(`detail 错误: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    let m3u8Url = id;
    const isPlayPage = !id.startsWith('http') && (/\/vod\/play\//.test(id) || id.startsWith('/'));

    if (isPlayPage) {
        const r = await getM3u8FromPlayPage(id);
        m3u8Url = r.url;
        if (!m3u8Url) {
            log(`未提取到播放地址 id=${id}`);
            return { parse: 0, url: '' };
        }
    }

    m3u8Url = decryptObfuscatedUrl(m3u8Url);
    const header = { 'User-Agent': UA, Referer: `${site}/`, Origin: site };

    if (/\.m3u8/i.test(m3u8Url) || !/\.mp4/i.test(m3u8Url)) {
        return { parse: 0, url: proxyM3u8Url(m3u8Url, `${site}/`, inReq), header };
    }
    return { parse: 0, url: m3u8Url, header };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const page = String(inReq.body.pg || inReq.body.page || '1');

    if (useApi) {
        const data = await fetchJson(`${apiUrl}?ac=list&wd=${encodeURIComponent(key)}&pg=${page}`);
        const videos = [];
        if (data?.code === 1) {
            for (const item of data.list || []) {
                videos.push({
                    vod_id: String(item.vod_id || ''),
                    vod_name: item.vod_name || '',
                    vod_pic: item.vod_pic || '',
                    vod_remarks: item.vod_remarks || '',
                });
            }
            return {
                list: videos,
                page: data.page || page,
                pagecount: data.pagecount || 9999,
                limit: data.limit || 20,
                total: data.total || 999999,
            };
        }
        return { list: [], page, pagecount: 9999, limit: 20, total: 999999 };
    }

    const searchUrl = `${site}/bb/index.php/vod/search.html?wd=${encodeURIComponent(key)}&page=${page}`;
    const html = await fetchText(searchUrl);
    const videos = html.length > 500 ? extractVideosFromHtml(html) : [];
    return { list: videos, page, pagecount: 9999, limit: 90, total: 999999 };
}

async function proxyHandler(inReq, outResp) {
    if (inReq.query.type !== 'm3u8') {
        return outResp.code(404).type('text/plain').send('unsupported type');
    }
    const url = inReq.query.url || '';
    const referer = inReq.query.referer || site;
    if (!url) return outResp.code(404).type('text/plain').send('no url');
    try {
        const resp = await http.get(url, {
            headers: { 'User-Agent': UA, Referer: referer, Origin: site },
            responseType: 'text',
            timeout: 10_000,
        });
        if (resp.status !== 200) return outResp.code(404).type('text/plain').send('m3u8 download failed');
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        const cleaned = cleanM3u8(text, url, referer, 25, inReq);
        return outResp.type('application/vnd.apple.mpegurl').send(cleaned);
    } catch (e) {
        log(`proxy 失败: ${e.message}`);
        return outResp.code(404).type('text/plain').send('proxy error');
    }
}

export default {
    meta: {
        key: 'baokuanpk',
        name: '💋爆款片库',
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
