const defaultUrls = [
  "http://123.666291.xyz",
  "https://mogg.5568.eu.org",
  "https://mo.91muou.icu",
  "https://mo.666291.xyz",
  "https://mo.muouso.fun"
]

export const getCache = async (server) => {
  const obj = await server.db.getObjectDefault(`/muou`, {})
  // 优先级：缓存->配置文件->兜底域名
  return obj?.urls || server.config.muou?.urls || defaultUrls
}

export const setCache = async (server, value) => {
  await server.db.push(`/muou/urls`, value);
}

export const removeCache = async (server) => {
  await server.db.delete(`/muou/urls`);
}

export default async function muou(fastify) {
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
