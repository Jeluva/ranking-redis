# ranking-redis

API HTTP chica de **ranking (leaderboard)** hecha con Node.js y Redis. Es un **proyecto de práctica** para aprender estructuras de Redis; no está pensado para producción (no tiene autenticación ni persistencia configurada).

## Qué hace

- **Sumar puntos** a un jugador de un juego (`ZINCRBY`) y devolver su puntaje total y posición.
- **Top N** de un juego, de mayor a menor (`ZRANGE ... REV WITHSCORES`).
- **Posición de un jugador** y sus vecinos (los 2 de arriba y los 2 de abajo).
- **Borrar** el ranking de un juego.
- **Rate limiting** por IP con ventana fija (`INCR` + `EXPIRE`): 60 pedidos por minuto, responde `429` con `Retry-After` si se pasa.

Cada juego es un sorted set `ranking:<juego>`. Nombres válidos: 1 a 32 caracteres (letras, números, `_`, `.`, `-`).

## Requisitos

- Node.js 20+ y un Redis accesible (probado con Redis 7.0 y Node 22).

## Cómo correrlo

```bash
npm install
redis-server --port 6379 &          # o usá un Redis que ya tengas
npm start                            # http://localhost:3000
```

Variables opcionales: `PORT` (3000) y `REDIS_URL` (`redis://127.0.0.1:6379`).

## Endpoints

```bash
# sumar puntos
curl -XPOST localhost:3000/juegos/tetris/puntos -d '{"jugador":"ana","puntos":120}'
# top 5
curl 'localhost:3000/juegos/tetris/top?n=5'
# posición y vecinos
curl localhost:3000/juegos/tetris/jugadores/ana
# borrar el ranking del juego
curl -XDELETE localhost:3000/juegos/tetris
```

## Tests

```bash
npm test
```

Levantan su propio `redis-server` en el puerto 6390 (tiene que estar en el PATH) y prueban sumar puntos, top, vecinos, validación y rate limit.

## Estructura

- `src/ranking.js`: lógica sobre Redis.
- `src/server.js`: servidor HTTP (módulo `http` de Node) y rutas.
- `test/ranking.test.js`: tests con `node:test`.
