import req from '../../util/req.js';
import { aesCbcDecryptHex, aesCbcEncryptHex } from '../../util/miniAesCbc.js';

const SITE = 'https://gz360.tv';
const API_HOSTS = [
    'https://haiwaiapi.1fc8ab0.com/Pc',
    'https://hyperf.718fd9f.com/Pc',
];
const KEY = '181cc88340ae5b2b';
const IV = '4423d1e2773476ce';
const CACHE_TTL = 1800 * 1000;
const CACHE_MAX = 300;

const HDR = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Origin: SITE,
    Referer: `${SITE}/`,
    'Content-Type': 'application/json',
};

let apiUrl = API_HOSTS[0];
const memoryCache = new Map();
const pending = new Map();
let categoryCache = null;
let categoryCacheTime = 0;
let categoryCachePromise = null;

const COMMON_AREAS = [
    { n: '全部', v: '0' },
    { n: '大陆', v: '大陆' },
    { n: '香港', v: '香港' },
    { n: '台湾', v: '台湾' },
    { n: '欧美', v: '俄罗斯,加拿大,德国,意大利,法国,欧美,美国,英国,西班牙' },
    { n: '日本', v: '日本' },
    { n: '韩国', v: '韩国' },
    { n: '泰国', v: '泰国' },
    { n: '其他', v: '其他,印度,新加坡,马来西亚' },
];
const COMMON_YEARS = [
    { n: '全部', v: '0' },
    { n: '2026', v: '2026' },
    { n: '2025', v: '2025' },
    { n: '2024', v: '2024' },
    { n: '2023', v: '2023' },
    { n: '2022', v: '2022' },
    { n: '2021', v: '2021' },
    { n: '2020', v: '2020' },
    { n: '2019', v: '2019' },
    { n: '2018', v: '2018' },
    { n: '2017', v: '2017' },
    { n: '2016-2011', v: '2016,2015,2014,2013,2012,2011' },
    { n: '2010-2000', v: '2010,2009,2008,2007,2006,2005,2004,2003,2002,2001,2000' },
    { n: '90年代', v: '1999,1998,1997,1996,1995,1994,1993,1992,1991,1990' },
    { n: '更早', v: '1989,1988,1987,1986,1985,1984,1983,1982,1981,1980' },
];
const COMMON_SORTS = [
    { n: '综合排序', v: 'd_id' },
    { n: '最新发布', v: 'd_addtime' },
    { n: '最多播放', v: 'd_hits' },
    { n: '评分最高', v: 'd_score' },
];

const MOVIE_CLASSES = [
    { n: '全部', v: '0' }, { n: '动作', v: '84' }, { n: '喜剧', v: '66' }, { n: '爱情', v: '71' },
    { n: '科幻', v: '3' }, { n: '恐怖', v: '9' }, { n: '剧情', v: '82' }, { n: '战争', v: '87' },
    { n: '悬疑', v: '2' }, { n: '惊悚', v: '1' }, { n: '罪案', v: '4' }, { n: '犯罪', v: '77' },
    { n: '冒险', v: '68' }, { n: '奇幻', v: '86' }, { n: '武侠', v: '93' }, { n: '古装', v: '7' },
    { n: '动画', v: '6' }, { n: '纪录片', v: '69' }, { n: '灾难', v: '5' }, { n: '青春', v: '8' },
    { n: '文艺', v: '10' }, { n: '生活', v: '11' }, { n: '历史', v: '12' }, { n: '励志', v: '13' },
    { n: '情色', v: '67' }, { n: '音乐', v: '70' }, { n: '传记', v: '72' }, { n: '西部', v: '73' },
    { n: '家庭', v: '83' }, { n: '同性', v: '88' }, { n: '运动', v: '90' },
];
const TV_CLASSES = [
    { n: '全部', v: '0' }, { n: '古装', v: '22' }, { n: '爱情', v: '15' }, { n: '都市', v: '16' },
    { n: '喜剧', v: '20' }, { n: '剧情', v: '81' }, { n: '悬疑', v: '32' }, { n: '动作', v: '80' },
    { n: '武侠', v: '23' }, { n: '奇幻', v: '78' }, { n: '冒险', v: '79' }, { n: '犯罪', v: '33' },
    { n: '刑侦', v: '24' }, { n: '战争', v: '25' }, { n: '历史', v: '21' }, { n: '家庭', v: '17' },
    { n: '生活', v: '18' }, { n: '偶像', v: '19' }, { n: '军旅', v: '27' }, { n: '谍战', v: '28' },
    { n: '商战', v: '29' }, { n: '校园', v: '30' }, { n: '穿越', v: '31' }, { n: '科幻', v: '34' },
    { n: '惊悚', v: '76' }, { n: '神话', v: '26' }, { n: '动画', v: '91' }, { n: '纪录片', v: '74' },
    { n: '传记', v: '102' }, { n: '音乐', v: '105' }, { n: '西部', v: '92' }, { n: '运动', v: '99' },
    { n: '恐怖', v: '100' }, { n: '同性', v: '75' },
];
const SHOW_CLASSES = [
    { n: '全部', v: '0' }, { n: '真人秀', v: '37' }, { n: '脱口秀', v: '36' }, { n: '选秀', v: '38' },
    { n: '情感', v: '39' }, { n: '访谈', v: '40' }, { n: '时尚', v: '41' }, { n: '晚会', v: '42' },
    { n: '音乐', v: '45' }, { n: '游戏', v: '46' }, { n: '美食', v: '48' }, { n: '旅游', v: '49' },
    { n: '职场', v: '47' }, { n: '财经', v: '43' }, { n: '益智', v: '44' }, { n: '韩国真人秀', v: '59' },
];
const ANIME_CLASSES = [
    { n: '全部', v: '0' }, { n: '热血', v: '51' }, { n: '冒险', v: '50' }, { n: '搞笑', v: '52' },
    { n: '爱情', v: '53' }, { n: '奇幻', v: '60' }, { n: '动作', v: '94' }, { n: '科幻', v: '96' },
    { n: '推理', v: '54' }, { n: '悬疑', v: '97' }, { n: '校园', v: '61' }, { n: '青春', v: '65' },
    { n: '竞技', v: '55' }, { n: '励志', v: '62' }, { n: '剧情', v: '63' }, { n: '喜剧', v: '95' },
    { n: '经典', v: '58' }, { n: '动画', v: '98' },
];

const DEFAULT_TOPIC_FILTERS = [
    { n: '全部', v: '0' },
    { n: 'Netflix新片推荐', v: 'Netflix新片推荐' },
    { n: '港台18🈲电影排行榜', v: '港台18🈲电影排行榜' },
    { n: '大尺度限制🚫级影片', v: '大尺度限制🚫级影片' },
    { n: '未删减影视', v: '未删减影视' },
    { n: '禁播影视', v: '禁播影视' },
    { n: '下架影视', v: '下架影视' },
    { n: '长假狂飙高燃爽剧', v: '⛱️长假狂飙！7天炫完全集的高燃爽剧' },
    { n: 'AI剧场 全新上线', v: 'AI剧场 全新上线' },
    { n: '第98届奥斯卡获奖影片', v: '🏆第98届奥斯卡获奖影片🏆' },
    { n: '2026金球奖获奖影片', v: '🔥2026金球奖获奖影片' },
    { n: '第33届金鹰奖获奖影片', v: '第33届金鹰奖获奖影片🏆' },
    { n: '第38届百花奖获奖影片', v: '🏆第38届大众电影百花奖获奖影片' },
    { n: '神级高分纪录片', v: '神级高分纪录片' },
    { n: '2026爆款剧王', v: '热度口碑双爆🔥2026剧王' },
    { n: '2026日漫新番', v: '2026日漫新番' },
    { n: '动漫变真人', v: '动漫变真人：你最pick哪一部' },
    { n: '殿堂级恐怖片系列', v: '殿堂级恐怖片系列（QQ群：1127581238）' },
    { n: '瓜友求片上新', v: '瓜友10/06求片上新' },
    { n: '即将上线', v: '即将上线' },
    { n: '🏮热门推荐🏮', v: '🏮热门推荐🏮' },
];

function encrypt(obj) {
    const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return aesCbcEncryptHex(text, KEY, IV);
}

function decrypt(hexStr) {
    return aesCbcDecryptHex(hexStr, KEY, IV);
}

function setCache(key, data, ttl = CACHE_TTL) {
    if (!key || data == null) return;
    if (memoryCache.has(key)) memoryCache.delete(key);
    else if (memoryCache.size >= CACHE_MAX) {
        const k = memoryCache.keys().next().value;
        if (k) memoryCache.delete(k);
    }
    memoryCache.set(key, { expire: Date.now() + ttl, data });
}

function getCache(key) {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expire) {
        memoryCache.delete(key);
        return null;
    }
    memoryCache.delete(key);
    memoryCache.set(key, entry);
    return entry.data;
}

function parseApiResult(resJson) {
    if (!resJson) return null;
    if (resJson.data && typeof resJson.data === 'object') return resJson.data;
    if (typeof resJson.data === 'string') {
        try {
            const dec = decrypt(resJson.data);
            if (dec) return JSON.parse(dec);
        } catch {
            return null;
        }
    }
    if (resJson.code === 200) return resJson;
    return null;
}

async function postApi(path, data = {}) {
    const hex = encrypt(data);
    const hosts = [apiUrl, ...API_HOSTS.filter((h) => h !== apiUrl)];
    for (const base of hosts) {
        try {
            const resp = await req.post(`${base}${path}`, { params: hex }, {
                headers: HDR,
                timeout: 6000,
                validateStatus: () => true,
            });
            const resultData = parseApiResult(resp.data);
            if (resultData) {
                if (base !== apiUrl) apiUrl = base;
                return resultData;
            }
        } catch {
            /* try next host */
        }
    }
    return {};
}

function cacheValid(res) {
    if (!res || typeof res !== 'object') return false;
    if (Array.isArray(res.list) && res.list.length > 0) return true;
    if (res.vodInfo?.vod_name) return true;
    if (Array.isArray(res.urls) && res.urls.length > 0) return true;
    return false;
}

async function postApiWithCache(path, data = {}, ttl = CACHE_TTL, isValid = null) {
    const cacheKey = `${path}_${JSON.stringify(data)}`;
    const cached = getCache(cacheKey);
    if (cached !== null) return cached;
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const p = (async () => {
        try {
            const res = await postApi(path, data);
            const ok = typeof isValid === 'function' ? isValid(res) : cacheValid(res);
            if (ok) setCache(cacheKey, res, ttl);
            return res;
        } finally {
            pending.delete(cacheKey);
        }
    })();
    pending.set(cacheKey, p);
    return p;
}

function cleanTopicTitle(str) {
    return String(str || '')
        .replace(/（QQ群[：:][^）]+）/g, '')
        .replace(/\(QQ群[：:][^)]+\)/g, '')
        .replace(/QQ群[：:][0-9]+/g, '')
        .trim();
}

async function getCategoryListCached() {
    const now = Date.now();
    if (categoryCache && now - categoryCacheTime < CACHE_TTL) return categoryCache;
    if (categoryCachePromise) return categoryCachePromise;
    categoryCachePromise = (async () => {
        try {
            const res = await postApi('/Index/CategoryList', {});
            if (res?.list?.length) {
                categoryCache = res.list;
                categoryCacheTime = Date.now();
                return categoryCache;
            }
        } finally {
            categoryCachePromise = null;
        }
        return categoryCache || [];
    })();
    return categoryCachePromise;
}

function makeFilter(classList) {
    const res = [];
    if (classList?.length) res.push({ key: 'class', name: '类型', value: classList });
    res.push({ key: 'area', name: '地区', value: COMMON_AREAS });
    res.push({ key: 'year', name: '年份', value: COMMON_YEARS });
    res.push({ key: 'sort', name: '排序', value: COMMON_SORTS });
    return res;
}

function parseExtend(inReq) {
    let ext = inReq.body.extend ?? inReq.body.filters ?? {};
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(ext);
        } catch {
            ext = {};
        }
    }
    return ext && typeof ext === 'object' ? ext : {};
}

function mapCard(item) {
    let remarks = item.vod_continu || '';
    if (!remarks) {
        const sc = item.vod_douban_score || item.vod_scroe;
        if (sc) remarks = `${sc}分`;
    }
    if (!remarks && item.vod_year) remarks = String(item.vod_year);
    return {
        vod_id: String(item.vod_id),
        vod_name: String(item.vod_name || item.c_name || '').replace(/💥.*/, '').trim(),
        vod_pic: item.vod_pic || item.c_pic || '',
        vod_remarks: remarks || item.new_continue || item.vod_title || '',
        vod_year: item.vod_year || '',
    };
}

function findTopicSection(catList, selTopic) {
    return catList.find(
        (s) => s.type === selTopic
            || cleanTopicTitle(s.type) === selTopic
            || (s.type && s.type.includes(selTopic)),
    );
}

async function init(inReq) {
    const ext = inReq?.body?.extend;
    if (typeof ext === 'string' && ext.startsWith('http')) {
        apiUrl = ext.replace(/\/+$/, '');
    } else if (ext && typeof ext === 'object') {
        const api = ext.api || ext.host;
        if (typeof api === 'string' && api.startsWith('http')) {
            apiUrl = api.replace(/\/+$/, '');
        }
    }
    void getCategoryListCached().catch(() => {});
    void postApiWithCache('/Search/GetConditionList', {
        tid: 1,
        page: 1,
        pageSize: 24,
        keywords: '',
    }).catch(() => {});
    return {};
}

async function home() {
    const classes = [
        { type_id: 'topics', type_name: '🔥精选专题' },
        { type_id: '1', type_name: '电影' },
        { type_id: '2', type_name: '连续剧' },
        { type_id: '3', type_name: '综艺' },
        { type_id: '4', type_name: '动漫' },
        { type_id: '64', type_name: '短剧' },
        { type_id: '74', type_name: 'AI漫剧' },
        { type_id: '73', type_name: '电影解说' },
        { type_id: '70', type_name: '电竞解说' },
        { type_id: '71', type_name: '体育解说' },
        { type_id: '72', type_name: '音乐' },
    ];

    let topicFilters = [{ n: '全部', v: '0' }];
    if (categoryCache?.length) {
        for (const sec of categoryCache) {
            if (sec?.type) topicFilters.push({ n: cleanTopicTitle(sec.type), v: sec.type });
        }
    }
    if (topicFilters.length <= 1) {
        topicFilters = DEFAULT_TOPIC_FILTERS;
        void getCategoryListCached().catch(() => {});
    }

    const filters = {
        topics: [{ key: 'topic', name: '主题', value: topicFilters }],
        1: makeFilter(MOVIE_CLASSES),
        2: makeFilter(TV_CLASSES),
        3: makeFilter(SHOW_CLASSES),
        4: makeFilter(ANIME_CLASSES),
        64: makeFilter([]),
        74: makeFilter([]),
        73: makeFilter([]),
        70: makeFilter([]),
        71: makeFilter([]),
        72: makeFilter([]),
    };
    return { class: classes, filters, list: [] };
}

async function homeVod() {
    const catList = await getCategoryListCached();
    const videos = [];
    const seen = new Set();
    for (const section of catList || []) {
        for (const item of section.list || []) {
            const id = String(item.vod_id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            videos.push(mapCard(item));
        }
    }
    return { list: videos };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const tid = String(inReq.body.id || inReq.body.tid || '1');
    const extend = parseExtend(inReq);

    if (tid === 'topics') {
        const catList = await getCategoryListCached();
        const selTopic = extend.topic || '0';

        if (selTopic && selTopic !== '0') {
            const sec = findTopicSection(catList, selTopic);
            if (sec?.show_id) {
                const res = await postApiWithCache('/Category/GetModuleList', {
                    show_id: parseInt(sec.show_id, 10),
                    show_pid: parseInt(sec.show_pid || 1, 10),
                    page,
                    pageSize: 24,
                });
                if (res?.list?.length) {
                    const list = res.list.map(mapCard);
                    const pc = Math.ceil((res.total || 0) / 24) || page;
                    return { page, pagecount: pc, limit: 24, total: res.total || list.length, list };
                }
            } else if (sec) {
                const res = await postApiWithCache('/Category/GetChoiceList', {
                    pid: parseInt(sec.pid || 1, 10),
                    page,
                    pageSize: 24,
                });
                if (res?.list?.length) {
                    const list = res.list.map(mapCard);
                    const pc = Math.ceil((res.total || 0) / 24) || page;
                    return { page, pagecount: pc, limit: 24, total: res.total || list.length, list };
                }
            }
            if (sec?.list?.length) {
                const pageSize = 24;
                const start = (page - 1) * pageSize;
                const paged = sec.list.slice(start, start + pageSize);
                return {
                    page,
                    pagecount: Math.ceil(sec.list.length / pageSize) || 1,
                    limit: pageSize,
                    total: sec.list.length,
                    list: paged.map(mapCard),
                };
            }
        }

        const target = [];
        const seen = new Set();
        for (const s of catList || []) {
            for (const item of s.list || []) {
                const id = String(item.vod_id || '');
                if (!id || seen.has(id)) continue;
                seen.add(id);
                target.push(item);
            }
        }
        const pageSize = 24;
        const start = (page - 1) * pageSize;
        return {
            page,
            pagecount: Math.ceil(target.length / pageSize) || 1,
            limit: pageSize,
            total: target.length,
            list: target.slice(start, start + pageSize).map(mapCard),
        };
    }

    const payload = {
        tid: parseInt(tid, 10) || 1,
        page,
        pageSize: 24,
        keywords: '',
    };
    if (extend.class && extend.class !== '0') payload.class = extend.class;
    if (extend.area && extend.area !== '0') payload.area = extend.area;
    if (extend.year && extend.year !== '0') payload.year = extend.year;
    if (extend.sort) {
        const s = extend.sort;
        if (s === 'time' || s === 'd_addtime') payload.sort = 'd_addtime';
        else if (s === 'hits' || s === 'd_hits') payload.sort = 'd_hits';
        else if (s === 'score' || s === 'd_score') payload.sort = 'd_score';
        else payload.sort = s;
    }

    const res = await postApiWithCache('/Search/GetConditionList', payload);
    const list = (res.list || []).map(mapCard);
    const pageCount = Math.ceil((res.total || 0) / 24) || page;
    return { page, pagecount: pageCount, limit: 24, total: res.total || 0, list };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    const vodId = parseInt(String(id || ''), 10);
    if (!vodId) return { list: [] };

    const [infoRes, playRes] = await Promise.all([
        postApiWithCache('/Resource/GetVodInfo', { vod_id: vodId }, CACHE_TTL, (r) => r?.vodInfo?.vod_name),
        postApiWithCache('/Resource/GetOnePlayList', { vod_id: vodId, pageSize: 2000 }, CACHE_TTL, (r) => r?.urls?.length),
    ]);

    const info = infoRes?.vodInfo || {};
    const urls = playRes?.urls || [];
    const epList = [];
    for (const ep of urls) {
        const epUrl = ep.url || '';
        if (!epUrl) continue;
        const epName = ep.name || `第${ep.episode || ep.sort || 1}集`;
        epList.push(`${epName}$${epUrl}`);
    }
    if (!epList.length && info.play_url) {
        epList.push(`${info.default_play_name || '正片'}$${info.play_url}`);
    }

    return {
        list: [{
            vod_id: String(info.vod_id || vodId),
            vod_name: info.vod_name || '',
            vod_pic: info.pic || '',
            type_name: Array.isArray(info.videoTag) ? info.videoTag.join(' / ') : '',
            vod_year: String(info.vod_year || '').slice(0, 4),
            vod_area: info.vod_area || '',
            vod_remarks: info.vod_continu || (info.vod_scroe ? `${info.vod_scroe}分` : ''),
            vod_actor: info.vod_actor || '',
            vod_director: info.vod_director || '',
            vod_content: String(info.vod_use_content || '').trim(),
            vod_play_from: '北美超清专线',
            vod_play_url: epList.join('#'),
        }],
    };
}

async function play(inReq) {
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': HDR['User-Agent'],
            Origin: SITE,
            Referer: `${SITE}/`,
        },
    };
}

async function search(inReq) {
    const page = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const wd = String(inReq.body.wd || inReq.body.key || '');
    const res = await postApiWithCache('/Search/GetConditionList', {
        keywords: wd,
        page,
        pageSize: 24,
    });
    const list = (res.list || []).map(mapCard);
    return {
        page,
        pagecount: Math.ceil((res.total || 0) / 24) || page,
        limit: 24,
        total: res.total || 0,
        list,
    };
}

export default {
    meta: {
        key: 'gz360',
        name: '🎬瓜子影视',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/homeVod', homeVod);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
