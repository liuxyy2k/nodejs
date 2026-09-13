import { load } from 'cheerio';
import req from '../../util/req.js';

const siteUrl = 'https://www.javrate.com';
const searchUrl = siteUrl + '/search/';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

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
    const m3u8Data = await req.get(m3u8, {
        headers: {
            'User-Agent': UA,
            Referer: url,
        },
    });
    const res = []
    const lines = m3u8Data.data.split("\n").filter(v => v.includes("/video.m3u8"))
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
    return {
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer': siteUrl + '/'
        },
    };
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
        name: '🔥鉴黄师',
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