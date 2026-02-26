const defaultUrls = [
  "https://wogg.xxooo.cf",
  "https://wogg.333232.xyz",
  "https://woggpan.333232.xyz",
  "https://wogg.heshiheng.top",
  "https://www.wogg.one",
  "https://www.wogg.lol"
]

export const getCache = async (server) => {
  const obj = await server.db.getObjectDefault(`/wogg`, {})
  // 优先级：缓存->配置文件->兜底域名
  return obj?.urls || server.config.wogg?.urls || defaultUrls
}

export const setCache = async (server, value) => {
  await server.db.push(`/wogg/urls`, value);
}

export const removeCache = async (server) => {
  await server.db.delete(`/wogg/urls`);
}

export default async function wogg(fastify) {
  fastify.get('/urls', async (req, res) => {
    res.send({
      code: 0,
      data: await getCache(req.server)
    })
  })

  fastify.put('/urls', async (req, res) => {
    await setCache(req.server, req.body)
    res.send({
      code: 0,
    })
  })

  fastify.delete('/urls', async (req, res) => {
    await removeCache(req.server)
    res.send({
      code: 0,
    })
  })
}
