/* app.app.js - Organizador Financiero (reemplazar todo el archivo) */

/* ============== Utilidades ============== */
const fmt = (v) => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(v||0);

/** parsePctComma("1,84") -> 0.0184 (fracción mensual). Acepta coma, rechaza puntos como separador decimal. */
function parsePctComma(str){
  const s = String(str||"").trim();
  if(!s) return NaN;
  // normalizar puntos usados por accidente a coma
  const normalized = s.replace(/\./g,',');
  if(!/^\d+(,\d{1,3})?$/.test(normalized)) return NaN;
  const [ent,dec=""]=normalized.split(",");
  const n = Number(ent) + (dec ? Number(dec)/Math.pow(10, dec.length) : 0);
  return n/100;
}
function formatPctComma(frac,decimals=2){
  const p = (Number(frac||0)*100).toFixed(decimals);
  return p.replace(".",",");
}

/* ============== App ============== */
class Finanzas {
  constructor(){
    this.key = "organizadorFinanciero";
    this.iniYM = "2025-08";
    this.mes = this.iniYM;
    this.data = this.load();

    this.cacheEls();
    this.bindUI();
    this.buildMonths();
    this.renderAll();

    // registrar SW si es posible
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(()=>{ /* fallthrough en dev */ });
    }
  }

  /* ---------- cache de elementos UI ---------- */
  cacheEls(){
    this.tabs = [...document.querySelectorAll(".tab")];
    this.panels = [...document.querySelectorAll(".panel")];
    this.toastEl = document.getElementById("toast");
    this.sel = document.getElementById("mesSelector");
    this.btns = {
      addIngreso: document.getElementById("addIngreso"),
      addFijo: document.getElementById("addFijo"),
      addTarjeta: document.getElementById("addTarjeta"),
      addCredito: document.getElementById("addCredito"),
      addCompra: document.getElementById("addCompra"),
      addAhorro: document.getElementById("addAhorro"),
      addAhorro2: document.getElementById("addAhorro2"),
      export: document.getElementById("exportBtn"),
      reset: document.getElementById("resetBtn"),
      modal: document.getElementById("modal"),
      modalForm: document.getElementById("modalForm"),
      modalTitle: document.getElementById("modalTitle"),
      closeModal: document.getElementById("closeModal"),
    };
  }

  /* ---------- binding UI ---------- */
  bindUI(){
    // tabs
    this.tabs.forEach(t => t.addEventListener("click", () => this.showTab(t.dataset.tab)));

    // selector mes
    if (this.sel) this.sel.addEventListener("change", (e) => {
      this.mes = e.target.value;
      this.ensureMonth(this.mes);
      this.renderAll();
      this.toast("Mes cambiado");
    });

    // botones principales
    Object.entries(this.btns).forEach(([k,el])=>{
      if(!el) return;
      if(k==="addIngreso") el.onclick = () => this.openForm("ingreso");
      if(k==="addFijo") el.onclick = () => this.openForm("fijo");
      if(k==="addTarjeta") el.onclick = () => this.openForm("tarjeta");
      if(k==="addCredito") el.onclick = () => this.openForm("credito");
      if(k==="addCompra") el.onclick = () => this.openForm("compra");
      if(k==="addAhorro" || k==="addAhorro2") el.onclick = () => this.openForm("ahorro");
      if(k==="export") el.onclick = () => this.export();
      if(k==="reset") el.onclick = () => this.reset();
      if(k==="closeModal") el.onclick = () => this.closeModal();
    });

    // delegación de acciones (editar, eliminar, marcar pagado, añadir ahorro)
    document.body.addEventListener("click", (ev) => {
      const a = ev.target.closest("a[data-action]");
      if(!a) return;
      ev.preventDefault();
      const act = a.dataset.action;
      const key = a.dataset.key;
      const id = parseInt(a.dataset.id);
      if(act === "edit") this.edit(key, id);
      if(act === "del") this.del(key, id);
      if(act === "addsave") this.addAhorroMonto(id);
      if(act === "markpaid") this.togglePaid(key, id);
    });

    // cerrar modal con clic fuera
    if(this.btns.modal) this.btns.modal.addEventListener("click", (e) => { if(e.target.id === "modal") this.closeModal(); });

    // cerrar modal con Escape
    document.addEventListener("keydown", (e) => { if(e.key === "Escape") this.closeModal(); });
  }

  showTab(name){
    this.tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    this.panels.forEach(p => p.classList.toggle("hidden", p.id !== name));
  }

  /* ---------- Storage & datos ---------- */
  uid(){ return Date.now() + Math.floor(Math.random()*1e6); }

  load(){
    try {
      const raw = localStorage.getItem(this.key);
      if(raw) return JSON.parse(raw);
    } catch(e) { /* ignore */ }

    // seed inicial si no hay nada
    const seed = {};
    seed[this.iniYM] = {
      ingresos: [{ id: this.uid(), nombre: "Salario", monto: 3500000, categoria: "Trabajo", fecha: `${this.iniYM}-01`, paid:false }],
      gastosFijos: [{ id: this.uid(), nombre: "Arriendo", monto: 1200000, categoria: "Vivienda", fecha: `${this.iniYM}-01`, paid:false }],
      tarjetas: [],
      creditos: [],
      gastosCompras: [{ id: this.uid(), nombre: "Supermercado", monto: 400000, categoria: "Alimentación", fecha: `${this.iniYM}-10`, paid:false }],
      ahorros: [{ id: this.uid(), nombre: "Emergencias", meta: 5000000, actual: 1200000, fecha: `${this.iniYM}-01` }]
    };
    return seed;
  }

  save(){ try{ localStorage.setItem(this.key, JSON.stringify(this.data)); }catch(e){ console.error('save error', e); } }

  /**
   * ensureMonth: si no existe el mes lo crea.
   * - Si existe mes previo copia ingresos/gastos/tarjetas/creditos/ahorros/gastosCompras
   * - Reasigna ids (evita colisiones), ajusta fecha y resetea paid=false
   * - Recalcula cuotas para tarjetas/creditos
   */
  ensureMonth(key){
    if(this.data[key]) return;

    const [y,m] = key.split("-").map(Number);
    let py = y, pm = m-1;
    if(pm <= 0){ pm = 12; py--; }
    const prev = `${py}-${String(pm).padStart(2,"0")}`;

    const emptyMonth = { ingresos:[], gastosFijos:[], tarjetas:[], creditos:[], gastosCompras:[], ahorros:[] };

    if(this.data[prev]){
      const copy = JSON.parse(JSON.stringify(this.data[prev]));

      Object.keys(copy).forEach(k => {
        if(!Array.isArray(copy[k])) return;
        copy[k] = copy[k].map(item => {
          item.id = this.uid();
          // forzar fecha a inicio de mes de la nueva clave
          item.fecha = `${key}-01`;
          // si existe paid, resetear para nuevo mes
          if(typeof item.paid !== "undefined") item.paid = false;
          return item;
        });
      });

      // recalcular cuotas de tarjetas y creditos en copia
      if(Array.isArray(copy.tarjetas)){
        copy.tarjetas.forEach(t=>{
          t.tasaMensual = Number(t.tasaMensual) || 0;
          t.numeroCuotas = parseInt(t.numeroCuotas||0);
          t.montoTotal = Number(t.montoTotal||0);
          t.cuotaMensual = this.cuota(t.montoTotal, t.tasaMensual, t.numeroCuotas);
        });
      }
      if(Array.isArray(copy.creditos)){
        copy.creditos.forEach(c=>{
          c.tasaMensual = Number(c.tasaMensual) || 0;
          c.avalPct = Number(c.avalPct||0);
          c.ivaAvalPct = Number(c.ivaAvalPct||0);
          c.numeroCuotas = parseInt(c.numeroCuotas||0);
          c.montoTotal = Number(c.montoTotal||0);
          c.cuotaMensual = this.cuota(c.montoTotal, c.tasaMensual, c.numeroCuotas, c.avalPct, c.ivaAvalPct);
        });
      }

      this.data[key] = copy;
    } else {
      this.data[key] = JSON.parse(JSON.stringify(emptyMonth));
    }

    this.save();
  }

  buildMonths(){
    const sel = this.sel; if(!sel) return;
    sel.innerHTML = "";
    const [y,m] = this.iniYM.split("-").map(Number);
    const d = new Date(y, m-1, 1);
    for(let i=0;i<=36;i++){
      const val = d.toISOString().slice(0,7);
      const txt = d.toLocaleDateString("es-CO",{month:"long", year:"numeric"});
      const opt = document.createElement("option");
      opt.value = val; opt.textContent = txt;
      if(val === this.mes) opt.selected = true;
      sel.appendChild(opt);
      d.setMonth(d.getMonth()+1);
    }
    this.ensureMonth(this.mes);
  }

  /* ============== Finanzas ============== */

  // convierte string tasa ("1,85") a fracción 0.0185
  rateFromInput(pctStr){ const r = parsePctComma(pctStr); return isNaN(r) ? 0 : r; }

  // cuota sistema francés + aval + ivaAval
  cuota(M, i, n, avalPct=0, ivaAvalPct=0){
    if(!n || n<=0) return 0;
    let base;
    if(!i) base = M / n;
    else {
      const f = Math.pow(1 + i, n);
      base = (M * i * f) / (f - 1);
    }
    const avalMensual = (M * (avalPct || 0)) / n;
    const ivaAvalMensual = avalMensual * (ivaAvalPct || 0);
    // redondeo a entero pesos
    return Math.round(base + avalMensual + ivaAvalMensual);
  }

  // recalcula cuotas guardadas para evitar "pegadas"
  recalcDeudas(d){
    (d.tarjetas || []).forEach(it => {
      const nueva = this.cuota(Number(it.montoTotal||0), Number(it.tasaMensual||0), parseInt(it.numeroCuotas||0));
      if(!it.cuotaMensual || Math.abs((it.cuotaMensual||0) - nueva) > 1) it.cuotaMensual = nueva;
    });
    (d.creditos || []).forEach(it => {
      const nueva = this.cuota(
        Number(it.montoTotal||0),
        Number(it.tasaMensual||0),
        parseInt(it.numeroCuotas||0),
        Number(it.avalPct||0),
        Number(it.ivaAvalPct||0)
      );
      if(!it.cuotaMensual || Math.abs((it.cuotaMensual||0) - nueva) > 1) it.cuotaMensual = nueva;
    });
  }

  get mesData(){ this.ensureMonth(this.mes); return this.data[this.mes]; }

  renderAll(){
    const d = this.mesData;
    this.recalcDeudas(d);
    this.save();

    this.renderList("listaIngresos", d.ingresos, i => this.rowGeneric("💵", i, "ingresos", i.monto));
    this.renderList("listaFijos", d.gastosFijos, i => this.rowGeneric("🏠", i, "gastosFijos", i.monto));
    this.renderList("listaTarjetas", d.tarjetas, i => this.rowTarjeta(i, "tarjetas"));
    this.renderList("listaCreditos", d.creditos, i => this.rowCredito(i, "creditos"));
    this.renderList("listaCompras", d.gastosCompras, i => this.rowGeneric("🛒", i, "gastosCompras", i.monto));
    this.renderList("listaAhorros", d.ahorros, i => this.rowAhorro(i, "ahorros"));

    const totalIng = d.ingresos.reduce((s,x) => s + (Number(x.monto)||0), 0);
    const totalFix = d.gastosFijos.reduce((s,x) => s + (Number(x.monto)||0), 0);
    const totalTar = d.tarjetas.reduce((s,x) => s + (Number(x.cuotaMensual)||0), 0);
    const totalCre = d.creditos.reduce((s,x) => s + (Number(x.cuotaMensual)||0), 0);
    const totalCom = d.gastosCompras.reduce((s,x) => s + (Number(x.monto)||0), 0);
    const totalAho = d.ahorros.reduce((s,x) => s + (Number(x.actual)||0), 0);
    const totalG = totalFix + totalTar + totalCre + totalCom;
    const libre = totalIng - totalG;

    const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent = val; };
    set("sumIngresos", fmt(totalIng)); set("sumFijos", fmt(totalFix));
    set("sumTarjetas", fmt(totalTar)); set("sumCreditos", fmt(totalCre));
    set("sumCompras", fmt(totalCom)); set("sumAhorros", fmt(totalAho));
    set("sumGastos", fmt(totalG)); set("sumLibre", fmt(libre));

    this.renderDashboard(totalIng, totalG, libre);
    this.renderMetas(d.ahorros);
    this.renderHistorial();
    this.renderConsejos(totalIng, totalG);
  }

  renderList(id, arr, row){
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = (arr && arr.length) ? arr.map(row).join("") : '<p class="meta">Sin registros.</p>';
  }

  rowGeneric(icon,i,key,monto){
    return `<div class="item ${i.paid ? "is-paid" : ""}">
      <div class="row">
        <div>${icon} <b>${i.nombre}</b><div class="meta">${i.categoria||"General"} · ${i.fecha||""}</div></div>
        <div><b>${fmt(monto)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
        <a class="${i.paid?'paid':''}" data-action="markpaid" data-key="${key}" data-id="${i.id}" href="#">${i.paid?'✅ Pagado':'☑️ Marcar pago'}</a>
      </div>
    </div>`;
  }

  rowTarjeta(i,key){
    return `<div class="item ${i.paid ? "is-paid" : ""}">
      <div class="row">
        <div>💳 <b>${i.nombre}</b>
          <div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${formatPctComma(i.tasaMensual)}%</div>
        </div>
        <div><b>Total ${fmt(i.montoTotal)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
        <a class="${i.paid?'paid':''}" data-action="markpaid" data-key="${key}" data-id="${i.id}" href="#">${i.paid?'✅ Pagado':'☑️ Marcar pago'}</a>
      </div>
    </div>`;
  }

  rowCredito(i,key){
    return `<div class="item ${i.paid ? "is-paid" : ""}">
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
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
        <a class="${i.paid?'paid':''}" data-action="markpaid" data-key="${key}" data-id="${i.id}" href="#">${i.paid?'✅ Pagado':'☑️ Marcar pago'}</a>
      </div>
    </div>`;
  }

  rowAhorro(i,key){
    const p = i.meta ? ((i.actual / i.meta) * 100).toFixed(1) : 0;
    const w = i.meta ? Math.min(100, (i.actual / i.meta) * 100) : 0;
    return `<div class="item">
      <div class="row">
        <div>💎 <b>${i.nombre}</b><div class="meta">Meta ${fmt(i.meta)} · ${i.fecha||""}</div></div>
        <div><b>${fmt(i.actual)}</b></div>
      </div>
      <div class="meta">${p}%</div>
      <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px">
        <div style="width:${w.toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div>
      </div>
      <div class="actions">
        <a data-action="addsave" data-id="${i.id}" href="#">💰 Añadir</a>
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }

  renderDashboard(ing,gastos,libre){
    const tasa = ing ? ((libre / ing) * 100).toFixed(1) : 0;
    const color = libre >= 0 ? "#00b894" : "#ff6b6b";
    const el = document.getElementById("analisisMensual");
    if(!el) return;
    el.innerHTML = `<div class="item"><b style="color:${color}">${fmt(libre)}</b> de balance — Ahorro ${tasa}%</div>`;
  }

  renderMetas(ahorros){
    const el = document.getElementById("metasAhorro"); if(!el) return;
    if(!ahorros.length){ el.innerHTML = '<p class="meta">Crea una meta para empezar.</p>'; return; }
    el.innerHTML = ahorros.map(a=>{
      const p = a.meta ? Math.min(100, (a.actual / a.meta) * 100) : 0;
      return `<div class="item"><b>${a.nombre}</b><div class="meta">${fmt(a.actual)} / ${fmt(a.meta)}</div>
        <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px"><div style="width:${p.toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div></div>
      </div>`;
    }).join("");
  }

  renderHistorial(){
    const el = document.getElementById("tablaHistorial"); if(!el) return;
    const meses = Object.keys(this.data).sort();
    const rows = meses.map(m=>{
      const d = this.data[m];
      const ing = d.ingresos.reduce((s,x)=>s+(Number(x.monto)||0),0);
      const gas = d.gastosFijos.reduce((s,x)=>s+(Number(x.monto)||0),0)
              + d.tarjetas.reduce((s,x)=>s+(Number(x.cuotaMensual)||0),0)
              + d.creditos.reduce((s,x)=>s+(Number(x.cuotaMensual)||0),0)
              + d.gastosCompras.reduce((s,x)=>s+(Number(x.monto)||0),0);
      const bal = ing - gas; const p = ing ? ((bal/ing) * 100).toFixed(1) : 0;
      return `<tr><td>${m}</td><td>${fmt(ing)}</td><td>${fmt(gas)}</td>
        <td style="color:${bal>=0?"#00b894":"#ff6b6b"}">${fmt(bal)}</td><td>${p}%</td></tr>`;
    }).join("");
    el.innerHTML = `<div style="overflow:auto"><table><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th><th>% Ahorro</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  renderConsejos(ing,gas){
    const el = document.getElementById("recomendaciones"); if(!el) return;
    const libre = ing - gas; const p = ing ? (libre/ing) * 100 : 0; const list = [];
    if(libre < 0) list.push({t:"🚨 Gastos Excesivos", d:"Tus gastos superan tus ingresos. Recorta no esenciales."});
    if(p < 10) list.push({t:"⚠️ Mejora tu ahorro", d:`Estás ahorrando ${p.toFixed(1)}%. Apunta al 20%.`});
    list.push({t:"📊 50/30/20", d:"50% necesidades, 30% gustos, 20% ahorro/inversión."});
    list.push({t:"💳 Tarjetas", d:"Paga total para evitar intereses."});
    el.innerHTML = list.map(c => `<div class="item"><b>${c.t}</b><div class="meta">${c.d}</div></div>`).join("");
  }

  /* ============== CRUD & Modals ============== */

  openForm(tipo, item = null){
    const f = (name,type,label,value,extra="") => (`<div class="field"><label>${label}</label><input type="${type}" id="f_${name}" value="${value??""}" ${extra}></div>`);
    let title="Formulario", fields="";

    if(tipo==="ingreso"){
      title="Nuevo Ingreso";
      fields = f("nombre","text","Nombre","") + f("monto","number","Monto","","step='1' min='0'") + f("categoria","text","Categoría","Trabajo") + f("fecha","date","Fecha",`${this.mes}-01`);
    } else if(tipo==="fijo"){
      title="Nuevo Gasto Fijo";
      fields = f("nombre","text","Nombre","") + f("monto","number","Monto","","step='1' min='0'") + f("categoria","text","Categoría","Vivienda") + f("fecha","date","Fecha",`${this.mes}-01`);
    } else if(tipo==="compra"){
      title="Nueva Compra";
      fields = f("nombre","text","Descripción","") + f("monto","number","Monto","","step='1' min='0'") + f("categoria","text","Categoría","Alimentación") + f("fecha","date","Fecha",`${this.mes}-01`);
    } else if(tipo==="ahorro"){
      title="Nueva Meta de Ahorro";
      fields = f("nombre","text","Nombre","") + f("meta","number","Meta","","step='1' min='0'") + f("actual","number","Actual","0","step='1' min='0'") + f("fecha","date","Fecha",`${this.mes}-01`);
    } else if(tipo==="tarjeta"){
      title="Nueva Tarjeta";
      fields = f("nombre","text","Nombre","") + f("montoTotal","number","Monto total","","step='1' min='1'") + f("numeroCuotas","number","Cuotas","","step='1' min='1'") + f("cuotasPagadas","number","Pagadas","0","step='1' min='0'") + f("tasa","text","Tasa mensual % (coma, ej: 1,85)","1,85","inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");