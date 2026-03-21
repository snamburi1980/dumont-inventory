// Inventory export utility
// Exports inventory items to CSV or Excel format

export function exportInventoryToCSV(items, sellPrices = {}, filename = 'inventory.csv') {
  const headers = [
    'Name', 'Code', 'Category', 'Vendor', 'UOM',
    'Case Size', 'Cost Price ($)', 'Sell Price ($)',
    'COGS %', 'Margin %', 'PAR Level', 'Order Qty',
    'Current Stock', 'Stock Value ($)', 'Active'
  ]

  const rows = items.map(item => {
    const costPrice  = item.cost_price || item.cost || 0
    const sellPrice  = sellPrices[item.id] || item.sell_price || 0
    const cogs       = costPrice > 0 && sellPrice > 0 ? ((costPrice / sellPrice) * 100).toFixed(1) : ''
    const margin     = costPrice > 0 && sellPrice > 0 ? (((sellPrice - costPrice) / sellPrice) * 100).toFixed(1) : ''
    const stockValue = (item.stock || 0) * costPrice

    return [
      item.name,
      item.code || '',
      item.cat || '',
      item.vendor || '',
      item.uom || '',
      item.case_size || 1,
      costPrice.toFixed(2),
      sellPrice > 0 ? sellPrice.toFixed(2) : '',
      cogs,
      margin,
      item.par || 0,
      item.order_qty || '',
      item.stock || 0,
      stockValue.toFixed(2),
      item.active !== false ? 'Yes' : 'No',
    ]
  })

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => {
      const str = String(cell)
      // Wrap in quotes if contains comma or newline
      return str.includes(',') || str.includes('\n') ? `"${str}"` : str
    }).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Summary stats for export
export function getInventoryStats(items, sellPrices = {}) {
  const active = items.filter(i => i.active !== false)
  return {
    totalItems:   active.length,
    totalValue:   active.reduce((s,i) => s + (i.stock||0) * (i.cost_price||i.cost||0), 0),
    lowStock:     active.filter(i => (i.stock||0) <= (i.par||0)).length,
    categories:   [...new Set(active.map(i => i.cat))].length,
    itemsWithSellPrice: active.filter(i => (sellPrices[i.id] || i.sell_price || 0) > 0).length,
  }
}
