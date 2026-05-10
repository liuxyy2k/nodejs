import axios from 'axios'
import { load } from 'cheerio'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const site = 'https://jptt.tv'

async function request(url) {
    const resp = await axios.get(url,{
        headers:{'User-Agent':UA}
    })
    return resp.data
}


function extractVideoUrl(html){

    let m = html.match(/<source\s+src="([^"]+)"/)

    if(m){
        let url = m[1]
        if(url.startsWith('//')) url = 'https:' + url
        return url
    }

    const patterns = [
        /https?:\/\/[^"']+\.m3u8[^"']*/,
        /\/\/cdn-[^"']+\.m3u8[^"']*/,
        /\/hlsredirect\/[^"']+\.m3u8/
    ]

    for(const p of patterns){
        const r = html.match(p)
        if(r){
            let url = r[0]
            if(url.startsWith('//')) return 'https:' + url
            if(url.startsWith('/')) return site + url
            return url
        }
    }

    return ''
}


async function init(){
    return {}
}


async function home(){

    const cateManual = {
        "中文":"278",
        "巨乳":"15",
        "熟女":"95",
        "騎乘位":"74",
        "口交":"34",
        "癡女":"75",
        "潮吹":"32",
        "企劃片":"84",
        "美尻":"156",
        "打手槍":"98",
        "制服":"19",
        "美腿":"157",
        "絲襪":"115",
        "爆乳":"483",
        "女教師":"131",
        "護士":"283",
        "人妻":"26"
    }

    const classes = []

    for(const k in cateManual){

        classes.push({
            type_id:cateManual[k],
            type_name:k
        })

    }

    return {
        class:classes,
        filters:{}
    }
}


async function category(inReq){

    const tid = inReq.body.id
    const page = inReq.body.page || 1

    const url = `${site}/tag_list?tid=${tid}&idx=${page}`

    const html = await request(url)

    const $ = load(html)

    const list = []

    $('.oneVideo').each((i,e)=>{

        const name = $(e).find('h3').text().trim()

        let pic = $(e).find('img').attr('src') || ''

        if(pic && !pic.startsWith('http')) pic = site + pic

        const desc = $(e).find('.p_duration').text().trim()

        const link = $(e).find('a').attr('href')

        if(name && link){

            list.push({

                vod_name:name,
                vod_pic:pic,
                vod_remarks:desc,
                vod_id:link

            })

        }

    })

    return {

        page,
        pagecount:9999,
        limit:90,
        total:999999,
        list

    }
}


async function detail(inReq){

    const id = inReq.body.id

    const url = id.startsWith('http') ? id : site + id

    const html = await request(url)

    const $ = load(html)

    const title = $('h1.h1_title').text().trim()

    let pic = $('video').attr('poster') || ''

    if(pic && !pic.startsWith('http')) pic = site + pic

    const desc = $('.info_original p').first().text().trim() || title

    const playUrl = extractVideoUrl(html)

    return {

        list:[{

            vod_id:id,
            vod_name:title,
            vod_pic:pic,
            vod_content:desc,
            vod_play_from:'禁片天堂',
            vod_play_url:`播放$${playUrl}`

        }]

    }
}


async function play(inReq){

    const id = inReq.body.id

    if(id.includes('.m3u8')){

        return{

            parse:0,
            url:id,
            header:{
                'User-Agent':UA,
                'Referer':site,
                'Origin':site
            }

        }

    }

    const html = await request(site + id)

    const url = extractVideoUrl(html)

    return{

        parse:0,
        url,
        header:{
            'User-Agent':UA,
            'Referer':site,
            'Origin':site
        }

    }

}


async function search(inReq){

    const key = encodeURIComponent(inReq.body.wd || '')

    const html = await request(`${site}/search?kw=${key}`)

    const $ = load(html)

    const list = []

    $('.oneVideo').each((i,e)=>{

        const name = $(e).find('h3').text().trim()

        let pic = $(e).find('img').attr('src') || ''

        if(pic && !pic.startsWith('http')) pic = site + pic

        const desc = $(e).find('.p_duration').text().trim()

        const link = $(e).find('a').attr('href')

        if(name && link){

            list.push({

                vod_name:name,
                vod_pic:pic,
                vod_remarks:desc,
                vod_id:link

            })

        }

    })

    return { list }

}


export default {

    meta:{
        key:'jptt',
        name:'🔥禁片天堂',
        type:3
    },

    api:async (fastify)=>{

        fastify.post('/init',init)

        fastify.post('/home',home)

        fastify.post('/category',category)

        fastify.post('/detail',detail)

        fastify.post('/play',play)

        fastify.post('/search',search)

    }

}