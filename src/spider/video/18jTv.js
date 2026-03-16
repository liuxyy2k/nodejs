import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://18j.tv';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA }
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.list li').each((_, element) => {
        const href     = $(element).find('a').attr('href') || '';
        const title    = $(element).find('.title').text().trim() || '';
        const cover    = $(element).find('.lazy').attr('src') || '';
        const subTitle = $(element).find('.vodlist_img span').text().trim();
        if (!href || !title) return;
        list.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: subTitle });
    });
    return list;
}



async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/label/hot/by/time/',                        type_name: '最近更新'},
        { type_id: '/label/hot/by/up_day/',                      type_name: '近期点赞'},
        { type_id: '/label/hot/by/hits_week/',                   type_name: '热门视频'},
        { type_id: '/show/1/',                                   type_name: '国产全部'},
        { type_id: '/show/5/',                                   type_name: '国产自拍'},
        { type_id: '/show/6/',                                   type_name: '主播大秀'},
        { type_id: '/show/7/',                 type_name: '国产探花' },
        { type_id: '/show/9/',                 type_name: '乱伦系列' },
        { type_id: '/show/10/',                type_name: '网曝吃瓜' },
        { type_id: '/show/8/',                 type_name: '偷拍偷窥' },
        { type_id: '/show/12/',                type_name: '国产AV' },
        { type_id: '/show/20/',                type_name: '福利姬' },
        { type_id: '/show/11/',                type_name: '抖音风格' },
        { type_id: '/show/36/',                type_name: '主播诱惑' },
        { type_id: '/show/2/',                 type_name: '日韩全部' },
        { type_id: '/show/13/',                type_name: '日韩自拍' },
        { type_id: '/show/14/',                type_name: '日本无码' },
        { type_id: '/show/15/',                type_name: '日本字幕' },
        { type_id: '/show/17/',                type_name: 'AV解说' },
        { type_id: '/show/3/',                 type_name: '欧美全部' },
        { type_id: '/t/4/',                    type_name: '伦理' },
        { type_id: '/show/16/',                type_name: '动漫' },
        { type_id: '/show/39/',                type_name: '另类' },
        { type_id: '/show/23/',                type_name: '另类重口' },
        { type_id: '/show/18/',                type_name: '换脸明星' },
    ];
    let filterObj = {
         '/show/1/': [
             {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/show/5/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/show/6/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/show/7/': [
             {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/show/9/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
         '/show/2/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/show/3/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/show/16/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
         '/t/4/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/show/39/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
    }
    return { class: classes, filters: filterObj};
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const filters = inReq.body.filters;
    let ext = {}
    if (typeof filters === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    } else {
        ext = filters
    }
    ext = ext || {}
    let by = ext?.by || ''
    const url = by ? `${site}${tid}${by}/page/${page}/` : `${site}${tid}page/${page}/`
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(site + href);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const des  = $('meta[property="og:description"]').attr('content') || '';

    const m = html.match(/source\s*=\s*['"](https?:\/\/[^'"]+\.m3u8)['"]/)
    const playUrl = m ? m[1] : ''
    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: '18jTv',
            vod_play_url:  `播放$${playUrl}`,
            vod_content: des
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
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;
    const html = await request(`${site}/search/${text}/${page}.html`);
    const $    = load(html);
    const list = parseCards($);
    return { list };
}

export default {
    meta: {
        key: '18jtv',
        name: '18JTv',
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