import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://supjav.com/zh';
const LK_BASE = 'https://lk1.supremejav.com/supjav.php';

async function request(targetUrl, referer = '') {
    const headers = {
        'User-Agent': UA,
        Referer: referer || `${site}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
    };
    // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
    const resp = await req.get(targetUrl, { headers });
    return resp.data;
}

async function fetchText(url, referer = `${site}/`) {
    const resp = await req.get(url, {
        headers: { 'User-Agent': UA, Referer: referer },
        timeout: 30000,
        validateStatus: () => true,
    });
    return String(resp.data || '');
}

function absUrl(url, base) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    try { return new URL(url, base).href; } catch { return url; }
}

function pickBestM3u8(text, base) {
    const lines = String(text || '').split('\n');
    let best = '';
    let bestH = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const m = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        const h = m ? parseInt(m[1], 10) : 0;
        const url = absUrl(lines[i + 1]?.trim(), base);
        if (url && h >= bestH) { bestH = h; best = url; }
    }
    if (best) return best;
    const direct = lines.find((l) => l.trim() && !l.startsWith('#'));
    return absUrl(direct?.trim(), base);
}

async function extractStream(html, ref) {
    let hits = [...String(html || '').matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((x) => x[0]);
    if (hits.length) return hits[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');

    const hash = load(html)('#video_player').attr('data-hash');
    if (hash) {
        const referer = /turbovidhls|turbosplayer|turboviplay/i.test(hash)
            ? `${new URL(hash).origin}/`
            : 'https://turbovidhls.com/';
        const master = await fetchText(hash, referer);
        return pickBestM3u8(master, hash);
    }
    return '';
}

function parseVods($) {
    const cards = [];
    $('.clearfix .post').each((_, e) => {
        cards.push({
            vod_id: $(e).find('a').attr('href') || '',
            vod_name: $(e).find('a').attr('title') || '',
            vod_pic: ($(e).find('.thumb').attr('data-original') || '').replace('!320x216.jpg', ''),
            vod_remarks: $(e).find('.con .meta .date').text().trim(),
        });
    });
    return cards;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: 'popular', type_name: '热门' },
            { type_id: 'category/censored-jav', type_name: '有码' },
            { type_id: 'category/uncensored-jav', type_name: '无码' },
            { type_id: 'category/amateur', type_name: '素人' },
            { type_id: 'category/chinese-subtitles', type_name: '中文字幕' },
            { type_id: 'tag/4k', type_name: '4K' },
            { type_id: 'tag/bareback', type_name: '无套' },
            { type_id: 'tag/acmeorgasm', type_name: '高潮' },
            { type_id: 'tag/creampie', type_name: '中出' },
            { type_id: 'tag/huge-cock', type_name: '巨根' },
            { type_id: 'category/reducing-mosaic', type_name: '无码破解' },
        ],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page, 10) || 1;
    const $ = load(await request(`${site}/${tid}/page/${page}`));
    return { page, pagecount: page + 1, list: parseVods($) };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(id);
    const $ = load(html);
    const name = $('meta[name="description"]').attr('content') || '';
    const vid = String(id).match(/(\d+)\.html/)?.[1] || '';

    const pairs = [];
    $('a.btn-server').each((_, e) => {
        const trackName = $(e).text().trim();
        const dataLink = $(e).attr('data-link') || '';
        if (!dataLink) return;
        pairs.push([trackName, `正片$${vid}|${dataLink}`]);
    });
    pairs.sort((a, b) => (a[0] === 'TV' ? 0 : 1) - (b[0] === 'TV' ? 0 : 1));

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: '',
            vod_content: name,
            vod_play_from: pairs.length ? pairs.map((p) => p[0]).join('$$$') : 'SupJav',
            vod_play_url: pairs.length ? pairs.map((p) => p[1]).join('$$$') : '',
        }],
    };
}

async function play(inReq, _outResp) {
    const fail = { parse: 0, url: '', header: { 'User-Agent': UA } };
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (/^https?:\/\/.+\.m3u8/i.test(raw)) {
        return {
            parse: 0,
            url: raw,
            header: { 'User-Agent': UA, Referer: 'https://turbovidhls.com/' },
        };
    }

    const pipe = raw.indexOf('|');
    const vid = pipe >= 0 ? raw.slice(0, pipe) : '';
    const lk = pipe >= 0 ? raw.slice(pipe + 1) : raw;
    if (!lk) return fail;

    const detailUrl = vid ? `https://supjav.com/zh/${vid}.html` : `${site}/`;
    const s1Url = `${LK_BASE}?l=${lk}`;
    const s1 = await fetchText(s1Url, detailUrl);
    const om = s1.match(/var\s+OLID\s*=\s*'([0-9a-f]{40,})'/i);
    const olid = om ? om[1].split('').reverse().join('') : lk.split('').reverse().join('');

    const s2Url = `${LK_BASE}?c=${olid}`;
    const s2 = await fetchText(s2Url, s1Url);
    let playUrl = await extractStream(s2, s2Url);
    if (!playUrl) return fail;

    playUrl = playUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    let referer = s2Url;
    if (/turbovidhls|turbosplayer|turboviplay/i.test(playUrl)) {
        try { referer = `${new URL(playUrl).origin}/`; } catch { referer = 'https://turbovidhls.com/'; }
    }

    return { parse: 0, url: playUrl, header: { 'User-Agent': UA, Referer: referer } };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = parseInt(inReq.body.page, 10) || 1;
    const $ = load(await request(`${site}/page/${page}?s=${text}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'supjav', name: '🌸SupjAv', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
