import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://911tanhua.com';

const DEFAULT_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
};

let headers = { ...DEFAULT_HEADERS, Origin: site, Referer: `${site}/` };

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/91tabhua/3/img?url=${encodeURIComponent(e64(raw))}`;
}

function unpackPacked(code) {
    const text = String(code || '');
    const start = text.indexOf('eval(function(p,a,c,k,e,d)');
    if (start < 0) return '';
    const end = text.indexOf(".split('|'),0,{}))", start);
    if (end < 0) return '';
    const expr = text.slice(start, end + ".split('|'),0,{}))".length);
    try {
        return String(eval(expr.replace(/^eval/, '')));
    } catch {
        return '';
    }
}

function parseDetailMeta(html) {
    const match = String(html).match(/const _detail_\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (!match) return {};
    try {
        return JSON.parse(match[1]);
    } catch {
        return {};
    }
}

function extractPlayUrl(html) {
    const boot = unpackPacked(html);
    if (boot) {
        const m = boot.match(/['"]url['"]\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i);
        if (m) return m[1];
    }
    const direct = String(html).match(/https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/i);
    return direct ? direct[0] : '';
}

function normTid(id) {
    let tid = String(id ?? '').trim();
    if (!tid) return '';
    if (tid.startsWith('folder_')) return tid;
    if (!tid.startsWith('/')) tid = `/${tid}`;
    if (!tid.endsWith('/')) tid = `${tid}/`;
    return tid;
}

function isAuthorsHot(tid) {
    return normTid(tid) === '/authors/hot/';
}

function authorsHotUrl(page) {
    const p = parseInt(page, 10) || 1;
    return p <= 1 ? `${site}/authors/hot/` : `${site}/authors/hot/${p}/`;
}

function parseAuthors($) {
    const items = [];
    $('li.group a[href^="/author/"]').each((_, element) => {
        const href = $(element).attr('href') || '';
        const name =
            $(element).find('.font-semibold').text().trim() ||
            $(element).find('img').attr('alt')?.trim() ||
            '';
        const rawPic = $(element).find('img').attr('data-src') || '';
        const count = $(element).find('.text-sm').text().trim();
        if (name && href) {
            items.push({
                vod_id: `folder_${href}`,
                vod_name: name,
                vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                vod_remarks: count,
                vod_tag: 'folder',
                style: { ratio: 1, type: 'rect' },
            });
        }
    });
    return items;
}

async function parseVods($) {
    const items = [];
    $('.video-item').each((_, element) => {
        const rawPic = $(element).find('img').attr('data-src') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('img').attr('alt') || '';
        const date  = $(element).find('.rounded-large').text().trim();
        if (name && url) {
            items.push(
                { 
                    vod_id: url, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                    vod_remarks: date,
                    style: { ratio: 1.77, type: 'rect' }
                }
            );
        }
    });

    return items
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '',     type_name: '首页' },
        { type_id: '/sort/hot/', type_name: '当前最热' },
        { type_id: '/sort/renew/', type_name: '最近更新' },
        { type_id: '/sort/month_hot/', type_name: '热门影片' },
        { type_id: '/category/tanhua-shipin/', type_name: '探花视频' },
        { type_id: '/tag/国产自拍/', type_name: '国产自拍' },
        { type_id: '/category/xingba-tanhua/', type_name: '杏吧探花' },
        { type_id: '/category/dingmei-tanhua/', type_name: '顶美探花' },
        { type_id: '/category/huisuo-anmo/', type_name: '会所按摩' },
        { type_id: '/category/mote-sipai/', type_name: '模特私拍' },
        { type_id: '/category/zhibo-luping/', type_name: '直播录屏' },
        { type_id: '/category/zhongkou-jiqing/', type_name: '重口刺激' },
        { type_id: '/category/sm-tiaojiao/', type_name: 'SM' },
        { type_id: '/tag/约啪实录/', type_name: '约啪实录' },
        { type_id: '/category/jietou-dashan/', type_name: '街头搭讪' },
        { type_id: '/category/jietou-chaodi/', type_name: '街头抄底' },
        { type_id: '/tag/外围嫩模/', type_name: '外围嫩模' },
        { type_id: '/category/jiudian-shexiangtou/', type_name: '酒店偷拍' },
        { type_id: '/category/zhifu-youhuo/', type_name: '制服诱惑' },
        { type_id: '/tag/酒店实战/', type_name: '酒店实战' },
        { type_id: '/tag/真实约会/', type_name: '真实约会' },
        { type_id: '/tag/极品身材/', type_name: '极品身材' },
        { type_id: '/tag/反差女神/', type_name: '反差女神' },
        { type_id: '/authors/hot/', type_name: '探花作者' },
    ];

    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid = normTid(inReq.body.id ?? inReq.body.tid);
    const page = parseInt(inReq.body.page, 10) || 1;
    let list = [];
    let pagecount = page + 1;

    if (isAuthorsHot(tid)) {
        const html = await request(authorsHotUrl(page));
        list = parseAuthors(load(html));
        if (!list.length && page > 1) pagecount = page;
    } else if (tid.startsWith('folder_')) {
        const path = tid.slice('folder_'.length);
        const html = await request(`${site}${path}`);
        list = await parseVods(load(html));
    } else {
        let url = `${site}${tid}${page}/`;
        if (tid === '') url = `${site}`;
        const html = await request(url);
        const $ = load(html);
        list = await parseVods($);
    }
    return { page, pagecount, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $ = load(html);
    const meta = parseDetailMeta(html);

    const name =
        meta.title ||
        $('meta[property="og:title"]').attr('content') ||
        '';
    const pic =
        meta.poster ||
        $('meta[property="og:image"]').attr('content') ||
        '';
    const des =
        (meta.tags ? String(meta.tags).replace(/,/g, ' ') : '') ||
        $('meta[property="og:description"]').attr('content') ||
        '';
    const playUrl = extractPlayUrl(html) || id;
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: des,
            vod_remarks: meta.times || '',
            vod_play_from: '91探花',
            vod_play_url: '正片$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    if (!/\.m3u8(\?|$)/i.test(url)) {
        const page = url.startsWith('http') ? url : `${site}${url.startsWith('/') ? url : `/${url}`}`;
        const html = await request(page);
        url = extractPlayUrl(html) || url;
    }
    return {
        parse: 0,
        url,
        header: headers,
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/search?keywords=${text}`);
    const $ = load(html);
    const list = await parseVods($);

    return { list };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${site}/`,
                'Origin':     site,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8')  ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: '91tabhua',
        name: '🎞️91探花',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',  imgProxy);
    },
};