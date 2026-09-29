import axios from 'axios'
import { load } from 'cheerio'
const siteUrl = 'https://www.yyddyy.com/'
const Init = 'https://spiderscloudcn2.51111666.com/getDataInit'
const cateUrl = 'https://spiderscloudcn2.51111666.com/forward'

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144 Safari/537.36'

async function request(url) {
    const resp = await axios.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': siteUrl
        }
    })
    return resp.data
}

async function post(url, data) {
    const resp = await axios.post(url, data, {
        headers: {
            'User-Agent': UA,
            'Referer': siteUrl,
            'Content-Type': 'application/json'
        }
    })
    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
}

/* ================= 首页 ================= */

async function home() {
    let classes = []
    let list = []
    const initBody = {
        name: 'John',
        age: 31,
        city: 'New York'
    }
    const initData = await post(Init, initBody)
    const menu0ListMap = initData.data.menu0ListMap
    for (let i = 0; i < menu0ListMap.length; i++) {
        const menu2List = menu0ListMap[i].menu2List
        for (let item of menu2List) {
            classes.push({
                type_id: String(item.typeId2),
                type_name: item.typeName2
            })
        }
    }

    const html = await request(siteUrl + 'home.html')
    const $ = load(html)

    $('a.vodlist_thumb').each((_, el) => {
        try {
            let pic = $(el).attr('data-original')
            const url = $(el).attr('href')
            const name = $(el).attr('title')

            if (!pic.startsWith('http')) {
                pic = siteUrl + pic
            }

            const id = url.split('/')[2]

            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: pic
            })
        } catch (e) {}
    })

    return {
        class: classes,
        list: list
    }
}

/* ================= 分类 ================= */

async function category(inReq) {

    const tid = inReq.body.id
    const pg = inReq.body.page || 1

    const body = {
        command: 'WEB_GET_INFO',
        pageNumber: parseInt(pg),
        RecordsPage: 20,
        typeId: tid,
        typeMid: '1',
        languageType: 'CN',
        content: ''
    }

    const data = await post(cateUrl, body)

    const resultList = data.data.resultList

    let list = []

    for (let item of resultList) {
        const vod_name = item.vod_name.replace('yy8ycom', '')
        const vod_pic = item.vod_pic
        const id = vod_name + '#' + vod_pic

        list.push({
            vod_id: id,
            vod_name: vod_name,
            vod_pic: vod_pic
        })
    }

    return {
        page: parseInt(pg),
        pagecount: parseInt(pg) + 1,
        limit: 20,
        total: (parseInt(pg) + 1) * 20,
        list: list
    }
}

/* ================= 详情 ================= */

async function detail(inReq) {

    const ids = Array.isArray(inReq.body.id)
        ? inReq.body.id
        : [inReq.body.id]

    let videos = []

    for (const rawId of ids) {

        const vod_name = rawId.split('#')[0]
        const vod_pic = rawId.split('#')[1]

        const PlayUrl = vod_pic.replace('1.jpg', 'playlist.m3u8')

        videos.push({
            vod_id: vod_name,
            vod_name: vod_name,
            vod_pic: vod_pic,
            vod_play_from: '熊猫视频',
            vod_play_url: '播放$' + PlayUrl
        })
    }

    return {
        list: videos
    }
}

/* ================= 播放 ================= */

async function play(inReq) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer': siteUrl
        }
    }
}

/* ================= 搜索 ================= */

async function search(inReq) {

    const key = inReq.body.wd

    const body = {
        command: 'WEB_GET_INFO',
        pageNumber: 1,
        RecordsPage: 20,
        typeId: '0',
        typeMid: '1',
        languageType: 'CN',
        content: key,
        type: '1'
    }

    const data = await post(cateUrl, body)

    const resultList = data.data.resultList

    let list = []

    for (let item of resultList) {
        const vod_name = item.vod_name.replace('yy8ycom', '')
        const vod_pic = item.vod_pic
        const id = vod_name + '#' + vod_pic

        list.push({
            vod_id: id,
            vod_name: vod_name,
            vod_pic: vod_pic
        })
    }

    return {
        list: list
    }
}

export default {
    meta: {
        key: 'xmvideo',
        name: '🌸XMVideo',
        type: 3
    },
    api: async (fastify) => {
        fastify.post('/home', home)
        fastify.post('/category', category)
        fastify.post('/detail', detail)
        fastify.post('/play', play)
        fastify.post('/search', search)
    }
}