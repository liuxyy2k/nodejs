import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://91videos.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('a.video-card').each((_, element) => {
        const pic = $(element).find('img').attr('src') || '';
        const url = $(element).attr('href') || '';
        const name = $(element).find('h3').text().trim();
        const remarks = $(element).find('.video-play').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        const parts = url.split('/');
        const id = parts[2] || url;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remarks
        });
    });
    return videos;
}

function extractFromVideoUrl(html) {
    const match = html.match(/&quot;video_url&quot;:\[0,&quot;([^&]+(?:&amp;[^&]+)*)&quot;\]/);
    if (match) {
        return match[1].replace(/&amp;/g, '&');
    }
    return '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/', type_name: '最新视频' },
        { type_id: '/sort/hot/time/7', type_name: '7天最热' },
        { type_id: '/sort/hot/time/30', type_name: '30天最热' },
    ];
    let filterObj = {
         '/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '全部', v: '' },
                    { n: '10分钟内', v: 'duration/0-600' },
                    { n: '10分钟+', v: 'duration/600-0' },
                    { n: '20分钟+', v: 'duration/1200-0' },
                ]
            }
        ],
         '/sort/hot/time/7': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '全部', v: '' },
                    { n: '10分钟内', v: 'duration/0-600' },
                    { n: '10分钟+', v: 'duration/600-0' },
                    { n: '20分钟+', v: 'duration/1200-0' },
                ]
            }
        ],
       '/sort/hot/time/30': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '全部', v: '' },
                    { n: '10分钟内', v: 'duration/0-600' },
                    { n: '10分钟+', v: 'duration/600-0' },
                    { n: '20分钟+', v: 'duration/1200-0' },
                ]
            }
        ], 
    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let ext = inReq.body.filters;
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    }
    ext = ext || {}
    let by = ext?.by || ''
    const url = `${site}/videos/list${tid}${by}/page/${page}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/video/${id}`;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';
    const playUrl = extractFromVideoUrl(html);

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'Video91',
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${site}/videos/list/keyword/${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'video91',
        name: '🌸91videos',
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