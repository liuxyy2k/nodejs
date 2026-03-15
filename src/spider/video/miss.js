import axios from "axios"
import { load } from "cheerio"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"

const DEFAULT_SITE = "https://missav.live"

const KEY_SITE = "/missavSite"
const KEY_COOKIE = "/missavCookie"


// ================= FlareSolverr 配置 =================

const FLARE_URL = 'http://192.168.0.102:8191/v1' 

// ================= 请求工具 =================

async function getSite(db){
    return DEFAULT_SITE
}

async function request(url){
    const body = {
        cmd: 'request.get',
        url: url,
        maxTimeout: 60000,
    }
    
    const resp = await axios.post(FLARE_URL, body, {
        timeout: 90000 // 比 maxTimeout 大一点
    })

    if(resp.data?.status !== 'ok'){
        throw new Error(`FlareSolverr 请求失败: ${resp.data?.message}`)
    }

    return resp.data.solution.response
}



// ================= init =================

async function init(){

    return {}

}



// ================= 首页 =================

async function home(inReq){

    const db = inReq.server.db

    const classes = [

        {type_id:"dm265/cn/chinese-subtitle",type_name:"中文字幕"},
        {type_id:"dm513/cn/new",type_name:"最近更新"},
        {type_id:"dm509/cn/release",type_name:"新作上市"},
        {type_id:"dm23/siro",type_name:"素人siro"},
        {type_id:"dm21/luxu",type_name:"素人luxu"},
        {type_id:"dm17/gana",type_name:"素人gana"},
        {type_id:"dm863/maan",type_name:"素人maan"},
        {type_id:"dm25/scute",type_name:"素人scute"},
        {type_id:"dm20/ara",type_name:"素人ara"},
        {type_id:"dm561/cn/uncensored-leak",type_name:"无码"},
        {type_id:"dm2469695/1pondo",type_name:"一本道"},
        {type_id:"dm291/today-hot",type_name:"今日热门"},
        {type_id:"dm168/cn/weekly-hot",type_name:"本周热门"},
        {type_id:"dm207/cn/monthly-hot",type_name:"本月热门"},
        {type_id:"dm95/cn/fc2",type_name:"FC2"},
        {type_id:"dm34/cn/madou",type_name:"麻豆"}

    ]


    let actors=[]

    try{

        actors = (await db.getData("/missavActors")||[])
            .filter(v=>v.enabled)
            .map(v=>v.name)

    }catch{}

    const filters = {}

    const options=[

        {
            key:"filt",
            name:"筛选",
            init:"all",
            value:[
                {n:"全部",v:"all"},
                {n:"单人作品",v:"individual"},
                {n:"多人作品",v:"multiple"},
                {n:"中文字幕",v:"chinese-subtitle"}
            ]
        },

        {
            key:"sort",
            name:"排序",
            init:"released_at",
            value:[
                {n:"发行时间",v:"released_at"},
                {n:"最近更新",v:"published_at"},
                {n:"收藏数",v:"saved"},
                {n:"今日浏览",v:"today_views"},
                {n:"本周浏览",v:"weekly_views"},
                {n:"本月浏览",v:"monthly_views"},
                {n:"总浏览",v:"views"}
            ]
        },

        {
            key:"actor",
            name:"演员",
            init:"all",
            value:[
                {n:"全部",v:"all"},
                ...actors.map(n=>({n,v:n}))
            ]
        }

    ]
    for(const c of classes){
        filters[c.type_id] = options
    }

    return {class:classes,filters}

}



// ================= 分类 =================

async function category(inReq){
    const db = inReq.server.db
    let id = inReq.body.id
    let page = inReq.body.page || 1
    const filters = inReq.body.filters || {}
    if(page===0) page=1

    if(filters.actor && filters.actor!=="all"){
        id = `cn/actresses/${encodeURIComponent(filters.actor)}`
    }
    if(filters.filt && filters.filt!=="all"){
        id += `?filters=${filters.filt}`
    }
    if(filters.sort){
        const sep = id.includes("?")?"&":"?"
        id += `${sep}sort=${filters.sort}`
    }
    id += id.includes("?")?`&page=${page}`:`?page=${page}`

    const site = await getSite(db)
    const html = await request(`${site}/${id}`,db)
    const $ = load(html)
    const list=[]


    $(".thumbnail").each((i,el)=>{
        const vod_id = $(el).find(".text-secondary").attr("href")
        const vod_name = $(el)
            .find(".text-secondary")
            .text()
            .trim()
            .replace(/\s+/g," ")
        const vod_pic = $(el)
            .find(".w-full")
            .attr("data-src")

        const vod_remarks = $(el)
            .find(".left-1")
            .text()
            .trim()

        const vod_duration = $(el)
            .find(".right-1")
            .text()
            .trim()

        list.push({
            vod_id,
            vod_name,
            vod_pic,
            vod_remarks,
            vod_duration
        })

    })


    return {
        page,
        pagecount:list.length<12?page:page+1,
        list
    }

}

// ================= 详情 =================

async function detail(inReq){
    const db = inReq.server.db
    const url = inReq.body.id
    const html = await request(url, db)
    const match = html.match(/nineyu\.com\\\/(.+)\\\/seek\\\/_0\.jpg/)
    const SURRIT = "https://surrit.com/"
    const PLAY = "/playlist.m3u8"
    const res = []

    if(match && match[1]){
        const uuid = match[1]
        let playUrl= SURRIT + uuid + PLAY
        const resp = await axios.get(playUrl, {
            headers: { 'User-Agent': UA },
        });
        const lines = resp.data.split("\n").filter(v => v.includes("/video.m3u8"))
        for(const line of lines){
            const name = line.trim().replace("/video.m3u8", "")
            const m = name.match(/(\d+)p|(\d+)x(\d+)/)
            if(!m) continue
            const r = parseInt(m[1] || m[3])
            res.push({
                name,
                resolution: r,
                url: `${SURRIT}${uuid}/${line.trim()}`
            })
        }
        
        // 从高到低排序
        res.sort((a, b) => b.resolution - a.resolution)
    }

    return {
        list:[{
            vod_id: url,
            vod_play_from: "MissAV",
            // 全部分辨率用 # 分隔，播放器会显示切换选项
            vod_play_url: res.map(v => `${v.name}$${v.url}`).join("#")
        }]
    }
}



// ================= 播放 =================

async function play(inReq){

    const db = inReq.server.db

    const site = await getSite(db)

    return {

        parse:0,

        url:inReq.body.id,

        header:{
            "User-Agent":UA,
            "Referer":site
        }

    }

}



// ================= 搜索 =================

async function search(inReq){

    const db = inReq.server.db

    let page = inReq.body.page || 1

    if(page===0) page=1

    const wd = encodeURIComponent(inReq.body.wd)

    const site = await getSite(db)

    const html = await request(`${site}/cn/search/${wd}?page=${page}`,db)

    const $ = load(html)

    const list=[]


    $(".thumbnail").each((i,el)=>{

        const vod_id = $(el).find(".text-secondary").attr("href")

        const vod_name = $(el)
            .find(".text-secondary")
            .text()
            .trim()
            .replace(/\s+/g," ")

        const vod_pic = $(el)
            .find(".w-full")
            .attr("data-src")

        const vod_remarks = $(el)
            .find(".left-1")
            .text()
            .trim()

        const vod_duration = $(el)
            .find(".right-1")
            .text()
            .trim()

        list.push({
            vod_id,
            vod_name,
            vod_pic,
            vod_remarks,
            vod_duration
        })

    })


    return {

        page,

        pagecount:list.length<12?page:page+1,

        list

    }

}



// ================= 导出 =================

export default {

    meta:{
        key:"missav",
        name:"MissAV",
        type:3
    },

    api: async (fastify)=>{

        fastify.post("/init",init)

        fastify.post("/home",home)

        fastify.post("/category",category)

        fastify.post("/detail",detail)

        fastify.post("/play",play)

        fastify.post("/search",search)

    }

}