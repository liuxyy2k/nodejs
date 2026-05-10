import axios from 'axios';
import { load } from 'cheerio';

const site = 'https://vip.wwgz.cn:5200';
const UA   = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';

const headers = { 'User-Agent': UA };

async function request(url) {
    const resp = await axios.get(url, { headers, timeout: 10000 });
    return resp.data;
}

async function post(url, body) {
    const resp = await axios.post(url, body, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
    });
    return resp.data;
}

const filterList = {
    1: [
        {
            key: 'type', name: '类型',
            value: [
                { n: '全部', v: '1' }, { n: '动作片', v: '5' }, { n: '喜剧片', v: '6' },
                { n: '爱情片', v: '7' }, { n: '科幻片', v: '8' }, { n: '恐怖片', v: '9' },
                { n: '剧情片', v: '10' }, { n: '战争片', v: '11' }, { n: '惊悚片', v: '12' },
                { n: '奇幻片', v: '13' },
            ],
        },
        {
            key: 'area', name: '地区',
            value: [
                { n: '全部', v: '' }, { n: '大陆', v: '大陆' }, { n: '香港', v: '香港' },
                { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '日本', v: '日本' },
                { n: '韩国', v: '韩国' }, { n: '印度', v: '印度' }, { n: '泰国', v: '泰国' },
                { n: '英国', v: '英国' }, { n: '法国', v: '法国' }, { n: '加拿大', v: '加拿大' },
                { n: '西班牙', v: '西班牙' }, { n: '俄罗斯', v: '俄罗斯' }, { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year', name: '年份',
            value: [
                { n: '全部', v: '' }, { n: '2026', v: '2026' }, { n: '2025', v: '2025' },
                { n: '2024', v: '2024' }, { n: '2023', v: '2023' }, { n: '2022', v: '2022' },
                { n: '2021', v: '2021' }, { n: '2020', v: '2020' }, { n: '2019', v: '2019' },
                { n: '2018', v: '2018' }, { n: '2017', v: '2017' }, { n: '2016', v: '2016' },
                { n: '2015', v: '2015' }, { n: '2014', v: '2014' }, { n: '2013', v: '2013' },
                { n: '2012', v: '2012' }, { n: '2011', v: '2011' }, { n: '2010', v: '2010' },
                { n: '2009~2000', v: '2009~2000' },
            ],
        },
        {
            key: 'sort', name: '排序',
            value: [{ n: '时间', v: 'time' }, { n: '人气', v: 'hits' }, { n: '评分', v: 'score' }],
        },
    ],
    2: [
        {
            key: 'type', name: '类型',
            value: [
                { n: '全部', v: '2' }, { n: '国产剧', v: '12' }, { n: '港台泰', v: '13' },
                { n: '日韩剧', v: '14' }, { n: '欧美剧', v: '15' },
            ],
        },
        {
            key: 'area', name: '地区',
            value: [
                { n: '全部', v: '' }, { n: '大陆', v: '大陆' }, { n: '香港', v: '香港' },
                { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '日本', v: '日本' },
                { n: '韩国', v: '韩国' }, { n: '印度', v: '印度' }, { n: '泰国', v: '泰国' },
                { n: '英国', v: '英国' }, { n: '法国', v: '法国' }, { n: '加拿大', v: '加拿大' },
                { n: '西班牙', v: '西班牙' }, { n: '俄罗斯', v: '俄罗斯' }, { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year', name: '年份',
            value: [
                { n: '全部', v: '' }, { n: '2026', v: '2026' }, { n: '2025', v: '2025' },
                { n: '2024', v: '2024' }, { n: '2023', v: '2023' }, { n: '2022', v: '2022' },
                { n: '2021', v: '2021' }, { n: '2020', v: '2020' }, { n: '2019', v: '2019' },
                { n: '2018', v: '2018' }, { n: '2017', v: '2017' }, { n: '2016', v: '2016' },
                { n: '2015', v: '2015' }, { n: '2014', v: '2014' }, { n: '2013', v: '2013' },
                { n: '2012', v: '2012' }, { n: '2011', v: '2011' }, { n: '2010', v: '2010' },
            ],
        },
        {
            key: 'sort', name: '排序',
            value: [{ n: '时间', v: 'time' }, { n: '人气', v: 'hits' }, { n: '评分', v: 'score' }],
        },
    ],
    3: [
        {
            key: 'area', name: '地区',
            value: [
                { n: '全部', v: '' }, { n: '大陆', v: '大陆' }, { n: '香港', v: '香港' },
                { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '日本', v: '日本' },
                { n: '韩国', v: '韩国' }, { n: '印度', v: '印度' }, { n: '泰国', v: '泰国' },
                { n: '英国', v: '英国' }, { n: '法国', v: '法国' }, { n: '加拿大', v: '加拿大' },
                { n: '西班牙', v: '西班牙' }, { n: '俄罗斯', v: '俄罗斯' }, { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year', name: '年份',
            value: [
                { n: '全部', v: '' }, { n: '2026', v: '2026' }, { n: '2025', v: '2025' },
                { n: '2024', v: '2024' }, { n: '2023', v: '2023' }, { n: '2022', v: '2022' },
                { n: '2021', v: '2021' }, { n: '2020', v: '2020' }, { n: '2019', v: '2019' },
                { n: '2018', v: '2018' }, { n: '2017', v: '2017' }, { n: '2016', v: '2016' },
                { n: '2015', v: '2015' }, { n: '2014', v: '2014' }, { n: '2013', v: '2013' },
                { n: '2012', v: '2012' }, { n: '2011', v: '2011' }, { n: '2010', v: '2010' },
            ],
        },
        {
            key: 'sort', name: '排序',
            value: [{ n: '时间', v: 'time' }, { n: '人气', v: 'hits' }, { n: '评分', v: 'score' }],
        },
    ],
    4: [
        {
            key: 'area', name: '地区',
            value: [
                { n: '全部', v: '' }, { n: '大陆', v: '大陆' }, { n: '香港', v: '香港' },
                { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '日本', v: '日本' },
                { n: '韩国', v: '韩国' }, { n: '印度', v: '印度' }, { n: '泰国', v: '泰国' },
                { n: '英国', v: '英国' }, { n: '法国', v: '法国' }, { n: '加拿大', v: '加拿大' },
                { n: '西班牙', v: '西班牙' }, { n: '俄罗斯', v: '俄罗斯' }, { n: '其他', v: '其他' },
            ],
        },
        {
            key: 'year', name: '年份',
            value: [
                { n: '全部', v: '' }, { n: '2026', v: '2026' }, { n: '2025', v: '2025' },
                { n: '2024', v: '2024' }, { n: '2023', v: '2023' }, { n: '2022', v: '2022' },
                { n: '2021', v: '2021' }, { n: '2020', v: '2020' }, { n: '2019', v: '2019' },
                { n: '2018', v: '2018' }, { n: '2017', v: '2017' }, { n: '2016', v: '2016' },
                { n: '2015', v: '2015' }, { n: '2014', v: '2014' }, { n: '2013', v: '2013' },
                { n: '2012', v: '2012' }, { n: '2011', v: '2011' }, { n: '2010', v: '2010' },
            ],
        },
        {
            key: 'sort', name: '排序',
            value: [{ n: '时间', v: 'time' }, { n: '人气', v: 'hits' }, { n: '评分', v: 'score' }],
        },
    ],
    26: [
        {
            key: 'sort', name: '排序',
            value: [{ n: '时间', v: 'time' }, { n: '人气', v: 'hits' }, { n: '评分', v: 'score' }],
        },
    ],
};

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '1',  type_name: '电影'  },
        { type_id: '2',  type_name: '连续剧' },
        { type_id: '3',  type_name: '综艺'  },
        { type_id: '4',  type_name: '动漫'  },
        { type_id: '26', type_name: '短剧'  },
    ];
    const filters = {};
    for (const c of classes) filters[c.type_id] = filterList[c.type_id] || [];
    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const id   = inReq.body.id;
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);
    const f    = inReq.body.filters || {};

    const url = `${site}/vod-list-id-${f.type || id}-pg-${page}-order--by-${f.sort || 'time'}-class-0-year-${f.year || 0}-letter--area-${f.area || ''}-lang-.html`;

    const html = await request(url);
    const $    = load(html);
    const list = [];

    $('.globalPicList > ul li').each((_, e) => {
        const href     = $(e).find('a').attr('href') || '';
        const title    = $(e).find('a').attr('title') || '';
        const cover    = $(e).find('img').attr('src') || '';
        const subTitle = $(e).find('.sDes').text();
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle || '',
        });
    });

    return { page, pagecount: list.length > 0 ? page + 1 : page, list, filter: filterList[id] || [] };
}

async function detail(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = id.startsWith('http') ? id : `${site}${id}`;

    const html = await request(url);
    const $    = load(html);

    const name = $('h1').first().text().trim() || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    // 从第一集页面取 mac_from / mac_url
    const firstHref   = $('.numList').first().find('li').first().find('a').attr('href') || '';
    const firstEpUrl  = `${site}${firstHref}`;
    const epHtml      = await request(firstEpUrl);

    const fromMatch = epHtml.match(/mac_from\s*=\s*'([^']*)'/);
    const urlMatch  = epHtml.match(/mac_url\s*=\s*'([^']+)'/);
    if (!fromMatch || !urlMatch) {
        return { list: [{ vod_id: id, vod_name: name, vod_pic: pic, vod_play_from: '', vod_play_url: '' }] };
    }

    const froms    = fromMatch[1].split('$$$');
    const urlGroups = urlMatch[1].split('$$$');

    const fromList = [];
    const playList = [];
    for (let i = 0; i < froms.length; i++) {
        const eps   = (urlGroups[i] || '').split('#');
        const tracks = eps.map(ep => {
            const parts = ep.split('$');
            const epName = froms.length === 1 ? `${froms[i]}-${parts[0]}` : parts[0];
            return `${epName}$${parts[1] || ''}`;
        });
        fromList.push(froms[i]);
        playList.push(tracks.join('#'));
    }
    
    return {
        list: [{
            vod_id:        id,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: fromList.join('$$$'),
            vod_play_url:  playList.join('$$$'),
        }],
    };
}

async function play(inReq, _outResp) {
    const rawUrl  = inReq.body.id;
    const apiUrl  = `https://api.nmvod.me:520/player/?url=${rawUrl}`;

    const html    = await axios.get(apiUrl, {
        headers: {
            'User-Agent':     UA,
            Referer:          site + '/',
            'sec-fetch-site': 'cross-site',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'iframe',
        },
        timeout: 10000,
    }).then(r => r.data);

    const match     = html.match(/var\s+config\s*=\s*(\{[\s\S]*?\})/);
    const configStr = match?.[1] || '';
    const playUrl   = (configStr.match(/url":\s*"(.+)"/) || [])[1] || '';

    return { parse: 0, url: playUrl, header: { 'User-Agent': UA } };
}

async function search(inReq, _outResp) {
    const page = parseInt(inReq.body.page) || 1;
    if (page > 1) return { list: [] };

    const text = encodeURIComponent(inReq.body.wd || '');
    const html = await post(`${site}/index.php?m=vod-search`, `wd=${text}`);
    const $    = load(html);
    const list = [];

    $('#search_main ul li').each((_, e) => {
        const href     = $(e).find('.pic a').attr('href') || '';
        const title    = $(e).find('.sTit').text().trim();
        const cover    = $(e).find('img').attr('data-src') || '';
        const subTitle = $(e).find('.sStyle').text();
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle || '',
        });
    });

    return { list };
}

export default {
    meta: { key: 'nmvod', name: '🔥农民影视', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};