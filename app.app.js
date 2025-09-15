/* app.app.js
   Versión corregida y funcional:
   - copia tarjetas/creditos al mes siguiente
   - guarda mes seleccionado
   - modal estable (no se queda pegado)
   - marcar pagado
   - tasas con coma
*/

(() => {
  /* ============== Utilidades ============== */
  const fmt = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(Number(v || 0));

  // "1,84" -> 0.0184 (fracción mensual). Solo coma permitido.
  function parsePctComma(str) {
    const s = String(str || "").trim();
    if (!s) return NaN;
    // permitir "1,84" o "1" o "01,84"
    if (!/^\d+(,\d{1,3})?$/.test(s)) return NaN;
    const [ent, dec = ""] = s.split(",");
    const n = Number(ent) + (dec ? Number(dec) / Math.pow(10, dec.length) : 0);
    return n / 100;
  }
  function formatPctComma(frac, decimals = 2) {
    const p = (Number(frac || 0) * 100).toFixed(decimals);
    return p.replace(".", ",");
  }

  /* ============== App ============== */
  class Finanzas {
    constructor() {
      this.key = "organizadorFinanciero";
      this.selKey = "organizadorMesSel";
      this.iniYM = "2025-08";
      // intenta cargar mes seleccionado guardado
      this.mes = localStorage.getItem(this.selKey) || this.iniYM;
      this.data = this.load();

      this.cacheEls();
      this.bindUI();
      this.buildMonths();
      this.renderAll();

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(() => { /* no crítico */ });
      }
    }

    cacheEls() {
      this.tabs = []; this.panels = [];
      this.toastEl = document.getElementById("toast");
      this.sel = document.getElementById("mesSelector");
      this.btns = {
        addTarjeta: document.getElementById("addTarjeta"),
        addCredito: document.getElementById("addCredito"),
        addAhorro2: document.getElementById("addAhorro2"),
        export: document.getElementById("exportBtn"),
        reset: document.getElementById("resetBtn"),
        modal: document.getElementById("modal"),
        modalForm: document.getElementById("modalForm"),
        modalTitle: document.getElementById("modalTitle"),
        closeModal: document.getElementById("closeModal"),
      };
    }

    bindUI() {
      if (this.sel) {
        this.sel.addEventListener("change", (e) => {
          this.mes = e.target.value;
          localStorage.setItem(this.selKey, this.mes);
          this.ensureMonth(this.mes);
          this.renderAll();
          this.toast("Mes cambiado");
        });
      }
      if (this.btns.addTarjeta) this.btns.addTarjeta.onclick = () => this.openForm("tarjeta");
      if (this.btns.addCredito) this.btns.addCredito.onclick = () => this.openForm("credito");
      if (this.btns.addAhorro2) this.btns.addAhorro2.onclick = () => this.openForm("ahorro");
      if (this.btns.export) this.btns.export.onclick = () => this.export();
      if (this.btns.reset) this.btns.reset.onclick = () => this.reset();
      if (this.btns.closeModal) this.btns.closeModal.onclick = () => this.closeModal();

      // Delegación de acciones (editar, eliminar, marcar pago, añadir ahorro)
      document.body.addEventListener("click", (ev) => {
        const a = ev.target.closest("[data-action]");
        if (!a) return;
        ev.preventDefault();
        const act = a.dataset.action, key = a.dataset.key, id = a.dataset.id ? parseInt(a.dataset.id) : null;
        if (act === "edit") this.edit(key, id);
        if (act === "del") this.del(key, id);
        if (act === "pay") this.togglePago(key, id);
        if (act === "addsave") this.addAhorroMonto(id);
      });

      // cerrar modal con click fuera
      this.btns.modal.addEventListener("click", (e) => {
        if (e.target.id === "modal") this.closeModal();
      });
      // esc para cerrar
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.closeModal(); });
    }

    showTab(name) { /* no usado, placeholder */ }

    /* ====== Storage & seed ====== */
    uid() { return Date.now() + Math.floor(Math.random() * 1e6); }
    load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (raw) return JSON.parse(raw);
      } catch (err) { /* parse error -> seed */ }
      const seed = {};
      seed[this.iniYM] = {
        ingresos: [{ id: this.uid(), nombre: "Salario", monto: 3500000, categoria: "Trabajo", fecha: `${this.iniYM}-01` }],
        gastosFijos: [{ id: this.uid(), nombre: "Arriendo", monto: 1200000, categoria: "Vivienda", fecha: `${this.iniYM}-01` }],
        tarjetas: [],
        creditos: [],
        gastosCompras: [{ id: this.uid(), nombre: "Supermercado", monto: 400000, categoria: "Alimentación", fecha: `${this.iniYM}-10` }],
        ahorros: [{ id: this.uid(), nombre: "Emergencias", meta: 5000000, actual: 1200000, fecha: `${this.iniYM}-01` }]
      };
      return seed;
    }
    save() {
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (err) { console.error("save error", err); }
    }

    /* ====== Ensure month + copy previous (incluye tarjetas/creditos) ====== */
    ensureMonth(key) {
      if (this.data[key]) return;
      // busca mes anterior
      const [y, m] = key.split("-").map(Number);
      let py = y, pm = m - 1;
      if (pm <= 0) { pm = 12; py--; }
      const prev = `${py}-${String(pm).padStart(2, "0")}`;
      if (this.data[prev]) {
        // copia profundo, actualiza ids y fecha (mantiene cuotas)
        const copy = JSON.parse(JSON.stringify(this.data[prev]));
        Object.entries(copy).forEach(([k, arr]) => {
          if (!Array.isArray(arr)) return;
          copy[k] = arr.map(it => {
            const newIt = Object.assign({}, it);
            newIt.id = this.uid();
            // si tiene fecha, actualizamos al día 01 del mes nuevo (si es un elemento recurrente)
            newIt.fecha = `${key}-01`;
            // No tocar cuotaMensual: mantener calculada
            return newIt;
          });
        });
        this.data[key] = copy;
      } else {
        // si no existe prev, crear vacío
        this.data[key] = { ingresos: [], gastosFijos: [], tarjetas: [], creditos: [], gastosCompras: [], ahorros: [] };
      }
      this.save();
    }

    buildMonths() {
      if (!this.sel) return;
      this.sel.innerHTML = "";
      const [y, m] = this.iniYM.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      for (let i = 0; i <= 36; i++) {
        const val = d.toISOString().slice(0, 7);
        const txt = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
        const opt = document.createElement("option");
        opt.value = val; opt.textContent = txt;
        if (val === this.mes) opt.selected = true;
        this.sel.appendChild(opt);
        d.setMonth(d.getMonth() + 1);
      }
      // asegurar mes actual en datos
      this.ensureMonth(this.mes);
    }

    /* ====== Finanzas: tasa, cuota (francés), recalc ====== */
    rateFromInput(pctStr) { const r = parsePctComma(pctStr); return isNaN(r) ? 0 : r; }

    cuota(M, i, n, avalPct = 0, ivaAvalPct = 0) {
      M = Number(M || 0); i = Number(i || 0); n = Number(n || 0);
      if (!n || n <= 0) return 0;
      let base;
      if (!i || i === 0) base = M / n;
      else {
        const f = Math.pow(1 + i, n);
        base = (M * i * f) / (f - 1);
      }
      const avalMensual = (M * (avalPct || 0)) / n;
      const ivaAvalMensual = avalMensual * (ivaAvalPct || 0);
      return Math.round(base + avalMensual + ivaAvalMensual);
    }

    recalcDeudas(d) {
      (d.tarjetas || []).forEach(it => {
        const nueva = this.cuota(Number(it.montoTotal || 0), Number(it.tasaMensual || 0), parseInt(it.numeroCuotas || 0));
        if (!it.cuotaMensual || Math.abs((it.cuotaMensual || 0) - nueva) > 1) it.cuotaMensual = nueva;
      });
      (d.creditos || []).forEach(it => {
        const nueva = this.cuota(
          Number(it.montoTotal || 0),
          Number(it.tasaMensual || 0),
          parseInt(it.numeroCuotas || 0),
          Number(it.avalPct || 0),
          Number(it.ivaAvalPct || 0)
        );
        if (!it.cuotaMensual || Math.abs((it.cuotaMensual || 0) - nueva) > 1) it.cuotaMensual = nueva;
      });
    }

    /* ====== Render ====== */
    get mesData() { this.ensureMonth(this.mes); return this.data[this.mes]; }

    renderAll() {
      const d = this.mesData;
      this.recalcDeudas(d);
      this.save();

      // resumen tiles (con colores)
      this.renderTiles(d);

      this.renderList("listaIngresos", d.ingresos, i => this.rowGeneric("💵", i, "ingresos", i.monto));
      this.renderList("listaFijos", d.gastosFijos, i => this.rowGeneric("🏠", i, "gastosFijos", i.monto));
      this.renderList("listaTarjetas", d.tarjetas, i => this.rowTarjeta(i, "tarjetas"));
      this.renderList("listaCreditos", d.creditos, i => this.rowCredito(i, "creditos"));
      this.renderList("listaCompras", d.gastosCompras, i => this.rowGeneric("🛒", i, "gastosCompras", i.monto));
      this.renderList("listaAhorros", d.ahorros, i => this.rowAhorro(i, "ahorros"));

      const totalIng = d.ingresos.reduce((s, x) => s + (Number(x.monto || 0)), 0);
      const totalFix = d.gastosFijos.reduce((s, x) => s + (Number(x.monto || 0)), 0);
      const totalTar = d.tarjetas.reduce((s, x) => s + (Number(x.cuotaMensual || 0)), 0);
      const totalCre = d.creditos.reduce((s, x) => s + (Number(x.cuotaMensual || 0)), 0);
      const totalCom = d.gastosCompras.reduce((s, x) => s + (Number(x.monto || 0)), 0);
      const totalAho = d.ahorros.reduce((s, x) => s + (Number(x.actual || 0)), 0);
      const totalG = totalFix + totalTar + totalCre + totalCom;
      const libre = totalIng - totalG;

      // sum elements
      this.setText("sumIngresos", fmt(totalIng));
      this.setText("sumFijos", fmt(totalFix));
      this.setText("sumTarjetas", fmt(totalTar));
      this.setText("sumCreditos", fmt(totalCre));
      this.setText("sumCompras", fmt(totalCom));
      this.setText("sumAhorros", fmt(totalAho));
      this.setText("sumGastos", fmt(totalG));
      this.setText("sumLibre", fmt(libre));

      this.renderDashboard(totalIng, totalG, libre);
      this.renderMetas(d.ahorros);
      this.renderHistorial();
      // show small toast optional
    }

    renderTiles(d) {
      const el = document.getElementById("tilesResumen");
      if (!el) return;
      // calcula sumas para tiles
      const totalIng = d.ingresos.reduce((s, x) => s + (Number(x.monto || 0)), 0);
      const totalFix = d.gastosFijos.reduce((s, x) => s + (Number(x.monto || 0)), 0);
      const totalTar = d.tarjetas.reduce((s, x) => s + (Number(x.cuotaMensual || 0)), 0);
      const totalCre = d.creditos.reduce((s, x) => s + (Number(x.cuotaMensual || 0)), 0);
      const totalCom = d.gastosCompras.reduce((s, x) => s + (Number(x.monto || 0)), 0);
      const totalAho = d.ahorros.reduce((s, x) => s + (Number(x.actual || 0)), 0);
      const totalG = totalFix + totalTar + totalCre + totalCom;
      const libre = totalIng - totalG;

      el.innerHTML = `
      <div class="tile green"><h3>💵 Ingresos</h3><div class="value">${fmt(totalIng)}</div></div>
      <div class="tile orange"><h3>🏠 Fijos</h3><div class="value">${fmt(totalFix)}</div></div>
      <div class="tile purple"><h3>💳 Tarjetas</h3><div class="value">${fmt(totalTar)}</div></div>
      <div class="tile blue"><h3>🏦 Créditos</h3><div class="value">${fmt(totalCre)}</div></div>
      <div class="tile"><h3>🛒 Compras</h3><div class="value">${fmt(totalCom)}</div></div>
      <div class="tile"><h3>💎 Ahorros</h3><div class="value">${fmt(totalAho)}</div></div>
      <div class="tile dark"><h3>📉 Total Gastos</h3><div class="value">${fmt(totalG)}</div></div>
      <div class="tile green"><h3>💰 Disponible</h3><div class="value">${fmt(libre)}</div></div>
      `;
    }

    setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

    renderList(id, arr, row) {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = arr && arr.length ? arr.map(row).join("") : '<p class="small">Sin registros.</p>';
    }

    rowGeneric(icon, i, key, monto) {
      const paidClass = i.paid ? "is-paid" : "";
      return `<div class="item ${paidClass}">
        <div class="row">
          <div>${icon} <b>${i.nombre}</b><div class="meta">${i.categoria || ""} · ${i.fecha || ""}</div></div>
          <div><b>${fmt(monto)}</b></div>
        </div>
        <div class="actions">
          <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
          <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
        </div>
      </div>`;
    }

    rowTarjeta(i, key) {
      const paidClass = (i.paid || false) ? "is-paid" : "";
      return `<div class="item ${paidClass}">
        <div class="row">
          <div>💳 <b>${i.nombre}</b>
            <div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${formatPctComma(i.tasaMensual)}%</div>
          </div>
          <div><b>Total ${fmt(i.montoTotal)}</b></div>
        </div>
        <div class="actions">
          <a data-action="pay" data-key="${key}" data-id="${i.id}" href="#" class="mark-pay">✅ Pagar</a>
          <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
          <a data-action="del" data-key="${key}" data-id="${i.id}" href="#" class="del">🗑️ Eliminar</a>
        </div>
      </div>`;
    }

    rowCredito(i, key) {
      const paidClass = (i.paid || false) ? "is-paid" : "";
      return `<div class="item ${paidClass}">
        <div class="row">
          <div>🏦 <b>${i.nombre}</b>
            <div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas}
              · tasa ${formatPctComma(i.tasaMensual)}%
              ${i.avalPct ? ` · aval ${formatPctComma(i.avalPct)}%` : ``}
              ${i.ivaAvalPct ? ` · IVA ${formatPctComma(i.ivaAvalPct)}%` : ``}
            </div>
          </div>
          <div><b>Total ${fmt(i.montoTotal)}</b></div>
        </div>
        <div class="actions">
          <a data-action="pay" data-key="${key}" data-id="${i.id}" href="#" class="mark-pay">✅ Pagar</a>
          <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
          <a data-action="del" data-key="${key}" data-id="${i.id}" href="#" class="del">🗑️ Eliminar</a>
        </div>
      </div>`;
    }

    rowAhorro(i, key) {
      const p = i.meta ? ((i.actual / i.meta) * 100).toFixed(1) : 0;
      return `<div class="item">
        <div class="row">
          <div>💎 <b>${i.nombre}</b><div class="meta">Meta ${fmt(i.meta)} · ${i.fecha || ""}</div></div>
          <div><b>${fmt(i.actual)}</b></div>
        </div>
        <div class="meta">${p}%</div>
        <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px">
          <div style="width:${Math.min(100, p)}%;height:100%;background:#6c5ce7;border-radius:6px"></div>
        </div>
        <div class="actions">
          <a data-action="addsave" data-id="${i.id}" href="#">💰 Añadir</a>
          <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
          <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
        </div>
      </div>`;
    }

    renderDashboard(ing, gastos, libre) {
      const tasa = ing ? ((libre / ing) * 100).toFixed(1) : 0;
      const el = document.getElementById("analisisMensual");
      if (!el) return;
      el.innerHTML = `<div class="item"><b style="color:${libre>=0? '--' : '--'}">${fmt(libre)}</b> de balance — Ahorro ${tasa}%</div>`;
    }

    renderMetas(ahorros) {
      const el = document.getElementById("metasAhorro"); if (!el) return;
      if (!ahorros || ahorros.length === 0) { el.innerHTML = '<p class="small">Crea una meta para empezar.</p>'; return; }
      el.innerHTML = ahorros.map(a => {
        const p = a.meta ? Math.min(100, (a.actual / a.meta) * 100) : 0;
        return `<div class="item"><b>${a.nombre}</b><div class="meta">${fmt(a.actual)} / ${fmt(a.meta)}</div>
          <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px">
            <div style="width:${p.toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div>
          </div></div>`;
      }).join("");
    }

    renderHistorial() {
      const el = document.getElementById("tablaHistorial"); if (!el) return;
      const meses = Object.keys(this.data).sort();
      const rows = meses.map(m => {
        const d = this.data[m];
        const ing = d.ingresos.reduce((s, x) => s + (Number(x.monto || 0)), 0);
        const gas = d.gastosFijos.reduce((s, x) => s + (Number(x.monto || 0)), 0)
          + d.tarjetas.reduce((s, x) => s + (Number(x.cuotaMensual || 0)), 0)
          + d.creditos.reduce((s, x) => s + (Number(x.cuotaMensual || 0)), 0)
          + d.gastosCompras.reduce((s, x) => s + (Number(x.monto || 0)), 0);
        const bal = ing - gas; const p = ing ? ((bal / ing) * 100).toFixed(1) : 0;
        return `<tr><td>${m}</td><td>${fmt(ing)}</td><td>${fmt(gas)}</td><td style="color:${bal>=0?"#00b894":"#ff6b6b"}">${fmt(bal)}</td><td>${p}%</td></tr>`;
      }).join("");
      el.innerHTML = `<div style="overflow:auto"><table><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th><th>% Ahorro</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    /* ====== CRUD + pagos ====== */
    openForm(tipo, item = null) {
      const f = (name, type, label, value, extra = "") => (
        `<div class="field"><label>${label}</label><input type="${type}" id="f_${name}" value="${value ?? ""}" ${extra}></div>`
      );
      let title = "Formulario", fields = "";
      if (tipo === "tarjeta") {
        title = "Nueva Tarjeta";
        fields = f("nombre", "text", "Nombre", "")
          + f("montoTotal", "number", "Monto total", "", "step='1' min='1'")
          + f("numeroCuotas", "number", "Cuotas", "1", "step='1' min='1'")
          + f("cuotasPagadas", "number", "Pagadas", "0", "step='1' min='0'")
          + f("tasa", "text", "Tasa mensual % (coma, ej: 1,85)", "1,85", "inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'");
      } else if (tipo === "credito") {
        title = "Nuevo Crédito";
        fields = f("nombre", "text", "Nombre", "")
          + f("montoTotal", "number", "Monto total", "", "step='1' min='1'")
          + f("numeroCuotas", "number", "Cuotas", "1", "step='1' min='1'")
          + f("cuotasPagadas", "number", "Pagadas", "0", "step='1' min='0'")
          + f("tasa", "text", "Tasa mensual % (coma, ej: 1,85)", "1,85", "inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'")
          + f("aval", "text", "Aval % sobre capital (coma, ej: 12,00)", "0,00", "inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'")
          + f("ivaAval", "text", "IVA del aval % (coma, ej: 19,00)", "0,00", "inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'");
      } else if (tipo === "ahorro") {
        title = "Nueva Meta de Ahorro";
        fields = f("nombre", "text", "Nombre", "")
          + f("meta", "number", "Meta", "", "step='1' min='0'")
          + f("actual", "number", "Actual", "0", "step='1' min='0'");
      }
      // mostrar modal con formulario
      this.showModal(title, fields, (vals) => {
        const d = this.mesData;
        const n = (x) => Number(x || 0);
        const pct = (x) => parsePctComma(x);
        if (tipo === "tarjeta") {
          const tasa = pct(vals.tasa);
          if (!(tasa > 0 && tasa <= 0.05)) { this.toast("Tasa inválida (usa coma, ≤5%)"); return; }
          const M = n(vals.montoTotal), cu = parseInt(vals.numeroCuotas || 0), pag = parseInt(vals.cuotasPagadas || 0);
          const cuota = this.cuota(M, tasa, cu);
          d.tarjetas.push({ id: this.uid(), nombre: vals.nombre, montoTotal: M, numeroCuotas: cu, cuotasPagadas: pag, tasaMensual: tasa, cuotaMensual: cuota, fecha: `${this.mes}-01`, paid: false });
        } else if (tipo === "credito") {
          const tasa = pct(vals.tasa), aval = pct(vals.aval || "0"), iva = pct(vals.ivaAval || "0");
          if (!(tasa > 0 && tasa <= 0.05)) { this.toast("Tasa inválida (usa coma, ≤5%)"); return; }
          if (aval < 0 || aval > 0.3) { this.toast("Aval fuera de rango (0%–30%)"); return; }
          if (iva < 0 || iva > 0.3) { this.toast("IVA aval fuera de rango (0%–30%)"); return; }
          const M = n(vals.montoTotal), cu = parseInt(vals.numeroCuotas || 0), pag = parseInt(vals.cuotasPagadas || 0);
          const cuota = this.cuota(M, tasa, cu, aval, iva);
          d.creditos.push({ id: this.uid(), nombre: vals.nombre, montoTotal: M, numeroCuotas: cu, cuotasPagadas: pag, tasaMensual: tasa, avalPct: aval, ivaAvalPct: iva, cuotaMensual: cuota, fecha: `${this.mes}-01`, paid: false });
        } else if (tipo === "ahorro") {
          d.ahorros.push({ id: this.uid(), nombre: vals.nombre, meta: n(vals.meta), actual: n(vals.actual), fecha: `${this.mes}-01` });
        }
        this.save(); this.renderAll(); this.toast("Guardado");
      });
    }

    edit(key, id) {
      const list = this.mesData[key]; const it = list.find(x => x.id === id); if (!it) return;
      const f = (name, type, label, value, extra = "") => (`<div class="field"><label>${label}</label><input type="${type}" id="f_${name}" value="${value ?? ""}" ${extra}></div>`);
      let title = "Editar", fields = "";
      if (key === "tarjetas") {
        title = "Editar Tarjeta";
        fields = f("nombre", "text", "Nombre", it.nombre)
          + f("montoTotal", "number", "Monto total", it.montoTotal, "step='1' min='1'")
          + f("numeroCuotas", "number", "Cuotas", it.numeroCuotas, "step='1' min='1'")
          + f("cuotasPagadas", "number", "Pagadas", it.cuotasPagadas || 0, "step='1' min='0'")
          + f("tasa", "text", "Tasa mensual % (coma)", formatPctComma(it.tasaMensual), "inputmode='decimal' oninput='this.value=this.value.replace(\".\",\",\");'");
      } else if (key === "creditos") {
        title = "Editar Crédito";
        fields = f("nombre", "text", "Nombre", it.nombre)
          + f("montoTotal", "number", "Monto total", it.montoTotal, "step='1' min='1'")
          + f("numeroCuotas", "number", "Cuotas", it.numeroCuotas, "step='1' min='1'")
          + f("cuotasPagadas", "number", "Pagadas", it.cuotasPagadas || 0, "step='1' min='0'")
          + f("tasa", "text", "Tasa mensual % (coma)", formatPctComma(it.tasaMensual), "inputmode='decimal' oninput='this.value=this.value.replace(\".\",\",\");'")
          + f("aval", "text", "Aval %", it.avalPct ? formatPctComma(it.avalPct) : "0,00", "inputmode='decimal' oninput='this.value=this.value.replace(\".\",\",\");'")
          + f("ivaAval", "text", "IVA aval %", it.ivaAvalPct ? formatPctComma(it.ivaAvalPct) : "0,00", "inputmode='decimal' oninput='this.value=this.value.replace(\".\",\",\");'");
      }
      this.showModal(title, fields, (vals) => {
        const n = (x) => Number(x || 0), pct = (x) => parsePctComma(x);
        if (key === "tarjetas") {
          const tasa = pct(vals.tasa); if (!(tasa > 0 && tasa <= 0.05)) { this.toast("Tasa inválida (≤5%)"); return; }
          const M = n(vals.montoTotal), cu = parseInt(vals.numeroCuotas || 0), pag = parseInt(vals.cuotasPagadas || 0);
          Object.assign(it, { nombre: vals.nombre, montoTotal: M, numeroCuotas: cu, cuotasPagadas: pag, tasaMensual: tasa, cuotaMensual: this.cuota(M, tasa, cu) });
        } else if (key === "creditos") {
          const tasa = pct(vals.tasa), aval = pct(vals.aval || "0"), iva = pct(vals.ivaAval || "0");
          if (!(tasa > 0 && tasa <= 0.05)) { this.toast("Tasa inválida (≤5%)"); return; }
          if (aval < 0 || aval > 0.3) { this.toast("Aval fuera de rango (0%–30%)"); return; }
          if (iva < 0 || iva > 0.3) { this.toast("IVA aval fuera de rango (0%–30%)"); return; }
          const M = n(vals.montoTotal), cu = parseInt(vals.numeroCuotas || 0), pag = parseInt(vals.cuotasPagadas || 0);
          Object.assign(it, { nombre: vals.nombre, montoTotal: M, numeroCuotas: cu, cuotasPagadas: pag, tasaMensual: tasa, avalPct: aval, ivaAvalPct: iva, cuotaMensual: this.cuota(M, tasa, cu, aval, iva) });
        }
        this.save(); this.renderAll(); this.toast("Actualizado");
      });
    }

    del(key, id) {
      if (!confirm("¿Eliminar registro?")) return;
      this.data[this.mes][key] = (this.data[this.mes][key] || []).filter(x => x.id !== id);
      this.save(); this.renderAll(); this.toast("Eliminado");
    }

    addAhorroMonto(id) {
      const a = this.mesData.ahorros.find(x => x.id === id); if (!a) return;
      const m = prompt("¿Cuánto agregar?", "0"); const n = Number(m);
      if (n > 0) { a.actual += n; this.save(); this.renderAll(); this.toast("Ahorro agregado"); }
    }

    // marcar pago: incrementa cuotasPagadas y marca paid si pagadas==numeroCuotas
    togglePago(key, id) {
      const list = this.mesData[key]; if (!list) return;
      const it = list.find(x => x.id === id); if (!it) return;
      if (typeof it.cuotasPagadas === "number" && typeof it.numeroCuotas === "number") {
        if (it.cuotasPagadas < it.numeroCuotas) { it.cuotasPagadas++; }
        if (it.cuotasPagadas >= it.numeroCuotas) it.paid = true;
      } else {
        // para items simples: toggle paid
        it.paid = !it.paid;
      }
      this.save(); this.renderAll(); this.toast("Pago registrado");
    }

    /* ====== Modal ====== */
    showModal(title, innerHtml, onSubmit) {
      const modal = this.btns.modal, form = this.btns.modalForm, titleEl = this.btns.modalTitle;
      titleEl.textContent = title;
      form.innerHTML = innerHtml + `
        <div class="actions">
          <button type="submit" class="primary">Guardar</button>
          <button type="button" class="cancel" id="cancelModal">Cancelar</button>
        </div>`;
      modal.classList.remove("hidden"); modal.setAttribute("aria-hidden", "false");

      const cancel = () => this.closeModal();
      const cancelBtn = document.getElementById("cancelModal");
      if (cancelBtn) cancelBtn.onclick = cancel;

      // asegurar que no queden handlers viejos
      form.onsubmit = (e) => {
        e.preventDefault();
        const vals = {};
        [...form.querySelectorAll("input")].forEach(inp => { const id = inp.id.replace(/^f_/, ""); vals[id] = inp.value; });
        // cierra primero
        this.closeModal();
        // ejecutar submit después para permitir animación de cierre
        setTimeout(() => onSubmit(vals), 60);
      };
    }

    closeModal() {
      const modal = this.btns.modal, form = this.btns.modalForm;
      if (!modal) return;
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      if (form) form.innerHTML = "";
    }

    /* ====== Otros: export, reset, toast ====== */
    export() {
      const data = { exportado: new Date().toISOString(), mes: this.mes, datos: this.data };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = "organizador-financiero.json"; a.click(); URL.revokeObjectURL(url);
    }
    reset() { if (confirm("¿Borrar datos locales?")) { localStorage.removeItem(this.key); localStorage.removeItem(this.selKey); location.reload(); } }
    toast(m) { const t = this.toastEl; if (!t) return; t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); }
  }

  // init
  window.app = new Finanzas();
})();