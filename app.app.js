/* ============== Utilidades ============== */
const fmt = (v) => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(v||0);

/** "1,84" -> 0.0184 (fracción mensual). Acepta coma. */
function parsePctComma(str){
  const s = String(str||"").trim();
  if(!/^\d+(,\d{1,3})?$/.test(s)) return NaN;
  const [ent,dec=""]=s.split(",");
  const n = Number(ent) + (dec? Number(dec)/Math.pow(10,dec.length):0);
  return n/100;
}
function formatPctComma(frac,decimals=2){
  const p=(Number(frac||0)*100).toFixed(decimals);
  return p.replace(".",",");
}

/* ============== App ============== */
class Finanzas {
  constructor(){
    this.key="organizadorFinanciero";
    this.iniYM="2025-08";
    this.mes = localStorage.getItem(`${this.key}_mes`) || this.iniYM;
    this.data=this.load();

    this.cacheEls();
    this.bindUI();
    this.buildMonths();
    this.renderAll();

    if("serviceWorker" in navigator){ navigator.serviceWorker.register("./sw.js").catch(()=>{}); }
  }

  cacheEls(){
    this.tabs=[...document.querySelectorAll(".tab")];
    this.panels=[...document.querySelectorAll(".panel")];
    this.toastEl=document.getElementById("toast");
    this.sel=document.getElementById("mesSelector");
    this.btns={
      addIngreso: document.getElementById("addIngreso"),
      addFijo: document.getElementById("addFijo"),
      addTarjeta: document.getElementById("addTarjeta"),
      addCredito: document.getElementById("addCredito"),
      addCompra: document.getElementById("addCompra"),
      addAhorro: document.getElementById("addAhorro"),
      export: document.getElementById("exportBtn"),
      reset: document.getElementById("resetBtn"),
      modal: document.getElementById("modal"),
      modalForm: document.getElementById("modalForm"),
      modalTitle: document.getElementById("modalTitle"),
      closeModal: document.getElementById("closeModal"),
    };
  }

  bindUI(){
    this.tabs.forEach(t=>t.addEventListener("click",()=>this.showTab(t.dataset.tab)));
    if(this.sel) this.sel.addEventListener("change",(e)=>{ this.mes=e.target.value; localStorage.setItem(`${this.key}_mes`, this.mes); this.ensureMonth(this.mes); this.renderAll(); this.toast("Mes cambiado"); });
    Object.entries(this.btns).forEach(([k,el])=>{
      if(!el) return;
      if(k==="addIngreso") el.onclick=()=>this.openForm("ingreso");
      if(k==="addFijo") el.onclick=()=>this.openForm("fijo");
      if(k==="addTarjeta") el.onclick=()=>this.openForm("tarjeta");
      if(k==="addCredito") el.onclick=()=>this.openForm("credito");
      if(k==="addCompra") el.onclick=()=>this.openForm("compra");
      if(k==="addAhorro") el.onclick=()=>this.openForm("ahorro");
      if(k==="export") el.onclick=()=>this.export();
      if(k==="reset") el.onclick=()=>this.reset();
      if(k==="closeModal") el.onclick=()=>this.closeModal();
    });

    // Delegación: edit / delete / add ahorro
    document.body.addEventListener("click",(ev)=>{
      const a=ev.target.closest("a[data-action]"); if(!a) return;
      ev.preventDefault();
      const act=a.dataset.action, key=a.dataset.key, id=parseInt(a.dataset.id);
      if(act==="edit") this.edit(key,id);
      if(act==="del") this.del(key,id);
      if(act==="addsave") this.addAhorroMonto(id);
    });

    // Cerrar modal por overlay y Escape
    this.btns.modal.addEventListener("click",(e)=>{ if(e.target.id==="modal") this.closeModal(); });
    document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") this.closeModal(); });

    // Normalizar input decimal (mientras escriben) -> convertir punto a coma para la UX hispana
    document.body.addEventListener('input', (e) => {
      const el = e.target;
      if(!el) return;
      if(el.getAttribute && el.getAttribute('inputmode') === 'decimal'){
        el.value = el.value.replace('.',',').replace(/[^\d,]/g,'');
      }
    }, {passive:true});
  }

  showTab(name){
    this.tabs.forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
    this.panels.forEach(p=>p.classList.toggle("hidden",p.id!==name));
  }

  /* ====== Storage & seed ====== */
  uid(){ return Date.now()+Math.floor(Math.random()*1e6); }
  load(){
    try{ const raw=localStorage.getItem(this.key); if(raw) return JSON.parse(raw); }catch{}
    // seed inicial útil
    const seed={}; seed[this.iniYM]={
      ingresos:[{id:this.uid(),nombre:"Salario",monto:3500000,categoria:"Trabajo",fecha:`${this.iniYM}-01`}],
      gastosFijos:[{id:this.uid(),nombre:"Arriendo",monto:1200000,categoria:"Vivienda",fecha:`${this.iniYM}-01`}],
      tarjetas:[],
      creditos:[],
      gastosCompras:[{id:this.uid(),nombre:"Supermercado",monto:400000,categoria:"Alimentación",fecha:`${this.iniYM}-10`}],
      ahorros:[{id:this.uid(),nombre:"Emergencias",meta:5000000,actual:1200000,fecha:`${this.iniYM}-01`}]
    };
    return seed;
  }
  save(){ try{ localStorage.setItem(this.key,JSON.stringify(this.data)); }catch{} }

  /** Crear mes nuevo — copia del mes previo (ingresos, fijos, tarjetas, creditos, ahorros) */
  ensureMonth(key){
    if(this.data[key]) return;
    const [y,m]=key.split("-").map(Number);
    let py=y, pm=m-1; if(pm<=0){pm=12;py--;}
    const prev=`${py}-${String(pm).padStart(2,"0")}`;
    if(this.data[prev]){
      const prevObj=this.data[prev];
      const copy={
        ingresos: prevObj.ingresos.map(it=>{ const n=JSON.parse(JSON.stringify(it)); n.id=this.uid(); n.fecha=`${key}-01`; return n; }),
        gastosFijos: prevObj.gastosFijos.map(it=>{ const n=JSON.parse(JSON.stringify(it)); n.id=this.uid(); n.fecha=`${key}-01`; return n; }),
        tarjetas: prevObj.tarjetas.map(it=>{ const n=JSON.parse(JSON.stringify(it)); n.id=this.uid(); n.fecha=`${key}-01`; return n; }),
        creditos: prevObj.creditos.map(it=>{ const n=JSON.parse(JSON.stringify(it)); n.id=this.uid(); n.fecha=`${key}-01`; return n; }),
        gastosCompras: prevObj.gastosCompras.map(it=>{ const n=JSON.parse(JSON.stringify(it)); n.id=this.uid(); n.fecha=`${key}-01`; return n; }),
        ahorros: prevObj.ahorros.map(it=>{ const n=JSON.parse(JSON.stringify(it)); n.id=this.uid(); return n; })
      };
      this.data[key]=copy;
    }else{
      this.data[key]={ingresos:[],gastosFijos:[],tarjetas:[],creditos:[],gastosCompras:[],ahorros:[]};
    }
    this.save();
  }

  buildMonths(){
    const sel=this.sel; if(!sel) return;
    sel.innerHTML="";
    const [y,m]=this.iniYM.split("-").map(Number);
    const d=new Date(y,m-1,1);
    for(let i=0;i<=36;i++){
      const val=d.toISOString().slice(0,7);
      const txt=d.toLocaleDateString("es-CO",{month:"long",year:"numeric"});
      const opt=document.createElement("option");
      opt.value=val; opt.textContent=txt; if(val===this.mes) opt.selected=true;
      sel.appendChild(opt); d.setMonth(d.getMonth()+1);
    }
    this.ensureMonth(this.mes);
  }

  /* ====== Finanzas: cuota (sistema francés) ====== */
  rateFromInput(pctStr){ const r=parsePctComma(pctStr); return isNaN(r)?0:r; }

  cuota(M,i,n,avalPct=0,ivaAvalPct=0){
    if(!n||n<=0) return 0;
    let base;
    if(!i || i===0) base = M / n;
    else {
      // fórmula: A = M * i / (1 - (1+i)^-n)
      const denom = 1 - Math.pow(1+i, -n);
      base = M * i / denom;
    }
    const avalMensual = (M * (avalPct||0)) / n;
    const ivaAvalMensual = avalMensual * (ivaAvalPct||0);
    return Math.round(base + avalMensual + ivaAvalMensual);
  }

  recalcDeudas(d){
    (d.tarjetas||[]).forEach(it=>{
      const nueva=this.cuota(Number(it.montoTotal||0),Number(it.tasaMensual||0),parseInt(it.numeroCuotas||0));
      if(!it.cuotaMensual || Math.abs((it.cuotaMensual||0)-nueva)>1) it.cuotaMensual=nueva;
    });
    (d.creditos||[]).forEach(it=>{
      const nueva=this.cuota(
        Number(it.montoTotal||0),
        Number(it.tasaMensual||0),
        parseInt(it.numeroCuotas||0),
        Number(it.avalPct||0),
        Number(it.ivaAvalPct||0)
      );
      if(!it.cuotaMensual || Math.abs((it.cuotaMensual||0)-nueva)>1) it.cuotaMensual=nueva;
    });
  }

  /* ====== Render ====== */
  get mesData(){ this.ensureMonth(this.mes); return this.data[this.mes]; }

  renderAll(){
    const d=this.mesData;
    this.recalcDeudas(d); this.save();

    this.renderList("listaIngresos",d.ingresos,i=>this.rowGeneric("💵",i,"ingresos",i.monto));
    this.renderList("listaFijos",d.gastosFijos,i=>this.rowGeneric("🏠",i,"gastosFijos",i.monto));
    this.renderList("listaTarjetas",d.tarjetas,i=>this.rowTarjeta(i,"tarjetas"));
    this.renderList("listaCreditos",d.creditos,i=>this.rowCredito(i,"creditos"));
    this.renderList("listaCompras",d.gastosCompras,i=>this.rowGeneric("🛒",i,"gastosCompras",i.monto));
    this.renderList("listaAhorros",d.ahorros,i=>this.rowAhorro(i,"ahorros"));

    const totalIng=d.ingresos.reduce((s,x)=>s+(x.monto||0),0);
    const totalFix=d.gastosFijos.reduce((s,x)=>s+(x.monto||0),0);
    const totalTar=d.tarjetas.reduce((s,x)=>s+(x.cuotaMensual||0),0);
    const totalCre=d.creditos.reduce((s,x)=>s+(x.cuotaMensual||0),0);
    const totalCom=d.gastosCompras.reduce((s,x)=>s+(x.monto||0),0);
    const totalAho=d.ahorros.reduce((s,x)=>s+(x.actual||0),0);
    const totalG=totalFix+totalTar+totalCre+totalCom;
    const libre=totalIng-totalG;

    const set=(id,title,val)=>{ const el=document.getElementById(id); if(!el) return; el.querySelector('.title').textContent=title; el.querySelector('.value').textContent=val; };
    set("sumIngresos","💵 Ingresos",fmt(totalIng));
    set("sumFijos","🏠 Fijos",fmt(totalFix));
    set("sumTarjetas","💳 Tarjetas",fmt(totalTar));
    set("sumCreditos","🏦 Créditos",fmt(totalCre));
    set("sumCompras","🛒 Compras",fmt(totalCom));
    set("sumAhorros","💎 Ahorros",fmt(totalAho));
    set("sumGastos","📉 Total Gastos",fmt(totalG));
    set("sumLibre","💰 Disponible",fmt(libre));

    this.renderDashboard(totalIng,totalG,libre);
    this.renderMetas(d.ahorros);
    this.renderHistorial();
    this.renderConsejos(totalIng,totalG);
  }

  renderList(id,arr,row){ const el=document.getElementById(id); if(!el) return; el.innerHTML=arr && arr.length?arr.map(row).join(""):'<p class="meta">Sin registros.</p>'; }

  rowGeneric(icon,i,key,monto){
    return `<div class="item">
      <div class="row">
        <div>${icon} <b>${i.nombre}</b><div class="meta">${i.categoria||""} ${i.fecha?`· ${i.fecha}`:""}</div></div>
        <div><b>${fmt(monto)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }

  rowTarjeta(i,key){
    return `<div class="item ${i.paid?'is-paid':''}">
      <div class="row">
        <div>💳 <b>${i.nombre}</b>
          <div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas||0} · tasa ${formatPctComma(i.tasaMensual)}%</div>
        </div>
        <div><b>Total ${fmt(i.montoTotal)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }

  rowCredito(i,key){
    return `<div class="item ${i.paid?'is-paid':''}">
      <div class="row">
        <div>🏦 <b>${i.nombre}</b>
          <div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas||0}
            · tasa ${formatPctComma(i.tasaMensual)}%
            ${i.avalPct?` · aval ${formatPctComma(i.avalPct)}%`:``}
            ${i.ivaAvalPct?` + IVA ${formatPctComma(i.ivaAvalPct)}%`:``}
          </div>
        </div>
        <div><b>Total ${fmt(i.montoTotal)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a>
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }

  rowAhorro(i,key){
    const p=i.meta?((i.actual/i.meta)*100).toFixed(1):0;
    const w=i.meta?Math.min(100,(i.actual/i.meta)*100):0;
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
    const tasa=ing?((libre/ing)*100).toFixed(1):0;
    const color=libre>=0?"#00b894":"#ff6b6b";
    const el=document.getElementById("analisisMensual");
    if(!el) return;
    el.innerHTML=`<div class="item"><b style="color:${color}">${fmt(libre)}</b> de balance — Ahorro ${tasa}%</div>`;
  }

  renderMetas(ahorros){
    const el=document.getElementById("metasAhorro"); if(!el) return;
    if(!ahorros || !ahorros.length){ el.innerHTML='<p class="meta">Crea una meta para empezar.</p>'; return; }
    el.innerHTML=ahorros.map(a=>{
      const p=a.meta?Math.min(100,(a.actual/a.meta)*100):0;
      return `<div class="item">
        <b>${a.nombre}</b><div class="meta">${fmt(a.actual)} / ${fmt(a.meta)}</div>
        <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px">
          <div style="width:${p.toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div>
        </div>
      </div>`;
    }).join("");
  }

  renderHistorial(){
    const el=document.getElementById("tablaHistorial"); if(!el) return;
    const meses=Object.keys(this.data).sort();
    const rows=meses.map(m=>{
      const d=this.data[m];
      const ing=d.ingresos.reduce((s,x)=>s+(x.monto||0),0);
      const gas=d.gastosFijos.reduce((s,x)=>s+(x.monto||0),0)
              + d.tarjetas.reduce((s,x)=>s+(x.cuotaMensual||0),0)
              + d.creditos.reduce((s,x)=>s+(x.cuotaMensual||0),0)
              + d.gastosCompras.reduce((s,x)=>s+(x.monto||0),0);
      const bal=ing-gas; const p=ing?((bal/ing)*100).toFixed(1):0;
      return `<tr><td>${m}</td><td>${fmt(ing)}</td><td>${fmt(gas)}</td>
        <td style="color:${bal>=0?"#00b894":"#ff6b6b"}">${fmt(bal)}</td><td>${p}%</td></tr>`;
    }).join("");
    el.innerHTML=`<div style="overflow:auto">
      <table style="width:100%;border-collapse:collapse"><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th><th>% Ahorro</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  renderConsejos(ing,gas){
    const el=document.getElementById("recomendaciones"); if(!el) return;
    const libre=ing-gas; const p=ing?(libre/ing)*100:0; const list=[];
    if(libre<0) list.push({t:"🚨 Gastos Excesivos",d:"Tus gastos superan tus ingresos. Recorta no esenciales."});
    if(p<10) list.push({t:"⚠️ Mejora tu ahorro",d:`Estás ahorrando ${p.toFixed(1)}%. Apunta al 20%.`});
    list.push({t:"📊 50/30/20",d:"50% necesidades, 30% gustos, 20% ahorro/inversión."});
    list.push({t:"💳 Tarjetas",d:"Paga total para evitar intereses."});
    el.innerHTML=list.map(c=>`<div class="item"><b>${c.t}</b><div class="meta">${c.d}</div></div>`).join("");
  }

  /* ====== CRUD + Modal ====== */
  openForm(tipo,item=null){
    const f=(name,type,label,value,extra="")=>(
      `<div class="field"><label>${label}</label><input type="${type}" id="f_${name}" value="${value??""}" ${extra}></div>`
    );
    let title="Formulario", fields="";
    // campos por tipo
    if(tipo==="ingreso"){
      title="Nuevo Ingreso";
      fields= f("nombre","text","Nombre","")
            + f("monto","number","Monto","","step='1' min='0'")
            + f("categoria","text","Categoría","Trabajo")
            + f("fecha","date","Fecha",`${this.mes}-01`);
    }else if(tipo==="fijo"){
      title="Nuevo Gasto Fijo";
      fields= f("nombre","text","Nombre","")
            + f("monto","number","Monto","","step='1' min='0'")
            + f("categoria","text","Categoría","Vivienda")
            + f("fecha","date","Fecha",`${this.mes}-01`);
    }else if(tipo==="compra"){
      title="Nueva Compra";
      fields= f("nombre","text","Descripción","")
            + f("monto","number","Monto","","step='1' min='0'")
            + f("categoria","text","Categoría","Alimentación")
            + f("fecha","date","Fecha",`${this.mes}-01`);
    }else if(tipo==="ahorro"){
      title="Nueva Meta de Ahorro";
      fields= f("nombre","text","Nombre","")
            + f("meta","number","Meta","","step='1' min='0'")
            + f("actual","number","Actual","0","step='1' min='0'")
            + f("fecha","date","Fecha",`${this.mes}-01`);
    }else if(tipo==="tarjeta"){
      title="Nueva Tarjeta";
      fields= f("nombre","text","Nombre","")
            + f("montoTotal","number","Monto total","","step='1' min='1'")
            + f("numeroCuotas","number","Cuotas","","step='1' min='1'")
            + f("cuotasPagadas","number","Pagadas","0","step='1' min='0'")
            + f("tasa","text","Tasa mensual % (coma, ej: 1,85)","1,85","inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'");
    }else if(tipo==="credito"){
      title="Nuevo Crédito";
      fields= f("nombre","text","Nombre","")
            + f("montoTotal","number","Monto total","","step='1' min='1'")
            + f("numeroCuotas","number","Cuotas","","step='1' min='1'")
            + f("cuotasPagadas","number","Pagadas","0","step='1' min='0'")
            + f("tasa","text","Tasa mensual % (coma, ej: 1,85)","1,85","inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'")
            + f("aval","text","Aval % sobre capital (coma, ej: 12,00)","0,00","inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'")
            + f("ivaAval","text","IVA del aval % (coma, ej: 19,00)","0,00","inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'");
    }

    this.showModal(title, fields, (vals)=>{
      const d=this.mesData;
      const n=(x)=>Number(x||0);
      const pct=(x)=>this.rateFromInput(x);

      if(tipo==="ingreso"){
        d.ingresos.push({id:this.uid(),nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha});
      }else if(tipo==="fijo"){
        d.gastosFijos.push({id:this.uid(),nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha});
      }else if(tipo==="compra"){
        d.gastosCompras.push({id:this.uid(),nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha});
      }else if(tipo==="ahorro"){
        d.ahorros.push({id:this.uid(),nombre:vals.nombre,meta:n(vals.meta),actual:n(vals.actual),fecha:vals.fecha});
      }else if(tipo==="tarjeta"){
        const tasa=pct(vals.tasa);
        if(!(tasa>0 && tasa<=0.5)) { this.toast("Tasa inválida (usa coma, ej: 1,85)"); return; }
        const M=n(vals.montoTotal), cu=parseInt(vals.numeroCuotas||0), pag=parseInt(vals.cuotasPagadas||0);
        const cuota=this.cuota(M,tasa,cu);
        d.tarjetas.push({id:this.uid(),nombre:vals.nombre,montoTotal:M,numeroCuotas:cu,cuotasPagadas:pag,tasaMensual:tasa,cuotaMensual:cuota,fecha:`${this.mes}-01`});
      }else if(tipo==="credito"){
        const tasa=pct(vals.tasa), aval=pct(vals.aval||"0"), iva=pct(vals.ivaAval||"0");
        if(!(tasa>0 && tasa<=0.5)) { this.toast("Tasa inválida (usa coma, ej: 1,85)"); return; }
        if(aval<0||aval>0.6){ this.toast("Aval fuera de rango (0%–60%)"); return; }
        if(iva<0||iva>0.6){ this.toast("IVA aval fuera de rango (0%–60%)"); return; }
        const M=n(vals.montoTotal), cu=parseInt(vals.numeroCuotas||0), pag=parseInt(vals.cuotasPagadas||0);
        const cuota=this.cuota(M,tasa,cu,aval,iva);
        d.creditos.push({id:this.uid(),nombre:vals.nombre,montoTotal:M,numeroCuotas:cu,cuotasPagadas:pag,tasaMensual:tasa,avalPct:aval,ivaAvalPct:iva,cuotaMensual:cuota,fecha:`${this.mes}-01`});
      }

      this.save(); this.renderAll(); this.toast("Guardado");
    });
  }

  edit(key,id){
    const list=this.mesData[key]; const it=list.find(x=>x.id===id); if(!it) return;
    const isDeuda=(key==="tarjetas"||key==="creditos");

    const f=(name,type,label,value,extra="")=>(
      `<div class="field"><label>${label}</label><input type="${type}" id="f_${name}" value="${value??""}" ${extra}></div>`
    );
    let title="Editar", fields="";
    if(!isDeuda && key!=="ahorros"){
      fields= f("nombre","text","Nombre",it.nombre)
            + f("monto","number","Monto",it.monto,"step='1' min='0'")
            + f("categoria","text","Categoría",it.categoria||"")
            + f("fecha","date","Fecha",it.fecha||`${this.mes}-01`);
    }else if(key==="ahorros"){
      title="Editar Meta";
      fields= f("nombre","text","Nombre",it.nombre)
            + f("meta","number","Meta",it.meta,"step='1' min='0'")
            + f("actual","number","Actual",it.actual,"step='1' min='0'");
    }else if(key==="tarjetas"){
      title="Editar Tarjeta";
      fields= f("nombre","text","Nombre",it.nombre)
            + f("montoTotal","number","Monto total",it.montoTotal,"step='1' min='1'")
            + f("numeroCuotas","number","Cuotas",it.numeroCuotas,"step='1' min='1'")
            + f("cuotasPagadas","number","Pagadas",it.cuotasPagadas||0,"step='1' min='0'")
            + f("tasa","text","Tasa mensual % (coma)",formatPctComma(it.tasaMensual),"inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'");
    }else if(key==="creditos"){
      title="Editar Crédito";
      fields= f("nombre","text","Nombre",it.nombre)
            + f("montoTotal","number","Monto total",it.montoTotal,"step='1' min='1'")
            + f("numeroCuotas","number","Cuotas",it.numeroCuotas,"step='1' min='1'")
            + f("cuotasPagadas","number","Pagadas",it.cuotasPagadas||0,"step='1' min='0'")
            + f("tasa","text","Tasa mensual % (coma)",formatPctComma(it.tasaMensual),"inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'")
            + f("aval","text","Aval %",it.avalPct?formatPctComma(it.avalPct):"0,00","inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'")
            + f("ivaAval","text","IVA aval %",it.ivaAvalPct?formatPctComma(it.ivaAvalPct):"0,00","inputmode='decimal' pattern='^\\d+(,\\d{1,3})?$' oninput='this.value=this.value.replace(\".\",\",\");'");
    }

    this.showModal(title, fields, (vals)=>{
      const n=(x)=>Number(x||0), pct=(x)=>this.rateFromInput(x);
      if(!isDeuda && key!=="ahorros"){
        Object.assign(it,{nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha});
      }else if(key==="ahorros"){
        Object.assign(it,{nombre:vals.nombre,meta:n(vals.meta),actual:n(vals.actual)});
      }else if(key==="tarjetas"){
        const tasa=pct(vals.tasa); if(!(tasa>0 && tasa<=0.5)){ this.toast("Tasa inválida (≤50%)"); return; }
        const M=n(vals.montoTotal), cu=parseInt(vals.numeroCuotas||0), pag=parseInt(vals.cuotasPagadas||0);
        Object.assign(it,{nombre:vals.nombre,montoTotal:M,numeroCuotas:cu,cuotasPagadas:pag,tasaMensual:tasa,cuotaMensual:this.cuota(M,tasa,cu)});
      }else if(key==="creditos"){
        const tasa=pct(vals.tasa), aval=pct(vals.aval||"0"), iva=pct(vals.ivaAval||"0");
        if(!(tasa>0 && tasa<=0.5)){ this.toast("Tasa inválida (≤50%)"); return; }
        if(aval<0||aval>0.6){ this.toast("Aval fuera de rango (0%–60%)"); return; }
        if(iva<0||iva>0.6){ this.toast("IVA aval fuera de rango (0%–60%)"); return; }
        const M=n(vals.montoTotal), cu=parseInt(vals.numeroCuotas||0), pag=parseInt(vals.cuotasPagadas||0);
        Object.assign(it,{nombre:vals.nombre,montoTotal:M,numeroCuotas:cu,cuotasPagadas:pag,tasaMensual:tasa,avalPct:aval,ivaAvalPct:iva,cuotaMensual:this.cuota(M,tasa,cu,aval,iva)});
      }
      this.save(); this.renderAll(); this.toast("Actualizado");
    });
  }

  del(key,id){
    if(!confirm("¿Eliminar registro?")) return;
    this.data[this.mes][key]=(this.data[this.mes][key]||[]).filter(x=>x.id!==id);
    this.save(); this.renderAll(); this.toast("Eliminado");
  }

  addAhorroMonto(id){
    const a=this.mesData.ahorros.find(x=>x.id===id); if(!a) return;
    const m=prompt("¿Cuánto agregar?","0"); const n=Number(m);
    if(n>0){ a.actual+=n; this.save(); this.renderAll(); this.toast("Ahorro agregado"); }
  }

  /* ====== Modal ====== */
  showModal(title, innerHtml, onSubmit){
    const modal=this.btns.modal, form=this.btns.modalForm, titleEl=this.btns.modalTitle;
    titleEl.textContent=title;
    form.innerHTML= innerHtml + `
      <div class="actions" style="margin-top:12px">
        <button type="submit" class="btn">Guardar</button>
        <button type="button" class="btn" id="cancelModal">Cancelar</button>
      </div>`;

    modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false");

    const cancel=()=>this.closeModal();
    const cancelBtn=document.getElementById("cancelModal");
    if(cancelBtn) cancelBtn.onclick=cancel;

    form.onsubmit=(e)=>{
      e.preventDefault();
      const vals={};
      [...form.querySelectorAll("input")].forEach(inp=>{ const id=inp.id.replace(/^f_/,""); vals[id]=inp.value; });
      // cerramos antes para evitar modal colgado
      this.closeModal();
      // ejecutamos guardado después con pequeño delay para asegurar DOM limpio
      setTimeout(()=>onSubmit(vals),50);
    };
  }

  closeModal(){
    const modal=this.btns.modal, form=this.btns.modalForm, titleEl=this.btns.modalTitle;
    if(form) form.onsubmit=null;
    if(modal) modal.classList.add("hidden");
    if(modal) modal.setAttribute("aria-hidden","true");
    if(form) form.innerHTML="";
    if(titleEl) titleEl.textContent="";
  }

  /* ====== Otros ====== */
  export(){
    const data={exportado:new Date().toISOString(),mes:this.mes,datos:this.data};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download="organizador-financiero.json"; a.click(); URL.revokeObjectURL(url);
  }
  reset(){ if(confirm("¿Borrar datos locales?")){ localStorage.removeItem(this.key); localStorage.removeItem(`${this.key}_mes`); location.reload(); } }
  toast(m){ const t=this.toastEl; if(!t) return; t.textContent=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1500); }
}
window.app=new Finanzas();