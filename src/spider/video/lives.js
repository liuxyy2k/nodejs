import axios from 'axios';
import { load } from 'cheerio';

// ─── 常量 ──────────────────────────────────────────────────────────────────

const EXCEPT_URL = 'https://www.baidu.com';

const UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    'Dart/3.4 (dart:io)',
];

const HOSTS = {
    huya:   ['https://www.huya.com', 'https://mp.huya.com'],
    douyin: 'https://live.douyin.com',
    douyu:  'https://www.douyu.com',
    wangyi: 'https://cc.163.com',
    bili:   ['https://api.live.bilibili.com', 'https://api.bilibili.com'],
};

const REFERERS = {
    huya:   'https://live.cdn.huya.com',
    douyin: 'https://live.douyin.com',
    douyu:  'https://m.douyu.com',
    bili:   'https://live.bilibili.com',
};

const PLAY_HEADERS = {
    wangyi: { 'User-Agent': 'ExoPlayer', 'Connection': 'Keep-Alive', 'Icy-MetaData': '1' },
    bili:   { 'Accept': '*/*', 'Icy-MetaData': '1', 'referer': REFERERS.bili, 'user-agent': UAS[0] },
    douyin: { 'User-Agent': 'libmpv', 'Icy-MetaData': '1' },
    huya:   { 'User-Agent': 'ExoPlayer', 'Connection': 'Keep-Alive', 'Icy-MetaData': '1' },
    douyu:  { 'User-Agent': 'libmpv', 'Icy-MetaData': '1' },
};

// ─── 模块级状态 ────────────────────────────────────────────────────────────

let dyHeaders  = {};   // 抖音专用 headers（含 ttwid cookie）
let blfData    = {};   // B站分类数据
let dyifData   = {};   // 抖音分类数据
let dyufData   = {};   // 斗鱼分类数据

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function gethr(index, rf = '', zr = '') {
    const h = { 'User-Agent': UAS[index] };
    h['referer'] = zr || (rf ? `${REFERERS[rf]}/` : '');
    return h;
}

function paramsToJson(queryString) {
    const result = {};
    for (const [k, v] of new URLSearchParams(queryString)) result[k] = v;
    return result;
}

function buildvod({
    vod_id = '', vod_name = '', vod_pic = '', vod_year = '', vod_tag = '',
    vod_remarks = '', style = '', type_name = '', vod_area = '',
    vod_actor = '', vod_director = '', vod_content = '',
    vod_play_from = '', vod_play_url = '',
} = {}) {
    const vod = {
        vod_id, vod_name, vod_pic, vod_year,
        vod_tag: vod_tag ? 'folder' : '',
        vod_remarks, style, type_name, vod_area,
        vod_actor, vod_director, vod_content,
        vod_play_from, vod_play_url,
    };
    return Object.fromEntries(Object.entries(vod).filter(([, v]) => v));
}

function handleException(e) {
    console.error('报错:', e?.message || e);
    return { vod_play_from: '哎呀翻车啦', vod_play_url: `翻车啦$${EXCEPT_URL}` };
}

async function fetchJson(url, opts = {}) {
    const resp = await axios.get(url, opts);
    return resp.data;
}

async function postJson(url, data, opts = {}) {
    const resp = await axios.post(url, data, opts);
    return resp.data;
}

// ─── 斗鱼签名工具 ──────────────────────────────────────────────────────────

function douyuText(text) {
    const positions = [...text.matchAll(/function/g)].map(m => m.index);
    const total     = positions.length;
    const targetIdx = total % 2 === 0 ? total / 2 + 1 : (total - 1) / 2 + 1;
    if (total >= targetIdx) {
        const cut = positions[targetIdx - 1];
        return text.slice(4, cut).replace(/eval\(strc\)\([\w\d,]+\)/g, 'strc');
    }
    return text;
}

// ─── 初始化 ────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    try {
        // 获取抖音 ttwid cookie
        const resp = await axios.head(HOSTS.douyin, {
            headers: { 'User-Agent': UAS[0] },
        });
        const setCookie = resp.headers['set-cookie'] || [];
        const ttwid = setCookie
            .map(c => c.match(/ttwid=([^;]+)/))
            .filter(Boolean)[0]?.[1] || '';

        dyHeaders = {
            'User-Agent': UAS[0],
            'authority':  HOSTS.douyin.split('//')[1],
            'cookie':     ttwid ? `ttwid=${ttwid}` : '',
            'referer':    `${REFERERS.douyin}/`,
        };
    } catch {}
    return {};
}

// ─── 首页（并发加载三平台分类） ────────────────────────────────────────────

async function processBili() {
    try {
        blfData = await fetchJson(
            `${HOSTS.bili[0]}/room/v1/Area/getList?need_entrance=1&parent_id=0`,
            { headers: gethr(0, 'bili') }
        );
        return ['bili', [{ key: 'cate', name: '分类',
            value: blfData.data.map(i => ({ n: i.name, v: String(i.id) })) }]];
    } catch (e) { return ['bili', null]; }
}

async function processDouyin() {
    try {
        const html = (await axios.get(HOSTS.douyin, { headers: dyHeaders })).data;
        const $    = load(html);
        for (const el of $('script').toArray()) {
            const text = $(el).html() || '';
            if (!text.includes('categoryData')) continue;
            const start = text.indexOf('{');
            const end   = text.lastIndexOf('}') + 1;
            if (start === -1 || end === 0) continue;
            const jsonStr = text.slice(start, end).replace(/\\"/g, '"');
            try {
                dyifData = JSON.parse(jsonStr);
                return ['douyin', [{ key: 'cate', name: '分类',
                    value: dyifData.categoryData.map(i => ({
                        n: i.partition.title,
                        v: `${i.partition.id_str}@@${i.partition.title}`,
                    })) }]];
            } catch {}
        }
        return ['douyin', null];
    } catch { return ['douyin', null]; }
}

async function processDouyu() {
    try {
        dyufData = await fetchJson(`${REFERERS.douyu}/api/cate/list`, { headers: { 'User-Agent': UAS[1] } });
        return ['douyu', [{ key: 'cate', name: '分类',
            value: dyufData.data.cate1Info.map(i => ({ n: i.cate1Name, v: String(i.cate1Id) })) }]];
    } catch { return ['douyu', null]; }
}

async function home(_inReq, _outResp) {
    const filters = {
        huya: [{ key: 'cate', name: '分类',
            value: [{ n: '网游', v: '1' }, { n: '单机', v: '2' }, { n: '娱乐', v: '8' }, { n: '手游', v: '3' }] }],
    };

    const [biliRes, douyinRes, douyuRes] = await Promise.allSettled([
        processBili(), processDouyin(), processDouyu(),
    ]);

    for (const r of [biliRes, douyinRes, douyuRes]) {
        if (r.status === 'fulfilled' && r.value[1]) {
            filters[r.value[0]] = r.value[1];
        }
    }

    const classes = [
        { type_name: '虎牙', type_id: 'huya'   },
        { type_name: '哔哩', type_id: 'bili'   },
        { type_name: '抖音', type_id: 'douyin' },
        { type_name: '斗鱼', type_id: 'douyu'  },
        { type_name: '网易', type_id: 'wangyi' },
    ];

    return { class: classes, filters };
}

// ─── 分类内容 ──────────────────────────────────────────────────────────────

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = String(inReq.body.page || 1);
    const extend = inReq.body.extend || {};

    let vdata = [], pagecount = 9999;

    if (tid === 'wangyi')           [vdata, pagecount] = await wyccContent(tid, pg, extend);
    else if (tid.includes('bili'))  [vdata, pagecount] = await biliContent(tid, pg, extend);
    else if (tid.includes('huya'))  [vdata, pagecount] = await huyaContent(tid, pg, extend);
    else if (tid.includes('douyin'))[vdata, pagecount] = await douyinContent(tid, pg, extend);
    else if (tid.includes('douyu')) [vdata, pagecount] = await douyuContent(tid, pg, extend);

    return { page: pg, limit: 90, total: 999999, pagecount, list: vdata };
}

async function wyccContent(tid, pg, extend) {
    const start  = (parseInt(pg) - 1) * 20;
    const resp   = await fetchJson(`${HOSTS[tid]}/api/category/live/`, {
        params:  { format: 'json', start, size: 20 },
        headers: { 'User-Agent': UAS[0] },
    });
    const vdata  = (resp.lives || []).filter(i => i.cuteid).map(i => buildvod({
        vod_id:      `${tid}@@${i.cuteid}`,
        vod_name:    i.title,
        vod_pic:     i.cover,
        vod_remarks: i.nickname,
        style:       { type: 'rect', ratio: 1.33 },
    }));
    return [vdata, 9999];
}

async function biliContent(tid, pg, extend) {
    if (extend?.cate && pg === '1' && !tid.includes('click')) {
        const vdata = [];
        for (const i of (blfData.data || [])) {
            if (String(i.id) !== extend.cate) continue;
            for (const j of i.list) {
                vdata.push(buildvod({
                    vod_id:  `click_${tid}@@${i.id}@@${j.id}`,
                    vod_name: j.name,
                    vod_pic:  j.pic,
                    vod_tag:  1,
                    style:    { type: 'oval', ratio: 1 },
                }));
            }
        }
        return [vdata, 1];
    }

    let path = `/xlive/web-interface/v1/second/getListByArea?platform=web&sort=online&page_size=30&page=${pg}`;
    let realTid = tid;
    if (tid.includes('click')) {
        const ids = tid.split('_')[1].split('@@');
        realTid = ids[0];
        path = `/xlive/web-interface/v1/second/getList?platform=web&parent_area_id=${ids[1]}&area_id=${ids[ids.length - 1]}&sort_type=&page=${pg}`;
    }
    const data  = await fetchJson(`${HOSTS[realTid][0]}${path}`, { headers: gethr(0, realTid) });
    const vdata = (data.data?.list || []).filter(i => i.roomid).map(i => buildvod({
        vod_id:      `${realTid}@@${i.roomid}`,
        vod_name:    i.title,
        vod_pic:     i.cover,
        vod_remarks: i.watched_show?.text_large,
        vod_actor:   i.uname,
        style:       { type: 'rect', ratio: 1.33 },
    }));
    return [vdata, 9999];
}

async function huyaContent(tid, pg, extend) {
    if (extend?.cate && pg === '1' && !tid.includes('click')) {
        const data  = await fetchJson(`${REFERERS[tid]}/liveconfig/game/bussLive?bussType=${extend.cate}`, { headers: { 'User-Agent': UAS[1] } });
        const vdata = (data.data || []).map(i => buildvod({
            vod_id:  `click_${tid}@@${parseInt(i.gid)}`,
            vod_name: i.gameFullName,
            vod_pic:  `https://huyaimg.msstatic.com/cdnimage/game/${parseInt(i.gid)}-MS.jpg`,
            vod_tag:  1,
            style:    { type: 'oval', ratio: 1 },
        }));
        return [vdata, 1];
    }

    let gid = '', realTid = tid;
    if (tid.includes('click')) {
        const ids = tid.split('_')[1].split('@@');
        realTid = ids[0];
        gid = `&gameId=${ids[1]}`;
    }
    const data  = await fetchJson(`${HOSTS[realTid][0]}/cache.php?m=LiveList&do=getLiveListByPage&tagAll=0${gid}&page=${pg}`, { headers: { 'User-Agent': UAS[1] } });
    const vdata = (data.data?.datas || []).filter(i => i.profileRoom).map(i => buildvod({
        vod_id:      `${realTid}@@${i.profileRoom}`,
        vod_name:    i.introduction,
        vod_pic:     i.screenshot,
        vod_remarks: (parseInt(i.totalCount || 1) / 10000).toFixed(1) + '万',
        vod_actor:   i.nick,
        style:       { type: 'rect', ratio: 1.33 },
    }));
    return [vdata, 9999];
}

async function douyinContent(tid, pg, extend) {
    if (extend?.cate && pg === '1' && !tid.includes('click')) {
        const ids   = extend.cate.split('@@');
        const vdata = [];
        for (const item of (dyifData.categoryData || [])) {
            const c = item.partition;
            if (c.id_str !== ids[0] || c.title !== ids[1]) continue;
            const vlist = [{ partition: c }, ...(item.sub_partition || [])];
            for (const j of vlist) {
                const p = j.partition;
                vdata.push(buildvod({
                    vod_id:  `click_${tid}@@${p.id_str}@@${p.type}`,
                    vod_name: p.title,
                    vod_pic:  'https://p3-pc-weboff.byteimg.com/tos-cn-i-9r5gewecjs/pwa_v3/512x512-1.png',
                    vod_tag:  1,
                    style:    { type: 'oval', ratio: 1 },
                }));
            }
        }
        return [vdata, 1];
    }

    const offset = (parseInt(pg) - 1) * 15;
    let path = `/webcast/web/partition/detail/room/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&count=15&offset=${offset}&partition=720&partition_type=1`;
    let realTid = tid;
    if (tid.includes('click')) {
        const ids = tid.split('_')[1].split('@@');
        realTid = ids[0];
        path = `/webcast/web/partition/detail/room/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&count=15&offset=${offset}&partition=${ids[1]}&partition_type=${ids[ids.length - 1]}&req_from=2`;
    }
    const data  = await fetchJson(`${HOSTS[realTid]}${path}`, { headers: dyHeaders });
    const vdata = (data.data?.data || []).map(i => buildvod({
        vod_id:      `${realTid}@@${i.web_rid}`,
        vod_name:    i.room?.title,
        vod_pic:     i.room?.cover?.url_list?.[0],
        vod_year:    i.user_count_str,
        vod_remarks: i.room?.owner?.nickname,
        style:       { type: 'rect', ratio: 1.33 },
    }));
    return [vdata, 9999];
}

async function douyuContent(tid, pg, extend) {
    if (extend?.cate && pg === '1' && !tid.includes('click')) {
        const vdata = (dyufData.data?.cate2Info || [])
            .filter(i => String(i.cate1Id) === extend.cate)
            .map(i => buildvod({
                vod_id:      `click_${tid}@@${i.cate2Id}`,
                vod_name:    i.cate2Name,
                vod_pic:     i.icon,
                vod_remarks: i.count,
                vod_tag:     1,
                style:       { type: 'oval', ratio: 1 },
            }));
        return [vdata, 1];
    }

    let path = `/japi/weblist/apinc/allpage/6/${pg}`;
    let realTid = tid;
    if (tid.includes('click')) {
        const ids = tid.split('_')[1].split('@@');
        realTid = ids[0];
        path = `/gapi/rkc/directory/mixList/2_${ids[1]}/${pg}`;
    }
    const data  = await fetchJson(`${HOSTS[realTid]}${path}`, { headers: { 'User-Agent': UAS[1] } });
    const vdata = (data.data?.rl || []).map(i => buildvod({
        vod_id:      `${realTid}@@${i.rid}`,
        vod_name:    i.rn,
        vod_pic:     i.rs16,
        vod_year:    (parseInt(i.ol || 1) / 10000).toFixed(1) + '万',
        vod_remarks: i.nn,
        style:       { type: 'rect', ratio: 1.33 },
    }));
    return [vdata, 9999];
}

// ─── 详情 ──────────────────────────────────────────────────────────────────

async function detail(inReq, _outResp) {
    const ids = inReq.body.id.split('@@');
    let vod;
    if (ids[0] === 'wangyi')      vod = await wyccDetail(ids);
    else if (ids[0] === 'bili')   vod = await biliDetail(ids);
    else if (ids[0] === 'huya')   vod = await huyaDetail(ids);
    else if (ids[0] === 'douyin') vod = await douyinDetail(ids);
    else if (ids[0] === 'douyu')  vod = await douyuDetail(ids);
    return { list: [vod] };
}

async function wyccDetail(ids) {
    try {
        const html = (await axios.get(`${HOSTS[ids[0]]}/${ids[1]}`, { headers: { 'User-Agent': UAS[0] } })).data;
        const $    = load(html);
        const text = $('script').last().html() || '';
        const data = JSON.parse(text).props.pageProps.roomInfoInitData;
        const name = data.live?.title || ids[0];

        const getQualityName = (vbr) => {
            if (vbr <= 600) return '标清';
            if (vbr <= 1000) return '高清';
            if (vbr <= 2000) return '超清';
            return '蓝光';
        };

        const resolution = data.live.quickplay.resolution;
        const allStreams  = {};
        const sorted      = Object.entries(resolution).sort((a, b) => b[1].vbr - a[1].vbr);

        for (const [, qData] of sorted) {
            const qName = getQualityName(qData.vbr);
            for (const [cdnName, url] of Object.entries(qData.cdn)) {
                if (typeof url !== 'string' || !url.startsWith('http')) continue;
                if (!allStreams[cdnName]) allStreams[cdnName] = [];
                allStreams[cdnName].push(qName, url);
            }
        }

        const names = [], plists = [];
        Object.entries(allStreams).forEach(([cdnName, streamList], i) => {
            names.push(`线路${i + 1}`);
            plists.push(`${name}$${ids[0]}@@${e64(JSON.stringify(streamList))}`);
        });

        return buildvod({
            vod_name:      data.keywords_suffix,
            vod_remarks:   data.live?.title,
            vod_content:   data.description_suffix,
            vod_play_from: names.join('$$$'),
            vod_play_url:  plists.join('$$$'),
        });
    } catch (e) { return handleException(e); }
}

async function biliDetail(ids) {
    try {
        const info = await fetchJson(
            `${HOSTS[ids[0]][0]}/xlive/web-room/v1/index/getInfoByRoom?room_id=${ids[1]}&wts=${Math.floor(Date.now() / 1000)}`,
            { headers: gethr(0, ids[0]) }
        );
        const v = info.data.room_info;

        const data = await fetchJson(
            `${HOSTS[ids[0]][0]}/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${ids[1]}&protocol=0%2C1&format=0%2C1%2C2&codec=0%2C1&platform=web`,
            { headers: gethr(0, ids[0]) }
        );
        const vdnams = data.data.playurl_info.playurl.g_qn_desc;
        const streams = data.data.playurl_info.playurl.stream;

        let maxAcceptQn = [];
        for (const stream of streams)
            for (const fmt of stream.format)
                for (const codec of fmt.codec)
                    if (codec.accept_qn?.length > maxAcceptQn.length)
                        maxAcceptQn = codec.accept_qn;

        const qualityMap = Object.fromEntries(vdnams.map(i => [i.qn, i.desc]));
        const playUrl    = maxAcceptQn.map(qn => `${qualityMap[qn]}$${ids[0]}@@${ids[1]}@@${qn}`).join('#');

        return buildvod({
            vod_name:      v.title,
            type_name:     `${v.parent_area_name}/${v.area_name}`,
            vod_remarks:   v.tags,
            vod_play_from: v.title,
            vod_play_url:  playUrl,
        });
    } catch (e) { return handleException(e); }
}

async function huyaDetail(ids) {
    try {
        const vdata = await fetchJson(
            `${HOSTS[ids[0]][1]}/cache.php?m=Live&do=profileRoom&roomid=${ids[1]}`,
            { headers: { 'User-Agent': UAS[0] } }
        );
        const v      = vdata.data.liveData;
        const data   = Object.fromEntries(Object.entries(vdata.data.stream).reverse());
        const names  = [], plist = [];

        for (const [, streamData] of Object.entries(data)) {
            if (!streamData?.multiLine || !streamData?.rateArray) continue;
            names.push(`线路${names.length + 1}`);
            const qualities  = [...streamData.rateArray].sort((a, b) =>
                b.iBitRate !== a.iBitRate ? b.iBitRate - a.iBitRate : b.sDisplayName.localeCompare(a.sDisplayName)
            );
            const cdnUrls = [];
            for (const cdn of streamData.multiLine) {
                const qualityUrls = [];
                for (const q of qualities) {
                    const bit     = q.iBitRate;
                    const baseUrl = cdn.url;
                    let newUrl    = baseUrl;
                    if (bit > 0) {
                        newUrl = baseUrl.includes('.m3u8')
                            ? baseUrl.replace('ratio=2000', `ratio=${bit}`)
                            : baseUrl.replace('imgplus.flv', `imgplus_${bit}.flv`);
                    }
                    qualityUrls.push(q.sDisplayName, newUrl);
                }
                cdnUrls.push(`${cdn.cdnType}$${ids[0]}@@${e64(JSON.stringify(qualityUrls))}`);
            }
            if (cdnUrls.length) plist.push(cdnUrls.join('#'));
        }

        return buildvod({
            vod_name:      v.introduction,
            type_name:     v.gameFullName,
            vod_director:  v.nick,
            vod_remarks:   v.contentIntro,
            vod_play_from: names.join('$$$'),
            vod_play_url:  plist.join('$$$'),
        });
    } catch (e) { return handleException(e); }
}

async function douyinDetail(ids) {
    try {
        const url  = `${HOSTS[ids[0]]}/webcast/room/web/enter/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&enter_from=web_live&web_rid=${ids[1]}&room_id_str=&enter_source=&Room-Enter-User-Login-Ab=0&is_need_double_stream=false&cookie_enabled=true&screen_width=1980&screen_height=1080&browser_language=zh-CN&browser_platform=Win32&browser_name=Edge&browser_version=125.0.0.0`;
        const data = await fetchJson(url, { headers: dyHeaders });
        const vdata = data.data.data[0];

        const resolutionData = vdata.stream_url.live_core_sdk_data.pull_data.options.qualities;
        const streamJson     = JSON.parse(vdata.stream_url.live_core_sdk_data.pull_data.stream_data);

        const availableTypes = [];
        if (Object.values(streamJson.data).some(v => v.main))   availableTypes.push('main');
        if (Object.values(streamJson.data).some(v => v.backup)) availableTypes.push('backup');

        const plist = [];
        for (const lineType of availableTypes) {
            const formatArrays = { flv: [], hls: [], lls: [] };
            const qualities    = [...resolutionData].sort((a, b) => b.level - a.level);
            for (const q of qualities) {
                const sdkKey = q.sdk_key;
                if (!streamJson.data[sdkKey]?.[lineType]) continue;
                const s = streamJson.data[sdkKey][lineType];
                if (s.flv) formatArrays.flv.push(q.name, s.flv);
                if (s.hls) formatArrays.hls.push(q.name, s.hls);
                if (s.lls) formatArrays.lls.push(q.name, s.lls);
            }
            const formatUrls = Object.entries(formatArrays)
                .filter(([, arr]) => arr.length)
                .map(([fmt, arr]) => `${fmt}$${ids[0]}@@${e64(JSON.stringify(arr))}`);
            if (formatUrls.length) plist.push(formatUrls.join('#'));
        }

        const names = ['线路1', '线路2'].slice(0, plist.length);
        return buildvod({
            vod_name:      vdata.title,
            vod_remarks:   vdata.user_count_str,
            vod_play_from: names.join('$$$'),
            vod_play_url:  plist.join('$$$'),
        });
    } catch (e) { return handleException(e); }
}

async function douyuDetail(ids) {
    try {
        const headers = gethr(0, '', `${HOSTS[ids[0]]}/${ids[1]}`);
        const data    = await fetchJson(`${HOSTS[ids[0]]}/betard/${ids[1]}`, { headers });
        const vname   = data.room.room_name;

        const vdata    = await fetchJson(`${HOSTS[ids[0]]}/swf_api/homeH5Enc?rids=${ids[1]}`, { headers });
        const jsonBody = {
            html: douyuText(vdata.data[`room${ids[1]}`]),
            rid:  ids[1],
        };
        const sign    = (await postJson('http://alive.nsapps.cn/api/AllLive/DouyuSign', jsonBody, { headers: { 'User-Agent': UAS[1] } })).data;
        const body    = paramsToJson(`${sign}&cdn=&rate=-1&ver=Douyu_223061205&iar=1&ive=1&hevc=0&fa=0`);
        const nubdata = await postJson(`${HOSTS[ids[0]]}/lapi/live/getH5Play/${ids[1]}`, body, { headers });

        const names = [], plist = [];
        nubdata.data.cdnsWithName.forEach((x, i) => {
            names.push(`线路${i + 1}`);
            const d = { sign, cdn: x.cdn, id: ids[1] };
            plist.push(`${vname}$${ids[0]}@@${e64(JSON.stringify(d))}@@${e64(JSON.stringify(nubdata.data.multirates))}`);
        });

        return buildvod({
            vod_name:      vname,
            vod_remarks:   data.room.second_lvl_name,
            vod_director:  data.room.nickname,
            vod_play_from: names.join('$$$'),
            vod_play_url:  plist.join('$$$'),
        });
    } catch (e) { return handleException(e); }
}

// ─── 播放 ──────────────────────────────────────────────────────────────────

async function play(inReq, _outResp) {
    try {
        const ids = inReq.body.id.split('@@');
        let   p   = 1, url;

        if (['wangyi', 'douyin', 'huya'].includes(ids[0])) {
            p   = 0;
            url = JSON.parse(d64(ids[1]));
        } else if (ids[0] === 'bili') {
            [p, url] = await biliPlay(ids);
        } else if (ids[0] === 'douyu') {
            [p, url] = await douyuPlay(ids);
        }

        return { parse: p, url, header: PLAY_HEADERS[ids[0]] };
    } catch {
        return { parse: 1, url: EXCEPT_URL, header: { 'User-Agent': UAS[0] } };
    }
}

async function biliPlay(ids) {
    try {
        const data = await fetchJson(
            `${HOSTS[ids[0]][0]}/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${ids[1]}&protocol=0,1&format=0,2&codec=0&platform=web&qn=${ids[2]}`,
            { headers: gethr(0, ids[0]) }
        );
        const urls = [];
        let lineIndex = 1;
        for (const stream of data.data.playurl_info.playurl.stream)
            for (const fmt of stream.format)
                for (const codec of fmt.codec)
                    for (const ui of codec.url_info) {
                        urls.push(`线路${lineIndex}`, `${ui.host}/${codec.base_url.replace(/^\//, '')}${ui.extra}`);
                        lineIndex++;
                    }
        return [0, urls];
    } catch { return [1, EXCEPT_URL]; }
}

async function douyuPlay(ids) {
    try {
        const sdata   = JSON.parse(d64(ids[1]));
        const headers = gethr(0, '', `${HOSTS[ids[0]]}/${sdata.id}`);
        const ldata   = JSON.parse(d64(ids[2]));
        const resultObj = {};

        await Promise.all(ldata.map(async quality => {
            try {
                const body = paramsToJson(`${sdata.sign}&cdn=${sdata.cdn}&rate=${quality.rate}`);
                const data = await postJson(`${HOSTS[ids[0]]}/lapi/live/getH5Play/${sdata.id}`, body, { headers });
                if (data?.data) {
                    const playUrl = `${data.data.rtmp_url}/${data.data.rtmp_live}`;
                    const bit     = quality.bit || 0;
                    if (!resultObj[bit]) resultObj[bit] = [];
                    resultObj[bit].push(quality.name, playUrl);
                }
            } catch {}
        }));

        const result = Object.keys(resultObj)
            .map(Number).sort((a, b) => b - a)
            .flatMap(bit => resultObj[bit]);

        return result.length ? [0, result] : [1, EXCEPT_URL];
    } catch { return [1, EXCEPT_URL]; }
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'multilive',
        name: '多平台直播',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};