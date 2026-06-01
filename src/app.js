/* ════════════════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════════════════ */
const TARGET_PX = 900;   // ancho en px del piso más ancho de la torre

const TIPO_COLORS = {
  Oficinas:         '#1976D2',
  Locales:          '#388E3C',
  Estacionamientos: '#F57C00',
  Bodegas:          '#7B1FA2',
};


/* ════════════════════════════════════════════════════════
   DATA  (inyectada por build.py como RAW)
════════════════════════════════════════════════════════ */
const DATA   = RAW.units;
const COLORS = RAW.tenant_colors;   // { arrendatario: '#hexcolor' }
const TODAY  = new Date(RAW.today);


/* ════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════ */
const state = {
  // Stacking filters
  activeTipos:   new Set(['Oficinas', 'Locales']),
  filterTenant:  '',
  filterExpiry:  '',
  showVacante:   true,
  hlTenant:      null,   // highlighted tenant in legend

  // Rent Roll
  rrSearch:   '',
  rrTipo:     '',
  rrSortCol:  'piso',
  rrSortDir:  1,         // 1 = asc, -1 = desc

  // Active tab
  activeTab: 'stacking',
};


/* ════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════ */

/** Etiqueta de piso: P12 / S2 */
function floorLabel(p) {
  return p > 0 ? 'P' + p : 'S' + Math.abs(p);
}

/** Días hasta una fecha ISO; null si no hay fecha válida */
function daysUntil(dateStr) {
  if (!dateStr || dateStr === '-') return null;
  const d = new Date(dateStr);
  return isNaN(d) ? null : Math.round((d - TODAY) / 86_400_000);
}

/** Clase CSS de expiración para un unit */
function expiryClass(unit) {
  if (unit.vacante) return '';
  const d = daysUntil(unit.vencimiento);
  if (d === null)  return '';
  if (d < 180)     return 'exp-crit';
  if (d < 365)     return 'exp-warn';
  if (d < 730)     return 'exp-watch';
  return '';
}

/** Color de texto (blanco/negro) sobre un fondo hex */
function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.52 ? '#212121' : '#FFFFFF';
}

/** Formatea número con separador de miles (es-CL) */
function fmt(n, decimals = 0) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Crea un elemento DOM con clases opcionales */
function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}


/* ════════════════════════════════════════════════════════
   LAYOUT — altura dinámica de los panes
════════════════════════════════════════════════════════ */
function adjustLayout() {
  const topH = document.getElementById('sticky-top').offsetHeight;
  const rem  = window.innerHeight - topH;
  ['pane-stacking', 'pane-rentroll'].forEach(id => {
    const pane = document.getElementById(id);
    if (pane) pane.style.height = rem + 'px';
  });
}
window.addEventListener('load',   adjustLayout);
window.addEventListener('resize', adjustLayout);


/* ════════════════════════════════════════════════════════
   TABS
════════════════════════════════════════════════════════ */
function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const showStacking = tabName === 'stacking';
  document.getElementById('pane-stacking').classList.toggle('pane--hidden', !showStacking);
  document.getElementById('pane-rentroll').classList.toggle('pane--hidden',  showStacking);

  // Mostrar/ocultar escala (solo relevante en stacking)
  document.getElementById('hdr-scale').parentElement.style.display = showStacking ? '' : 'none';

  if (tabName === 'rentroll') renderRentRoll();
  adjustLayout();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});


/* ════════════════════════════════════════════════════════
   FILTER — datos filtrados del stacking plan
════════════════════════════════════════════════════════ */
function getFilteredData() {
  return DATA.filter(u => {
    if (!state.activeTipos.has(u.tipo))                           return false;
    if (!state.showVacante && u.vacante)                          return false;
    if (state.filterTenant && u.arrendatario !== state.filterTenant) return false;
    if (state.filterExpiry && !u.vacante &&
        (!u.vencimiento || u.vencimiento > state.filterExpiry))   return false;
    return true;
  });
}


/* ════════════════════════════════════════════════════════
   KPIs
════════════════════════════════════════════════════════ */
function updateKPIs(filtered) {
  const occ  = filtered.filter(u => !u.vacante);
  const vac  = filtered.filter(u =>  u.vacante);
  const totM2  = filtered.reduce((s, u) => s + u.util_m2, 0);
  const occM2  = occ.reduce((s, u) => s + u.util_m2, 0);
  const canon  = occ.reduce((s, u) => s + u.canon,   0);
  const rate   = totM2 > 0 ? (occM2 / totM2) * 100 : 0;
  const avgUf  = occM2 > 0 ? occ.reduce((s, u) => s + u.uf_m2 * u.util_m2, 0) / occM2 : 0;

  const expiring = occ.filter(u => { const d = daysUntil(u.vencimiento); return d !== null && d >= 0 && d < 365; });
  const expired  = occ.filter(u => { const d = daysUntil(u.vencimiento); return d !== null && d < 0; });

  document.getElementById('k-occ').textContent   = fmt(rate, 1) + '%';
  document.getElementById('k-occ2').textContent  = fmt(occM2, 0) + ' / ' + fmt(totM2, 0) + ' m²';
  document.getElementById('k-canon').textContent = fmt(canon, 1);
  document.getElementById('k-area').textContent  = fmt(occM2, 0) + ' m²';
  document.getElementById('k-area2').textContent = fmt(vac.reduce((s, u) => s + u.util_m2, 0), 0) + ' m² vacante';
  document.getElementById('k-uf').textContent    = fmt(avgUf, 3);
  document.getElementById('k-exp').textContent   = expiring.length + (expired.length ? ' (+' + expired.length + ' venc.)' : '');
  document.getElementById('k-exp2').textContent  = fmt(expiring.reduce((s, u) => s + u.util_m2, 0), 0) + ' m² en riesgo';
}


/* ════════════════════════════════════════════════════════
   LEGEND SIDEBAR
════════════════════════════════════════════════════════ */
function updateLegend(filtered) {
  const m2ByTenant = {};
  filtered.forEach(u => {
    if (!u.vacante) m2ByTenant[u.arrendatario] = (m2ByTenant[u.arrendatario] || 0) + u.util_m2;
  });
  const sorted   = Object.entries(m2ByTenant).sort((a, b) => b[1] - a[1]);
  const vacM2    = filtered.filter(u => u.vacante).reduce((s, u) => s + u.util_m2, 0);
  const list     = document.getElementById('leg-list');
  list.innerHTML = '';

  if (vacM2 > 0 && state.showVacante) {
    list.appendChild(makeLegendItem('Vacante', '#CFD8DC', true, vacM2));
  }
  sorted.forEach(([tenant, m2]) => {
    list.appendChild(makeLegendItem(tenant, COLORS[tenant] || '#9E9E9E', false, m2));
  });
}

function makeLegendItem(tenant, color, isVacante, m2) {
  const dimmed = state.hlTenant && state.hlTenant !== tenant;
  const item   = el('div', 'leg-item' + (dimmed ? ' dimmed' : ''));
  item.innerHTML =
    `<div class="leg-dot" style="background:${color};${isVacante ? 'border:1px solid #90A4AE' : ''}"></div>` +
    `<span class="leg-name" title="${tenant}">${tenant}</span>` +
    `<span class="leg-m2">${fmt(m2, 0)}</span>`;
  item.addEventListener('click', () => {
    state.hlTenant = state.hlTenant === tenant ? null : tenant;
    renderStacking();
  });
  return item;
}


/* ════════════════════════════════════════════════════════
   SCALE — px por m²
════════════════════════════════════════════════════════ */
function calcScale(byFloor, ofLocFloors) {
  const towerFloors = ofLocFloors.filter(p => p > 3);
  const reference   = towerFloors.length ? towerFloors : ofLocFloors;
  let maxM2 = 0;
  reference.forEach(piso => {
    const tot = (byFloor[piso] || []).reduce((s, u) => s + u.util_m2, 0);
    if (tot > maxM2) maxM2 = tot;
  });
  return maxM2 > 0 ? TARGET_PX / maxM2 : 1;
}


/* ════════════════════════════════════════════════════════
   STACKING PLAN — render pisos
════════════════════════════════════════════════════════ */
function renderFloorGroup(container, floors, byFloor, scale) {
  floors.forEach(piso => {
    const units = (byFloor[piso] || []).filter(u => u.tipo === 'Oficinas' || u.tipo === 'Locales');
    if (!units.length) return;

    const row   = el('div', 'floor-row');
    const label = el('div', 'floor-row__label', floorLabel(piso));
    const unitsDiv = el('div', 'floor-row__units');

    units.forEach(u => {
      unitsDiv.appendChild(makeUnitBlock(u, scale));
    });

    row.appendChild(label);
    row.appendChild(unitsDiv);
    container.appendChild(row);
  });
}

function makeUnitBlock(u, scale) {
  const pxW    = Math.max(u.util_m2 * scale, 44);
  const color  = u.vacante ? '#CFD8DC' : (COLORS[u.arrendatario] || '#9E9E9E');
  const tColor = u.vacante ? '#546E7A' : contrastText(color);
  const ec     = expiryClass(u);
  const dimmed = state.hlTenant && u.arrendatario !== state.hlTenant;

  const block = el('div',
    'unit-block' + (ec ? ' ' + ec : '') + (dimmed ? ' dimmed' : ''));
  block.style.cssText = `width:${pxW}px;min-width:${pxW}px;background:${color};color:${tColor};`;
  if (u.vacante) block.style.borderColor = '#90A4AE';

  block.innerHTML =
    (pxW >= 44 ? `<div class="unit-block__num">${u.unidad}</div>` : '') +
    `<div class="unit-block__tenant">${u.vacante ? 'VACANTE' : u.arrendatario}</div>` +
    (pxW >= 70  ? `<div class="unit-block__m2">${fmt(u.util_m2, 0)} m²</div>` : '');

  block.addEventListener('mouseenter', e => showTooltip(e, u));
  block.addEventListener('mousemove',  moveTooltip);
  block.addEventListener('mouseleave', hideTooltip);
  return block;
}

function addSectionLabel(parent, text, scale) {
  const s = el('div', 'sec-label',
    text + (scale !== null ? `<span class="sec-scale">escala: 1 px ≈ ${fmt(1 / scale, 2)} m²</span>` : ''));
  parent.appendChild(s);
}

function addFloorGap(parent, fromFloor, toFloor) {
  const g = el('div', 'floor-gap');
  g.innerHTML =
    `<div class="floor-gap__label"></div>` +
    `<div class="floor-gap__bar" style="width:${Math.round(TARGET_PX * 0.5)}px"></div>` +
    `<span class="floor-gap__text">Pisos ${fromFloor}–${toFloor} (sin uso comercial)</span>`;
  parent.appendChild(g);
}

function addParkingRow(parent, label, units, style) {
  const occ  = units.filter(u => !u.vacante);
  const canon = occ.reduce((s, u) => s + u.canon, 0);
  const row  = el('div', 'floor-row');
  const lbl  = el('div', 'floor-row__label', floorLabel(label));
  const ud   = el('div', 'floor-row__units');
  const bar  = el('div', `summary-bar ${style}`);
  bar.style.width = TARGET_PX + 'px';
  bar.innerHTML =
    `<span class="summary-bar__count">${occ.length}</span> / ${units.length} ocupados` +
    `&nbsp;<span class="summary-bar__canon">${fmt(canon, 1)} UF/mes</span>` +
    `<span class="summary-bar__free">${units.length - occ.length} libres</span>`;
  ud.appendChild(bar);
  row.appendChild(lbl);
  row.appendChild(ud);
  parent.appendChild(row);
}


/* ════════════════════════════════════════════════════════
   STACKING PLAN — render principal
════════════════════════════════════════════════════════ */
function renderStacking() {
  const filtered = getFilteredData();
  updateKPIs(filtered);

  // Agrupar por piso
  const byFloor = {};
  filtered.forEach(u => (byFloor[u.piso] = byFloor[u.piso] || []).push(u));

  const ofLoc   = filtered.filter(u => u.tipo === 'Oficinas' || u.tipo === 'Locales');
  const estac   = filtered.filter(u => u.tipo === 'Estacionamientos');
  const bodegas = filtered.filter(u => u.tipo === 'Bodegas');

  const building = document.getElementById('building');
  building.innerHTML = '';

  if (!filtered.length) {
    building.appendChild(el('div', 'no-data', 'Sin datos con los filtros aplicados'));
    updateLegend([]);
    return;
  }

  // Pisos con Oficinas / Locales, de mayor a menor (arriba → abajo en pantalla)
  const ofLocFloors  = [...new Set(ofLoc.map(u => u.piso))].sort((a, b) => b - a);
  const scale        = calcScale(byFloor, ofLocFloors);
  document.getElementById('hdr-scale').textContent = fmt(1 / scale, 2);

  const towerFloors = ofLocFloors.filter(p => p > 3);
  const commFloors  = ofLocFloors.filter(p => p >= 1 && p <= 3);
  const subFloors   = ofLocFloors.filter(p => p < 0);

  // ── Torre ──────────────────────────────────────────
  if (towerFloors.length) {
    addSectionLabel(building, 'Torre Oficinas', scale);
    renderFloorGroup(building, towerFloors, byFloor, scale);
  }

  // Gap entre torre y locales
  if (towerFloors.length && commFloors.length) {
    const minTower = towerFloors[towerFloors.length - 1];
    const maxComm  = commFloors[0];
    if (minTower - maxComm > 1) {
      addFloorGap(building, maxComm + 1, minTower - 1);
    }
  }

  // ── Locales comerciales ────────────────────────────
  if (commFloors.length) {
    addSectionLabel(building, 'Locales Comerciales', scale);
    renderFloorGroup(building, commFloors, byFloor, scale);
  }

  // ── Subterráneo (oficinas / locales) ───────────────
  if (subFloors.length) {
    addSectionLabel(building, 'Subterráneo — Oficinas / Locales', scale);
    renderFloorGroup(building, subFloors, byFloor, scale);
  }

  // ── Estacionamientos ───────────────────────────────
  if (estac.length) {
    addSectionLabel(building, 'Estacionamientos', null);
    [...new Set(estac.map(u => u.piso))].sort((a, b) => b - a).forEach(piso => {
      addParkingRow(building, piso, estac.filter(u => u.piso === piso), 'summary-bar--parking');
    });
  }

  // ── Bodegas ────────────────────────────────────────
  if (bodegas.length) {
    addSectionLabel(building, 'Bodegas', null);
    [...new Set(bodegas.map(u => u.piso))].sort((a, b) => b - a).forEach(piso => {
      addParkingRow(building, piso, bodegas.filter(u => u.piso === piso), 'summary-bar--bodega');
    });
  }

  updateLegend(filtered);
}


/* ════════════════════════════════════════════════════════
   RENT ROLL — filtro y ordenamiento
════════════════════════════════════════════════════════ */
function getRRFiltered() {
  return DATA.filter(u => {
    if (state.rrTipo && u.tipo !== state.rrTipo) return false;
    if (state.rrSearch) {
      const q = state.rrSearch.toLowerCase();
      const match =
        u.arrendatario.toLowerCase().includes(q) ||
        u.unidad.toLowerCase().includes(q)       ||
        u.sociedad.toLowerCase().includes(q)     ||
        String(u.piso).includes(q)               ||
        u.tipo.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });
}

function sortRR(arr) {
  return [...arr].sort((a, b) => {
    let va = a[state.rrSortCol];
    let vb = b[state.rrSortCol];
    if (state.rrSortCol === '_estado') { va = a.vacante ? 1 : 0; vb = b.vacante ? 1 : 0; }
    if (va === null || va === undefined) va = '';
    if (vb === null || vb === undefined) vb = '';
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * state.rrSortDir;
    return String(va).localeCompare(String(vb)) * state.rrSortDir;
  });
}

function makeRRBadge(u) {
  const d = daysUntil(u.vencimiento);
  if (u.vacante)              return '<span class="rr-badge badge-vacante">Vacante</span>';
  if (d !== null && d < 0)    return '<span class="rr-badge badge-vencido">Vencido</span>';
  if (d !== null && d < 180)  return `<span class="rr-badge badge-critico">${d} días</span>`;
  if (d !== null && d < 365)  return `<span class="rr-badge badge-warning">${d} días</span>`;
  if (d !== null && d < 730)  return `<span class="rr-badge badge-watch">${d} días</span>`;
  return '<span class="rr-badge badge-vigente">Vigente</span>';
}

function makeRRRowClass(u) {
  if (u.vacante) return 'row-vacante';
  const d = daysUntil(u.vencimiento);
  if (d !== null && d < 180) return 'row-exp-crit';
  if (d !== null && d < 365) return 'row-exp-warn';
  return '';
}


/* ════════════════════════════════════════════════════════
   RENT ROLL — render tabla
════════════════════════════════════════════════════════ */
function renderRentRoll() {
  const data = sortRR(getRRFiltered());
  document.getElementById('rr-count').textContent = data.length + ' registros';

  const fragment = document.createDocumentFragment();
  data.forEach(u => {
    const tc = TIPO_COLORS[u.tipo] || '#9E9E9E';
    const tr = el('tr', makeRRRowClass(u));
    tr.innerHTML =
      `<td class="td-piso">${floorLabel(u.piso)}</td>` +
      `<td><span class="tipo-dot" style="background:${tc}"></span>${u.tipo}</td>` +
      `<td class="td-bold">${u.unidad}</td>` +
      `<td>${u.arrendatario}</td>` +
      `<td class="td-muted" style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${u.sociedad}</td>` +
      `<td class="td-num">${u.interior_m2 !== null ? fmt(u.interior_m2, 2) : '—'}</td>` +
      `<td class="td-num">${u.terraza_m2  !== null ? fmt(u.terraza_m2,  2) : '—'}</td>` +
      `<td class="td-num td-bold">${fmt(u.util_m2, 2)}</td>` +
      `<td class="td-num">${fmt(u.uf_m2, 4)}</td>` +
      `<td class="td-num td-bold">${fmt(u.canon, 2)}</td>` +
      `<td>${u.vencimiento || '—'}</td>` +
      `<td class="td-muted">${u.salida_anticipada || '—'}</td>` +
      `<td>${makeRRBadge(u)}</td>`;
    fragment.appendChild(tr);
  });

  const tbody = document.getElementById('rr-body');
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

// Sort on header click
document.querySelectorAll('.rr-table thead th').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (state.rrSortCol === col) {
      state.rrSortDir *= -1;
    } else {
      state.rrSortCol = col;
      state.rrSortDir = 1;
    }
    document.querySelectorAll('.rr-table thead th').forEach(h =>
      h.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(state.rrSortDir === 1 ? 'sorted-asc' : 'sorted-desc');
    renderRentRoll();
  });
});

document.getElementById('rr-search').addEventListener('input', e => {
  state.rrSearch = e.target.value.trim();
  renderRentRoll();
});
document.getElementById('rr-tipo').addEventListener('change', e => {
  state.rrTipo = e.target.value;
  renderRentRoll();
});


/* ════════════════════════════════════════════════════════
   TOOLTIP
════════════════════════════════════════════════════════ */
const tooltipEl = document.getElementById('tooltip');

function showTooltip(e, u) {
  const d = daysUntil(u.vencimiento);
  let badge = '';
  if (u.vacante) {
    badge = '<span class="tooltip__badge tip-badge--vacante">VACANTE</span>';
  } else if (d !== null) {
    if      (d < 0)   badge = `<span class="tooltip__badge tip-badge--crit">VENCIDO hace ${Math.abs(d)} días</span>`;
    else if (d < 180) badge = `<span class="tooltip__badge tip-badge--crit">VENCE en ${d} días</span>`;
    else if (d < 365) badge = `<span class="tooltip__badge tip-badge--warn">VENCE en ${d} días</span>`;
    else if (d < 730) badge = `<span class="tooltip__badge tip-badge--watch">${d} días restantes</span>`;
    else              badge = `<span class="tooltip__badge tip-badge--ok">${(d / 365).toFixed(1)} años restantes</span>`;
  }

  const row = (k, v) =>
    `<div class="tooltip__row"><span class="tooltip__key">${k}</span><span class="tooltip__value">${v}</span></div>`;

  let html = `<div class="tooltip__title">Unidad ${u.unidad}</div><hr class="tooltip__divider">`;
  if (!u.vacante) {
    html += row('Arrendatario', u.arrendatario);
    if (u.sociedad && u.sociedad !== u.arrendatario)
      html += `<div class="tooltip__row"><span class="tooltip__key">Sociedad</span><span class="tooltip__value" style="font-size:10px;max-width:160px">${u.sociedad}</span></div>`;
  }
  html += row('Tipo', u.tipo);
  if (u.interior_m2) html += row('Interior',  fmt(u.interior_m2, 2) + ' m²');
  if (u.terraza_m2)  html += row('Terraza',   fmt(u.terraza_m2,  2) + ' m²');
  html += row('Sup. Útil', fmt(u.util_m2, 2) + ' m²');
  html += '<hr class="tooltip__divider">';
  if (!u.vacante) {
    html += row('Canon',    fmt(u.canon, 2) + ' UF/mes');
    html += row('UF/m²/mes', fmt(u.uf_m2, 4));
    html += '<hr class="tooltip__divider">';
    html += row('Vencimiento',   u.vencimiento || '—');
    if (u.salida_anticipada)
      html += row('Salida antic.', u.salida_anticipada);
  }
  if (badge) html += `<div style="margin-top:6px">${badge}</div>`;

  tooltipEl.innerHTML = html;
  tooltipEl.classList.add('is-visible');
  moveTooltip(e);
}

function moveTooltip(e) {
  const tw = tooltipEl.offsetWidth, th = tooltipEl.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + tw > window.innerWidth  - 10) x = e.clientX - tw - 14;
  if (y + th > window.innerHeight - 10) y = e.clientY - th - 14;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top  = y + 'px';
}

function hideTooltip() {
  tooltipEl.classList.remove('is-visible');
}


/* ════════════════════════════════════════════════════════
   CONTROLS — event listeners
════════════════════════════════════════════════════════ */

// Tipo buttons
document.querySelectorAll('.tipo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tipo = btn.dataset.tipo;
    if (state.activeTipos.has(tipo)) {
      if (state.activeTipos.size > 1) {
        state.activeTipos.delete(tipo);
        btn.classList.remove('active');
      }
    } else {
      state.activeTipos.add(tipo);
      btn.classList.add('active');
    }
    renderStacking();
  });
});

// Populate tenant dropdown
(function populateTenantSelect() {
  const sel = document.getElementById('f-tenant');
  const tenants = [...new Set(DATA.filter(u => !u.vacante).map(u => u.arrendatario))].sort();
  tenants.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
})();

document.getElementById('f-tenant').addEventListener('change', e => {
  state.filterTenant = e.target.value;
  renderStacking();
});
document.getElementById('f-expiry').addEventListener('change', e => {
  state.filterExpiry = e.target.value;
  renderStacking();
});
document.getElementById('f-vac').addEventListener('change', e => {
  state.showVacante = e.target.checked;
  renderStacking();
});


/* ════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
document.getElementById('hdr-date').textContent =
  'Al ' + TODAY.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

// Set initial RR sort indicator
document.querySelector('.rr-table thead th[data-col="piso"]').classList.add('sorted-asc');

renderStacking();
