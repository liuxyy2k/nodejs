import axios from 'axios'
import * as cheerio from 'cheerio'

const siteUrl = 'https://www.nivod.vip'
const cateUrl = siteUrl + '/k/'
const detailUrl = siteUrl + '/nivod/'
const searchUrl = siteUrl + '/search?keywords='

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
}

async function request(url) {
    const { data } = await axios.get(url, { headers })
    return data
}

/* 解析列表 */
function parseVods(html) {
    const $ = cheerio.load(html)
    const list = []

    $('div.module-items a').each((i, el) => {

        const picRaw = $(el).find('img').attr('data-original')
        const name = $(el).attr('title')
        const remark = $(el).find('div.module-item-note').text()
        const href = $(el).attr('href')

        if (!picRaw || picRaw.endsWith('.gif') || !name) return

        const id = href.split('/')[2]

        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: siteUrl + picRaw,
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
        { type_id: '1', type_name: '电影' },
        { type_id: '2', type_name: '电视剧' },
        { type_id: '3', type_name: '综艺' },
        { type_id: '4', type_name: '动漫' }
    ]

    const html = await request(siteUrl)
    const list = parseVods(html)

    reply.send({
        class: classes,
        list
    })
}

async function category(req, reply) {

    const { id, page = 1 } = req.body

    const target = `${cateUrl}${id}--time_update------${id}---/`

    const html = await request(target)
    const list = parseVods(html)

    reply.send({
        page,
        pagecount: page + 1,
        limit: 20,
        total: (page + 1) * 20,
        list
    })
}

async function detail(req, reply) {

    const { id } = req.body

    const html = await request(detailUrl + id)
    const $ = cheerio.load(html)

    const name = $('meta[property="og:title"]').attr('content')
    const pic = $('meta[property="og:image"]').attr('content')
    const year = $('meta[property="video:release_date"]').attr('content')

    /* 播放线路 */
    let playFromArr = []
    $('div.module-tab-items-box div').each((i, el) => {
        const router = $(el).find('span').text()
        if (router) playFromArr.push(router)
    })

    /* 播放列表 */
    let playListArr = []

    const playLists = $('div.module-play-list-content')

    for (let i = 0; i < playLists.length; i++) {

        const element = playLists.eq(i)
        const links = element.find('a')

        const promises = []

        links.each((j, a) => {

            const playLink = siteUrl + $(a).attr('href')
            const linkName = $(a).text()

            promises.push(
                request(playLink).then(playHtml => {
                    const $$ = cheerio.load(playHtml)
                    const script = $$('div.player-box-main script').html() || ''
                    const match = script.match(/"url"\s*:\s*"([^"]+)"/)
                    const url = match ? match[1].replace(/\\\//g, '/') : ''
                    return `${linkName}$${url}`
                }).catch(() => `${linkName}$`)
            )
        })

        const results = await Promise.all(promises)

        playListArr.push(results.join('#'))
    }

    reply.send({
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: playFromArr.join('$$$'),
            vod_play_url: playListArr.join('$$$')
        }]
    })
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
        key: 'nivod',
        name: 'NiVideo',
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