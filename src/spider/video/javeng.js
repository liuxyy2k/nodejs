import crypto from 'crypto';
import { load } from 'cheerio';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://javeng.tv';
const ABYSS_REFERER = 'https://player.abyssplayer.com/';

const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};

async function request(reqUrl, referer = `${site}/`) {
    const resp = await axios.get(reqUrl, {
        headers: { ...headers, Referer: referer },
        timeout: 25000,
        validateStatus: () => true,
    });
    if (resp.status !== 200) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVods($) {
    const list = [];
    $('article').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('h3').text().trim() || '',
            vod_pic: $(el).find('img').attr('src') || '',
            vod_remarks: $(el).find('.mepo').text().trim() || '',
        });
    });
    return list;
}

function absDetailId(id) {
    const raw = String(id || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${site}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

async function fetchDooplayEmbed(pageUrl, post, type, nume) {
    const api = `${site}/wp-json/dooplayer/v2/${post}/${type}/${nume}`;
    const resp = await axios.get(api, {
        headers: {
            ...headers,
            Referer: pageUrl,
            'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 25000,
        validateStatus: () => true,
    });
    if (resp.status !== 200 || !resp.data) return '';
    return String(resp.data.embed_url || resp.data.url || '').trim();
}

function parseDatasFromPlayer(html) {
    const m = String(html).match(/const\s+datas\s*=\s*"([^"]+)"/);
    if (!m) return null;
    return JSON.parse(Buffer.from(m[1], 'base64').toString('latin1'));
}

function decryptAbyssMedia(datas) {
    const mediaKeyStr = `${datas.user_id}:${datas.slug}:${datas.md5_id}`;
    const keyHex = crypto.createHash('md5').update(mediaKeyStr, 'utf8').digest('hex');
    const keyBytes = Buffer.from(keyHex, 'utf8');
    const iv = Buffer.from(keyHex.slice(0, 16), 'utf8');
    const inputBytes = Buffer.from(datas.media, 'latin1');
    const plain = Buffer.concat([
        crypto.createDecipheriv('aes-256-ctr', keyBytes, iv).update(inputBytes),
        crypto.createDecipheriv('aes-256-ctr', keyBytes, iv).final(),
    ]);
    return JSON.parse(plain.toString('utf8'));
}

function pickAbyssPlayUrl(manifest) {
    const first = manifest?.mp4?.fristDatas || [];
    const pick = first.find((x) => x.res_id === 5)
        || first.find((x) => x.res_id === 4)
        || first[0];
    return pick?.url || '';
}

async function resolveAbyss(embedUrl, referer) {
    const html = await request(embedUrl, referer);
    const datas = parseDatasFromPlayer(html);
    if (!datas?.media) return '';
    const manifest = decryptAbyssMedia(datas);
    return pickAbyssPlayUrl(manifest);
}

function unpackPacker(html) {
    const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
    if (!m) return '';
    let p = m[1];
    const base = parseInt(m[2], 10);
    let count = parseInt(m[3], 10);
    const dict = m[4].split('|');
    while (count--) if (dict[count]) p = p.replace(new RegExp(`\\b${count.toString(base)}\\b`, 'g'), dict[count]);
    return p;
}

function mediaFromHtml(html) {
    const unpacked = unpackPacker(html);
    const text = unpacked || String(html);
    const m3u8 = text.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/i);
    if (m3u8) return m3u8[0];
    const cfg = String(html).match(/"file"\s*:\s*"([^"]+)"/) || String(html).match(/"m3u8"\s*:\s*"([^"]+)"/);
    if (cfg) {
        try { return JSON.parse(`"${cfg[1]}"`); } catch { return cfg[1].replace(/\\\//g, '/'); }
    }
    return '';
}

function nextEmbedPage(html, base) {
    const iframe = String(html).match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframe?.[1] && !/^about:blank/i.test(iframe[1])) {
        try { return new URL(iframe[1], base).href; } catch { return iframe[1]; }
    }
    return '';
}

async function resolvePlaykrx(embedUrl, referer) {
    const html = await request(embedUrl, referer);
    const api = html.match(/DOMAIN_API\s*=\s*'([^']+)'/)?.[1];
    const idfile = html.match(/idfile_enc\s*=\s*"([^"]+)"/)?.[1];
    const idUser = html.match(/idUser_enc\s*=\s*"([^"]+)"/)?.[1];
    if (!api || !idfile || !idUser) return mediaFromHtml(html);

    const domainPlay = embedUrl.split('/').slice(0, 3).join('/');
    const payload = JSON.stringify({
        idfile,
        iduser: idUser,
        domain_play: domainPlay,
        unixTimestamp: Date.now() + 1000,
    });

    for (const field of ['data', 'enc', 'payload', 'token']) {
        for (const body of [
            new URLSearchParams({ [field]: payload }),
            new URLSearchParams({ [field]: Buffer.from(payload).toString('base64') }),
            payload,
        ]) {
            const resp = await axios.post(api, body, {
                headers: {
                    'User-Agent': UA,
                    Referer: embedUrl,
                    Origin: new URL(embedUrl).origin,
                    'Content-Type': typeof body === 'string'
                        ? 'application/json'
                        : 'application/x-www-form-urlencoded',
                },
                timeout: 20000,
                validateStatus: () => true,
            });
            const data = resp.data;
            const text = typeof data === 'string' ? data : JSON.stringify(data || {});
            const playlist = data?.playlist || data?.url || data?.file || data?.hls;
            if (playlist && /\.m3u8|\/m3u8\//i.test(String(playlist))) {
                return String(playlist);
            }
            const m3u8 = text.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/i);
            if (m3u8 && data?.status !== 'error') return m3u8[0];
        }
    }

    const direct = mediaFromHtml(html);
    if (direct) return direct;
    return '';
}

async function resolveEmbed(embedUrl, pageReferer) {
    const url = String(embedUrl || '').trim();
    if (!url) return { url: '', referer: pageReferer };

    if (/player\.abyssplayer\.com/i.test(url)) {
        const media = await resolveAbyss(url, pageReferer);
        if (media) return { url: media, referer: ABYSS_REFERER };
    }

    if (/playkrx18\.site/i.test(url)) {
        const media = await resolvePlaykrx(url, pageReferer);
        if (media) {
            try { return { url: media, referer: `${new URL(url).origin}/` }; } catch { return { url: media, referer: pageReferer }; }
        }
    }

    let page = url;
    let referer = pageReferer;
    for (let i = 0; i < 5; i++) {
        const html = await request(page, referer);
        const media = mediaFromHtml(html);
        if (media) {
            try { return { url: media, referer: `${new URL(page).origin}/` }; } catch { return { url: media, referer }; }
        }
        const next = nextEmbedPage(html, page);
        if (!next || next === page) break;
        referer = page;
        page = next;
    }

    return { url, referer: pageReferer, parse: 1 };
}

function parsePlayToken(raw) {
    const id = String(raw || '').trim();
    if (!id.startsWith('jv://')) return null;
    const rest = id.slice('jv://'.length);
    const [pageUrl, post, type, nume] = rest.split('|');
    if (!pageUrl || !post || !type || !nume) return null;
    return { pageUrl, post, type, nume };
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/jav-eng-sub/', type_name: '最近更新' },
            { type_id: '/genre/eng-sub/', type_name: '英文字幕' },
            { type_id: '/genre/censored/', type_name: '有码' },
            { type_id: '/genre/uncensored/', type_name: '无码' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = `${site}${inReq.body.id}page/${page}/`;
    const $ = load(await request(url));
    return { page, pagecount: 99999, list: parseVods($) };
}

async function detail(inReq) {
    const pageUrl = absDetailId(inReq.body.id);
    const $ = load(await request(pageUrl));
    const vod_play_from = [];
    const vod_play_url = [];

    const options = [];
    $('li.dooplay_player_option').each((_, el) => {
        const post = $(el).attr('data-post') || '';
        const type = $(el).attr('data-type') || 'movie';
        const nume = $(el).attr('data-nume') || '';
        if (!post || !nume) return;
        const server = $(el).find('span.server').text().trim();
        const name = $(el).find('span.title').text().trim() || server || `线路${options.length + 1}`;
        options.push({ name, server, post, type, nume });
    });
    options.sort((a, b) => {
        const score = (s) => (/abyss/i.test(s) ? 0 : /playkrx/i.test(s) ? 1 : 2);
        return score(a.server) - score(b.server) || score(a.name) - score(b.name);
    });
    for (const opt of options) {
        vod_play_from.push(opt.name);
        vod_play_url.push(`${opt.name}$jv://${pageUrl}|${opt.post}|${opt.type}|${opt.nume}`);
    }

    return {
        list: [{
            vod_id: pageUrl,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: vod_play_from.join('$$$') || 'javeng',
            vod_play_url: vod_play_url.join('$$$'),
        }],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();

    const token = parsePlayToken(raw);
    let embedUrl = '';
    let pageReferer = `${site}/`;

    if (token) {
        pageReferer = token.pageUrl;
        embedUrl = await fetchDooplayEmbed(token.pageUrl, token.post, token.type, token.nume);
    } else if (/^https?:\/\//i.test(raw)) {
        embedUrl = raw;
    }

    if (!embedUrl) {
        return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: pageReferer } };
    }

    const resolved = await resolveEmbed(embedUrl, pageReferer);
    if (resolved.parse) {
        return {
            parse: 1,
            url: resolved.url,
            header: { 'User-Agent': UA, Referer: resolved.referer || pageReferer },
        };
    }
    if (!resolved.url) {
        return {
            parse: 1,
            url: embedUrl,
            header: { 'User-Agent': UA, Referer: pageReferer },
        };
    }

    return {
        parse: 0,
        url: resolved.url,
        header: { 'User-Agent': UA, Referer: resolved.referer || pageReferer },
    };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search_result?kw=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javeng', name: '🌸Javeng', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
