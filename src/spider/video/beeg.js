import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const API_BASE = 'https://store.externulls.com';

const CHANNELS = [
    { type_id: 'blacked',             type_name: 'Blacked' },
    { type_id: 'vixencom',            type_name: 'Vixen' },
    { type_id: 'teamskeet',           type_name: 'Team Skeet' },
    { type_id: 'teenmegaworld',       type_name: 'Teen Mega World' },
    { type_id: 'nubilesporn',         type_name: 'Nubiles' },
    { type_id: 'wowgirls',            type_name: 'Wow Girls' },
    { type_id: 'brattysis',           type_name: 'Bratty Sis' },
    { type_id: 'adulttime',           type_name: 'Adult Time' },
    { type_id: 'familystrokes',       type_name: 'Family Strokes' },
    { type_id: 'ultrafilms',          type_name: 'Ultra Films' },
    { type_id: 'nubilefilms',         type_name: 'Nubile Films' },
    { type_id: 'letsdoeit',           type_name: 'LetsDoeIt' },
    { type_id: 'familyxxx',           type_name: 'Family XXX' },
    { type_id: 'tiny4k',              type_name: 'Tiny 4K' },
    { type_id: 'newsensations',       type_name: 'New Sensations' },
    { type_id: 'naughtyamerica',      type_name: 'Naughty America' },
    { type_id: 'sislovesme',          type_name: 'Sis Loves Me' },
    { type_id: 'puretaboo',           type_name: 'Pure Taboo' },
    { type_id: 'stepsiblingscaught',  type_name: 'Step Siblings Caught' },
    { type_id: 'momsteachsex',        type_name: 'Moms Teach Sex' },
    { type_id: 'hotwifexxx',          type_name: 'Hot Wife XXX' },
    { type_id: 'pornforce',           type_name: 'Porn Force' },
    { type_id: 'dorcelclub',          type_name: 'Dorcel Club' },
    { type_id: 'vixenplus',           type_name: 'Vixen Plus' },
    { type_id: 'myfamilypies',        type_name: 'My Family Pies' },
    { type_id: 'myfriendshotmom',     type_name: "My Friend's Hot Mom" },
    { type_id: 'barebackstudios',     type_name: 'Bare Back Studios' },
    { type_id: 'nfbusty',             type_name: 'NF Busty' },
    { type_id: 'passionhd',           type_name: 'Passion HD' },
    { type_id: '21naturals',          type_name: '21 Naturals' },
    { type_id: 'teenfidelity',        type_name: 'Teen Fidelity' },
    { type_id: 'tushy',               type_name: 'Tushy' },
    { type_id: 'pornworld',           type_name: 'Porn World' },
    { type_id: 'cum4k',               type_name: 'Cum 4K' },
    { type_id: 'mypervyfamily',       type_name: 'My Pervy Family' },
    { type_id: 'pornfidelity',        type_name: 'Porn Fidelity' },
    { type_id: 'nvg',                 type_name: 'NVG' },
    { type_id: 'exploitedcollegegirls', type_name: 'Exploited College Girls' },
    { type_id: 'deeperofficial',      type_name: 'Deeper' },
    { type_id: 'bellesaplus',         type_name: 'Bellesa Plus' },
    { type_id: 'princesscum',         type_name: 'Princess Cum' },
    { type_id: 'whiteboxxx',          type_name: 'White Boxxx' },
    { type_id: 'puremature',          type_name: 'Pure Mature' },
    { type_id: 'pervmom',             type_name: 'Perv Mom' },
    { type_id: 'blackedraw',          type_name: 'Blacked Raw' },
    { type_id: 'momwantstobreed',     type_name: 'Mom Wants to Breed' },
    { type_id: '21sextury',           type_name: '21 Sextury' },
    { type_id: 'hegre',               type_name: 'Hegre' },
    { type_id: 'lifeselector',        type_name: 'Life Selector' },
    { type_id: 'exxtrasmall',         type_name: 'Exxxtra Small' },
    { type_id: 'javhd',               type_name: 'JAV HD' },
    { type_id: 'girlcumofficial',     type_name: 'Girl Cum' },
    { type_id: 'sexart',              type_name: 'Sex Art' },
    { type_id: 'tonightsgirlfriend',  type_name: "Tonight's Girlfriend" },
    { type_id: 'dadcrush',            type_name: 'Dad Crush' },
    { type_id: 'lubedcom',            type_name: 'Lubed' },
    { type_id: 'vip4k',               type_name: 'VIP 4K' },
    { type_id: 'evilangel',           type_name: 'Evil Angel' },
    { type_id: 'javhub',              type_name: 'JAV Hub' },
    { type_id: 'caribbeancom',        type_name: 'Caribbeancom' },
    { type_id: 'mysistershotfriend',  type_name: "My Sister's Hot Friend" },
    { type_id: 'daughterswap',        type_name: 'Daughter Swap' },
];

const MODELS = [
    { type_id: 'evaelfie',        type_name: 'Eva Elfie' },
    { type_id: 'angelawhite',     type_name: 'Angela White' },
    { type_id: 'danidaniels',     type_name: 'Dani Daniels' },
    { type_id: 'miamalkova',      type_name: 'Mia Malkova' },
    { type_id: 'rileyreid',       type_name: 'Riley Reid' },
    { type_id: 'milalioness',     type_name: 'Mila Lioness' },
    { type_id: 'alexagrace',      type_name: 'Alexa Grace' },
    { type_id: 'alinalopez',      type_name: 'Alina Lopez' },
    { type_id: 'comatozze',       type_name: 'Comatozze' },
    { type_id: 'candylove',       type_name: 'Candy Love' },
    { type_id: 'dianarider',      type_name: 'Diana Rider' },
    { type_id: 'sweetiefox',      type_name: 'Sweetie Fox' },
    { type_id: 'lanarhoades',     type_name: 'Lana Rhoades' },
    { type_id: 'juliejess',       type_name: 'Julie Jess' },
    { type_id: 'annywalker',      type_name: 'Anny Walker' },
    { type_id: 'angelx',          type_name: 'Angel X' },
    { type_id: 'shinaryen',       type_name: 'Shinaryen' },
    { type_id: 'abelladanger',    type_name: 'Abella Danger' },
    { type_id: 'sybil',           type_name: 'Sybil' },
    { type_id: 'emiliabunny',     type_name: 'Emilia Bunny' },
    { type_id: 'syndicete',       type_name: 'Syndicete' },
    { type_id: 'jennykitty',      type_name: 'Jenny Kitty' },
    { type_id: 'emilywillis',     type_name: 'Emily Willis' },
    { type_id: 'elsajean',        type_name: 'Elsa Jean' },
    { type_id: 'nicoleaniston',   type_name: 'Nicole Aniston' },
    { type_id: 'fantasybabe',     type_name: 'Fantasy Babe' },
    { type_id: 'lenapaul',        type_name: 'Lena Paul' },
    { type_id: 'bonnieblaze',     type_name: 'Bonnie Blaze' },
    { type_id: 'corychase',       type_name: 'Cory Chase' },
    { type_id: 'martinpaola',     type_name: 'Martin & Paola' },
    { type_id: 'dickforlily',     type_name: 'Dick For Lily' },
    { type_id: 'gabbiecarter',    type_name: 'Gabbie Carter' },
    { type_id: 'lexilore',        type_name: 'Lexi Lore' },
    { type_id: 'katekuray',       type_name: 'Kate Kuray' },
    { type_id: 'blakeblossom',    type_name: 'Blake Blossom' },
    { type_id: 'carlacute',       type_name: 'Carla Cute' },
    { type_id: 'hottiestwo',      type_name: 'Hotties Two' },
    { type_id: 'adrianachechik',  type_name: 'Adriana Chechik' },
    { type_id: 'yummymira',       type_name: 'Yummy Mira' },
    { type_id: 'reislin',         type_name: 'Reislin' },
    { type_id: 'anastangel',      type_name: 'Anastangel' },
    { type_id: 'ginavalentina',   type_name: 'Gina Valentina' },
    { type_id: 'kenzie Reeves',   type_name: 'Kenzie Reeves' },
    { type_id: 'valentinanappi',  type_name: 'Valentina Nappi' },
    { type_id: 'leahmeow',        type_name: 'Leah Meow' },
    { type_id: 'carrylight',      type_name: 'Carry Light' },
    { type_id: 'purplebitch',     type_name: 'Purple Bitch' },
    { type_id: 'pinkloving',      type_name: 'Pink Loving' },
    { type_id: 'myanny',          type_name: 'My Anny' },
    { type_id: 'lilkarina',       type_name: 'Lil Karina' },
    { type_id: 'melodymarks',     type_name: 'Melody Marks' },
    { type_id: 'luxurymur',       type_name: 'Luxury Mur' },
    { type_id: 'danadaniels',     type_name: 'Diana Daniels' },
    { type_id: 'stacycruz',       type_name: 'Stacy Cruz' },
    { type_id: 'allinika',        type_name: 'Allinika' },
    { type_id: 'autumnfalls',     type_name: 'Autumn Falls' },
    { type_id: 'solazola',        type_name: 'Sola Zola' },
    { type_id: 'krystalboyd',     type_name: 'Krystal Boyd' },
    { type_id: 'lexiluna',        type_name: 'Lexi Luna' },
    { type_id: 'laurenphillips',  type_name: 'Lauren Phillips' },
    { type_id: 'kerabear',        type_name: 'Kera Bear' },
    { type_id: 'littlecaprice',   type_name: 'Little Caprice' },
    { type_id: 'siasiberia',      type_name: 'Sia Siberia' },
    { type_id: 'mollyredwolf',    type_name: 'Molly Red Wolf' },
    { type_id: 'samanthaflair',   type_name: 'Samantha Flair' },
    { type_id: 'luxurygirl',      type_name: 'Luxury Girl' },
    { type_id: 'mollylittle',     type_name: 'Molly Little' },
    { type_id: 'kellyaleman',     type_name: 'Kelly Aleman' },
    { type_id: 'yinyleon',        type_name: 'Yinyleon' },
    { type_id: 'liyasilver',      type_name: 'Liya Silver' },
    { type_id: 'telarilove',      type_name: 'Telari Love' },
    { type_id: 'skyeyoung',       type_name: 'Skye Young' },
    { type_id: 'trukait',         type_name: 'Tru Kait' },
    { type_id: 'elizaibarra',     type_name: 'Eliza Ibarra' },
    { type_id: 'jennylux',        type_name: 'Jenny Lux' },
    { type_id: 'anissakate',      type_name: 'Anissa Kate' },
    { type_id: 'haleyreed',       type_name: 'Haley Reed' },
    { type_id: 'kylerquinn',      type_name: 'Kyler Quinn' },
    { type_id: 'skylarvox',       type_name: 'Skylar Vox' },
    { type_id: 'leahgotti',       type_name: 'Leah Gotti' },
    { type_id: 'linamigurtt',     type_name: 'Lina Migurtt' },
    { type_id: 'dillionharper',   type_name: 'Dillion Harper' },
    { type_id: 'brandilove',      type_name: 'Brandi Love' },
    { type_id: 'jialissa',        type_name: 'Jia Lissa' },
    { type_id: 'brooketilli',     type_name: 'Brooke Tilli' },
    { type_id: 'misslexa',        type_name: 'Miss Lexa' },
    { type_id: 'bunnyrabbits',    type_name: 'Bunny Rabbits' },
    { type_id: 'leolulu',         type_name: 'Leo Lulu' },
    { type_id: 'laylaray',        type_name: 'Layla Ray' },
    { type_id: 'webtolove',       type_name: 'Web To Love' },
    { type_id: 'nancyace',        type_name: 'Nancy Ace' },
    { type_id: 'hanselgrettel',   type_name: 'Hansel & Grettel' },
    { type_id: 'xreindeers',      type_name: 'Xreindeers' },
    { type_id: 'tiffanystatum',   type_name: 'Tiffany Tatum' },
    { type_id: 'mirari',          type_name: 'Mirari' },
    { type_id: 'adriarae',        type_name: 'Adria Rae' },
    { type_id: 'kristeljack',     type_name: 'Kristel Jack' },
    { type_id: 'milasolana',      type_name: 'Mila Solana' },
    { type_id: 'alexisfawx',      type_name: 'Alexis Fawx' },
];

// ── 工具函数 ──────────────────────────────────────────────

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function buildCard(video) {
    const fcFacts  = video.fc_facts?.[0];
    const factId   = fcFacts?.id;
    const fileData = video.file?.data || [];
    const fileId   = video.file?.id || fileData[0]?.cd_file || factId;
    if (!fileId) return null;

    const duration    = video.file?.fl_duration || 0;
    const height      = video.file?.fl_height || 0;
    const fcThumbs    = fcFacts?.fc_thumbs || [];

    let title = 'Untitled';
    for (const item of fileData) {
        if (item.cd_column === 'sf_name') { title = item.cd_value || title; break; }
    }

    let cover = '';
    if (fcThumbs.length > 0) {
        cover = `https://thumbs.externulls.com/videos/${fileId}/${fcThumbs[0]}.jpg`;
    } else if (fileData[0]?.cd_file) {
        cover = `https://img.externulls.com/${fileData[0].cd_file}/preview_01.jpg`;
    }

    return {
        vod_id:      String(fileId),
        vod_name:    title,
        vod_pic:     cover,
        vod_remarks: `${height}p ${formatDuration(duration)}`.trim(),
        hls_resources: video.file?.hls_resources || {},
    };
}

async function fetchVideos(slug, page) {
    const offset = (page - 1) * 48;
    const url    = `${API_BASE}/tag/videos/${slug}?limit=48&offset=${offset}`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': UA } });
    const videos = typeof data === 'string' ? JSON.parse(data) : data;
    return Array.isArray(videos) ? videos : [];
}

// ── API 处理函数 ──────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'home', type_name: '首页推荐' },
        ...CHANNELS,
        ...MODELS,
    ];

    const videos = await fetchVideos('index', 1);
    const list   = videos.map(buildCard).filter(Boolean);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const slug = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const apiSlug = slug === 'home' ? 'index' : slug;

    const videos = await fetchVideos(apiSlug, page);
    const list   = videos.map(buildCard).filter(Boolean);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id  = inReq.body.id;
    // detail 直接用 hls_resources（从 category 缓存来），这里重新拉一次
    const { data } = await axios.get(`${API_BASE}/facts/file/${id}`, {
        headers: {
            'User-Agent': UA,
            'Origin':  'https://beeg.com',
            'Referer': 'https://beeg.com/',
        },
    });
    const parsed       = typeof data === 'string' ? JSON.parse(data) : data;
    const hlsResources = parsed?.file?.hls_resources || {};

    // 构造多清晰度播放地址
    const qualities = [];
    for (const [key, value] of Object.entries(hlsResources)) {
        if (value && key.startsWith('fl_cdn_') && key !== 'fl_cdn_multi') {
            const m = key.match(/fl_cdn_(\d+)/);
            qualities.push({ height: m ? parseInt(m[1]) : 0, url: `https://video.beeg.com/${value}` });
        }
    }
    qualities.sort((a, b) => b.height - a.height);

    const playUrl = qualities.map((q, i) => `${q.height}p$${q.url}`).join('#');

    return {
        list: [{
            vod_id:        id,
            vod_name:      parsed?.file?.sf_name || id,
            vod_pic:       '',
            vod_play_from: 'Beeg',
            vod_play_url:  playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
     return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = (inReq.body.wd || '').trim();
    if (!text) return { list: [] };

    const queryWords = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
    const cards = [];
    const seen  = new Set();

    for (let p = 1; p <= 5 && cards.length < 48; p++) {
        try {
            const videos = await fetchVideos('index', p);
            for (const video of videos) {
                const card = buildCard(video);
                if (!card || seen.has(card.vod_id)) continue;
                const normalized = card.vod_name.toLowerCase().replace(/[^a-z0-9]+/g, '');
                if (queryWords.every(w => normalized.includes(w))) {
                    seen.add(card.vod_id);
                    cards.push(card);
                    if (cards.length >= 48) break;
                }
            }
        } catch (e) {}
    }

    return { list: cards };
}

export default {
    meta: {
        key: 'beeg',
        name: '🎥Beeg',
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