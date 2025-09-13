/* ========= Utilidades ========= */
const fmt = v => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(v||0);

/** Convierte "1,84" a fracción 0.0184 (admite 0–3 decimales). */
function parsePctComma(str){
  const s = String(str||"").trim();
  if(!/^\d+(,\d{1,3})?$/.test(s)) return NaN;
  const [ent,dec=""]=s.split(",");
  const n = Number(ent) + (dec? Number(dec)/Math.pow(10,dec.length):0);
  return n/100;
}
function formatPctComma(frac,dec=2){
  const p=(Number(frac||0)*100).toFixed(dec);
  return p.replace(".",",");
}
const uid = () => Date.now()+Math.floor(Math.random()*1e6);

/* ========= App ========= */
class App {
  constructor(){
    this.KEY="organizadorFinanciero";
    this.iniYM="2025-08";
    this.mes=this.iniYM;
    this.data=this.load();

    this.cache();
    this.events();
    this.buildMonths();
    this.renderAll();

    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  cache(){
    this.$ = (sel)=>document.querySelector(sel);
    this.tabs=[...document.querySelectorAll('.tab')];
    this.panels=[...document.querySelectorAll('.panel')];
    this.sel=this.$('#mesSelector');
    this.toastEl=this.$('#toast');
    this.btn={
      addIngreso:this.$('#addIngreso'),
      addFijo:this.$('#addFijo'),
      addTarjeta:this.$('#addTarjeta'),
      addCredito:this.$('#addCredito'),
      addCompra:this.$('#addCompra'),
      addAhorro:this.$('#addAhorro'),
      export:this.$('#exportBtn'),
      reset:this.$('#resetBtn'),
      modal:this.$('#modal'),
      modalForm:this.$('#modalForm'),
      modalTitle:this.$('#modalTitle'),
      closeModal:this.$('#closeModal'),
    };
  }

  events(){
    // Tabs
    this.tabs.forEach(b=>b.addEventListener('click',()=>{
      const tab=b.dataset.tab;
      this.tabs.forEach(x=>x.classList.toggle('active',x===b));
      this.panels.forEach(p=>p.classList.toggle('hidden',p.id!==tab));
      if(tab==='dashboard') this.updateDashboard();
    }));

    // Mes
    this.sel.addEventListener('change',(e)=>{
      this.mes=e.target.value;
      this.ensureMonth(this.mes);
      this.renderAll();
      this.toast('Mes cambiado');
    });

    // Botones agregar
    this.btn.addIngreso.onclick=()=>this.openForm('ingreso');
    this.btn.addFijo.onclick=()=>this.openForm('fijo');
    this.btn.addTarjeta.onclick=()=>this.openForm('tarjeta');
    this.btn.addCredito.onclick=()=>this.openForm('credito');
    this.btn.addCompra.onclick=()=>this.openForm('compra');
    this.btn.addAhorro.onclick=()=>this.openForm('ahorro');

    // Export / reset
    this.btn.export.onclick=()=>this.export();
    this.btn.reset.onclick=()=>this.reset();

    // Modal
    this.btn.closeModal.onclick=()=>this.closeModal();
    this.btn.modal.addEventListener('click',e=>{ if(e.target.id==='modal') this.closeModal(); });

    // Acciones delegadas
    document.body.addEventListener('click',(ev)=>{
      const a=ev.target.closest('a[data-action]'); if(!a) return;
      ev.preventDefault();
      const {action,key,id}=a.dataset;
      if(action==='edit') this.edit(key,Number(id));
      if(action==='del') this.del(key,Number(id));
      if(action==='paid') this.togglePaid(key,Number(id));
      if(action==='addsave') this.addAhorro(Number(id));
    });
  }

  /* ===== Storage ===== */
  load(){
    try{
      const raw=localStorage.getItem(this.KEY);
      if(raw) return JSON.parse(raw);
    }catch{}
    const seed={};
    seed[this.iniYM]={
      ingresos:[{id:uid(),nombre:'Salario',monto:3500000,categoria:'Trabajo',fecha:`${this.iniYM}-01`}],
      gastosFijos:[{id:uid(),nombre:'Arriendo',monto:1200000,categoria:'Vivienda',fecha:`${this.iniYM}-01`,pagadoMes:false}],
      tarjetas:[],
      creditos:[{id:uid(),nombre:'Crédito Vehículo',montoTotal:24200000,numeroCuotas:60,cuotasPagadas:0,tasaMensual:0.01842,cuotaMensual:0,pagadoMes:false,fecha:`${this.iniYM}-01`}],
      gastosCompras:[{id:uid(),nombre:'Supermercado',monto:400000,categoria:'Alimentación',fecha:`${this.iniYM}-10`,pagadoMes:false}],
      ahorros:[{id:uid(),nombre:'Emergencias',meta:5000000,actual:1200000,fecha:`${this.iniYM}-01`}]
    };
    // calcular cuota inicial
    seed[this.iniYM].creditos[0].cuotaMensual=this.cuota(24200000,0.01842,60);
    return seed;
  }
  save(){ try{ localStorage.setItem(this.KEY,JSON.stringify(this.data)); }catch{} }

  // copia mes anterior
  ensureMonth(key){
    if(this.data[key]) return;
    const [y,m]=key.split('-').map(Number);
    let py=y, pm=m-1; if(pm<=0){pm=12;py--;}
    const prev=`${py}-${String(pm).padStart(2,'0')}`;
    if(this.data[prev]){
      const copy=JSON.parse(JSON.stringify(this.data[prev]));
      // reset ids y pagadoMes
      ['ingresos','gastosFijos','tarjetas','creditos','gastosCompras','ahorros'].forEach(k=>{
        copy[k]=(copy[k]||[]).map(it=>({
          ...it,
          id:uid(),
          fecha:`${key}-01`,
          pagadoMes:false
        }));
      });
      this.data[key]=copy;
    }else{
      this.data[key]={ingresos:[],gastosFijos:[],tarjetas:[],creditos:[],gastosCompras:[],ahorros:[]};
    }
    this.save();
  }

  buildMonths(){
    const [y,m]=this.iniYM.split('-').map(Number);
    const d=new Date(y,m-1,1);
    this.sel.innerHTML='';
    for(let i=0;i<48;i++){
      const val=d.toISOString().slice(0,7);
      const txt=d.toLocaleDateString('es-CO',{month:'long',year:'numeric'});
      const opt=document.createElement('option');
      opt.value=val; opt.textContent=txt;
      if(val===this.mes) opt.selected=true;
      this.sel.appendChild(opt);
      d.setMonth(d.getMonth()+1);
    }
    this.ensureMonth(this.mes);
  }

  /* ===== Finanzas ===== */
  cuota(M,i,n){ // francés
    if(!n||n<=0) return 0;
    if(!i) return Math.round(M/n);
    const f=Math.pow(1+i,n);
    return Math.round((M*i*f)/(f-1));
  }

  recalc(d){
    (d.tarjetas||[]).forEach(t=>{
      const nueva=this.cuota(Number(t.montoTotal||0),Number(t.tasaMensual||0),parseInt(t.numeroCuotas||0));
      if(!t.cuotaMensual || Math.abs((t.cuotaMensual||0)-nueva)>1) t.cuotaMensual=nueva;
    });
    (d.creditos||[]).forEach(c=>{
      const nueva=this.cuota(Number(c.montoTotal||0),Number(c.tasaMensual||0),parseInt(c.numeroCuotas||0));
      if(!c.cuotaMensual || Math.abs((c.cuotaMensual||0)-nueva)>1) c.cuotaMensual=nueva;
    });
  }

  get D(){ this.ensureMonth(this.mes); return this.data[this.mes]; }

  /* ===== Render ===== */
  renderAll(){
    const d=this.D;
    this.recalc(d); this.save();

    this.renderList('listaIngresos',d.ingresos,i=>this.rowGeneric('💵',i,'ingresos',i.monto));
    this.renderList('listaFijos',d.gastosFijos,i=>this.rowGeneric('🏠',i,'gastosFijos',i.monto,true));
    this.renderList('listaTarjetas',d.tarjetas,i=>this.rowDeuda('💳',i,'tarjetas'));
    this.renderList('listaCreditos',d.creditos,i=>this.rowDeuda('🏦',i,'creditos'));
    this.renderList('listaCompras',d.gastosCompras,i=>this.rowGeneric('🛒',i,'gastosCompras',i.monto,true));
    this.renderList('listaAhorros',d.ahorros,i=>this.rowAhorro(i));

    // Totales (excluye pagadoMes)
    const totalIng=d.ingresos.reduce((s,x)=>s+(x.monto||0),0);
    const totalFix=d.gastosFijos.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.monto||0),0);
    const totalTar=d.tarjetas.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.cuotaMensual||0),0);
    const totalCre=d.creditos.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.cuotaMensual||0),0);
    const totalCom=d.gastosCompras.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.monto||0),0);
    const totalAho=d.ahorros.reduce((s,x)=>s+(x.actual||0),0);
    const totalG=totalFix+totalTar+totalCre+totalCom;
    const libre=totalIng-totalG;

    const set=(id,val)=>{const el=document.getElementById(id);if(el) el.textContent=val;};
    set('sumIngresos',fmt(totalIng));
    set('sumFijos',fmt(totalFix));
    set('sumTarjetas',fmt(totalTar));
    set('sumCreditos',fmt(totalCre));
    set('sumCompras',fmt(totalCom));
    set('sumAhorros',fmt(totalAho));
    set('sumGastos',fmt(totalG));
    set('sumLibre',fmt(libre));

    this.updateDashboard();
    this.renderMetas(d.ahorros);
    this.renderHistorial();
    this.renderConsejos(totalIng,totalG);
  }

  renderList(id,arr,row){
    const el=document.getElementById(id); if(!el) return;
    el.innerHTML = arr.length ? arr.map(row).join('') : '<div class="box">Sin registros.</div>';
  }

  rowGeneric(icon,i,key,monto,allowPaid=false){
    return `<div class="item ${i.pagadoMes?'is-paid':''}">
      <div class="row">
        <div>${icon} <b>${i.nombre||'—'}</b>
          <div class="meta">${i.categoria||'General'} · ${i.fecha||''}</div>
        </div>
        <div><b>${fmt(monto||0)}</b>${allowPaid? this.badgePaid(i):''}</div>
      </div>
      <div class="actions">
        ${allowPaid? `<a href="#" data-action="paid" data-key="${key}" data-id="${i.id}" class="paid">✔ Pagado</a>`:''}
        <a href="#" data-action="edit" data-key="${key}" data-id="${i.id}" class="edit">✏️ Editar</a>
        <a href="#" data-action="del"  data-key="${key}" data-id="${i.id}" class="del">🗑️ Eliminar</a>
      </div>
    </div>`;
  }
  rowDeuda(icon,i,key){
    return `<div class="item ${i.pagadoMes?'is-paid':''}">
      <div class="row">
        <div>${icon} <b>${i.nombre||'—'}</b>
          <div class="meta">Cuota ${fmt(i.cuotaMensual||0)} · ${i.cuotasPagadas||0}/${i.numeroCuotas||0} · tasa ${formatPctComma(i.tasaMensual||0)}%</div>
        </div>
        <div><b>Total ${fmt(i.montoTotal||0)}</b>${this.badgePaid(i)}</div>
      </div>
      <div class="actions">
        <a href="#" data-action="paid" data-key="${key}" data-id="${i.id}" class="paid">✔ Pagado</a>
        <a href="#" data-action="edit" data-key="${key}" data-id="${i.id}" class="edit">✏️ Editar</a>
        <a href="#" data-action="del"  data-key="${key}" data-id="${i.id}" class="del">🗑️ Eliminar</a>
      </div>
    </div>`;
  }
  rowAhorro(i){
    const p=i.meta?((i.actual/i.meta)*100):0;
    return `<div class="item">
      <div class="row">
        <div>💎 <b>${i.nombre||'—'}</b><div class="meta">Meta ${fmt(i.meta||0)}</div></div>
        <div><b>${fmt(i.actual||0)}</b></div>
      </div>
      <div class="meta">${p.toFixed(1)}%</div>
      <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px">
        <div style="width:${Math.min(100,p).toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div>
      </div>
      <div class="actions">
        <a href="#" data-action="addsave" data-id="${i.id}" class="pill">💰 Añadir</a>
        <a href="#" data-action="edit" data-key="ahorros" data-id="${i.id}" class="edit">✏️ Editar</a>
        <a href="#" data-action="del"  data-key="ahorros" data-id="${i.id}" class="del">🗑️ Eliminar</a>
      </div>
    </div>`;
  }
  badgePaid(i){ return i.pagadoMes ? `<span class="badge success">Pagado</span>` : ``; }

  /* ===== Dashboard & otros ===== */
  updateDashboard(){
    const el=document.getElementById('analisisMensual'); if(!el) return;
    const ingText=document.getElementById('sumIngresos').textContent;
    const libreText=document.getElementById('sumLibre').textContent;
    const ingNum=Number(ingText.replace(/[^\d]/g,'')), libreNum=Number(libreText.replace(/[^\d]/g,''));
    const tasa=ingNum?((libreNum/ingNum)*100):0;
    const color=libreNum>=0?'#10b981':'#ef4444';
    el.innerHTML=`<div class="item"><b style="color:${color}">${libreText}</b> de balance — Ahorro ${tasa.toFixed(1)}%</div>`;
  }
  renderMetas(a){
    const el=document.getElementById('metasAhorro'); if(!el) return;
    el.innerHTML = a.length? a.map(x=>{
      const p=x.meta?Math.min(100,(x.actual/x.meta)*100):0;
      return `<div class="box"><b>${x.nombre}</b><div class="meta">${fmt(x.actual)} / ${fmt(x.meta)}</div>
      <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px">
        <div style="width:${p.toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div>
      </div></div>`;
    }).join('') : '<div class="box">Crea una meta para empezar.</div>';
  }
  renderHistorial(){
    const el=document.getElementById('tablaHistorial'); if(!el) return;
    const meses=Object.keys(this.data).sort();
    const rows=meses.map(m=>{
      const d=this.data[m];
      const ing=d.ingresos.reduce((s,x)=>s+(x.monto||0),0);
      const gas=d.gastosFijos.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.monto||0),0)
               + d.tarjetas.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.cuotaMensual||0),0)
               + d.creditos.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.cuotaMensual||0),0)
               + d.gastosCompras.filter(x=>!x.pagadoMes).reduce((s,x)=>s+(x.monto||0),0);
      const bal=ing-gas; const p=ing?((bal/ing)*100):0;
      return `<tr>
        <td>${m}</td>
        <td>${fmt(ing)}</td>
        <td>${fmt(gas)}</td>
        <td style="color:${bal>=0?'#10b981':'#ef4444'}">${fmt(bal)}</td>
        <td>${p.toFixed(1)}%</td>
      </tr>`;
    }).join('');
    el.innerHTML=`<div style="overflow:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th><th>% Ahorro</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }
  renderConsejos(ing,gas){
    const el=document.getElementById('recomendaciones'); if(!el) return;
    const libre=ing-gas; const p=ing?(libre/ing)*100:0;
    const list=[];
    if(libre<0) list.push({t:'🚨 Gastos Excesivos',d:'Tus gastos superan tus ingresos. Recorta no esenciales.'});
    if(p<10) list.push({t:'⚠️ Mejora tu ahorro',d:`Estás ahorrando ${p.toFixed(1)}%. Apunta al 20%.`});
    list.push({t:'📊 50/30/20',d:'50% necesidades, 30% gustos, 20% ahorro/inversión.'});
    list.push({t:'💳 Tarjetas',d:'Paga el total para evitar intereses.'});
    el.innerHTML=list.map(c=>`<div class="box"><b>${c.t}</b><div class="meta">${c.d}</div></div>`).join('');
  }

  /* ===== CRUD ===== */
  openForm(tipo){
    const f=(n,t,l,v='',extra='')=>`<div class="field"><label>${l}</label><input type="${t}" id="f_${n}" value="${v}" ${extra}></div>`;
    let title='Nuevo', html='';
    if(tipo==='ingreso'){
      title='Nuevo Ingreso';
      html=f('nombre','text','Nombre')+f('monto','number','Monto','',`min="0" step="1"`)
        +f('categoria','text','Categoría','Trabajo')+f('fecha','date','Fecha',`${this.mes}-01`);
    }else if(tipo==='fijo'){
      title='Nuevo Gasto Fijo';
      html=f('nombre','text','Nombre')+f('monto','number','Monto','',`min="0" step="1"`)
        +f('categoria','text','Categoría','Vivienda')+f('fecha','date','Fecha',`${this.mes}-01`);
    }else if(tipo==='compra'){
      title='Nueva Compra';
      html=f('nombre','text','Descripción')+f('monto','number','Monto','',`min="0" step="1"`)
        +f('categoria','text','Categoría','General')+f('fecha','date','Fecha',`${this.mes}-01`);
    }else if(tipo==='ahorro'){
      title='Nueva Meta de Ahorro';
      html=f('nombre','text','Nombre')+f('meta','number','Meta','',`min="0" step="1"`)
        +f('actual','number','Actual','0',`min="0" step="1"`);
    }else if(tipo==='tarjeta'){
      title='Nueva Tarjeta';
      html=f('nombre','text','Nombre')+f('montoTotal','number','Monto total','',`min="1" step="1"`)
        +f('numeroCuotas','number','Cuotas','',`min="1" step="1"`) + f('cuotasPagadas','number','Pagadas','0',`min="0" step="1"`)
        +f('tasa','text','Tasa mensual % (coma, ej: 1,84)','1,84',`inputmode="decimal" pattern="^\\d+(,\\d{1,3})?$"`);
    }else if(tipo==='credito'){
      title='Nuevo Crédito';
      html=f('nombre','text','Nombre')+f('montoTotal','number','Monto total','',`min="1" step="1"`)
        +f('numeroCuotas','number','Cuotas','',`min="1" step="1"`) + f('cuotasPagadas','number','Pagadas','0',`min="0" step="1"`)
        +f('tasa','text','Tasa mensual % (coma, ej: 1,84)','1,84',`inputmode="decimal" pattern="^\\d+(,\\d{1,3})?$"`);
    }
    this.showModal(title,html,(vals)=>{
      const n=x=>Number(x||0), pct=x=>parsePctComma(x);
      if(tipo==='ingreso'){
        this.D.ingresos.push({id:uid(),nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha});
      }else if(tipo==='fijo'){
        this.D.gastosFijos.push({id:uid(),nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha,pagadoMes:false});
      }else if(tipo==='compra'){
        this.D.gastosCompras.push({id:uid(),nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha,pagadoMes:false});
      }else if(tipo==='ahorro'){
        this.D.ahorros.push({id:uid(),nombre:vals.nombre,meta:n(vals.meta),actual:n(vals.actual),fecha:`${this.mes}-01`});
      }else if(tipo==='tarjeta'){
        const t=pct(vals.tasa); if(!(t>0 && t<=0.05)) { this.toast('Tasa inválida (usa coma, ≤5%)'); return; }
        const M=n(vals.montoTotal), cu=parseInt(vals.numeroCuotas||0), pag=parseInt(vals.cuotasPagadas||0);
        const cuota=this.cuota(M,t,cu);
        this.D.tarjetas.push({id:uid(),nombre:vals.nombre,montoTotal:M,numeroCuotas:cu,cuotasPagadas:pag,tasaMensual:t,cuotaMensual:cuota,pagadoMes:false,fecha:`${this.mes}-01`});
      }else if(tipo==='credito'){
        const t=pct(vals.tasa); if(!(t>0 && t<=0.05)) { this.toast('Tasa inválida (usa coma, ≤5%)'); return; }
        const M=n(vals.montoTotal), cu=parseInt(vals.numeroCuotas||0), pag=parseInt(vals.cuotasPagadas||0);
        const cuota=this.cuota(M,t,cu);
        this.D.creditos.push({id:uid(),nombre:vals.nombre,montoTotal:M,numeroCuotas:cu,cuotasPagadas:pag,tasaMensual:t,cuotaMensual:cuota,pagadoMes:false,fecha:`${this.mes}-01`});
      }
      this.save(); this.renderAll(); this.toast('Guardado');
    });
  }

  edit(key,id){
    const list=this.D[key]; const it=list.find(x=>x.id===id); if(!it) return;
    const f=(n,t,l,v='',extra='')=>`<div class="field"><label>${l}</label><input type="${t}" id="f_${n}" value="${v}" ${extra}></div>`;
    let title='Editar', html='';
    if(key==='ingresos'){
      html=f('nombre','text','Nombre',it.nombre)+f('monto','number','Monto',it.monto,`min="0" step="1"`)
        +f('categoria','text','Categoría',it.categoria||'')+f('fecha','date','Fecha',it.fecha||`${this.mes}-01`);
    }else if(key==='gastosFijos' || key==='gastosCompras'){
      title= key==='gastosFijos'?'Editar Gasto Fijo':'Editar Compra';
      html=f('nombre','text','Nombre',it.nombre)+f('monto','number','Monto',it.monto,`min="0" step="1"`)
        +f('categoria','text','Categoría',it.categoria||'')+f('fecha','date','Fecha',it.fecha||`${this.mes}-01`);
    }else if(key==='ahorros'){
      title='Editar Meta';
      html=f('nombre','text','Nombre',it.nombre)+f('meta','number','Meta',it.meta,`min="0" step="1"`)
        +f('actual','number','Actual',it.actual,`min="0" step="1"`);
    }else{
      const isTar=key==='tarjetas';
      title=isTar?'Editar Tarjeta':'Editar Crédito';
      html=f('nombre','text','Nombre',it.nombre)
        +f('montoTotal','number','Monto total',it.montoTotal,`min="1" step="1"`)
        +f('numeroCuotas','number','Cuotas',it.numeroCuotas,`min="1" step="1"`)
        +f('cuotasPagadas','number','Pagadas',it.cuotasPagadas||0,`min="0" step="1"`)
        +f('tasa','text','Tasa mensual % (coma)',formatPctComma(it.tasaMensual),`inputmode="decimal" pattern="^\\d+(,\\d{1,3})?$"`);
    }
    this.showModal(title,html,(vals)=>{
      const n=x=>Number(x||0), pct=x=>parsePctComma(x);
      if(key==='ingresos'){
        Object.assign(it,{nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha});
      }else if(key==='gastosFijos' || key==='gastosCompras'){
        Object.assign(it,{nombre:vals.nombre,monto:n(vals.monto),categoria:vals.categoria,fecha:vals.fecha});
      }else if(key==='ahorros'){
        Object.assign(it,{nombre:vals.nombre,meta:n(vals.meta),actual:n(vals.actual)});
      }else{
        const t=pct(vals.tasa); if(!(t>0 && t<=0.05)){ this.toast('Tasa inválida (≤5%)'); return; }
        const M=n(vals.montoTotal), cu=parseInt(vals.numeroCuotas||0), pag=parseInt(vals.cuotasPagadas||0);
        Object.assign(it,{nombre:vals.nombre,montoTotal:M,numeroCuotas:cu,cuotasPagadas:pag,tasaMensual:t,cuotaMensual:this.cuota(M,t,cu)});
      }
      this.save(); this.renderAll(); this.toast('Actualizado');
    });
  }

  del(key,id){
    if(!confirm('¿Eliminar registro?')) return;
    this.D[key]=this.D[key].filter(x=>x.id!==id);
    this.save(); this.renderAll(); this.toast('Eliminado');
  }

  togglePaid(key,id){
    const it=this.D[key].find(x=>x.id===id); if(!it) return;
    it.pagadoMes=!it.pagadoMes;
    this.save(); this.renderAll();
    this.toast(it.pagadoMes?'Marcado como pagado':'Se contabilizará este mes');
  }

  addAhorro(id){
    const a=this.D.ahorros.find(x=>x.id===id); if(!a) return;
    const v=prompt('¿Cuánto agregar?', '0'); const n=Number(v||0);
    if(n>0){ a.actual+=n; this.save(); this.renderAll(); this.toast('Ahorro agregado'); }
  }

  /* ===== Modal & otros ===== */
  showModal(title,inner,onSubmit){
    const modal=this.btn.modal, form=this.btn.modalForm, titleEl=this.btn.modalTitle;
    titleEl.textContent=title;
    form.innerHTML=inner+`
      <div class="actions">
        <button type="submit" class="primary">Guardar</button>
        <button type="button" class="cancel" id="cancelModal">Cancelar</button>
      </div>`;
    modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
    document.getElementById('cancelModal').onclick=()=>this.closeModal();
    form.onsubmit=(e)=>{
      e.preventDefault();
      const vals={};
      [...form.querySelectorAll('input')].forEach(i=>vals[i.id.replace(/^f_/,'')]=i.value);
      this.closeModal();
      setTimeout(()=>onSubmit(vals),0);
    };
  }
  closeModal(){
    const modal=this.btn.modal, form=this.btn.modalForm;
    modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); form.innerHTML='';
  }

  export(){
    const out={fecha:new Date().toISOString(),mes:this.mes,datos:this.data};
    const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='organizador-financiero.json'; a.click(); URL.revokeObjectURL(url);
  }
  reset(){
    if(confirm('¿Borrar datos locales?')){ localStorage.removeItem(this.KEY); location.reload(); }
  }
  toast(m){ const t=this.toastEl; t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1700); }
}
window.app=new App();
