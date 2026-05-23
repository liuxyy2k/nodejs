import axios from 'axios';
import { load } from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://jable.tv';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classurl = `${site}/categories/?mode=async&function=get_block&block_id=list_categories_video_categories_list&sort_by=avg_videos_popularity`;
    const html = await request(classurl);
    const $ = load(html);

    let classes = [
        {
            type_id: site + '/new-release/',
            type_name: '最新上市',
        },
        {
            type_id: site + '/hot/',
            type_name: '热门影片',
        },
        {
            type_id: site + '/models/',
            type_name: '女优列表',
        }

    ];
    const ignore = ['首页'];
    $('.container .col-6.col-sm-4.col-lg-3').each((_, e) => {
        const name = $(e).find('h4').text();
        const href = $(e).find('a').attr('href');
        if (!name || ignore.some(i => name.includes(i))) return;
        classes.push({ type_id: href, type_name: name });
    });
    let filterObj = {
        'https://jable.tv/hot/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '所有时间', v: 'video_viewed' },
                    { n: '本月热门',     v: 'video_viewed_month' },
                    { n: '本周热门',   v: 'video_viewed_week' },
                    { n: '今日热门',   v: 'video_viewed_today' }   
                ]
            }
        ],
         'https://jable.tv/categories/uncensored/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',     v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',     v: 'video_viewed' },
                    { n: '最高收藏',     v: 'most_favourited' }   
                ]
            }
        ],
        'https://jable.tv/categories/bdsm/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新', v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',   v: 'video_viewed' },
                    { n: '最高收藏',   v: 'most_favourited' }   
                ]
            }
        ],
        'https://jable.tv/categories/chinese-subtitle/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',     v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',     v: 'video_viewed' },
                    { n: '最高收藏',     v: 'most_favourited' }   
                ]
            }
        ],
        'https://jable.tv/categories/pantyhose/': [
            {
                key: 'by',
                name: '排序',
               value: [
                    { n: '最近更新',     v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',     v: 'video_viewed' },
                    { n: '最高收藏',     v: 'most_favourited' }   
                ]
            }
        ],
        'https://jable.tv/categories/insult/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',     v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',     v: 'video_viewed' },
                    { n: '最高收藏',     v: 'most_favourited' }   
                ]
            }
        ],
        'https://jable.tv/categories/private-cam/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',     v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',     v: 'video_viewed' },
                    { n: '最高收藏',     v: 'most_favourited' }   
                ]
            }
        ],
        'https://jable.tv/categories/uniform/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',     v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',     v: 'video_viewed' },
                    { n: '最高收藏',     v: 'most_favourited' }   
                ]
            }
        ],
        'https://jable.tv/categories/groupsex/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',     v: 'post_date' },
                    { n: '近期最佳',     v: 'post_date_and_popularity' },
                    { n: '最多观看',     v: 'video_viewed' },
                    { n: '最高收藏',     v: 'most_favourited' }   
                ]
            }
        ],
     'https://jable.tv/models/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '名称顺序',     v: 'title' },
                    { n: '热度优先',     v: 'avg_videos_popularity' },
                    { n: '最近更新',     v: 'last_content_date' },
                    { n: '最多影片',     v: 'total_videos' }   
                ]
            }
        ],
    }
    return { class: classes, filters: filterObj };
}

async function parseVods($) {
    const items = [];
    $('#list_videos_common_videos_list .container .row > div').each((_, element) => {
        const href = $(element).find('.title a').attr('href');
        const title = $(element).find('.title a').text();
        const cover = $(element).find('.img-box img').attr('data-src');
        const duration = $(element).find('.label').text();
        if (href) {
            items.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
            });
        }
    });

    return items
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    let videos = [];
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
    if(typeurl == 'https://jable.tv/models/') {
        let url = `${typeurl}?mode=async&function=get_block&block_id=list_models_models_list&sort_by=${by}&from=${page}&_=${Date.now()}`;
        console.log(url)
        const html = await request(url, {
            'referer': typeurl,
            'Origin': site,
            'X-requested-with': 'XMLHttpRequest',
        });
        const $ = load(html);
        $('.horizontal-img-box').each((_, element) => {
            const href = $(element).find('a').attr('href');
            const title = $(element).find('.title').text();
            const cover = $(element).find('.d-md-none').attr('src');
            const duration = $(element).find('.detail span').text();
            if (href) {
                videos.push({
                    vod_id: `folder_${href}`,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: duration,
                    vod_tag:  'folder',
                    style:    { ratio: 1.77, type: 'rect' },
                });
            }
        });

    }else if(typeurl.startsWith('folder_')) {
        const url = typeurl.replace('folder_', '');
        const html = await request(url);
        const $ = load(html);
        videos = await parseVods($);
    } else {
        let url = `${typeurl}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=${by}&from=${page}&_=${Date.now()}`;
        const html = await request(url, {
            'referer': typeurl,
            'Origin': site,
            'X-requested-with': 'XMLHttpRequest',
        });
        const $ = load(html);
        videos = await parseVods($);
    }
    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    let playUrl = '';
    try {
        const script = $('#site-content .container .col').eq(0).find('section').eq(0).find('script:last').text();
        playUrl = script.match(/var hlsUrl = '(.*)';/)[1];
    } catch (e) {}

    const title = $('h4').first().text().trim();
    const pic = $('.detail-header img').attr('src') || '';

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: 'Jable',
            vod_play_url: '播放$' + playUrl
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA, 'Referer': site },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/search/${text}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${text}&sort_by=&from=${page}&_=${Date.now()}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('#list_videos_videos_list_search_result .container .row > div').each((_, element) => {
        const href = $(element).find('.title a').attr('href');
        const title = $(element).find('.title a').text();
        const cover = $(element).find('.img-box img').attr('data-src');
        const duration = $(element).find('.label').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'jable',
        name: '🔥Jable',
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