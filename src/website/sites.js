export const getCache = async (server) => {
  const obj = await server.db.getObjectDefault(`/sites`, {})
  return obj?.list || server.config.sites.list
}

export const setCache = async (server, value) => {
  await server.db.push(`/sites/list`, value);
}

export const removeCache = async (server) => {
  await server.db.delete(`/sites/list`);
}

export default async function sites(fastify) {
  fastify.get('/list', async (req, res) => {
    res.send({
      code: 0,
      data: await getCache(req.server)
    })
  })

  fastify.put('/list', async (req, res) => {
    await setCache(req.server, req.body.list)
    res.send({
      code: 0,
    })
  })

  fastify.delete('/list', async (req, res) => {
    await removeCache(req.server)
    res.send({
      code: 0,
    })
  })
}
