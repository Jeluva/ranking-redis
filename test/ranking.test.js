import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createClient } from "redis";
import { crearServidor } from "../src/server.js";

const PUERTO_REDIS = 6390;
let proc, redis, srv, base;

before(async () => {
  proc = spawn("redis-server", ["--port", PUERTO_REDIS, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  redis = createClient({ url: `redis://127.0.0.1:${PUERTO_REDIS}`, socket: { reconnectStrategy: (n) => (n > 20 ? false : 100) } });
  redis.on("error", () => {});
  await redis.connect();
  srv = crearServidor(redis, { max: 20, ventana: 60 });
  await new Promise((ok) => srv.listen(0, ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});

after(async () => {
  srv.close();
  await redis.quit();
  proc.kill();
});

const post = (ruta, cuerpo) => fetch(base + ruta, { method: "POST", body: JSON.stringify(cuerpo) });

test("suma puntos, ordena el top y da posicion", async () => {
  await post("/juegos/t1/puntos", { jugador: "ana", puntos: 50 });
  await post("/juegos/t1/puntos", { jugador: "beto", puntos: 80 });
  const r = await (await post("/juegos/t1/puntos", { jugador: "ana", puntos: 40 })).json();
  assert.deepEqual(r, { jugador: "ana", puntos: 90, posicion: 1 });
  const top = await (await fetch(base + "/juegos/t1/top?n=2")).json();
  assert.deepEqual(top.map((x) => x.jugador), ["ana", "beto"]);
});

test("vecinos y jugador inexistente", async () => {
  const j = await (await fetch(base + "/juegos/t1/jugadores/beto")).json();
  assert.equal(j.posicion, 2);
  assert.equal(j.cerca.length, 2);
  assert.equal((await fetch(base + "/juegos/t1/jugadores/nadie")).status, 404);
});

test("valida entrada", async () => {
  assert.equal((await post("/juegos/t1/puntos", { jugador: "x y", puntos: 1 })).status, 400);
  assert.equal((await post("/juegos/t1/puntos", { jugador: "ok", puntos: "mucho" })).status, 400);
});

test("rate limit devuelve 429 al pasarse", async () => {
  await redis.flushAll();
  let ultimo;
  for (let i = 0; i < 22; i++) ultimo = await fetch(base + "/juegos/t1/top");
  assert.equal(ultimo.status, 429);
  assert.ok(ultimo.headers.get("retry-after"));
});
