import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────────────────────────────────────
// Parser for Clover's "Items Report" (Reporting → Revenue → Item Sales) export.
//
// The real export is NOT a flat table. Its shape:
//
//   Items Report                            ← preamble (title, date range, filters,
//   "Jul 1, 2026 ... - Jul 31, 2026 ..."      summary block) — ~15 rows before the header
//   Net Sales,"$23,643.56"
//   ...
//   Category Name,Name,Gross Sales,Net Sales,Sold,...   ← real header row
//   Ice Cream                               ← category section header (col 0 only)
//   ,Kheer kids,$978.86,$973.11,192,...      ← item row (col 0 blank)
//   ,," "," "," ",Nuts,4,$3.96,...           ← MODIFIER row — amount already counted
//                                              inside the item's Net Sales; must skip
//   Total (Ice Cream),,"$15,767.44",...      ← category total
//   TOTAL,,"$24,051.07","$23,643.56",...     ← grand total
//
// Verified against a real Jul 2026 export: item rows sum to each category total,
// and the category totals sum to the grand total exactly.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_IDX = {
  jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
  jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
}

// Clover money cells: "$24,051.07" · -$5.75 · $0.00 · "-" · " " · (1.23)
export function money(v) {
  if (v == null) return 0
  const s = String(v).trim()
  if (!s || s === '-' || s === '—') return 0
  const negative = s.startsWith('-') || /^\(.*\)$/.test(s)
  const num = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return 0
  return negative ? -num : num
}

function count(v) {
  const n = parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

function cell(row, idx) {
  if (idx < 0 || idx == null) return ''
  return String(row[idx] ?? '').trim()
}

// Pull "Jul 1, 2026" out of the report's date-range line
function findPeriod(grid, headerRow) {
  for (let r = 0; r < Math.min(headerRow, 14); r++) {
    for (const raw of grid[r] || []) {
      const s = String(raw ?? '')
      const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/)
      if (m) {
        const mi = MONTH_IDX[m[1].slice(0, 3).toLowerCase()]
        if (mi != null) {
          return {
            date: new Date(Number(m[3]), mi, Number(m[2])),
            label: s.replace(/\s+\d{1,2}:\d{2}\s*(AM|PM)/gi, '').trim(),
          }
        }
      }
    }
  }
  return null
}

export function parseCloverReport(arrayBuffer) {
  const wb   = XLSX.read(arrayBuffer, { type: 'array' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true })
  if (!grid.length) return null

  // Locate the real header row. The preamble contains a summary block with a
  // literal "Net Sales" label cell, so a single keyword match is not enough —
  // require several recognised column names on the same row.
  const HEADER_WORDS = new Set([
    'category name', 'category', 'name', 'item', 'item name', 'product',
    'gross sales', 'net sales', 'sold', 'quantity', 'qty', 'items sold',
    'refunded', 'modifier name', 'discounts', 'refunds', '% net sales',
  ])
  let headerRow = -1, H = []
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const row  = (grid[r] || []).map(c => String(c ?? '').trim().toLowerCase())
    const hits = row.filter(c => HEADER_WORDS.has(c)).length
    const hasRevenue = row.some(c => c === 'net sales' || c === 'gross sales')
    if (hasRevenue && hits >= 3) { headerRow = r; H = row; break }
  }
  if (headerRow === -1) return null

  const idx = (...names) => {
    for (const n of names) {
      const i = H.findIndex(h => h === n)
      if (i !== -1) return i
    }
    return -1
  }
  const cCat   = idx('category name', 'category')
  const cName  = idx('name', 'item', 'item name', 'product')
  const cNet   = idx('net sales', 'net revenue')
  const cGross = idx('gross sales', 'gross revenue')
  const cSold  = idx('sold', 'quantity', 'qty', 'items sold')
  const cRev   = cNet !== -1 ? cNet : cGross
  if (cRev === -1) return null

  const byItem = {}, byCategory = {}
  let currentCat = 'Uncategorized'
  let grandTotal = 0, totalQty = 0
  let sawSections = false

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || []
    const catCell  = cell(row, cCat)
    const nameCell = cell(row, cName)

    // Grand total row
    if (/^total$/i.test(catCell)) {
      grandTotal = money(row[cRev])
      continue
    }
    // Category total row — authoritative per-category revenue
    const totalMatch = catCell.match(/^total\s*\((.+)\)$/i)
    if (totalMatch) {
      byCategory[totalMatch[1].trim()] = money(row[cRev])
      sawSections = true
      continue
    }
    // Category section header (name in col 0, nothing in the item column)
    if (catCell && !nameCell) {
      currentCat = catCell
      sawSections = true
      continue
    }
    // Item row. Modifier rows have a blank name (Clover writes " ") → skipped here.
    if (nameCell) {
      const revenue = money(row[cRev])
      const qty     = count(row[cSold])
      if (revenue === 0 && qty === 0) continue
      const cat = catCell || currentCat
      const key = `${cat}|${nameCell}`
      if (!byItem[key]) byItem[key] = { item: nameCell, cat, revenue: 0, qty: 0 }
      byItem[key].revenue += revenue
      byItem[key].qty     += qty
      totalQty            += qty
      // Flat exports (no Total (X) rows) still get a category breakdown
      if (!sawSections) byCategory[cat] = (byCategory[cat] || 0) + revenue
    }
  }

  const rows = Object.values(byItem).sort((a, b) => b.revenue - a.revenue)
  if (!rows.length && !Object.keys(byCategory).length) return null

  const catSum  = Object.values(byCategory).reduce((s, v) => s + v, 0)
  const revenue = grandTotal || catSum || rows.reduce((s, i) => s + i.revenue, 0)

  const period = findPeriod(grid, headerRow)
  return {
    revenue,
    itemsSold:  totalQty,
    period:     period?.label || `Uploaded ${new Date().toLocaleDateString()}`,
    firstDate:  period?.date || null,
    rows:       rows.slice(0, 300),
    byCategory,
    // Reconciliation info so the UI can warn if the file looks off
    reconciled: grandTotal > 0 ? Math.abs(grandTotal - catSum) < 1 : true,
    grandTotal,
    catSum,
  }
}
