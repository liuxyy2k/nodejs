import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const baseUrl = 'http://api.hclyz.com:81/mf'

async function request(url) {

    const resp = await axios.get(url,{
        headers:{'User-Agent':UA}
    })

    return resp.data
}

async function init() {
    return {}
}


async function home() {

    return {

        class:[
            {
                type_name:'色播聚合',
                type_id:'/json.txt'
            }
        ],

        filters:{}

    }

}


async function category(inReq) {

    const pg = parseInt(inReq.body.page) || 1

    const json = await request(`${baseUrl}/json.txt`)

    const data = json.pingtai.slice(1)

    const list = data
        .sort((a,b)=>Number(b.Number)-Number(a.Number))
        .map(item=>({

            vod_id:'/'+item.address,

            vod_name:item.title,

            vod_pic:item.xinimg.replace(
                "http://cdn.gcufbd.top/img/",
                "https://gh-proxy.org/https://raw.githubusercontent.com/fish2018/lib/refs/heads/main/imgs/"
            ),

            vod_remarks:item.Number,

            style:{type:'rect',ratio:1.33}

        }))

    return {

        page:pg,

        pagecount:1,

        limit:list.length,

        total:list.length,

        list

    }

}


async function detail(inReq) {

    const id = inReq.body.id

    const data = await request(`${baseUrl}/${id}`)

    const zhubo = data.zhubo

    const playUrls = zhubo
        .map(v=>`${v.title}$${v.address}`)
        .join('#')

    return {

        list:[
            {

                vod_play_from:'sebo',

                vod_play_url:playUrls,

                vod_content:'https://github.com/fish2018'

            }
        ]

    }

}


async function play(inReq) {

    return {

        parse:0,

        url:inReq.body.id,

        header:{
            'User-Agent':UA
        }

    }

}


async function search() {
    return {list:[]}
}


export default {

    meta:{
        key:'sebo',
        name:'🔴色播聚合',
        type:3
    },

    api: async(fastify)=>{

        fastify.post('/init',init)

        fastify.post('/home',home)

        fastify.post('/category',category)

        fastify.post('/detail',detail)

        fastify.post('/play',play)

        fastify.post('/search',search)

    }

}
