import { describe, it, expect } from 'vitest'
import { money, parseCloverReport } from '../../src/utils/cloverParser.js'

// Structurally identical to a real Clover "Items Report" export (verified against
// a real Jul 2026 file — see CLAUDE.md "Clover Item Sales export format"): preamble
// rows with a decoy "Net Sales" label, category section headers, modifier sub-rows
// with blank item names, per-category totals, and a grand total.
function buildCloverCsv({ revenue = true } = {}) {
  const rows = [
    'Items Report',
    '"Jul 1, 2026 12:00 AM - Jul 31, 2026 11:59 PM"',
    '"Requested on: Aug 4, 2026 11:12 AM"',
    'Filters: Item Type = Revenue Items',
    '',
    'Categories: All',
    '"Some disclaimer text mentioning Net Sales in a summary block."',
    '',
    'Gross Sales,"$1,100.00"',
    'Net Sales,"$1,000.00"',
    'COGS,$0.00',
    '',
    'Category Name,Name,Gross Sales,Net Sales,Sold,Refunded,Modifier Name,Modifier Sold,Modifier Amount,Discounts,Refunds,% Net Sales,Avg Item Size,COGS,Gross Profit',
    'Ice Cream',
    ',Kids Scoop,"$500.00","$480.00",100,0," "," ",-,-$20.00,$0.00,48.0%,$4.80,-,-',
    ',," "," "," "," ",Sprinkles,10,$9.90," "," "," "," "," "," "',
    ',Regular Scoop,"$220.00","$220.00",40,0," "," ",-,$0.00,$0.00,22.0%,$5.50,-,-',
    'Total (Ice Cream),,"$720.00","$700.00",140,0,-,10,$9.90,-$20.00,$0.00,70.0%,$5.00,-,-',
    '',
    'Coffee',
    ',Americano,"$300.00","$300.00",80,0," "," ",-,$0.00,$0.00,30.0%,$3.75,-,-',
    'Total (Coffee),,"$300.00","$300.00",80,0,-," ",$0.00,$0.00,$0.00,30.0%,$3.75,-,-',
    '',
    'TOTAL,,"$1,020.00","$1,000.00",220,0,-," ","$9.90",-$20.00,$0.00,100.00%,$4.55,-,-',
  ]
  return rows.join('\n')
}

function toBuf(str) {
  return new TextEncoder().encode(str)
}

describe('money()', () => {
  it('parses standard currency strings', () => {
    expect(money('$24,051.07')).toBeCloseTo(24051.07)
  })
  it('parses negative amounts', () => {
    expect(money('-$5.75')).toBeCloseTo(-5.75)
  })
  it('treats a bare dash as zero', () => {
    expect(money('-')).toBe(0)
  })
  it('treats blank/whitespace as zero', () => {
    expect(money(' ')).toBe(0)
    expect(money('')).toBe(0)
    expect(money(undefined)).toBe(0)
  })
  it('handles values xlsx has already pre-converted to numbers', () => {
    expect(money(24051.07)).toBeCloseTo(24051.07)
  })
})

describe('parseCloverReport()', () => {
  it('finds the real header row despite the decoy "Net Sales" label in the preamble', () => {
    const result = parseCloverReport(toBuf(buildCloverCsv()))
    expect(result).not.toBeNull()
  })

  it('reconciles: item rows sum to category totals, categories sum to the grand total', () => {
    const result = parseCloverReport(toBuf(buildCloverCsv()))
    expect(result.revenue).toBeCloseTo(1000.0)
    expect(result.reconciled).toBe(true)
    expect(result.catSum).toBeCloseTo(1000.0)
  })

  it('excludes modifier row amounts from revenue (they are already inside the parent item)', () => {
    const result = parseCloverReport(toBuf(buildCloverCsv()))
    // Sprinkles ($9.90 across 10 sold) must NOT be added on top of Kids Scoop's $480
    const kidsScoop = result.rows.find(r => r.item === 'Kids Scoop')
    expect(kidsScoop.revenue).toBeCloseTo(480.0)
    expect(result.rows.find(r => r.item === 'Sprinkles')).toBeUndefined()
  })

  it('assigns items to their category section, not a column', () => {
    const result = parseCloverReport(toBuf(buildCloverCsv()))
    expect(result.rows.find(r => r.item === 'Kids Scoop').cat).toBe('Ice Cream')
    expect(result.rows.find(r => r.item === 'Americano').cat).toBe('Coffee')
  })

  it('builds the category revenue breakdown from the authoritative Total (X) rows', () => {
    const result = parseCloverReport(toBuf(buildCloverCsv()))
    expect(result.byCategory['Ice Cream']).toBeCloseTo(700.0)
    expect(result.byCategory['Coffee']).toBeCloseTo(300.0)
  })

  it('detects the report period from the date-range line', () => {
    const result = parseCloverReport(toBuf(buildCloverCsv()))
    expect(result.firstDate).not.toBeNull()
    expect(result.firstDate.getFullYear()).toBe(2026)
    expect(result.firstDate.getMonth()).toBe(6) // July = index 6
  })

  it('sums total item quantity sold', () => {
    const result = parseCloverReport(toBuf(buildCloverCsv()))
    expect(result.itemsSold).toBe(220)
  })

  it('returns null for a file with no recognisable header row', () => {
    const result = parseCloverReport(toBuf('just,some,random,csv\n1,2,3,4'))
    expect(result).toBeNull()
  })

  it('flags reconciled=false when category totals do not match the grand total', () => {
    const broken = buildCloverCsv().replace('"$1,020.00","$1,000.00"', '"$1,020.00","$5,000.00"')
    const result = parseCloverReport(toBuf(broken))
    expect(result.reconciled).toBe(false)
  })
})
