import axios from 'axios';
import { load } from 'cheerio';

/**
 * Dottai - https://dottaia.lol
 */

const site = 'https://dottaia.lol';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent': UA,
        Referer: site,
    },
    validateStatus: () => true,
});

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    return u.startsWith('/') ? site + u : `${site}/${u}`;
}

async function getHtml(url) {
    try {
        const resp = await http.get(url, { responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseList($) {
    const items = [];
    const seen = new Set();
    $('.movie-card').each((_, el) => {
        try {
            const a = $(el).find('a[href*="/cn/movie/"]').first();
            if (!a.length) return;
            const href = a.attr('href') || '';
            const vid = href.includes('/movie/') ? href.split('/movie/').pop() : href;
            if (!vid || seen.has(vid)) return;
            seen.add(vid);

            const img = $(el).find('img').first();
            let pic = img.attr('data-src') || img.attr('src') || '';
            pic = absUrl(pic);

            let name = '';
            const h5 = $(el).find('h5').first();
            if (h5.length) name = h5.attr('data-full-title') || h5.text().trim();
            if (!name) name = a.attr('title') || '';

            items.push({ vod_id: vid, vod_name: name, vod_pic: pic });
        } catch {
            /* skip */
        }
    });
    return items;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    try {
        await http.get(site, { timeout: 5_000 });
    } catch {
        /* ignore */
    }
    return {};
}

async function home(_inReq, _outResp) {
    try {
        const html = await getHtml(`${site}/cn`);
        const $ = load(html);
        const classes = [];
        const seen = new Set();
        $('a[href*="/cn/tag/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const name = $(el).text().trim();
            const m = href.match(/\/cn\/tag\/(.+)/);
            if (m && name && !seen.has(name)) {
                seen.add(name);
                classes.push({
                    type_name: name,
                    type_id: encodeURIComponent(m[1]),
                });
            }
        });
        return { class: classes, filters: {}, list: parseList($) };
    } catch {
        return { class: [], filters: {}, list: [] };
    }
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    let url = `${site}/cn/tag/${tid}`;
    if (pg > 1) url += `?page=${pg}`;
    try {
        const html = await getHtml(url);
        const $ = load(html);
        const list = parseList($);
        return { list, page: pg, pagecount: 99, limit: list.length, total: 999 };
    } catch {
        return { list: [], page: pg };
    }
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    try {
        const url = `${site}/cn/movie/${vid}`;
        const html = await getHtml(url);
        const $ = load(html);

        let name = $('h1').first().text().trim();
        if (!name) name = ($('title').text() || '').split('-')[0].trim() || vid;

        let pic = '';
        const ld = $('script[type="application/ld+json"]').first().html();
        if (ld) {
            try {
                pic = JSON.parse(ld)?.thumbnailUrl || '';
            } catch {
                /* ignore */
            }
        }
        if (!pic) {
            const img = $('img[uk-cover]').first();
            if (img.length) pic = img.attr('src') || '';
        }

        const fromList = [];
        const urlList = [];
        let opts = $('select.line-select option');
        if (!opts.length) opts = $('option');

        opts.each((_, el) => {
            const val = $(el).attr('value') || '';
            const txt = $(el).text().trim();
            if (val === 'no' || ['English', '简体中文', '繁體中文', '720P'].includes(txt)) return;
            if (!val) return;
            fromList.push(txt);
            urlList.push(`高清$${vid}|${val}`);
        });

        if (!fromList.length) {
            fromList.push('默认');
            urlList.push(`高清$${vid}`);
        }

        // 多线路：from / url 一一对应用 $$$（修正原 Python # 拼在一起导致数量不一致）
        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: name,
                    vod_pic: absUrl(pic),
                    vod_play_from: fromList.join('$$$'),
                    vod_play_url: urlList.join('$$$'),
                },
            ],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const parts = id.split('|');
    const vid = parts[0];
    const url = `${site}/cn/movie/${vid}`;
    const header = { 'User-Agent': UA, Referer: url };

    try {
        const html = await getHtml(url);
        const m3u8 = html.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
        if (m3u8) {
            return {
                parse: 0,
                url: m3u8[1].replace(/\\\//g, '/'),
                header,
            };
        }
        const match = html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})/);
        if (match) {
            let vUrl = '';
            try {
                vUrl = JSON.parse(match[1])?.url || '';
            } catch {
                /* ignore */
            }
            if (vUrl && !/\.m3u8|\.mp4|http/i.test(vUrl) && vUrl.length > 20) {
                try {
                    vUrl = Buffer.from(vUrl, 'base64').toString('utf-8');
                } catch {
                    /* ignore */
                }
            }
            return {
                parse: /\.m3u8|\.mp4/i.test(vUrl) ? 0 : 1,
                url: vUrl,
                header,
            };
        }
    } catch {
        /* fallthrough */
    }
    return { parse: 1, url, header };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    let url = `${site}/cn/search?q=${encodeURIComponent(key)}`;
    if (pg > 1) url += `&page=${pg}`;
    try {
        const html = await getHtml(url);
        const $ = load(html);
        return { list: parseList($) };
    } catch {
        return { list: [] };
    }
}

export default {
    meta: {
        key: 'dottaia',
        name: '🔥Dottai',
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
