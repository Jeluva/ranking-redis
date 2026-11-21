// Logica del ranking sobre Redis. Cada juego es un sorted set: ranking:<juego>
const key = (juego) => `ranking:${juego}`;

export function validarNombre(valor, campo) {
  if (typeof valor !== "string" || !/^[\w.-]{1,32}$/.test(valor)) {
    throw new ErrorValidacion(`${campo} invalido (1-32 caracteres: letras, numeros, _ . -)`);
  }
  return valor;
}

export class ErrorValidacion extends Error {}

// Suma puntos al jugador (ZINCRBY) y devuelve su puntaje total y posicion.
export async function sumarPuntos(redis, juego, jugador, puntos) {
  validarNombre(juego, "juego");
  validarNombre(jugador, "jugador");
  if (!Number.isFinite(puntos)) throw new ErrorValidacion("puntos debe ser un numero");
  const total = await redis.zIncrBy(key(juego), puntos, jugador);
  return { jugador, puntos: total, posicion: await posicion(redis, juego, jugador) };
}

// Top N de mayor a menor (ZRANGE REV WITHSCORES).
export async function top(redis, juego, n = 10) {
  validarNombre(juego, "juego");
  const filas = await redis.zRangeWithScores(key(juego), 0, n - 1, { REV: true });
  return filas.map((f, i) => ({ posicion: i + 1, jugador: f.value, puntos: f.score }));
}

// Posicion (1 = primero) y puntaje de un jugador, o null si no existe.
export async function posicion(redis, juego, jugador) {
  validarNombre(juego, "juego");
  validarNombre(jugador, "jugador");
  const [rank] = await Promise.all([
    redis.zRevRank(key(juego), jugador),
  ]);
  return rank === null ? null : rank + 1;
}

// Jugadores vecinos (n arriba y n abajo) para mostrar "tu zona" del ranking.
export async function vecinos(redis, juego, jugador, n = 2) {
  const pos = await posicion(redis, juego, jugador);
  if (pos === null) return null;
  const desde = Math.max(0, pos - 1 - n);
  const filas = await redis.zRangeWithScores(key(juego), desde, pos - 1 + n, { REV: true });
  return filas.map((f, i) => ({ posicion: desde + i + 1, jugador: f.value, puntos: f.score }));
}

export async function borrar(redis, juego) {
  validarNombre(juego, "juego");
  return (await redis.del(key(juego))) === 1;
}

// Rate limit de ventana fija: max pedidos por ventana (segundos) por clave.
export async function limitar(redis, id, max, ventana) {
  const k = `limite:${id}`;
  const usados = await redis.incr(k);
  if (usados === 1) await redis.expire(k, ventana);
  const ttl = await redis.ttl(k);
  return { permitido: usados <= max, restantes: Math.max(0, max - usados), reintentarEn: ttl };
}
