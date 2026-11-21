import http from "node:http";
import { createClient } from "redis";
import * as r from "./ranking.js";

export function crearServidor(redis, { max = 60, ventana = 60 } = {}) {
  return http.createServer(async (req, res) => {
    const enviar = (codigo, cuerpo) => {
      res.writeHead(codigo, { "content-type": "application/json" });
      res.end(JSON.stringify(cuerpo));
    };
    try {
      const lim = await r.limitar(redis, req.socket.remoteAddress, max, ventana);
      res.setHeader("x-ratelimit-remaining", lim.restantes);
      if (!lim.permitido) {
        res.setHeader("retry-after", lim.reintentarEn);
        return enviar(429, { error: "demasiados pedidos", reintentarEn: lim.reintentarEn });
      }
      const url = new URL(req.url, "http://x");
      const [, base, juego, jugador, extra] = url.pathname.split("/").map(decodeURIComponent);
      if (base !== "juegos" || !juego) return enviar(404, { error: "no encontrado" });

      // POST /juegos/:juego/puntos  {"jugador": "ana", "puntos": 50}
      if (req.method === "POST" && jugador === "puntos") {
        let texto = "";
        for await (const c of req) texto += c;
        let datos;
        try { datos = JSON.parse(texto); } catch { throw new r.ErrorValidacion("JSON invalido"); }
        return enviar(200, await r.sumarPuntos(redis, juego, datos.jugador, datos.puntos));
      }
      // GET /juegos/:juego/top?n=10
      if (req.method === "GET" && jugador === "top") {
        const n = Math.min(100, Math.max(1, Number(url.searchParams.get("n")) || 10));
        return enviar(200, await r.top(redis, juego, n));
      }
      // GET /juegos/:juego/jugadores/:jugador  (y /vecinos)
      if (req.method === "GET" && jugador === "jugadores" && extra) {
        const pos = await r.posicion(redis, juego, extra);
        if (pos === null) return enviar(404, { error: "jugador sin puntos" });
        const cerca = await r.vecinos(redis, juego, extra);
        return enviar(200, { jugador: extra, posicion: pos, cerca });
      }
      // DELETE /juegos/:juego
      if (req.method === "DELETE" && !jugador) {
        return enviar(200, { borrado: await r.borrar(redis, juego) });
      }
      enviar(404, { error: "no encontrado" });
    } catch (e) {
      if (e instanceof r.ErrorValidacion) return enviar(400, { error: e.message });
      console.error(e);
      enviar(500, { error: "error interno" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const redis = createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" });
  redis.on("error", (e) => console.error("redis:", e.message));
  await redis.connect();
  const puerto = Number(process.env.PORT) || 3000;
  crearServidor(redis).listen(puerto, () => console.log(`Ranking en http://localhost:${puerto}`));
}
