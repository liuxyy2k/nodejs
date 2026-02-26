const getCache = async (server, key, defaultValue) => {
  const obj = await server.db.getObjectDefault(`/tgchannel`, {})
  // 优先级：缓存->配置文件->兜底域名
  return obj?.[key] || server.config.tgchannel[key] || defaultValue
}

export const getUrlCache = (server) => {
  return getCache(server, 'url', 'https://t.me')
}

export const getCountCache = (server) => {
  return getCache(server, 'count', 4)
}

export const getChannelUsernameCache = (server) => {
  return getCache(server, 'channelUsername', 'Q66Share,alyp_TV,ucpanpan,ucquark,tianyirigeng,hao115,guaguale115,ydypzyfx,tgsearchers,NewQuark,dianyingshare,XiangxiuNB,yunpanpan,kuakeyun,Quark_Movies,qixingzhenren,longzbija,alyp_4K_Movies,yunpanshare,shareAliyun,alyp_1,xx123pan')
}

export const getHomeChannelUsernameCache = (server) => {
  return getCache(server, 'homeChannelUsername', 'alyp_TV,ucquark,tianyirigeng,ydypzyfx')
}

export const setCache = async (server, key, value) => {
  await server.db.push(`/tgchannel/${key}`, value);
}

export default async function tgchannel(fastify) {
  fastify.get('/config', async (req, res) => {
    const url = await getUrlCache(req.server)
    const count = await getCountCache(req.server)
    const channelUsername = await getChannelUsernameCache(req.server)
    const homeChannelUsername = await getHomeChannelUsernameCache(req.server)
    res.send({
      code: 0,
      data: {
        url,
        count: Number(count),
        channelUsername: channelUsername.split(','),
        homeChannelUsername: homeChannelUsername.split(','),
      }
    })
  })

  fastify.put('/config', async (req, res) => {
    await setCache(req.server, 'url', req.body.url)
    await setCache(req.server, 'count', req.body.count)
    await setCache(req.server, 'channelUsername', req.body.channelUsername.join(','))
    await setCache(req.server, 'homeChannelUsername', req.body.homeChannelUsername.join(','))
    res.send({
      code: 0,
    })
  })
}