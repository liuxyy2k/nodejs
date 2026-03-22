import axios from 'axios';

const site      = 'https://ev5356.970xw.com';
let   imgDomain = 'https://img.jgsfnl.com';

function getHeader() {
    return {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; V2196A Build/PQ3A.190705.08211809; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36;webank/h5face;webank/1.0;netType:NETWORK_WIFI;appVersion:416;packageName:com.jp3.xg3',
        Referer: site,
    };
}

async function request(url) {
    const resp = await axios.get(url, { headers: getHeader() });
    return resp.data;
}

async function fetchImgDomain() {
    try {
        const data   = await request(`${site}/api/v2/settings/resourceDomainConfig`);
        let   domain = data.data.imgDomain;
        const list   = domain.split(',');
        domain       = list[Math.floor(Math.random() * list.length)];
        return domain.startsWith('http') ? domain : 'https://' + domain;
    } catch (e) {
        return imgDomain;
    }
}

const filterObj = {
    1: buildFilter(), 2: buildFilter(), 3: buildFilter(), 4: buildFilter(),
};

function buildFilter() {
    return [
        {
            key: 'cateId', name: '分类', init: '',
            value: [
                { v: '', n: '全部' },{ v: '1', n: '剧情' },{ v: '2', n: '爱情' },{ v: '3', n: '动画' },
                { v: '4', n: '喜剧' },{ v: '5', n: '战争' },{ v: '6', n: '歌舞' },{ v: '7', n: '古装' },
                { v: '8', n: '奇幻' },{ v: '9', n: '冒险' },{ v: '10', n: '动作' },{ v: '11', n: '科幻' },
                { v: '12', n: '悬疑' },{ v: '13', n: '犯罪' },{ v: '14', n: '家庭' },{ v: '15', n: '传记' },
                { v: '16', n: '运动' },{ v: '18', n: '惊悚' },{ v: '20', n: '短片' },{ v: '21', n: '历史' },
                { v: '22', n: '音乐' },{ v: '23', n: '西部' },{ v: '24', n: '武侠' },{ v: '25', n: '恐怖' },
            ],
        },
        {
            key: 'area', name: '地区', init: '',
            value: [
                { v: '', n: '全部' },{ v: '1', n: '国产' },{ v: '3', n: '香港' },{ v: '6', n: '台湾' },
                { v: '5', n: '美国' },{ v: '18', n: '韩国' },{ v: '2', n: '日本' },
            ],
        },
        {
            key: 'year', name: '年代', init: '',
            value: [
                { v: '', n: '全部' },{ v: '107', n: '2025' },{ v: '119', n: '2024' },{ v: '153', n: '2023' },
                { v: '101', n: '2022' },{ v: '118', n: '2021' },{ v: '16', n: '2020' },{ v: '7', n: '2019' },
                { v: '2', n: '2018' },{ v: '3', n: '2017' },{ v: '22', n: '2016' },{ v: '2015', n: '2015以前' },
            ],
        },
        {
            key: 'sort', name: '排序', init: 'update',
            value: [{ v: 'update', n: '最新' },{ v: 'hot', n: '最热' },{ v: 'rating', n: '评分' }],
        },
    ];
}

async function init(_inReq, _outResp) {
    imgDomain = await fetchImgDomain();
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'home', type_name: '首页'   },
        { type_id: '1',    type_name: '电影'   },
        { type_id: '2',    type_name: '电视剧'  },
        { type_id: '3',    type_name: '动漫'   },
        { type_id: '4',    type_name: '综艺'   },
        { type_id: '50',   type_name: '纪录片'  },
        { type_id: '99',   type_name: 'Netflix' },
    ];
    const filters = {};
    for (const c of classes) {
        if (filterObj[c.type_id]) filters[c.type_id] = filterObj[c.type_id];
    }
    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const id      = inReq.body.id;
    const page    = Math.max(parseInt(inReq.body.page) || 1, 1);
    const f       = inReq.body.filters || {};
    const list    = [];

    // 首页轮播
    if (id === 'home') {
        if (page > 1) return { list: [] };
        const data = await request(`${site}/api/slide/list?pos_id=88`);
        data.data.forEach(e => {
            list.push({
                vod_id:   e.jump_id.toString(),
                vod_name: e.title,
                vod_pic:  imgDomain + e.thumbnail,
            });
        });
        return { page, pagecount: 1, list };
    }

    // Netflix / 纪录片 tag 列表
    if (id === '99' || id === '50') {
        if (page > 1) return { list: [] };
        const data = await request(`${site}/api/dyTag/list?category_id=${id}&page=${page}`);
        data.data.forEach(e => {
            const duration = e.name;
            e.dataList.forEach(item => {
                list.push({
                    vod_id:       item.id.toString(),
                    vod_name:     item.title,
                    vod_pic:      imgDomain + item.path,
                    vod_remarks:  item.mask || '',
                    vod_duration: duration,
                });
            });
        });
        return { page, pagecount: 1, list };
    }

    // 普通分类
    const url  = `${site}/api/crumb/list?fcate_pid=${id}&area=${f.area ?? ''}&year=${f.year ?? ''}&type=0&sort=${f.sort ?? ''}&page=${page}&category_id=${f.cateId ?? ''}`;
    const data = await request(url);
    data.data.forEach(e => {
        list.push({
            vod_id:      e.id.toString(),
            vod_name:    e.title,
            vod_pic:     imgDomain + e.path,
            vod_remarks: e.mask || '',
        });
    });

    return { page, pagecount: list.length > 0 ? page + 1 : page, list, filter: filterObj[id] || [] };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const data = await request(`${site}/api/video/detailv2?id=${id}`);

    const groups = [];
    try {
        (data.data.source_list_source || []).forEach(e => {
            if (e.source_key === 'back_source_list_p2p') return;
            const tracks = e.source_list.map(item => `${item.source_name}$${item.url}`);
            groups.push({ title: e.name, tracks });
        });
    } catch (e) {
        console.error(e.message);
    }

    // 取第一个分组构造 vod_play_url，多分组用 '^^^' 分隔 from
    const vod_play_from = groups.map(g => g.title).join('$$$');
    const vod_play_url  = groups.map(g => g.tracks.join('#')).join('$$$');

    return {
        list: [{
            vod_id:        id,
            vod_name:      '',
            vod_pic:       '',
            vod_play_from,
            vod_play_url,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: getHeader(),
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = parseInt(inReq.body.page) || 1;

    const data = await request(`${site}/api/v2/search/videoV2?key=${text}&category_id=88&page=${page}&pageSize=20`);
    const list = data.data.map(e => ({
        vod_id:      e.id.toString(),
        vod_name:    e.title,
        vod_pic:     imgDomain + e.thumbnail,
        vod_remarks: e.mask || '',
    }));

    return { list };
}

export default {
    meta: { key: 'jianpian', name: '荐片', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};