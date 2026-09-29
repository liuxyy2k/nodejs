import { load } from 'cheerio';
import req from '../../util/req.js';

const siteUrl = 'https://www.javrate.com';
const searchUrl = siteUrl + '/search/';
const PORT = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/javrate/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function e64url(s) {
    return Buffer.from(String(s), 'utf8').toString('base64url');
}

function d64url(s) {
    return Buffer.from(String(s || '').replace(/ /g, '+'), 'base64url').toString('utf8');
}

function withPlaylistQuery(abs, playlistUrl) {
    const u = new URL(abs);
    const p = new URL(playlistUrl);
    if (!u.search && p.search) {
        p.searchParams.forEach((v, k) => {
            if (!u.searchParams.has(k)) u.searchParams.set(k, v);
        });
    }
    return u.href;
}

function proxyMediaLine(abs, playlistUrl, proxyBase) {
    const signed = withPlaylistQuery(abs, playlistUrl);
    if (/\.m3u8($|[?#])/i.test(signed)) {
        return `${proxyBase}/${e64url(signed)}/index.m3u8`;
    }
    return `${proxyBase}/seg/${e64url(signed)}`;
}

function rewriteM3u8(text, playlistUrl, proxyBase) {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => {
            const t = line.trim();
            if (t.includes('URI="')) {
                return line.replace(/URI="([^"]+)"/g, (_, uri) => {
                    return `URI="${proxyMediaLine(new URL(uri, playlistUrl).href, playlistUrl, proxyBase)}"`;
                });
            }
            if (!t || t.startsWith('#')) return line;
            return proxyMediaLine(new URL(t, playlistUrl).href, playlistUrl, proxyBase);
        })
        .join('\n');
}

async function request(targetUrl, referer = '') {
    const headers = {
        'User-Agent': UA,
        Referer: referer || `${siteUrl}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
    };
    // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
    const resp = await req.get(targetUrl, { headers });
    return resp.data;
}

async function cdnRequest(targetUrl, { binary = false } = {}) {
    const resp = await req.get(targetUrl, {
        headers: {
            'User-Agent': UA,
            Referer: `${siteUrl}/`,
            Accept: '*/*',
            'Accept-Encoding': 'identity',
        },
        timeout: 60000,
        responseType: binary ? 'arraybuffer' : 'text',
        validateStatus: () => true,
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('.mgn-item').each((_, element) => {
        if(!$(element).attr('data-index')) return
        const pic = $(element).find('.mgn-cover').attr('src') || '';
        const url = $(element).find('.movie-card-link').attr('href') || '';
        const name = $(element).find('.movie-card-link').attr('title') || '';
        const year = $(element).find('.mgn-badge-year').text().trim() || '';
        const type = $(element).find('.mgn-badge-type').text().trim() || '';
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: year + '|' + type,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/movie/new', type_name: '最近更新' },
            { type_id: '/menu/uncensored', type_name: '无码A片' },
            { type_id: '/menu/censored', type_name: '日本A片' },
            { type_id: '/menu/chinese', type_name: '国产AV' },
            { type_id: '/actor/list', type_name: 'AV女优' },
            { type_id: '/issuer', type_name: 'A片片商' },
            { type_id: '/keywords/movie', type_name: '分类找片' },
            { type_id: '/best', type_name: '最多人看' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;
    let list = [];
    if(tid === '/actor/list') {
         let url = `${siteUrl}${tid}`;
         if( pg > 1) {
            url = `${siteUrl}${tid}/1-0-${pg}.html`
        }
        const html = await request(url);
        const $ = load(html);
        $('.actor-card').each((_, element) => {
            const pic = $(element).find('img').attr('src') || '';
            const url = $(element).find('.actress-card-link').attr('href') || '';
            const name = $(element).find('.actress-card-link').attr('title') || '';
            const remark = $(element).find('.right').text().trim() || '';
            list.push({
                vod_id: `folder_${url}`,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: remark,
                vod_tag:  'folder',
                style: { ratio: 1.77, type: 'rect' },
            });
        });
    } else if(tid === '/issuer') {
         let url = `${siteUrl}${tid}`;
         if( pg > 1) {
            url = `${siteUrl}${tid}?page=${pg}&sort=3`
        }
        const html = await request(url);
        const $ = load(html);
        $('.col-xl-3').each((_, element) => {
            const pic = $(element).find('.issuer-box').attr('style') || '';
            const url = $(element).find('.issuer-box').attr('href') || '';
            const name = $(element).find('h2').text().trim() || '';
            const remark = $(element).find('.fg-light1').text().trim() || '';
            const match = pic.match(/url\(['"]?(.*?)['"]?\)/);
            list.push({
                vod_id: `folder_${url}`,
                vod_name: name,
                vod_pic: match[1],
                vod_tag:  'folder',
                vod_remarks: remark,
                style: { ratio: 1.77, type: 'rect' },
            });
        });
    } else if(tid === '/keywords/movie') {
         let url = `${siteUrl}${tid}`;
         if( pg > 1) {
            url = `${siteUrl}${tid}?page=${pg}&sort=3`
        }
        const html = await request(url);
        const $ = load(html);
        $('.series-box').each((_, element) => {
            const pic = $(element).attr('style') || '';
            const url = $(element).attr('href') || '';
            const name = $(element).find('h3').text().trim() || '';
            const remark = $(element).find('label').text().trim() || '';
            const match = pic.match(/url\(['"]?(.*?)['"]?\)/);
            list.push({
                vod_id: `folder_${url}`,
                vod_name: name,
                vod_pic: match[1],
                vod_remarks: remark,
                vod_tag:  'folder',
                style: { ratio: 1.77, type: 'rect' },
            });
        });
    } else if (tid.startsWith('folder_')) {
        const url = tid.replace('folder_', '');
        const html = await request(siteUrl + url);
        const $ = load(html);
        list = parseVods($);
    } else {
        let url = `${siteUrl}${tid.replace('folder_', '')}`;
        if( pg > 1) {
            url = `${siteUrl}${tid}/5-2-${pg}`
        }
        const html = await request(url);
        const $ = load(html);
        list = parseVods($);
    }
    

    return {
        page: parseInt(pg),
        pagecount: parseInt(pg) + 1,
        limit: 20,
        total: (parseInt(pg) + 1) * 20,
        list,
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = siteUrl + id;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[name="twitter:title"]').attr('content') || '';
    const pic = $('meta[property=witter:image"]').attr('content') || '';
    const description = $('meta[name=description"]').attr('content') || '';
    const player = $('#v2-player').attr('src')
    let plaUrl = siteUrl + player
    const resp = await request(plaUrl);
    const match = resp.match(/initialSignedUrl:\s*'([^']+\.m3u8[^']*)'/);
    let m3u8 = match ? match[1] : '';
    const m3u8Text = String((await cdnRequest(m3u8)) || '');
    const res = []
    const lines = m3u8Text.split('\n').filter(v => v.includes('/video.m3u8'))
    for(const line of lines){
        const name = line.trim().replace("/video.m3u8", "")
        const m = name.match(/(\d+)p|(\d+)x(\d+)/)
        if(!m) continue
        const r = parseInt(m[1] || m[3])
        res.push({
            name,
            resolution: r,
            url: `${m3u8.replace('playlist.m3u8',line.trim())}`
        })
    }
    // 从高到低排序
    res.sort((a, b) => b.resolution - a.resolution)
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'javrate',
            vod_play_url: res.map(v => `${v.name}$${v.url}`).join("#"),
            vod_content: description
        }],
    };
}

async function decUrl(str) {
    let b64 = "";
    for (let i = 0; i < str.length; i++) {
        b64 += String.fromCharCode(str.charCodeAt(i) - 3);
    }
    return Buffer.from(b64, "base64").toString("utf-8");
}

async function play(inReq, _outResp) {
    const src = String(inReq.body.id || '');
    return {
        parse: 0,
        url: `${getProxyBase(inReq)}/${e64url(src)}/index.m3u8`,
        header: {
            'User-Agent': UA,
            Referer: siteUrl + '/',
        },
    };
}

async function proxyM3u8(token, inReq) {
    const src = d64url(token);
    const text = String((await cdnRequest(src)) || '');
    if (!text.includes('#EXTM3U')) throw new Error('m3u8 empty');
    const body = rewriteM3u8(text, src, getProxyBase(inReq));
    return [200, 'application/vnd.apple.mpegurl', {
        'access-control-allow-origin': '*',
        'cache-control': 'no-cache',
    }, body];
}

async function proxySeg(token) {
    const src = d64url(token);
    const data = await cdnRequest(src, { binary: true });
    return [200, 'video/MP2T', {
        'access-control-allow-origin': '*',
    }, Buffer.from(data || [])];
}

function sendProxy(reply, result) {
    const [status, mime, hdrs, body] = result;
    if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
            if (v != null) reply.header(k, v);
        }
    }
    if (mime) reply.type(mime);
    return reply.code(status).send(body);
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = searchUrl + text;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'javrate',
        name: '🌸鉴黄师',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy/:token/index.m3u8', async (req, reply) => {
            try {
                return sendProxy(reply, await proxyM3u8(req.params.token, req));
            } catch (e) {
                return reply.code(502).send(String(e.message || e));
            }
        });
        fastify.get('/proxy/seg/:token', async (req, reply) => {
            try {
                return sendProxy(reply, await proxySeg(req.params.token));
            } catch (e) {
                return reply.code(502).send(String(e.message || e));
            }
        });
    },
};