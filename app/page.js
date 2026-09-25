"use client";
import { useEffect, useMemo, useState } from "react";

function money(n) {
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function mismoMes(fechaStr, ref) {
  const d = new Date(fechaStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

// Comprueba si un campo "día" (p.ej. "1", "1-5", "26", "variable") coincide
// con el día del mes de hoy. Los días aproximados/variables no se marcan
// automáticamente como "hoy" porque no se puede saber con certeza.
function diaEsHoy(diaStr, diaHoy) {
  if (!diaStr) return false;
  const limpio = diaStr.trim();
  if (/^\d+$/.test(limpio)) {
    return Number(limpio) === diaHoy;
  }
  const rango = limpio.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rango) {
    const [, a, b] = rango;
    return diaHoy >= Number(a) && diaHoy <= Number(b);
  }
  return false;
}

// Para emparejar un movimiento con una categoría variable usamos la
// primera palabra del nombre de la categoría (p.ej. "Comida / supermercado"
// -> "comida"), porque el concepto que escribes suele ser más corto.
function palabraClave(concepto) {
  return concepto.split("/")[0].split(" y ")[0].trim().toLowerCase();
}

export default function Home() {
  const hoy = useMemo(() => new Date(), []);
  const [movimientos, setMovimientos] = useState([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [config, setConfig] = useState({ meta_min: 450, meta_max: 500 });
  const [gastosFijos, setGastosFijos] = useState([]);
  const [ingresosFijos, setIngresosFijos] = useState([]);
  const [presupuestoVariable, setPresupuestoVariable] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [nuevoSaldoInicial, setNuevoSaldoInicial] = useState("");
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaMinInput, setMetaMinInput] = useState("");
  const [metaMaxInput, setMetaMaxInput] = useState("");

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [tipo, setTipo] = useState("gasto");

  const [mostrarGestion, setMostrarGestion] = useState(false);
  const [nuevoGF, setNuevoGF] = useState({ concepto: "", importe: "", dia: "" });
  const [mostrarGestionIng, setMostrarGestionIng] = useState(false);
  const [nuevoIF, setNuevoIF] = useState({ concepto: "", importe: "", dia: "" });
  const [mostrarGestionVar, setMostrarGestionVar] = useState(false);
  const [nuevaCat, setNuevaCat] = useState({ concepto: "", importe: "" });
  const [error, setError] = useState("");

  async function cargarTodo() {
    setLoading(true);
    setError("");
    try {
      const [rMov, rCfg, rGF, rIF, rVar] = await Promise.all([
        fetch("/api/movimientos"),
        fetch("/api/config"),
        fetch("/api/gastos-fijos"),
        fetch("/api/ingresos-fijos"),
        fetch("/api/presupuesto-variable"),
      ]);
      for (const r of [rMov, rCfg, rGF, rIF, rVar]) {
        if (!r.ok) throw new Error(`Error ${r.status} cargando datos`);
      }
      const dMov = await rMov.json();
      const dCfg = await rCfg.json();
      const dGF = await rGF.json();
      const dIF = await rIF.json();
      const dVar = await rVar.json();
      setMovimientos(dMov.movimientos);
      setSaldoInicial(dMov.saldoInicial);
      setConfig(dCfg);
      setGastosFijos(dGF.gastosFijos);
      setIngresosFijos(dIF.ingresosFijos);
      setPresupuestoVariable(dVar.presupuestoVariable);
    } catch (err) {
      console.error(err);
      setError("No se ha podido cargar: " + err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  let saldo = saldoInicial;
  const filas = movimientos.map((m) => {
    saldo = saldo - Number(m.gasto) + Number(m.ingreso);
    return { ...m, saldo };
  });
  const saldoActual = filas.length ? filas[filas.length - 1].saldo : saldoInicial;

  const movDelMes = filas.filter((m) => mismoMes(m.fecha, hoy));
  const ingresosMes = movDelMes.reduce((s, m) => s + Number(m.ingreso), 0);
  const gastosMes = movDelMes.reduce((s, m) => s + Number(m.gasto), 0);
  const ahorroRealMes = ingresosMes - gastosMes;
  const metaMin = Number(config.meta_min ?? 450);
  const metaMax = Number(config.meta_max ?? 500);
  const enMeta = ahorroRealMes >= metaMin;

  const gastosFijosConEstado = gastosFijos.map((gf) => {
    const registrado = movDelMes.some(
      (m) =>
        Number(m.gasto) > 0 &&
        m.concepto.toLowerCase().includes(gf.concepto.toLowerCase())
    );
    return { ...gf, registrado };
  });

  const diaHoy = hoy.getDate();
  const gastosHoy = gastosFijosConEstado.filter((gf) => diaEsHoy(gf.dia, diaHoy) && !gf.registrado);
  const ingresosHoy = ingresosFijos.filter((iff) => {
    const yaRegistrado = movDelMes.some(
      (m) => Number(m.ingreso) > 0 && m.concepto.toLowerCase().includes(iff.concepto.toLowerCase())
    );
    return diaEsHoy(iff.dia, diaHoy) && !yaRegistrado;
  });

  const variablesConGasto = presupuestoVariable.map((cat) => {
    const clave = palabraClave(cat.concepto);
    const gastado = movDelMes
      .filter((m) => Number(m.gasto) > 0 && m.concepto.toLowerCase().includes(clave))
      .reduce((s, m) => s + Number(m.gasto), 0);
    const presupuestado = Number(cat.importe);
    const resta = presupuestado - gastado;
    const porcentaje = presupuestado > 0 ? Math.min(100, (gastado / presupuestado) * 100) : gastado > 0 ? 100 : 0;
    return { ...cat, gastado, resta, porcentaje };
  });

  async function guardarMovimiento(e) {
    e.preventDefault();
    if (!concepto || !importe) return;
    setError("");
    try {
      const res = await fetch("/api/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          concepto,
          gasto: tipo === "gasto" ? importe : 0,
          ingreso: tipo === "ingreso" ? importe : 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status} al guardar`);
      }
      setConcepto("");
      setImporte("");
      cargarTodo();
    } catch (err) {
      console.error(err);
      setError("No se ha podido guardar: " + err.message);
    }
  }

  async function registrarRapido(gf) {
    await fetch("/api/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: new Date().toISOString().slice(0, 10),
        concepto: gf.concepto,
        gasto: gf.importe,
        ingreso: 0,
      }),
    });
    cargarTodo();
  }

  async function registrarIngresoRapido(iff) {
    await fetch("/api/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: new Date().toISOString().slice(0, 10),
        concepto: iff.concepto,
        gasto: 0,
        ingreso: iff.importe,
      }),
    });
    cargarTodo();
  }

  async function borrar(id) {
    await fetch(`/api/movimientos?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function guardarSaldoInicial() {
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saldo_inicial: Number(nuevoSaldoInicial) }),
    });
    setEditandoSaldo(false);
    cargarTodo();
  }

  async function guardarMeta() {
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta_min: Number(metaMinInput),
        meta_max: Number(metaMaxInput),
      }),
    });
    setEditandoMeta(false);
    cargarTodo();
  }

  async function actualizarGF(gf) {
    await fetch("/api/gastos-fijos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gf),
    });
    cargarTodo();
  }

  async function borrarGF(id) {
    await fetch(`/api/gastos-fijos?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function anadirGF(e) {
    e.preventDefault();
    if (!nuevoGF.concepto) return;
    await fetch("/api/gastos-fijos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevoGF),
    });
    setNuevoGF({ concepto: "", importe: "", dia: "" });
    cargarTodo();
  }

  async function actualizarIF(iff) {
    await fetch("/api/ingresos-fijos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(iff),
    });
    cargarTodo();
  }

  async function borrarIF(id) {
    await fetch(`/api/ingresos-fijos?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function anadirIF(e) {
    e.preventDefault();
    if (!nuevoIF.concepto) return;
    await fetch("/api/ingresos-fijos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevoIF),
    });
    setNuevoIF({ concepto: "", importe: "", dia: "" });
    cargarTodo();
  }

  async function actualizarCat(cat) {
    await fetch("/api/presupuesto-variable", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cat),
    });
    cargarTodo();
  }

  async function borrarCat(id) {
    await fetch(`/api/presupuesto-variable?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function anadirCat(e) {
    e.preventDefault();
    if (!nuevaCat.concepto) return;
    await fetch("/api/presupuesto-variable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevaCat),
    });
    setNuevaCat({ concepto: "", importe: "" });
    cargarTodo();
  }

  const nombreMes = hoy.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  return (
    <div className="container">
      <h1>Mis Cuentas</h1>
      <p className="subtitle">Tarjeta y ahorro, todo junto en un solo número.</p>

      {error && (
        <div className="card error-msg" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="card saldo-actual">
        <div className="label">Tienes ahora mismo</div>
        <div className="valor">{loading ? "…" : money(saldoActual)}</div>
        {!editandoSaldo ? (
          <div className="editar-saldo" style={{ justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => {
                setNuevoSaldoInicial(String(saldoInicial));
                setEditandoSaldo(true);
              }}
              style={{ background: "transparent", color: "#2f5496" }}
            >
              Corregir saldo de partida
            </button>
          </div>
        ) : (
          <div className="editar-saldo" style={{ justifyContent: "center" }}>
            <input
              type="number"
              step="0.01"
              value={nuevoSaldoInicial}
              onChange={(e) => setNuevoSaldoInicial(e.target.value)}
            />
            <button type="button" onClick={guardarSaldoInicial}>Guardar</button>
          </div>
        )}
      </div>

      <div className={"card tarjeta-hoy" + (ingresosHoy.length || gastosHoy.length ? " con-eventos" : "")}>
        <strong style={{ textTransform: "capitalize" }}>
          Hoy, {hoy.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
        </strong>
        {ingresosHoy.length === 0 && gastosHoy.length === 0 ? (
          <p className="subtitle" style={{ margin: "8px 0 0" }}>
            No tienes ningún ingreso ni gasto fijo previsto para hoy.
          </p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {ingresosHoy.map((iff) => (
              <div key={"ing-" + iff.id} className="hoy-item ingreso">
                <span>🎉 Hoy cobras: {iff.concepto}</span>
                <span className="gf-right">
                  {money(iff.importe)}
                  <button type="button" className="mini-btn" onClick={() => registrarIngresoRapido(iff)}>
                    Apuntar
                  </button>
                </span>
              </div>
            ))}
            {gastosHoy.map((gf) => (
              <div key={"gas-" + gf.id} className="hoy-item gasto">
                <span>💸 Hoy se te cobra: {gf.concepto}</span>
                <span className="gf-right">
                  {money(gf.importe)}
                  <button type="button" className="mini-btn" onClick={() => registrarRapido(gf)}>
                    Apuntar
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={"card resumen-mes" + (enMeta ? " en-meta" : " fuera-meta")}>
        <div className="resumen-mes-header">
          <strong style={{ textTransform: "capitalize" }}>{nombreMes}</strong>
          <span className={"pill" + (enMeta ? " verde" : " rojo")}>
            {enMeta ? "Vas bien de ahorro" : "Por debajo de tu meta"}
          </span>
        </div>
        <div className="resumen-grid">
          <div>
            <div className="label">Ingresos</div>
            <div className="cifra">{money(ingresosMes)}</div>
          </div>
          <div>
            <div className="label">Gastos</div>
            <div className="cifra">{money(gastosMes)}</div>
          </div>
          <div>
            <div className="label">Ahorro real</div>
            <div className="cifra">{money(ahorroRealMes)}</div>
          </div>
        </div>
        {!editandoMeta ? (
          <div className="meta-linea">
            Tu meta: entre {money(metaMin)} y {money(metaMax)}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMetaMinInput(String(metaMin));
                setMetaMaxInput(String(metaMax));
                setEditandoMeta(true);
              }}
            >
              editar
            </button>
          </div>
        ) : (
          <div className="editar-saldo">
            <input type="number" step="1" value={metaMinInput} onChange={(e) => setMetaMinInput(e.target.value)} />
            <span>—</span>
            <input type="number" step="1" value={metaMaxInput} onChange={(e) => setMetaMaxInput(e.target.value)} />
            <button type="button" onClick={guardarMeta}>Guardar</button>
          </div>
        )}
      </div>

      <div className="card">
        <strong>Gastos fijos de este mes</strong>
        <p className="subtitle" style={{ margin: "6px 0 12px" }}>
          Toca uno pendiente para apuntarlo con un clic (usa el importe de siempre y la fecha de hoy).
        </p>
        {gastosFijosConEstado.map((gf) => (
          <div key={gf.id} className={"gf-item" + (gf.registrado ? " ok" : "")}>
            <span>
              {gf.registrado ? "✓" : "○"} {gf.concepto} <span className="dia">· día {gf.dia}</span>
            </span>
            <span className="gf-right">
              {money(gf.importe)}
              {!gf.registrado && (
                <button type="button" className="mini-btn" onClick={() => registrarRapido(gf)}>
                  Apuntar
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>Gastos variables de este mes</strong>
        <p className="subtitle" style={{ margin: "6px 0 12px" }}>
          Se rellena solo con lo que escribes abajo en "Añadir movimiento" si el concepto se parece al nombre de la categoría.
        </p>
        {variablesConGasto.map((cat) => (
          <div key={cat.id} className="var-item">
            <div className="var-item-top">
              <span>{cat.concepto}</span>
              <span className={cat.resta < 0 ? "var-resta negativo" : "var-resta"}>
                {cat.resta < 0
                  ? `Te has pasado ${money(Math.abs(cat.resta))}`
                  : `Te quedan ${money(cat.resta)}`}
              </span>
            </div>
            <div className="barra-fondo">
              <div
                className={"barra-relleno" + (cat.resta < 0 ? " excedido" : "")}
                style={{ width: `${cat.porcentaje}%` }}
              />
            </div>
            <div className="var-item-bottom">
              {money(cat.gastado)} de {money(cat.importe)}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>Añadir movimiento</strong>
        <form className="nuevo" onSubmit={guardarMovimiento}>
          <div className="tipo-toggle">
            <button type="button" className={tipo === "gasto" ? "activo gasto" : ""} onClick={() => setTipo("gasto")}>
              Gasto
            </button>
            <button type="button" className={tipo === "ingreso" ? "activo ingreso" : ""} onClick={() => setTipo("ingreso")}>
              Ingreso
            </button>
          </div>
          <div>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label>Importe (€)</label>
            <input type="number" step="0.01" placeholder="0.00" value={importe} onChange={(e) => setImporte(e.target.value)} />
          </div>
          <div className="full">
            <label>Concepto</label>
            <input type="text" placeholder="p.ej. comida, coche, paro..." value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          <button type="submit">Añadir</button>
          {error && <div className="error-msg">{error}</div>}
        </form>
      </div>

      <div className="card">
        <strong>Movimientos</strong>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th className="num">Gasto</th>
              <th className="num">Ingreso</th>
              <th className="num">Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.fecha).toLocaleDateString("es-ES")}</td>
                <td>{m.concepto}</td>
                <td className="num gasto">{Number(m.gasto) ? money(m.gasto) : ""}</td>
                <td className="num ingreso">{Number(m.ingreso) ? money(m.ingreso) : ""}</td>
                <td className="num saldo-col">{money(m.saldo)}</td>
                <td>
                  <button className="borrar" onClick={() => borrar(m.id)}>✕</button>
                </td>
              </tr>
            ))}
            {!loading && filas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "#888", padding: "16px 0" }}>
                  Todavía no has añadido ningún movimiento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <button type="button" className="link-btn" onClick={() => setMostrarGestionVar((v) => !v)}>
          {mostrarGestionVar ? "Ocultar gestión de gastos variables" : "Gestionar mis categorías de gastos variables"}
        </button>
        {mostrarGestionVar && (
          <div style={{ marginTop: 12 }}>
            {presupuestoVariable.map((cat) => (
              <CategoriaEditable key={cat.id} cat={cat} onGuardar={actualizarCat} onBorrar={borrarCat} />
            ))}
            <form className="nuevo" onSubmit={anadirCat} style={{ marginTop: 16 }}>
              <div className="full">
                <label>Categoría nueva</label>
                <input
                  type="text"
                  value={nuevaCat.concepto}
                  onChange={(e) => setNuevaCat({ ...nuevaCat, concepto: e.target.value })}
                />
              </div>
              <div className="full">
                <label>Presupuesto mensual (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nuevaCat.importe}
                  onChange={(e) => setNuevaCat({ ...nuevaCat, importe: e.target.value })}
                />
              </div>
              <button type="submit">Añadir categoría</button>
            </form>
          </div>
        )}
      </div>

      <div className="card">
        <button type="button" className="link-btn" onClick={() => setMostrarGestionIng((v) => !v)}>
          {mostrarGestionIng ? "Ocultar gestión de ingresos fijos" : "Gestionar mis ingresos fijos (el Paro, etc.)"}
        </button>
        {mostrarGestionIng && (
          <div style={{ marginTop: 12 }}>
            {ingresosFijos.map((iff) => (
              <GastoFijoEditable key={iff.id} gf={iff} onGuardar={actualizarIF} onBorrar={borrarIF} />
            ))}
            <form className="nuevo" onSubmit={anadirIF} style={{ marginTop: 16 }}>
              <div>
                <label>Concepto nuevo</label>
                <input
                  type="text"
                  value={nuevoIF.concepto}
                  onChange={(e) => setNuevoIF({ ...nuevoIF, concepto: e.target.value })}
                />
              </div>
              <div>
                <label>Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nuevoIF.importe}
                  onChange={(e) => setNuevoIF({ ...nuevoIF, importe: e.target.value })}
                />
              </div>
              <div className="full">
                <label>Día del mes</label>
                <input
                  type="text"
                  placeholder="p.ej. 10"
                  value={nuevoIF.dia}
                  onChange={(e) => setNuevoIF({ ...nuevoIF, dia: e.target.value })}
                />
              </div>
              <button type="submit">Añadir ingreso fijo</button>
            </form>
          </div>
        )}
      </div>

      <div className="card">
        <button type="button" className="link-btn" onClick={() => setMostrarGestion((v) => !v)}>
          {mostrarGestion ? "Ocultar gestión de gastos fijos" : "Gestionar mis gastos fijos (añadir, editar, borrar)"}
        </button>
        {mostrarGestion && (
          <div style={{ marginTop: 12 }}>
            {gastosFijos.map((gf) => (
              <GastoFijoEditable key={gf.id} gf={gf} onGuardar={actualizarGF} onBorrar={borrarGF} />
            ))}
            <form className="nuevo" onSubmit={anadirGF} style={{ marginTop: 16 }}>
              <div>
                <label>Concepto nuevo</label>
                <input
                  type="text"
                  value={nuevoGF.concepto}
                  onChange={(e) => setNuevoGF({ ...nuevoGF, concepto: e.target.value })}
                />
              </div>
              <div>
                <label>Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nuevoGF.importe}
                  onChange={(e) => setNuevoGF({ ...nuevoGF, importe: e.target.value })}
                />
              </div>
              <div className="full">
                <label>Día del mes</label>
                <input
                  type="text"
                  placeholder="p.ej. 1, 1-5, variable..."
                  value={nuevoGF.dia}
                  onChange={(e) => setNuevoGF({ ...nuevoGF, dia: e.target.value })}
                />
              </div>
              <button type="submit">Añadir gasto fijo</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function GastoFijoEditable({ gf, onGuardar, onBorrar }) {
  const [local, setLocal] = useState(gf);
  const cambiado =
    local.concepto !== gf.concepto || Number(local.importe) !== Number(gf.importe) || local.dia !== gf.dia;
  return (
    <div className="gf-editable">
      <input
        type="text"
        value={local.concepto}
        onChange={(e) => setLocal({ ...local, concepto: e.target.value })}
      />
      <input
        type="number"
        step="0.01"
        value={local.importe}
        onChange={(e) => setLocal({ ...local, importe: e.target.value })}
      />
      <input
        type="text"
        value={local.dia}
        onChange={(e) => setLocal({ ...local, dia: e.target.value })}
      />
      {cambiado && (
        <button type="button" className="mini-btn" onClick={() => onGuardar(local)}>
          Guardar
        </button>
      )}
      <button type="button" className="borrar" onClick={() => onBorrar(gf.id)}>✕</button>
    </div>
  );
}

function CategoriaEditable({ cat, onGuardar, onBorrar }) {
  const [local, setLocal] = useState(cat);
  const cambiado = local.concepto !== cat.concepto || Number(local.importe) !== Number(cat.importe);
  return (
    <div className="gf-editable cat-editable">
      <input
        type="text"
        value={local.concepto}
        onChange={(e) => setLocal({ ...local, concepto: e.target.value })}
      />
      <input
        type="number"
        step="0.01"
        value={local.importe}
        onChange={(e) => setLocal({ ...local, importe: e.target.value })}
      />
      {cambiado && (
        <button type="button" className="mini-btn" onClick={() => onGuardar(local)}>
          Guardar
        </button>
      )}
      <button type="button" className="borrar" onClick={() => onBorrar(cat.id)}>✕</button>
    </div>
  );
}
