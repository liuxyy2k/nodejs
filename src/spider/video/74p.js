import axios from 'axios';

const site = 'https://www.74p.net';

const COOKIE = '_tj_vid=b1f7ad3c-348c-4640-9a76-6b3af67b4ce8; session=MTc3NzEwMzIxOXxEWDhFQVFMX2dBQUJFQUVRQUFCdV80QUFBd1p6ZEhKcGJtY01DQUFHVlhObGNrbGtCbk4wY21sdVp3d0dBQVEwTlRNeEJuTjBjbWx1Wnd3S0FBaFZjMlZ5VG1GdFpRWnpkSEpwYm1jTURnQU1jMmhoWjNWaE9EZzRNVFk0Qm5OMGNtbHVad3dMQUFsVmMyVnlSM0p2ZFhBR2MzUnlhVzVuREFNQUFUQT18gvrE7G9PtSdGBC4ge-PtnIAbvGbP0wzsxQqZk6UvdEA=; username=shagua888168; uid=4531;';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Cookie:       COOKIE,
        Referer:      site + '/',
        Accept:       'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        Connection:   'keep-alive',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//'))   return 'https:' + url;
    if (url.startsWith('/'))    return site + url;
    return url;
}

function getPostList(html, pg) {
    const vlist = [];

    let block = html;
    const mainM = html.match(/(?:id="index_ajax_list"|class="site-main")[^>]*>(.*?)<(?:footer|aside)/s);
    if (mainM) block = mainM[1];

    const items = [...block.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => m[1]);

    for (const item of items) {
        const hrefM = item.match(/href=["']([^"']+)['"]/);
        if (!hrefM) continue;
        const href = hrefM[1];
        if (['.css', '.js', 'templates/', 'wp-includes'].some((x) => href.includes(x))) continue;

        const imgM = item.match(/data-original=["']([^"']+)['"]/)?.[1]
                  || item.match(/src=["']([^"']+)['"]/)?.[1] || '';
        const pic  = imgM || `${site}/static/images/cover.png`;

        const titleM = item.match(/title=["']([^"']+)['"]/);
        let name = titleM ? titleM[1] : item.replace(/<[^>]+>/g, '').trim().split('\n')[0];
        if (!name || name.startsWith('.') || name.includes('{') || name.length > 100) continue;

        vlist.push({
            vod_id:      absUrl(href),
            vod_name:    name,
            vod_pic:     pic,
            vod_remarks: '点击查看',
            style:       { type: 'rect', ratio: 1.33 },
        });
    }

    return {
        list:      vlist,
        page:      pg,
        pagecount: vlist.length >= 15 ? pg + 1 : pg,
        limit:     20,
        total:     9999,
    };
}

async function fetchHtml(url, referer = null) {
    const { data } = await http.get(url, referer ? { headers: { Referer: referer } } : {});
    return data;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: 'xiurenwang',             type_name: '秀人网'   },
            { type_id: 'yuhuajie',               type_name: '语画界'   },
            { type_id: 'huayang',                type_name: '花漾'     },
            { type_id: 'xingyanshe',             type_name: '星颜社'   },
            { type_id: 'feilin',                 type_name: '嗲囡囡'   },
            { type_id: 'aimishe',                type_name: '爱蜜社'   },
            { type_id: 'boluoshe',               type_name: '波萝社'   },
            { type_id: 'youwuguan',              type_name: '尤物馆'   },
            { type_id: 'uxing',                  type_name: '优星馆'   },
            { type_id: 'wings',                  type_name: '影私荟'   },
            { type_id: 'xingleyuan',             type_name: '星乐园'   },
            { type_id: 'miitao',                 type_name: '蜜桃社'   },
            { type_id: 'taste',                  type_name: '顽味生活' },
            { type_id: 'meiyanshe',              type_name: '魅妍社'   },
            { type_id: 'meiyuanguan',            type_name: '美媛馆'   },
            { type_id: 'candyhuabao',            type_name: '糖果画报' },
            { type_id: 'huayan',                 type_name: '花の颜'   },
            { type_id: 'mofanxueyuan',           type_name: '模范学院' },
            { type_id: 'yituyu',                 type_name: '艺图语'   },
            { type_id: 'mzsock',                 type_name: '爱美足'   },
            { type_id: 'comic/category/jp',      type_name: '日本漫画' },
            { type_id: 'comic/category/kr',      type_name: '韩国漫画' },
            { type_id: 'novel/category/Urban',   type_name: '都市'     },
            { type_id: 'novel/category/campus',  type_name: '校园'     },
            { type_id: 'novel/category/Incestuous', type_name: '乱伦'  },
            { type_id: 'novel/category/Xuanhuan',type_name: '玄幻'     },
            { type_id: 'novel/category/Goldfinger', type_name: '系统'  },
            { type_id: 'novel/category/traverse',type_name: '穿越'     },
            { type_id: 'novel/category/Wuxia',   type_name: '武侠'     },
            { type_id: 'novel/category/Fantasy', type_name: '奇幻'     },
            { type_id: 'novel/category/Rural',   type_name: '乡村'     },
            { type_id: 'novel/category/Historical', type_name: '历史'  },
            { type_id: 'novel/category/Celebrity', type_name: '明星'   },
            { type_id: 'novel/category/Superpower', type_name: '异能'  },
            { type_id: 'novel/category/Science', type_name: '科幻'     },
            { type_id: 'novel/category/Fan',     type_name: '同人'     },
        ],
        list:    [],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;
    const html = await fetchHtml(`${site}/${tid}/page/${pg}`);
    return getPostList(html, pg);
}

async function detail(inReq, _outResp) {
    const url      = inReq.body.id;
    const html     = await fetchHtml(url);
    const isNovel  = url.includes('/novel/');

    const h1M  = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    const descM = html.match(/<div class="entry-content"[^>]*>(.*?)<\/div>/s);

    const name  = h1M ? h1M[1].trim() : '';
    let content = '';
    if (descM) {
        content = descM[1].replace(/<[^>]+>/g, '').trim().slice(0, 200);
    }

    const chapterLinks = [
        ...html.matchAll(/<a[^>]+href=["']([^"']*\/(?:comic|novel)\/chapter\/[^"']+)["'][^>]*>(.*?)<\/a>/g),
    ];

    let playUrls;
    if (chapterLinks.length) {
        playUrls = chapterLinks.map(([, href, n]) => `${n.trim()}$${absUrl(href)}`).join('#');
    } else {
        playUrls = `在线观看$${url}`;
    }

    return {
        list: [{
            vod_id:        url,
            vod_name:      name,
            vod_pic:       '',
            type_name:     isNovel ? '小说' : '漫画',
            vod_content:   content,
            vod_play_from: isNovel ? '74P小说' : '74P漫画',
            vod_play_url:  playUrls,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;
    return id.includes('/novel/') ? playerNovel(id) : playerComic(id);
}

async function playerComic(id) {
    const images = await scrapeAllImages(id);
    return { parse: 0, url: `pics://${images.join('&&')}`, header: '' };
}

async function playerNovel(id) {
    try {
        const url  = id.startsWith('http') ? id : site + id;
        const html = await fetchHtml(url);

        const titleM = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
        const title  = titleM ? titleM[1].trim() : '';

        let content = '';
        const contentM = html.match(/(?:class="entry-content|id="content")[^>]*>(.*?)<\/div/s);
        if (contentM) {
            let c = contentM[1]
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<p[^>]*>/gi, '\n')
                .replace(/<[^>]+>/g, '');
            content = c.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
        }

        return {
            parse:  0,
            url:    'novel://' + JSON.stringify({ title, content: content || '正文获取失败' }),
            header: '',
        };
    } catch (e) {
        return {
            parse:  0,
            url:    'novel://' + JSON.stringify({ title: '错误', content: String(e) }),
            header: '',
        };
    }
}

async function scrapeAllImages(startUrl) {
    const images  = [];
    const seen    = new Set();
    let current   = startUrl;
    let page      = 1;
    const maxPages = 50;

    while (page <= maxPages) {
        if (seen.has(current)) break;
        seen.add(current);

        let html;
        try { html = await fetchHtml(current); } catch { break; }

        const contentM = html.match(/(?:id="content"|class="entry-content"|class="single-content")[^>]*>(.*?)<(?:div class="related|footer|section)/s);
        const block    = contentM ? contentM[1] : html;

        for (const m of block.matchAll(/<img[^>]+(?:src|data-original|data-src)=["']([^"']+)['"]/g)) {
            const src = m[1];
            if (/\.gif|\.svg|logo|avatar|icon/i.test(src)) continue;
            const abs = absUrl(src);
            if (!images.includes(abs)) images.push(abs);
        }

        let nextUrl = null;
        const nextM = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>(?:下一页|Next|»)/i)
                   || html.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*next[^"']*["']/i);

        if (!nextM && !current.includes('/comic/chapter/') && current.includes('page')) {
            nextUrl = `${current.rsplit('/', 1)[0]}/${page + 1}`;
        } else if (nextM) {
            nextUrl = absUrl(nextM[1]);
        }

        if (!nextUrl) break;
        current = nextUrl;
        page++;
    }

    return images;
}

async function search(inReq, _outResp) {
    const key      = inReq.body.wd || '';
    const pg       = parseInt(inReq.body.pg) || 1;
    const referer  = key.includes('漫画') ? `${site}/comic` : `${site}/novel`;
    const url      = pg > 1 ? `${site}/search/${key}/page/${pg}` : `${site}/search/${key}`;
    const html     = await fetchHtml(url, referer);
    return getPostList(html, pg);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  '74p',
        name: '🔥74P福利',
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