import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://123av.com/zh';

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers },
        httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.box-item').each((_, element) => {
        const href     = $(element).find('.thumb a').attr('href') || '';
        const subTitle = $(element).find('.detail').text().trim();
        const duration = $(element).find('.duration').text().trim();
        const style    = $(element).find('img').attr('data-src') || '';

        list.push({
            vod_id:      href,
            vod_name:    subTitle,
            vod_pic:     style,
            vod_remarks: duration,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = []
    const html = await request(site);
    const $    = load(html);
    $('.has-child ul li a').each((_, element) => {
         const typeId = $(element).attr('href') || '';
         const typeName = $(element).text() || '';
         classes.push({
            type_id: typeId,
            type_name: typeName
         })
    });
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/${tid}?page=${page}`
    console.log(url)
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function getJumpConfig() {
    const url  = 'https://fs-im-kefu.7moor-fs1.com/ly/4d2c3f00-7d4c-11e5-af15-41bf63ae4ea0/1732707176882/jiduo.txt';
    const text = await request(url);
    const name  = (text.match(/s1='(.*?)'/) || [])[1] || '';
    const jumps = (text.match(/s2='(.*?)'/) || [])[1] || '';
    return { name, jumps };
}

async function detail(inReq, _outResp) {
    const did    = inReq.body.id;
    const [path, pic] = did.split('@');

    const html = await request(`${site}/${path}`);
    const $    = load(html);

    // 基本信息
    const dianzan = ' ' + (html.match(/<span ref="counter">(.*?)</) || [])[1] + '人点赞❤';
    const fbrqArr = [...html.matchAll(/<span>(.*?)<\/span>/g)].map(m => m[1]);

    const durMatch = html.match(/时长:([\s\S]*?)<\/div>/);
    const durSpans = durMatch ? [...durMatch[0].matchAll(/<span>(.*?)<\/span>/g)].map(m => m[1]).join(' ') : '';

    const genre     = $('span.genre').text().trim();
    const content   = `集多为您介绍剧情📢 ${genre} 时长:${durSpans}${dianzan}`
                        .replace(/,/g, ' ').replace(/\n/g, ' ').replace(/\//g, ' ');

    const dirMatch  = html.match(/制作人:([\s\S]*?)<\/div>/);
    const director  = dirMatch ? [...dirMatch[0].matchAll(/href=".*?">(.*?)<\/a>/g)].map(m => m[1]).join(' ') + ' 集多' : '集多';

    const actMatch  = html.match(/女演员:([\s\S]*?)<\/div>/);
    const actor     = actMatch ? [...actMatch[0].matchAll(/>(.*?)<\/a>/g)].map(m => m[1]).join(' ') + ' 乐哥' : '乐哥';

    const tagMatch  = html.match(/标签:([\s\S]*?)<\/div>/);
    const remarks   = tagMatch ? [...tagMatch[0].matchAll(/>(.*?)<\/a>/g)].map(m => m[1]).join(' ') : '';

    const yearMatch = html.match(/发布日期:([\s\S]*?)<\/div>/);
    const year      = yearMatch ? ([...yearMatch[0].matchAll(/<span>(.*?)<\/span>/g)].map(m => m[1]).join(' ')) : '';

    // 播放地址
    let playUrl  = '';
    let playFrom = ''
    const qianMatch = html.match(/Movie\(\{id:\s*(\d+),/);
    if (qianMatch) {
        const qian    = qianMatch[1];
        const ajaxData = await request(`${site}/ajax/v/${qian}/videos`);
        const url1    = ajaxData.result?.watch?.[0]?.url || '';

        if (url1) {
            const playerHtml = await request(`${url1}?poster=${pic}`);
            playUrl  = (playerHtml.match(/stream&quot;:&quot;(.*?)&/) || [])[1]?.replace(/\\/g, '') || '';
            playFrom = '集多专线';
        }
    }

    return {
        list: [{
            vod_id:        did,
            vod_director:  director,
            vod_actor:     actor,
            vod_remarks:   remarks,
            vod_year:      year,
            vod_content:   content,
            vod_play_from: playFrom,
            vod_play_url:  playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            'Referer': 'https://avtoday.io/player?s=' + url.replace('/video/',''),
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/search?s=${text}&page=${page}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: '123av',
        name: '🔥123AV',
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