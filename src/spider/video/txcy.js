import axios from 'axios';
import https from 'https';
import { load } from 'cheerio';

/**
 * 溏心次元 - https://lhej.txcy-emo.buzz
 */

const DEFAULT_HOST = 'https://lhej.txcy-emo.buzz';

const CLASSES = [
    { type_id: '1', type_name: '麻豆原创' },
    { type_id: '2', type_name: '代理节目' },
    { type_id: '3', type_name: '节目企划' },
    { type_id: '32', type_name: '国产片商' },
    { type_id: '39', type_name: '国产精品' },
    { type_id: '4', type_name: 'MD系列' },
    { type_id: '5', type_name: '导演系列' },
    { type_id: '6', type_name: 'MDS系列' },
    { type_id: '7', type_name: 'MDX系列' },
    { type_id: '8', type_name: 'MDXS系列' },
    { type_id: '46', type_name: 'MDL系列' },
    { type_id: '50', type_name: 'MMZ系列' },
    { type_id: '53', type_name: 'MAD系列' },
    { type_id: '58', type_name: 'MDWP系列' },
    { type_id: '64', type_name: 'MSD系列' },
    { type_id: '74', type_name: 'MDM恋爱咖啡' },
    { type_id: '78', type_name: 'MDUS系列' },
    { type_id: '79', type_name: 'MXJ系列' },
    { type_id: '87', type_name: 'MKY系列' },
    { type_id: '89', type_name: 'MAN系列' },
    { type_id: '96', type_name: 'MCY系列' },
    { type_id: '100', type_name: 'MDAG系列' },
    { type_id: '101', type_name: 'MDHT系列' },
    { type_id: '115', type_name: 'BLX系列' },
    { type_id: '116', type_name: 'MPG系列' },
    { type_id: '10', type_name: '兔子先生' },
    { type_id: '11', type_name: '果冻传媒' },
    { type_id: '12', type_name: '皇家华人' },
    { type_id: '13', type_name: '吴梦梦无套系列' },
    { type_id: '14', type_name: 'PsychoPorn色控' },
    { type_id: '15', type_name: '蜜桃影像传媒' },
    { type_id: '45', type_name: '天美传媒' },
    { type_id: '52', type_name: '91制片厂' },
    { type_id: '65', type_name: 'MSM性梦者' },
    { type_id: '71', type_name: '叮叮映画' },
    { type_id: '72', type_name: '涩会' },
    { type_id: '75', type_name: '豚豚创媒' },
    { type_id: '76', type_name: '爱妃传媒' },
    { type_id: '80', type_name: '辣椒原创' },
    { type_id: '81', type_name: 'O-STAR' },
    { type_id: '91', type_name: '肉肉传媒' },
    { type_id: '95', type_name: '渡边传媒' },
    { type_id: '97', type_name: '葵心娱乐' },
    { type_id: '103', type_name: '红斯灯影像' },
    { type_id: '105', type_name: '蝌蚪传媒' },
    { type_id: '106', type_name: 'Pussy Hunter' },
    { type_id: '108', type_name: '桃花源' },
    { type_id: '17', type_name: '大鸟十八' },
    { type_id: '18', type_name: '疯拍系列' },
    { type_id: '19', type_name: 'KISS糖果屋' },
    { type_id: '20', type_name: '小鹏奇啪行' },
    { type_id: '22', type_name: '30天解密麻豆' },
    { type_id: '23', type_name: '突袭女优计划' },
    { type_id: '24', type_name: '女神羞羞研究所' },
    { type_id: '27', type_name: '小哥哥艾理' },
    { type_id: '31', type_name: '情趣K歌房' },
    { type_id: '40', type_name: '淫欲游戏王' },
    { type_id: '41', type_name: '麻豆不回家' },
    { type_id: '42', type_name: '女优淫娃培训营' },
    { type_id: '54', type_name: '狼人插' },
    { type_id: '55', type_name: '女优擂台摔角狂热' },
    { type_id: '61', type_name: '恋爱巴士' },
    { type_id: '66', type_name: '男女优生死斗' },
    { type_id: '67', type_name: '情人劫密室逃脱' },
    { type_id: '68', type_name: '换妻' },
    { type_id: '69', type_name: '你好同学' },
    { type_id: '77', type_name: '禁欲小屋' },
    { type_id: '84', type_name: '鲍鱼的胜利' },
    { type_id: '88', type_name: '性爱自修室' },
    { type_id: '92', type_name: '春游记' },
    { type_id: '93', type_name: '心动的性号' },
    { type_id: '94', type_name: '情趣大富翁' },
    { type_id: '99', type_name: '寻宝吧女神' },
    { type_id: '102', type_name: '男优练习生' },
    { type_id: '110', type_name: '女神体育祭' },
    { type_id: '111', type_name: '麻豆高校' },
    { type_id: '112', type_name: '野外露初' },
    { type_id: '33', type_name: '乌鸦传媒' },
    { type_id: '34', type_name: '精东影业' },
    { type_id: '36', type_name: 'SWAG' },
    { type_id: '47', type_name: '星空无限传媒' },
    { type_id: '48', type_name: '大象传媒' },
    { type_id: '59', type_name: '大象传媒' },
    { type_id: '62', type_name: 'MINI传媒' },
    { type_id: '73', type_name: '糖心vlog' },
    { type_id: '82', type_name: '葫芦影业' },
    { type_id: '83', type_name: '天马传媒' },
    { type_id: '90', type_name: 'CCAV成人头条' },
    { type_id: '109', type_name: '性视界传媒' },
    { type_id: '113', type_name: 'SA国际传媒' },
    { type_id: '114', type_name: '香蕉传媒' },
    { type_id: '117', type_name: '91茄子' },
    { type_id: '118', type_name: 'EDmosaic' },
];

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
});

function getHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${host}/banshu/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
}

function fixUrl(u) {
    const v = String(u || '').trim();
    if (!v) return '';
    if (v.startsWith('//')) return `https:${v}`;
    if (v.startsWith('/')) return `${host.replace(/\/$/, '')}${v}`;
    if (v.startsWith('http')) return v;
    return `${host.replace(/\/$/, '')}/${v}`;
}

async function fetchHtml(url, method = 'GET', data = null) {
    const full = fixUrl(url);
    try {
        const config = { headers: getHeaders(), responseType: 'text' };
        const resp =
            method === 'POST' ? await http.post(full, data, config) : await http.get(full, config);
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseList(html) {
    if (!html) return [];

    const res = [];
    const seen = new Set();

    const blocks =
        html.match(/<section[^>]+class=["'][^"']*item-box[^"']*["'][\s\S]*?<\/section>/gi) ||
        html.match(/<li[^>]+class=["'][^"']*col-25[^"']*["'][\s\S]*?<\/li>/gi) ||
        [];

    for (const b of blocks) {
        const m = b.match(/href=["']([^"']*\/vod(?:detail|play)\/(\d+)[^"']*)["']/i);
        if (!m || seen.has(m[2])) continue;
        seen.add(m[2]);

        let name = '';
        let pic = '';
        const n = b.match(/title=["']([^"']+)["']/i) || b.match(/alt=["']([^"']+)["']/i);
        const im = b.match(/<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/i);
        if (n) name = n[1].replace(/\s+/g, ' ').trim();
        if (im) pic = im[1];
        if (name) {
            res.push({
                vod_id: m[2],
                vod_name: name,
                vod_pic: fixUrl(pic),
                vod_remarks: '',
            });
        }
    }

    if (res.length) return res;

    const $ = load(html);
    $('a').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        if (!/\/vod(?:detail|play)\/\d+/i.test(href)) return;
        if (!a.find('img').length) return;

        const mm = href.match(/\/vod(?:detail|play)\/(\d+)/i);
        if (!mm || seen.has(mm[1])) return;
        seen.add(mm[1]);

        const img = a.find('img').first();
        const name =
            (a.attr('title') || '').trim() ||
            (img.attr('alt') || '').trim() ||
            a.text().replace(/\s+/g, ' ').trim();
        const pic = img.attr('data-original') || img.attr('data-src') || img.attr('src') || '';

        if (name) {
            res.push({
                vod_id: mm[1],
                vod_name: name,
                vod_pic: fixUrl(pic),
                vod_remarks: '',
            });
        }
    });

    return res;
}

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend ?? '';
    if (extend && String(extend).startsWith('http')) {
        host = String(extend).replace(/\/$/, '');
    } else if (typeof extend === 'object' && extend?.host) {
        host = String(extend.host).replace(/\/$/, '');
    } else {
        host = DEFAULT_HOST;
    }
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(`${host}/banshu/`);
    return { class: CLASSES, list: parseList(html), filters: {} };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '1');
    const pg = String(inReq.body.page || inReq.body.pg || '1');

    const url =
        pg === '1' ? `${host}/vodtype/${tid}.html` : `${host}/vodtype/${tid}-${pg}/`;

    const list = parseList(await fetchHtml(url));

    return {
        page: parseInt(pg, 10) || 1,
        pagecount: list.length ? 999 : parseInt(pg, 10) || 1,
        limit: list.length || 30,
        total: list.length ? 999999 : 0,
        list,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(
        Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '',
    );

    const vod = {
        vod_id: vid,
        vod_name: '',
        vod_pic: '',
        type_name: '',
        vod_year: '',
        vod_area: '',
        vod_actor: '',
        vod_director: '',
        vod_content: '',
        vod_play_from: 'ckplayer',
        vod_play_url: `播放$${host}/vodplay/${vid}-1-1/`,
    };

    const html = await fetchHtml(`${host}/voddetail/${vid}/`);
    if (!html) return { list: [vod] };

    const $ = load(html);

    const name =
        $('h1.f-bold').first().text().trim() ||
        $('h1').first().text().trim() ||
        '';
    const pic =
        $('.detail-image-wrapper img').first().attr('src') ||
        $('meta[property="og:image"]').attr('content') ||
        '';
    const typ = $('span.place a[href*="/vodtype/"]').last().text().trim();
    const desc = $('meta[name="description"]').attr('content') || '';

    const eps = [];
    const seen = new Set();

    $('a[href*="/vodplay/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const mm = href.match(/\/vodplay\/(\d+-\d+-\d+)\//);
        if (!mm || !mm[1].startsWith(`${vid}-`)) return;

        const title = ($(el).attr('title') || $(el).text() || '播放').trim();
        const ep = `${title}$${host}/vodplay/${mm[1]}/`;
        if (!seen.has(ep)) {
            seen.add(ep);
            eps.push(ep);
        }
    });

    vod.vod_name = name || vod.vod_name;
    vod.vod_pic = fixUrl(pic);
    vod.type_name = typ;
    vod.vod_content = desc;
    if (eps.length) vod.vod_play_url = eps.join('#');

    return { list: [vod] };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;

    if (!key) return { list: [], page: pg };

    let html = await fetchHtml(`${host}/vodsearch/-------------/`, 'POST', { wd: key });
    if (!html) {
        html = await fetchHtml(`${host}/index.php/vodsearch/${encodeURIComponent(key)}-------------.html`);
    }

    return { list: parseList(html), page: pg };
}

async function play(inReq, _outResp) {
    let url = fixUrl(String(inReq.body.id || ''));

    if (!/\.m3u8|\.mp4/i.test(url)) {
        const html = await fetchHtml(url);
        if (html) {
            const m =
                html.match(/player_data\s*=\s*(\{[\s\S]*?\})\s*<\/script>/) ||
                html.match(/player_data\s*=\s*(\{[\s\S]*?\})/);
            if (m) {
                try {
                    const data = JSON.parse(m[1].replace(/\\\//g, '/'));
                    if (data.url) url = fixUrl(data.url);
                } catch {
                    /* keep */
                }
            }
            if (!/\.m3u8|\.mp4/i.test(url)) {
                const dm = html.match(/(https?:\/\/[^\s"']+\.(?:m3u8|mp4)[^\s"']*)/);
                if (dm) url = fixUrl(dm[1]);
            }
        }
    }

    return { parse: 0, url, header: getHeaders() };
}

export default {
    meta: {
        key: 'txcy',
        name: '🔥溏心次元',
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
