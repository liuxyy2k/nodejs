import axios from 'axios';
import https from 'https';

const siteUrl = 'https://javfree.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAIN_CATEGORIES = [
    { type_id: 'featured', type_name: 'Featured' },
    { type_id: 'most-watched', type_name: 'Most Watched' },
    { type_id: 'censored', type_name: 'Censored' },
    { type_id: 'uncensored', type_name: 'Uncensored' },
    { type_id: 'star', type_name: 'Jav Stars' },
];

const P_ITEM =
    /<div class="post movie-item">\s*<a[^>]*?title="([^"]+)"[^>]*?href="([^"]+)"[^>]*?>\s*.*?<img[^>]*?data-src="([^"]+)"[^>]*?>.*?<i class="type">([^<]+)<\/i>.*?<span class="date">([^<]+)<\/span>/gs;

const P_STAR =
    /<div class="star-b">\s*<div class="thumb">\s*<a href="https?:\/\/javfree\.com\/star\/([^/]+)\/"[^>]*title="([^"]+)"[^>]*>\s*<img src="([^"]+)"/gs;


const http = axios.create({
    timeout: 15000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: `${siteUrl}/`,
    },
});

function cleanTitle(text) {
    return String(text || '')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#8211;/g, '-')
        .replace(/<[^>]+>/g, '')
        .trim();
}

async function fetchHtml(url) {
    try {
        const r = await http.get(url);
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch (e) {
        console.log(`[javfree] fetch failed: ${url} | ${e.message}`);
        return '';
    }
}

function extractVideos(html) {
    const videos = [];
    for (const m of html.matchAll(P_ITEM)) {
        const [_, title, href, pic, vtype, duration] = m;
        const vidMatch = href.match(/\/video-([^/]+)\//);
        const vodId = vidMatch ? vidMatch[1] : href;
        videos.push({
            vod_id: vodId,
            vod_name: cleanTitle(title),
            vod_pic: pic,
            vod_remarks: `${vtype.trim()} | ${duration.trim()}`,
        });
    }
    return videos;
}

function extractStars(html) {
    const videos = [];
    for (const m of html.matchAll(P_STAR)) {
        const [_, slug, name, pic] = m;
        videos.push({
            vod_id: `star_${slug}`,
            vod_name: cleanTitle(name),
            vod_pic: pic,
            vod_remarks: 'Jav Star',
        });
    }
    return videos;
}

function parseMovie(html) {
    const movieMatch = html.match(/movie\s*=\s*({[\s\S]+?});/);
    if (!movieMatch) return null;
    const movieStr = movieMatch[1];
    const movieIdMatch = movieStr.match(/id\s*:\s*['"]([^'"]+)['"]/);
    const movieId = movieIdMatch ? movieIdMatch[1] : '';

    const svMap = {};
    for (const m of movieStr.matchAll(/"(\d+)"\s*:\s*\["([^"]+)","([^"]+)"\]/g)) {
        svMap[m[1]] = m[3];
    }
    const epiMap = {};
    for (const m of movieStr.matchAll(/"(\d+)"\s*:\s*\["([^"]+)"\]/g)) {
        epiMap[m[1]] = m[2];
    }
    return { movieId, svMap, epiMap };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(`${siteUrl}/home/`);
    const videos = extractVideos(html);
    return { class: [...MAIN_CATEGORIES], list: videos.slice(0, 12) };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page, 10) || 1;
    let html;
    let videos;

    if (tid === 'star') {
        html = await fetchHtml(`${siteUrl}/star/?p=${pg}`);
        videos = extractStars(html);
    } else if (tid.startsWith('star_')) {
        const slug = tid.replace('star_', '');
        html = await fetchHtml(`${siteUrl}/star/${slug}/?p=${pg}`);
        videos = extractVideos(html);
    } else {
        html = await fetchHtml(`${siteUrl}/${tid}/?p=${pg}`);
        videos = extractVideos(html);
    }

    let pagecount = 999;
    const hasNext = new RegExp(`data-page="${pg + 1}"`).test(html);
    if (!hasNext && videos.length < 20) pagecount = pg;

    return {
        list: videos,
        page: pg,
        pagecount,
        limit: 40,
        total: pagecount * 40,
    };
}

async function detail(inReq, _outResp) {
    const vodId = String(inReq.body.id || '');

    if (vodId.startsWith('star_')) {
        const slug = vodId.replace('star_', '');
        const url = `${siteUrl}/star/${slug}/`;
        const html = await fetchHtml(url);
        if (!html) return { list: [] };

        const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        const starName = nameMatch
            ? cleanTitle(nameMatch[1].replace(/<[^>]+>/g, ''))
            : slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        const videos = extractVideos(html);
        if (!videos.length) return { list: [] };

        const playUrls = videos.map(
            (v, i) => `第${i + 1}集$${siteUrl}/video-${v.vod_id}/`,
        );

        return {
            list: [
                {
                    vod_id: vodId,
                    vod_name: starName,
                    vod_pic: videos[0]?.vod_pic || '',
                    vod_actor: starName,
                    vod_content: `${starName} 的作品列表，共 ${videos.length} 部`,
                    vod_play_from: '作品列表',
                    vod_play_url: playUrls.join('#'),
                },
            ],
        };
    }

    const url = vodId.startsWith('http') ? vodId : `${siteUrl}/video-${vodId}/`;
    const html = await fetchHtml(url);
    if (!html) return { list: [] };

    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const title = titleMatch
        ? cleanTitle(titleMatch[1].replace(/<[^>]+>/g, ''))
        : vodId;

    let pic = '';
    const coverMatch = html.match(/img\.javfree\.com\/thumb\/(?:600x0|640x0)\/([^"'\s]+)/);
    if (coverMatch) {
        const size = html.slice(Math.max(0, coverMatch.index - 10), coverMatch.index).includes('600x0')
            ? '600x0'
            : '640x0';
        pic = `https://img.javfree.com/thumb/${size}/${coverMatch[1]}`;
    } else {
        const coverMatch2 = html.match(/img\.javfree\.com\/thumb\/[^"'\s/]+\/([^"'\s]+)/);
        if (coverMatch2) pic = `https://img.javfree.com/thumb/600x0/${coverMatch2[1]}`;
    }

    const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const actors = [...html.matchAll(/href="https?:\/\/javfree\.com\/star\/([^/]+)\/"[^>]*>([^<]+)<\/a>/g)].map(
        (m) => m[2],
    );
    const genres = [...html.matchAll(/href="https?:\/\/javfree\.com\/genre\/([^/]+)\/"[^>]*>([^<]+)<\/a>/g)].map(
        (m) => m[2],
    );

    const playFroms = [];
    const playUrls = [];
    const movie = parseMovie(html);

    if (movie) {
        for (const [sid, serverName] of Object.entries(movie.svMap)) {
            if (movie.epiMap[sid] && serverName !== 'DOWNLOAD') {
                playFroms.push(serverName);
                playUrls.push(`第1集$${url}`);
            }
        }
    }

    if (!playFroms.length) {
        const external = [
            ...(html.match(/https?:\/\/k2s\.cc\/file\/[^\s"'<>]+/g) || []),
            ...(html.match(/https?:\/\/rapidgator\.net\/file\/[^\s"'<>]+/gi) || []),
        ];
        if (external.length) {
            playFroms.push('网盘外链');
            playUrls.push(`第1集$${external[0]}`);
        } else {
            playFroms.push('详情页');
            playUrls.push(`第1集$${url}`);
        }
    }

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_actor: actors.join(','),
                vod_tag: genres.join(','),
                vod_content: desc,
                vod_play_from: playFroms.join('$$$'),
                vod_play_url: playUrls.join('$$$'),
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const html = await fetchHtml(`${siteUrl}/search/?q=${encodeURIComponent(key)}&p=${pg}`);
    return { list: extractVideos(html), page: pg, pagecount: 999 };
}

async function play(inReq, _outResp) {
    const flag = inReq.body.flag || '';
    let id = String(inReq.body.id || '');

    if (/k2s\.cc|rapidgator/i.test(id)) {
        return { parse: 0, url: id, header: { 'User-Agent': UA } };
    }

    const detailUrl = id.startsWith('http') ? id : id;
    if (!detailUrl.startsWith('http')) {
        return { parse: 0, url: id, header: { 'User-Agent': UA } };
    }

    const html = await fetchHtml(detailUrl);
    if (!html) return { parse: 0, url: id, header: { 'User-Agent': UA } };

    const movie = parseMovie(html);
    if (!movie?.movieId) return { parse: 0, url: id, header: { 'User-Agent': UA } };

    let selectedSid = null;
    for (const [sid, name] of Object.entries(movie.svMap)) {
        if (name === flag && movie.epiMap[sid]) {
            selectedSid = sid;
            break;
        }
    }
    if (!selectedSid) {
        for (const [sid, name] of Object.entries(movie.svMap)) {
            if (movie.epiMap[sid] && name !== 'DOWNLOAD') {
                selectedSid = sid;
                break;
            }
        }
    }
    if (!selectedSid) return { parse: 0, url: id, header: { 'User-Agent': UA } };

    const hashB64 = movie.epiMap[selectedSid];
    try {
        const r = await http.post(
            `${siteUrl}/api/watch`,
            new URLSearchParams({ id: movie.movieId, hash: hashB64 }).toString(),
            {
                headers: {
                    'User-Agent': UA,
                    Accept: 'application/json, text/javascript, */*; q=0.01',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    Referer: detailUrl,
                    'X-Requested-With': 'XMLHttpRequest',
                    Origin: siteUrl,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 15000,
            },
        );
        const result = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        if (result.status === 1 && result.embed) {
            let embedUrl = result.embed;
            if (embedUrl.startsWith('//')) embedUrl = `https:${embedUrl}`;

            if (/turbovidhls|turboviplay/i.test(embedUrl)) {
                const embedResp = await http.get(embedUrl, {
                    headers: { 'User-Agent': UA, Referer: `${siteUrl}/` },
                    timeout: 15000,
                });
                const embedHtml = typeof embedResp.data === 'string' ? embedResp.data : String(embedResp.data || '');
                const m3u8Match = embedHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8)/);
                if (m3u8Match) {
                    return {
                        parse: 0,
                        url: m3u8Match[1],
                        header: {
                            'User-Agent': UA,
                            Referer: embedUrl,
                        },
                    };
                }
                return { parse: 1, url: embedUrl, header: { 'User-Agent': UA } };
            }
            return { parse: 1, url: embedUrl, header: { 'User-Agent': UA } };
        }
    } catch (e) {
        console.log(`[javfree] playerContent: ${e.message}`);
    }

    return { parse: 0, url: id, header: { 'User-Agent': UA } };
}

export default {
    meta: {
        key: 'javfree',
        name: '🔥JavFree',
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
