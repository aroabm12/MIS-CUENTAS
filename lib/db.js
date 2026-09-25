import { neon } from "@neondatabase/serverless";

// Vercel inyecta esta variable automáticamente cuando conectas
// la integración de Neon Postgres desde la pestaña "Storage".
// Se crea de forma perezosa (no al cargar el módulo) para que
// `next build` no falle si la variable aún no existe en ese momento.
let _sql = null;
export function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "Falta DATABASE_URL. Conecta la base de datos Neon desde la pestaña Storage de tu proyecto en Vercel."
      );
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
export const sql = (...args) => getSql()(...args);

let ready = false;

const GASTOS_FIJOS_INICIALES = [
  ["Coche", 150.0, "1"],
  ["Gimnasio", 40.0, "1"],
  ["Parking", 60.0, "1-5"],
  ["Plan Metal", 16.0, "5"],
  ["Hevy", 3.5, "8"],
  ["Claude", 17.61, "11"],
  ["Apple", 10.0, "12"],
  ["Uñas manos", 22.0, "variable"],
  ["Cejas", 11.0, "~24"],
  ["Podimo (mamá)", 5.0, "26"],
  ["Disney+", 11.0, "26"],
  ["Uñas pie", 25.0, "mes sí / mes no"],
];

// Crea las tablas y los datos iniciales la primera vez que se
// necesitan. No hace falta ejecutar nada a mano.
export async function ensureSchema() {
  if (ready) return;
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS movimientos (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      concepto TEXT NOT NULL,
      gasto NUMERIC(10,2) NOT NULL DEFAULT 0,
      ingreso NUMERIC(10,2) NOT NULL DEFAULT 0,
      creado_en TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor NUMERIC(10,2) NOT NULL
    );
  `;
  await sql`
    INSERT INTO config (clave, valor) VALUES ('saldo_inicial', 0)
    ON CONFLICT (clave) DO NOTHING;
  `;
  await sql`
    INSERT INTO config (clave, valor) VALUES ('meta_min', 450)
    ON CONFLICT (clave) DO NOTHING;
  `;
  await sql`
    INSERT INTO config (clave, valor) VALUES ('meta_max', 500)
    ON CONFLICT (clave) DO NOTHING;
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS gastos_fijos (
      id SERIAL PRIMARY KEY,
      concepto TEXT NOT NULL,
      importe NUMERIC(10,2) NOT NULL DEFAULT 0,
      dia TEXT NOT NULL DEFAULT '',
      orden INT NOT NULL DEFAULT 0
    );
  `;
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM gastos_fijos`;
  if (count === 0) {
    for (let i = 0; i < GASTOS_FIJOS_INICIALES.length; i++) {
      const [concepto, importe, dia] = GASTOS_FIJOS_INICIALES[i];
      await sql`
        INSERT INTO gastos_fijos (concepto, importe, dia, orden)
        VALUES (${concepto}, ${importe}, ${dia}, ${i})
      `;
    }
  }
  ready = true;
}
