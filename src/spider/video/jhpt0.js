import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// type: 1 = 标准 provide/vod JSON；type: 3 = 大地 feifei2
const SOURCES = {
    s1: { name: '🎬香蕉', api: 'https://www.xiangjiaozyw.com/api.php/provide/vod/' },
    s2: { name: '💧番茄', api: 'http://fhapi9.com/api.php/provide/vod/' },
    s3: { name: '🧸嘿嘿', api: 'https://api.heiapi.cc/api.php/provide/vod/' },
    s4: { name: '📺鲨鱼', api: 'https://shayuzy5.com/api.php/provide/vod/' },
    s5: { name: '🔥麻花', api: 'https://19q.cc/api.php/provide/vod/' },
    s6: { name: '📺搜AV', api: 'https://souavzy.net/api.php/provide/vod/' },
    s7: { name: '📺精品', api: 'https://www.jingpinx.com/api.php/provide/vod/' },
    s8: { name: '⚡极品', api: 'https://jipinvip1.com/api.php/provide/vod/' },
    s9: { name: '📺美少女', api: 'https://www.msnii.com/api/json.php' },
    s10: { name: '📺饮水机', api: 'https://www.xrbsp.com/api/json.php' },
    s11: { name: '📺香奶儿', api: 'https://www.gdlsp.com/api/json.php' },
    s12: { name: '🐯白嫖', api: 'https://www.kxgav.com/api/json.php' },
    s13: { name: '📺小师妹', api: 'https://www.afasu.com/api/json.php' },
    s14: { name: '📺潢AV', api: 'https://www.pgxdy.com/api/json.php' },
    s15: { name: '📺杏吧', api: 'https://api.xgbbk8.com/api.php/provide/vod/' },
    s16: { name: '📺CK资源', api: 'https://ckzy.me/api.php/provide/vod' },
    s17: { name: '📺越南', api: 'https://vnzyz.com/api.php/provide/vod' },
    s18: { name: '📺15', api: 'https://155api.com/api.php/provide/vod/' },
    s19: { name: '📺91AV', api: 'https://91av.cyou/api.php/provide/vod/' },
    s20: { name: '🌕红楼', api: 'https://www.hlzyapi.vip/api.php/provide/vod/' },
    s21: { name: '📺小鸡', api: 'https://api.xiaojizy.live/provide/vod/' },
    s22: { name: '📺大奶', api: 'https://apidanaizi.com/api.php/provide/vod/' },
    s23: { name: '📺豆豆', api: 'https://api.douapi.cc/api.php/provide/vod/' },
    s24: { name: '📺黑料', api: 'https://heiliaozyapi.com/api.php/provide/vod/' },
    s25: { name: '🌸仓库', api: 'https://hsckzy888.com/api.php/provide/vod/' },
    s26: { name: '🐮玉兔', api: 'https://apiyutu.com/api.php/provide/vod' },
    s27: { name: '☁️精东', api: 'http://chujia.cc/api.php/provide/vod/' },
    s28: { name: '🏎奶香', api: 'https://naixxzy.com/api.php/provide/vod' },
    s29: { name: '🦅乐播', api: 'https://lbapi9.com/api.php/provide/vod' },
    s30: { name: '⚡JKUN', api: 'https://jkunzyapi.com/api.php/provide/vod' },
    s31: { name: '👑桃花', api: 'https://thzy1.me/api.php/provide/vod/' },
    s32: { name: '🍃百花', api: 'https://bhziyuan.com/api.php/provide/vod/' },
    s33: { name: '🐾老色', api: 'https://apilsbzy1.com/api.php/provide/vod/' },
    s34: { name: '🐾辣椒', api: 'https://apilj.com/api.php/provide/vod' },
    s35: { name: '🐾javbus', api: 'https://javbus.sbs/api.php/provide/vod/' },
    s36: { name: '🐾奥斯卡', api: 'https://aosikazy8.com/api.php/provide/vod' },
    s37: { name: '🐾火速', api: 'https://api.huosuapi.cc/api.php/provide/vod/' },
    s38: { name: '🐾聚合2', api: 'http://150.109.94.44:1112/api.php/provide/vod/' },
    s39: { name: '🐾CK百货', api: 'https://ckbh1.xyz/api.php/provide/vod/' },
    s40: { name: '🐾番茄', api: 'https://fqzy.me/api.php/provide/vod/' },
    s41: { name: '🐾98', api: 'https://jp98.vip/api.php/provide/vod/' },
    s42: { name: '🐾森林', api: 'https://slapibf.com/api.php/provide/vod/' },
    s43: { name: '🐾大地', api: 'https://dadiapi.com/feifei2/', type: 3 },
    s44: { name: '🐾色猫', api: 'https://caiji.semaozy.net/inc/apijson_vod.php' },
    s45: { name: '🐾滴滴', api: 'https://api.ddapi.cc/api.php/provide/vod/' },
    s46: { name: '🐾91', api: 'https://91md.me/api.php/provide/vod/' },
    s47: { name: '🐾免费', api: 'https://yuanlib.com/api.php/provide/vod/' },
    s48: { name: '🐾细胞', api: 'https://www.xxibaozyw.com/api.php/provide/vod/' },
    s49: { name: '📺湿园', api: 'https://xxavs.com/api.php/provide/vod' },
};

function text(v) {
    return String(v ?? '').trim();
}

function buildUrl(base, params = {}) {
    let url = text(base).replace(/^["'\s]+|["'\s]+$/g, '');
    const keys = Object.keys(params).filter((k) => params[k] != null && String(params[k]) !== '');
    if (!keys.length) return url;
    const qs = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
    return url + (url.includes('?') ? '&' : '?') + qs;
}

async function request(url) {
    try {
        const resp = await req.get(url, {
            timeout: 6000,
            headers: { 'User-Agent': UA },
            responseType: 'text',
            transformResponse: [(d) => d],
            validateStatus: (s) => s === 200,
        });
        return resp.data || '';
    } catch (e) {
        console.error('request error', url, e.message);
        return '';
    }
}

function safeJson(s) {
    try {
        if (!s) return null;
        if (typeof s === 'object') return s;
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function fixPic(url) {
    url = text(url);
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return '';
}

function normalizeVod(item) {
    if (!item || typeof item !== 'object') return item;
    const o = { ...item };
    if (!o.vod_play_from && o.vod_play) o.vod_play_from = o.vod_play;
    if (!o.vod_play_url && o.vod_url) o.vod_play_url = o.vod_url;
    if (!o.vod_id && o.id) o.vod_id = o.id;
    if (!o.vod_name && o.name) o.vod_name = o.name;
    if (!o.vod_name && o.title) o.vod_name = o.title;
    if (!o.vod_pic && o.pic) o.vod_pic = o.pic;
    if (!o.vod_remarks && o.remarks) o.vod_remarks = o.remarks;
    if (!o.vod_remarks && o.note) o.vod_remarks = o.note;
    if (!o.vod_remarks && o.vod_continu) o.vod_remarks = o.vod_continu;
    if (!o.vod_content && o.content) o.vod_content = o.content;
    if (!o.vod_year && o.d_year) o.vod_year = o.d_year;
    if (!o.type_name && o.list_name) o.type_name = o.list_name;
    o.vod_pic = fixPic(o.vod_pic);
    return o;
}

function parseResponse(html) {
    const empty = { list: [], page: 1, pagecount: 1, pagesize: 20, total: 0, class: [] };
    const j = safeJson(html);
    if (!j) return empty;

    // 大地 feifei2
    if (j.status != null && (Array.isArray(j.data) || j.page)) {
        const pageObj = j.page || {};
        let classes = [];
        if (Array.isArray(j.list) && j.list.length) {
            const first = j.list[0];
            if (first && (first.list_id != null || first.list_name)) {
                classes = j.list.map((c) => ({
                    type_id: text(c.list_id ?? c.type_id ?? c.id),
                    type_name: text(c.list_name ?? c.type_name ?? c.name),
                }));
            }
        }
        const raw = Array.isArray(j.data) ? j.data : [];
        return {
            list: raw.map(normalizeVod),
            page: parseInt(pageObj.pageindex ?? pageObj.page ?? 1, 10),
            pagecount: parseInt(pageObj.pagecount ?? 1, 10),
            pagesize: parseInt(pageObj.pagesize ?? 20, 10),
            total: parseInt(pageObj.recordcount ?? pageObj.total ?? raw.length, 10),
            class: classes,
        };
    }

    // 标准 provide
    let classes = Array.isArray(j.class) ? j.class : [];
    classes = classes.map((c) => ({
        type_id: text(c.type_id ?? c.list_id ?? c.id),
        type_name: text(c.type_name ?? c.list_name ?? c.name),
    }));
    let raw = Array.isArray(j.list) ? j.list : [];
    if (raw.length && raw[0]?.list_id != null && !raw[0]?.vod_id && !raw[0]?.vod_name) {
        classes = raw.map((c) => ({
            type_id: text(c.list_id ?? c.type_id),
            type_name: text(c.list_name ?? c.type_name),
        }));
        raw = [];
    }
    return {
        list: raw.map(normalizeVod),
        page: parseInt(j.page ?? 1, 10),
        pagecount: parseInt(j.pagecount ?? 1, 10),
        pagesize: parseInt(j.limit ?? j.pagesize ?? 20, 10),
        total: parseInt(j.total ?? 0, 10),
        class: classes,
    };
}

function cleanItem(item, sourceKey, sourceName, isDetail = false) {
    const o = normalizeVod({ ...item });
    if (!isDetail) o.vod_id = `${sourceKey}@@${text(o.vod_id)}`;
    const rem = text(o.vod_remarks);
    o.vod_remarks = rem ? `${sourceName} | ${rem}` : sourceName;

    let fromArr = text(o.vod_play_from).split('$$$').map((s) => s.trim()).filter(Boolean);
    let urlArr = text(o.vod_play_url).split('$$$').map((s) => s.trim());

    if (fromArr.length) {
        fromArr = fromArr.map((x) => (x.startsWith(sourceName) ? x : `${sourceName}-${x}`));
    }
    if (!fromArr.length && urlArr.some(Boolean)) {
        fromArr = urlArr.map((_, i) => `${sourceName}-线路${i + 1}`);
    }
    if (fromArr.length && urlArr.length) {
        while (urlArr.length < fromArr.length) urlArr.push('');
        while (fromArr.length < urlArr.length) fromArr.push(`${sourceName}-线路${fromArr.length + 1}`);
    }
    o.vod_play_from = fromArr.join('$$$');
    o.vod_play_url = urlArr.join('$$$');
    delete o.vod_down_from;
    delete o.vod_down_url;
    return o;
}

function isVideoFormat(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    return ['.mp4', '.m3u8', '.flv', '.mkv'].some((x) => u.includes(x));
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [];
    const filters = {};
    const defaultVals = [{ n: '全部(最新)', v: '' }];
    for (const [sk, so] of Object.entries(SOURCES)) {
        classes.push({ type_id: sk, type_name: so.name });
        filters[sk] = [{ key: 'cateId', name: '分类', value: [...defaultVals] }];
    }
    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const tid = text(inReq.body.id);
    const pg = parseInt(inReq.body.page || 1, 10);
    const source = SOURCES[tid];
    if (!source) return { list: [], page: pg, pagecount: 0 };

    const cateId = text(inReq.body.filters?.cateId);
    const stype = source.type || 1;
    let params;
    if (stype === 3) {
        params = { ac: 'videolist', pg };
        if (cateId) params.t = cateId;
    } else {
        params = { ac: 'detail', pg };
        if (cateId) params.t = cateId;
    }

    let data = parseResponse(await request(buildUrl(source.api, params)));
    if (stype !== 3 && !data.list?.length) {
        const params2 = { ac: 'videolist', pg };
        if (cateId) params2.t = cateId;
        const data2 = parseResponse(await request(buildUrl(source.api, params2)));
        if (data2.list?.length) data = data2;
    }

    const out = (data.list || []).map((it) => {
        const cleaned = cleanItem(it, tid, source.name, false);
        cleaned.vod_pic = fixPic(cleaned.vod_pic);
        return cleaned;
    });

    return {
        list: out,
        page: parseInt(data.page || pg, 10),
        pagecount: parseInt(data.pagecount || 1, 10),
        limit: parseInt(data.pagesize || 20, 10),
        total: parseInt(data.total || out.length, 10),
    };
}

async function detail(inReq, _outResp) {
    const raw = text(inReq.body.id);
    if (!raw.includes('@@')) return { list: [] };

    const [sourceKey, realId] = raw.split('@@', 2);
    const source = SOURCES[sourceKey];
    if (!source) return { list: [] };

    const stype = source.type || 1;
    let html;

    if (stype === 3) {
        html = await request(buildUrl(source.api, { ac: 'videolist', ids: realId }));
        let tmp = parseResponse(html);
        let first = tmp.list?.[0];
        if (!first || !text(first.vod_play_url || first.vod_url)) {
            const html2 = await request(buildUrl(source.api, { ac: 'detail', ids: realId }));
            if (html2) html = html2;
        }
    } else {
        html = await request(buildUrl(source.api, { ac: 'detail', ids: realId }));
        const tmp = parseResponse(html);
        const first = tmp.list?.[0];
        if (!first || !text(first.vod_play_url)) {
            const html2 = await request(buildUrl(source.api, { ac: 'videolist', ids: realId }));
            const d2 = parseResponse(html2);
            if (d2.list?.[0] && text(d2.list[0].vod_play_url || '')) html = html2;
        }
    }

    const data = parseResponse(html);
    const out = (data.list || []).map((it) => {
        const cleaned = cleanItem(it, sourceKey, source.name, true);
        cleaned.vod_id = raw;
        cleaned.vod_pic = fixPic(cleaned.vod_pic);
        if (!text(cleaned.vod_play_from) && text(cleaned.vod_play_url)) {
            const segs = text(cleaned.vod_play_url).split('$$$');
            cleaned.vod_play_from = segs.map((_, i) => `${source.name}-线路${i + 1}`).join('$$$');
        }
        return cleaned;
    });
    return { list: out };
}

async function play(inReq, _outResp) {
    const playUrl = text(inReq.body.id);
    return {
        parse: isVideoFormat(playUrl) ? 0 : 1,
        url: playUrl,
        header: { 'User-Agent': UA },
    };
}

async function searchOne([sk, so], key, pg) {
    const stype = so.type || 1;
    let url;
    if (stype === 0 || stype === 3) {
        url = buildUrl(so.api, { ac: 'videolist', wd: key, pg });
    } else if (stype === 2) {
        url = buildUrl(so.api, { wd: key, pg });
    } else {
        url = buildUrl(so.api, { ac: 'detail', wd: key, pg });
    }
    let data = parseResponse(await request(url));
    if (stype !== 0 && stype !== 2 && stype !== 3 && !data.list?.length) {
        const data2 = parseResponse(await request(buildUrl(so.api, { ac: 'videolist', wd: key, pg })));
        if (data2.list?.length) data = data2;
    }
    const lst = (data.list || []).map((it) => {
        const cleaned = cleanItem(it, sk, so.name, false);
        cleaned.vod_pic = fixPic(cleaned.vod_pic);
        return cleaned;
    });
    return { lst, pc: parseInt(data.pagecount || 1, 10) };
}

async function searchPool(items, key, pg, concurrency = 8, timeoutMs = 25000) {
    const result = [];
    let maxPage = 1;
    let idx = 0;

    const run = async () => {
        while (idx < items.length) {
            const cur = items[idx++];
            try {
                const { lst, pc } = await searchOne(cur, key, pg);
                result.push(...lst);
                if (pc > maxPage) maxPage = pc;
            } catch (e) {
                console.error('search skip', cur[0], e.message);
            }
        }
    };

    await Promise.race([
        Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run)),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    return { result, maxPage };
}

async function search(inReq, _outResp) {
    const key = text(inReq.body.wd);
    const pg = parseInt(inReq.body.page || 1, 10);
    if (!key) return { list: [], page: pg, pagecount: 1, limit: 40, total: 0 };

    const items = Object.entries(SOURCES);
    let result = [];
    let maxPage = 1;

    try {
        ({ result, maxPage } = await searchPool(items, key, pg));
    } catch {
        for (const item of items.slice(0, 15)) {
            try {
                const { lst, pc } = await searchOne(item, key, pg);
                result.push(...lst);
                if (pc > maxPage) maxPage = pc;
            } catch (e) {
                console.error('search skip', item[0], e.message);
            }
        }
    }

    return {
        list: result,
        page: pg,
        pagecount: maxPage,
        limit: 40,
        total: 9999,
    };
}

export default {
    meta: {
        key: 'jhpt0',
        name: '💋聚合平台0',
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
