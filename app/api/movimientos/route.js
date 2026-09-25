export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, ensureSchema } from "../../../lib/db";
import { conManejoErrores } from "../../../lib/api-utils";

export const GET = conManejoErrores(async function GET() {
  await ensureSchema();
  const rows = await sql`
    SELECT id, fecha, concepto, gasto, ingreso
    FROM movimientos
    ORDER BY fecha ASC, id ASC
  `;
  const [{ valor: saldoInicial }] = await sql`
    SELECT valor FROM config WHERE clave = 'saldo_inicial'
  `;
  return NextResponse.json({ movimientos: rows, saldoInicial: Number(saldoInicial) });
});

export const POST = conManejoErrores(async function POST(request) {
  await ensureSchema();
  const body = await request.json();
  const { fecha, concepto, gasto, ingreso } = body;
  if (!fecha || !concepto) {
    return NextResponse.json({ error: "Falta fecha o concepto" }, { status: 400 });
  }
  const [row] = await sql`
    INSERT INTO movimientos (fecha, concepto, gasto, ingreso)
    VALUES (${fecha}, ${concepto}, ${Number(gasto) || 0}, ${Number(ingreso) || 0})
    RETURNING id, fecha, concepto, gasto, ingreso
  `;
  return NextResponse.json({ movimiento: row });
});

export const DELETE = conManejoErrores(async function DELETE(request) {
  await ensureSchema();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  await sql`DELETE FROM movimientos WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
});
