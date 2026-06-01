#!/usr/bin/env python3
"""
Stacking Plan Builder
=====================
Uso:  python build.py
Lee:  Isidora 3000.xlsx  +  src/template.html  +  src/style.css  +  src/app.js
Crea: stacking_plan.html  (archivo final standalone, abrir directo en navegador)

Si cambias estilos  → edita src/style.css  y corre build.py
Si cambias lógica   → edita src/app.js     y corre build.py
Si cambias layout   → edita src/template.html y corre build.py
Si cambia el Excel  → simplemente corre build.py de nuevo
"""

import openpyxl
import json
import os
from datetime import datetime

# ── Rutas ────────────────────────────────────────────────────────────────────
ROOT  = os.path.dirname(os.path.abspath(__file__))
EXCEL = os.path.join(ROOT, 'Isidora 3000.xlsx')
SRC   = os.path.join(ROOT, 'src')
OUT   = os.path.join(ROOT, 'stacking_plan.html')

TODAY_STR = '2026-06-01'   # fecha de referencia para vencimientos

# ── Paleta de colores para arrendatarios ─────────────────────────────────────
PALETTE = [
    '#1976D2', '#388E3C', '#E64A19', '#7B1FA2', '#F57C00',
    '#0097A7', '#C62828', '#558B2F', '#283593', '#F9A825',
    '#00695C', '#AD1457', '#33691E', '#1565C0', '#E65100',
    '#006064', '#880E4F', '#1B5E20', '#0D47A1', '#BF360C',
    '#37474F', '#4E342E', '#0288D1', '#689F38', '#AB47BC',
    '#FF7043', '#26A69A', '#EC407A', '#7CB342', '#5C6BC0',
    '#26C6DA', '#D4E157', '#EF5350', '#42A5F5', '#66BB6A',
    '#FFCA28', '#8D6E63', '#78909C', '#FF8A65', '#9CCC65',
    '#4DD0E1', '#DCE775', '#F06292', '#AED581', '#80DEEA',
]


# ── Extracción de datos ───────────────────────────────────────────────────────
def extract_units():
    """Lee la hoja Rent Roll del Excel y devuelve lista de dicts."""
    if not os.path.exists(EXCEL):
        raise FileNotFoundError(f'No se encontró el Excel en: {EXCEL}')

    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    ws = wb['Rent Roll']

    def to_float(v):
        return round(float(v), 4) if isinstance(v, (int, float)) else None

    def to_date(v):
        if isinstance(v, datetime):
            return v.strftime('%Y-%m-%d')
        return '' if v in (None, '-') else str(v)

    units = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        piso = row[0]
        if piso is None or not isinstance(piso, (int, float)):
            continue

        util   = to_float(row[11]) or 0.0
        uf_m2  = to_float(row[12]) or 0.0
        canon  = to_float(row[13]) or 0.0
        arrend = str(row[1]).strip() if row[1] else ''

        units.append({
            'piso':             int(piso),
            'arrendatario':     arrend,
            'sociedad':         str(row[2]).strip() if row[2] else '',
            'tipo':             row[3] or '',
            'unidad':           str(row[4]) if row[4] is not None else '',
            'detalle':          str(row[5]).strip() if row[5] else '',
            'interior_m2':      to_float(row[9]),
            'terraza_m2':       to_float(row[10]),
            'util_m2':          round(util, 2),
            'uf_m2':            round(uf_m2, 4),
            'canon':            round(canon, 2),
            'vencimiento':      to_date(row[7]),
            'salida_anticipada':to_date(row[6]),
            'vacante':          arrend.lower() == 'vacante',
        })

    return units


def build_colors(units):
    """Asigna un color único por arrendatario."""
    tenants = sorted(set(u['arrendatario'] for u in units if not u['vacante']))
    colors = {t: PALETTE[i % len(PALETTE)] for i, t in enumerate(tenants)}
    colors['Vacante'] = '#B0BEC5'
    return colors


# ── Ensamblado ────────────────────────────────────────────────────────────────
def read_src(filename):
    path = os.path.join(SRC, filename)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def build():
    print('Extrayendo datos del Excel...')
    units  = extract_units()
    colors = build_colors(units)

    data_json = json.dumps(
        {'units': units, 'tenant_colors': colors, 'today': TODAY_STR},
        ensure_ascii=False,
        separators=(',', ':'),   # compacto para reducir tamaño
    )

    print('Leyendo archivos fuente de src/ ...')
    template = read_src('template.html')
    style    = read_src('style.css')
    script   = read_src('app.js')

    print('Ensamblando stacking_plan.html ...')
    html = (template
            .replace('{{STYLE}}',  style)
            .replace('{{DATA}}',   data_json)
            .replace('{{SCRIPT}}', script))

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)

    size_kb = os.path.getsize(OUT) // 1024
    print(f'OK stacking_plan.html generado  ({size_kb} KB  |  {len(units)} registros)')
    print(f'  Abrir: {OUT}')


if __name__ == '__main__':
    build()
