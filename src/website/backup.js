import dayjs from "dayjs";

export default async function backup(fastify) {
  fastify.get('/', async (req, res) => {
    res.header('Content-Disposition', `attachment; filename="config.${dayjs().format('YYYY-MM-DD')}.json"`);
    const data = await req.server.db.getData("/")
    res.send(JSON.stringify(data, null, 4));
  })

  fastify.put('/', async (req, res) => {
    await req.server.db.push("/", req.body);
    res.send({ code: 0 })
  })
}