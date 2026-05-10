import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const site = 'https://xl01.com.de';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const headers = {
    Referer:      site + '/',
    Origin:       site,
    'User-Agent': UA,
};

let cachedFilter = [];

async function ensureCookie() {
    if (headers['Cookie']) return;
    try {
        const resp = await axios.get(site + '/zzzzz', { headers, maxRedirects: 5 });
        const setCookie = resp.headers['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    } catch (e) {
        const setCookie = e.response?.headers?.['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    }
}

async function request(url, method = 'get', body = null, extraHeaders = {}) {
    await ensureCookie();
    const config = { headers: { ...headers, ...extraHeaders } };
    if (method === 'post') {
        const resp = await axios.post(url, new URLSearchParams(body).toString(), config);
        return resp.data;
    }
    const resp = await axios.get(url, config);
    return resp.data;
}

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function aesEcbEncrypt(text, keyStr) {
    const key    = Buffer.from(keyStr, 'utf-8');
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(true);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(text, 'utf-8')), cipher.final()]);
    return encrypted.toString('hex').toUpperCase();
}

async function extractCards(url) {
    const html = await request(url);
    const $    = load(html);
    const cards = [];
    $('.card-link').each((_, e) => {
        const path = $(e).find('a').attr('href') || '';
        cards.push({
            vod_id:      path,
            vod_name:    $(e).find('.card-title').text(),
            vod_pic:     $(e).find('img').attr('src') || '',
            vod_remarks: $(e).find('span.badge').text(),
        });
    });
    return cards;
}

async function init(_inReq, _outResp) {
    await ensureCookie();
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: JSON.stringify({ type: 'filter', url: '/s/all' }), type_name: '分类'     },
        { type_id: JSON.stringify({ url: '/s/all/1?type=0'         }), type_name: '最新电影' },
        { type_id: JSON.stringify({ url: '/s/all/1?type=1'         }), type_name: '最新剧集' },
        { type_id: JSON.stringify({ url: '/s/meiju/1'              }), type_name: '欧美剧集' },
        { type_id: JSON.stringify({ url: '/s/hanju/1'              }), type_name: '日韩剧集' },
        { type_id: JSON.stringify({ url: '/s/gangtaiju/1'          }), type_name: '港台剧集' },
        { type_id: JSON.stringify({ url: '/s/donghua/1?type=1'     }), type_name: '动漫'     },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const ext     = JSON.parse(inReq.body.id);
    const page    = Math.max(parseInt(inReq.body.page) || 1, 1);
    const filters = inReq.body.filters || {};
    let   url;
    let   list;

    if (ext.type === 'filter' && Object.keys(filters).length === 0) {
        // 首次进入分类页，拉取 filter 列表
        url  = `${site}/s/all/${page}`;
        const html = await request(url);
        const $    = load(html);

        list = await extractCards(url);

        if (cachedFilter.length === 0) {
            $('.all-filter-wrapper > dl').each((_, e) => {
                const name = $(e).find('dt').text().replace(/：/g, '').trim();
                if (cachedFilter.some(f => f.name === name)) return;
                const isCategory = name === '影视类型';
                const values = [];
                let key = '';

                $(e).find('dd > a').each((_, a) => {
                    const subname = $(a).text().trim();
                    const path    = $(a).attr('href') || '';
                    let value = '', currentKey = '';

                    if (isCategory) {
                        value      = path.replace('/s/', '');
                        currentKey = 'cat';
                    } else {
                        const query    = path.replace(/\/s\/all\??/, '');
                        const [k, v]   = query.split('=');
                        currentKey     = k;
                        value          = v || '';
                    }
                    if (!key) key = currentKey;
                    values.push({ n: subname, v: subname === '不限' ? '' : value });
                });

                cachedFilter.push({ name, key, init: values[0]?.v || '', value: values });
            });
        }

        return { page, pagecount: list.length > 0 ? page + 1 : page, list, filter: cachedFilter };

    } else if (ext.type === 'filter' && Object.keys(filters).length > 0) {
        url  = `${site}/s/${filters.cat || 'all'}/${page}?type=${filters.type || ''}&year=${filters.year || ''}&order=${filters.order || ''}`;
        if (filters.area) url += `&area=${filters.area}`;
        list = await extractCards(url);
        return { page, pagecount: list.length > 0 ? page + 1 : page, list, filter: cachedFilter };

    } else {
        // 普通 tab
        url  = `${site}${ext.url}`.replace(/\/1(?=\?|$)/, `/${page}`);
        list = await extractCards(url);
        return { page, pagecount: list.length > 0 ? page + 1 : page, list };
    }
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const url  = id.startsWith('http') ? id : `${site}${id}`;
    const html = await request(url);
    const $    = load(html);

    const tracks = [];
    $('a.btn').each((_, e) => {
        const path = $(e).attr('href') || '';
        if (path.startsWith('/play/') || path.startsWith('/guoju/play/')) {
            tracks.push(`${$(e).text()}$${site}${path}`);
        }
    });

    const name = $('h1').first().text().trim();
    const pic  = $('img.object-cover').first().attr('src') || '';

    return {
        list: [{
            vod_id:        id,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: '在线',
            vod_play_url:  tracks.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const url  = inReq.body.id;
    const html = await request(url);

    const pid              = html.match(/var pid = (\d+);/)[1];
    const currentTimeMillis = Date.now();
    const str4             = `${pid}-${currentTimeMillis}`;

    let md5Hash = md5(str4).toLowerCase();
    while (md5Hash.length < 32) md5Hash = '0' + md5Hash;

    const keyStr          = md5Hash.substring(0, 16);
    const encryptedString = aesEcbEncrypt(str4, keyStr);

    const linesUrl  = `${site}/lines?t=${currentTimeMillis}&sg=${encryptedString}&pid=${pid}`;
    const linesData = await request(linesUrl);
    const linesJson = JSON.parse(linesData);

    if (linesJson.data?.url3) {
        const url3    = linesJson.data.url3;
        const playUrl = url3.includes(',') ? url3.split(',')[1].trim() : url3.trim();
        return { parse: 0, url: playUrl, header: headers };
    }

    const isToS    = !!linesJson.data?.tos;
    const godUrl   = `${site}/god/${pid}${isToS ? '?type=1' : ''}`;
    const godBody  = { t: currentTimeMillis, sg: encryptedString, verifyCode: isToS ? 888 : 666 };
    const godExtra = {
        'Content-Type':    'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
    };

    const godData = await request(godUrl, 'post', godBody, godExtra);
    const playUrl = JSON.parse(typeof godData === 'string' ? godData : JSON.stringify(godData)).url;

    return {
        parse:  0,
        url:    playUrl,
        header: isToS ? { 'User-Agent': UA } : headers,
    };
}

async function search(inReq, _outResp) {
    const page = parseInt(inReq.body.page) || 1;
    if (page > 1) return { list: [] };

    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/search/${text}?code=112`);
    const $    = load(html);
    const list = [];

    $('div.row').each((_, e) => {
        const a = $(e).find('a.search-movie-title');
        list.push({
            vod_id:      a.attr('href') || '',
            vod_name:    a.attr('title') || '',
            vod_pic:     $(e).find('img.object-cover').attr('src') || '',
            vod_remarks: '',
        });
    });

    return { list };
}

export default {
    meta: { key: 'bdys', name: '🔥哔滴影视', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};