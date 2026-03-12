import axios from 'axios'
import * as cheerio from 'cheerio'
const siteUrl = 'https://a123tv.com'
const cateUrl = siteUrl + '/t/'
const detailUrl = siteUrl + '/nivod/'
const searchUrl = siteUrl + '/search?keywords='

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
}

async function request(url) {
    const { data } = await axios.get(url, { headers})
    return data
}

/* 解析列表 */
function parseVods(html) {
    const $ = cheerio.load(html)
    const list = []
    $('.w4-item-wrap').each((i, el) => {
        const picRaw = $(el).find('img').attr('data-src')
        const name = $(el).find('.t').text()
        const remark = $(el).find('.r').text()
        const href = $(el).find('.w4-item').attr('href')
        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: 'https:' + picRaw,
            vod_remarks: remark
        })
    })

    return list
}

/* ---------------- 接口 ---------------- */

async function init(req, reply) {
    reply.send({})
}

async function home(req, reply) {
    const classes = [
        { type_id: '10', type_name: '电影' },
        { type_id: '11', type_name: '电视剧' },
        { type_id: '12', type_name: '综艺' },
        { type_id: '13', type_name: '动漫' },
        { type_id: '15', type_name: '福利' }
    ]
    let filterObj = {
         '10': [
             {
                key: 'class',
                name: '类型',
                value: [
                    { n: '全部',   v: '' },
                    { n: '动作片', v: '1001' },
                    { n: '喜剧片', v: '1002' },
                    { n: '爱情片', v: '1003' },
                    { n: '科幻片', v: '1004' },
                    { n: '恐怖片', v: '1005' },
                    { n: '剧情片', v: '1006' },
                    { n: '战争片', v: '1007' },
                    { n: '悬疑片', v: '1016' },
                    { n: '犯罪片', v: '1014' },
                    { n: '邵氏电影', v: '1019' },
                    { n: '古装片', v: '1025' },
                    { n: '4k电影', v: '1027' },
                ]
            }
        ],
        '11': [
             {
                key: 'class',
                name: '类型',
                value: [
                    { n: '全部',   v: '' },
                    { n: '国产剧', v: '1101' },
                    { n: '香港剧', v: '1102' },
                    { n: '台湾剧',   v: '1105' },
                    { n: '韩剧',   v: '1103' },
                    { n: '欧美剧', v: '1104' },
                    { n: '日本剧',   v: '1106' },
                    { n: '泰国剧', v: '1108' }
                ]
            }
        ],
        '12': [
             {
                key: 'class',
                name: '类型',
                value: [
                    { n: '全部',   v: '' },
                    { n: '内地综艺', v: '1201' },
                    { n: '港台综艺', v: '1202' },
                    { n: '日韩综艺', v: '1203' },
                    { n: '国外综艺', v: '1205' },
                    { n: '欧美综艺', v: '1204' }
                ]
            }
        ],
        '13': [
             {
                key: 'class',
                name: '类型',
                value: [
                    { n: '全部',     v: '' },
                    { n: '国产动漫', v: '1301' },
                    { n: '日韩动漫', v: '1302' },
                    { n: '海外动漫', v: '1305' },
                    { n: '欧美动漫', v: '1303' },
                    { n: '里番',     v: '1307' }
                ]
            }
        ],
        '15': [
             {
                key: 'class',
                name: '类型',
                value: [
                    { n: '全部',     v: '' },
                    { n: '韩国情色', v: '1551' },
                    { n: '日本情色', v: '1552' },
                    { n: '大陆情色', v: '1555' },
                    { n: '香港情色', v: '1553' },
                    { n: '台湾情色', v: '1554' },
                    { n: '美国情色', v: '1556' },
                    { n: '欧洲情色', v: '1557' },
                    { n: '印度情色', v: '1558' },
                    { n: '东南亚情色', v: '1559' },
                    { n: '其他情色', v: '1550' },
                ]
            }
        ]
    }
   return { class: classes, filters: filterObj };
}

async function category(req, reply) {
    const { id, page = 1, filters } = req.body
    let ext = filters
    if (typeof filters === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    } else {
        ext = filters
    }
    ext = ext || {}
    let type = ext?.class || ''
    const path = (type === '' ? id : type) + (page > 1 ? `/p${page}` : '')
    const target = `${cateUrl}${path}.html`
    const html = await request(target)
    const list = parseVods(html)

    return { page, pagecount: page + 1,total: (page + 1) * 20, list };
}

async function detail(req, reply) {

    const { id } = req.body

    const html = await request(siteUrl + id)
    const $ = cheerio.load(html)

    const name = $('meta[property="og:title"]').attr('content') || ''
    const pic = $('meta[property="og:image"]').attr('content') || ''
    const year = $('meta[property="video:release_date"]').attr('content') || ''
    const description = $('meta[name="description"]').attr('content') || ''

    const links = $('.w a').toArray()

    const results = await Promise.all(links.map(async (el, index) => {
        const ep = $(el).text().trim()
        const url = $(el).attr('href')
        if (!url) return null

        try {
            const detHtml = await request(siteUrl + url)
            const match = detHtml.match(/var\s+pp\s*=\s*({[\s\S]*?});/)
            if (!match) return null

            const pp = JSON.parse(match[1])
            if (!Array.isArray(pp?.la)) return null

            return { index, ep, lines: pp.la }
        } catch (e) {
            console.log('解析失败:', url)
            return null
        }
    }))

    const validResults = results.filter(Boolean).sort((a, b) => a.index - b.index)

    // 用线路索引分组，保证同一线路的集数归在一起
    let playMap = {}
    let lineNames = {}

    validResults.forEach(({ ep, lines }) => {
        lines.forEach((item, lineIndex) => {
            const lineName = item[1]
            const playUrl = item[4]
            if (!playUrl) return

            // 记录线路名（取第一次出现的）
            if (!lineNames[lineIndex]) {
                lineNames[lineIndex] = lineName || ('线路' + (lineIndex + 1))
            }

            playMap[lineIndex] = playMap[lineIndex] || []
            playMap[lineIndex].push(ep + '$' + playUrl)
        })
    })

    const playFromArr = Object.keys(playMap).map(i => lineNames[i])
    const playListArr = Object.keys(playMap).map(i => playMap[i].join('#'))

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: playFromArr.join('$$$'),
            vod_play_url: playListArr.join('$$$'),
            vod_content: description
        }]
    }
}

async function search(req, reply) {

    const { wd } = req.body

    const html = await request(searchUrl + encodeURIComponent(wd))
    const list = parseVods(html)

    reply.send({ list })
}

async function play(req, reply) {

    const { id } = req.body

    reply.send({
        parse: 0,
        url: id
    })
}

/* 导出 */

export default {
    meta: {
        key: '123Tv',
        name: '123Tv',
        type: 3
    },
    api: async (fastify) => {
        fastify.post('/init', init)
        fastify.post('/home', home)
        fastify.post('/category', category)
        fastify.post('/detail', detail)
        fastify.post('/play', play)
        fastify.post('/search', search)
    }
}