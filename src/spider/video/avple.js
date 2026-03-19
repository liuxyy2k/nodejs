import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const FLARE_URL = config.FLARE_URL;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://avple.tv';

async function request(url) {
    const resp = await axios.post(FLARE_URL, {
        cmd: 'request.get',
        url: url,
        maxTimeout: 60000,
    });
    return resp.data.solution.response;
}

function parseCards($) {
    const list = [];
    $('.w-full').each((_, element) => {
        const href     = $(element).find('a').attr('href') || '';
        const title    = $(element).find('.object-cover').attr('alt') || '';
        const cover    = $(element).find('.object-cover').attr('src') || '';
        const subTitle = $(element).find('.absolute').text().trim();
        if (!href || !title) return;
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/tags/122/', type_name: 'SWAG' },
        { type_id: '/tags/121/', type_name: '麻豆传媒' },
        { type_id: '/tags/123/', type_name: '果冻传媒' },
        { type_id: '/tags/124/', type_name: '皇家华人' },
        { type_id: '/tags/125/', type_name: '京东影业' },
        { type_id: '/tags/126/', type_name: '天美传媒' },
        { type_id: '/tags/127/', type_name: '星空无限' },
        { type_id: '/tags/128/', type_name: '乐播传媒' },
        { type_id: '/tags/129/', type_name: '蜜桃传媒' },
        { type_id: '/tags/130/', type_name: '乌鸦传媒' },
        { type_id: '/tags/135/', type_name: 'FC2PPV' },
        { type_id: '/tags/131/', type_name: '国产自拍' },
    ];
    let filterObj = {
         '/tags/122/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最多观看', v: 'view_count' },
                    { n: '最近更新', v: 'date' }  
                ]
            }
        ],
        '/tags/121/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最多观看', v: 'view_count' },
                    { n: '最近更新', v: 'date' }  
                ]
            }
        ],
        '/tags/123/': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最多观看', v: 'view_count' },
                    { n: '最近更新', v: 'date' }  
                ]
            }
        ],

    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
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
    const url  = `${site}${tid}${page}/${by === '' ? 'date' : by}`
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

// 域名池
const u = [
  "d862cp.cdnedge.live","q2cyl7.cdnedge.live","u89ey.cdnedge.live",
  "zo392.cdnedge.live","wo880.cdnedge.live","6m7d.cdnedge.live",
  "8bb88.cdnedge.live","fa678.cdnedge.live","pg2z7.cdnedge.live",
  "1xp60.cdnedge.live","47b61.cdnedge.live","i3qss.cdnedge.live",
  "10j99.cdnedge.live","je40u.cdnedge.live","s2jfy.cdnedge.live",
  "l87ul.cdnedge.live","s6s6u.cdnedge.live","rup0u.cdnedge.live",
  "ja34l.cdnedge.live","rr0s1.cdnedge.live","c4m6s.cdnedge.live",
  "60frt.cdnedge.live","rd192.cdnedge.live","2nm9j.cdnedge.live",
  "l8uao.cdnedge.live","ie2ow.cdnedge.live","fhq06.cdnedge.live",
  "b3h6s.cdnedge.live","sms9q.cdnedge.live","xre5q.cdnedge.live"
];

// 生成 f 数组（xxx1.cdnedge.live）
const f = u.map(e => e.split(".")[0] + "1.cdnedge.live");

// 核心函数（还原 h）
function buildM3u8Url(type, path) {
  if (!path) return null;

  // play_source_type = 13 走这里
  if ([12, 13, 14].includes(type)) {
    const index = Math.floor(Math.random() * f.length);
    return `https://${f[index]}/file/avple-asserts/${path}`;
  }

  // 其他情况（可选补充）
  if ([2,3,4,7,8].includes(type)) {
    const index = Math.floor(Math.random() * u.length);
    return `https://${u[index]}/file/avple-images/${path}`;
  }

  return path;
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(site + href);
    const $    = load(html);

    const des =  $('meta[name="description"]').attr('content') || '';
    
    const info = $('#__NEXT_DATA__').text()
    const json = JSON.parse(info)
    const name  = json.props.pageProps.data[0].title;
    const type  = json.props.pageProps.instance.play_source_type
    let playUrl = json.props.pageProps.instance.play
    playUrl = await buildM3u8Url(type, playUrl)
    console.log(playUrl)
    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_play_from: 'avple',
            vod_play_url:  `播放$${playUrl}`,
            vod_content: des
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA, 'Referer': site + '/' },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/search?key=${text}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'avple',
        name: 'Avple',
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