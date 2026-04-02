import { sendLowStockAlert } from './emailNotify'

// Call this when inventory loads to check for low stock
// and send alert if needed
export async function checkAndAlertLowStock({ inventory, storeName, storeEmail, getStatus }) {
  const lowItems = inventory.filter(i => {
    const status = getStatus(i)
    return status === 'low' || status === 'critical'
  })

  if (lowItems.length === 0) return

  // Only send once per day - check localStorage
  const key     = `low_stock_alert_${storeName}_${new Date().toDateString()}`
  const already = localStorage.getItem(key)
  if (already) return

  // Send alert
  const sent = await sendLowStockAlert({ storeName, storeEmail, items: lowItems })
  if (sent) {
    localStorage.setItem(key, 'sent')
    console.log(`Low stock alert sent for ${lowItems.length} items`)
  }
}
