import emailjs from '@emailjs/browser'

const SERVICE_ID  = 'service_hrmh6gj'
const TEMPLATE_ID = 'template_qz6w4dk'
const PUBLIC_KEY  = 'J6H5AoKpjqurMWiVd'

// Initialize EmailJS
emailjs.init(PUBLIC_KEY)

// Generic send function
async function sendEmail({ to, subject, message, fromName = 'Dumont Inventory' }) {
  try {
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      to_email:  to,
      subject,
      message,
      from_name: fromName,
    })
    return true
  } catch(e) {
    console.error('Email send failed:', e)
    return false
  }
}

// Low stock alert
export async function sendLowStockAlert({ storeName, storeEmail, items }) {
  const itemList = items.map(i => `• ${i.name} — Stock: ${i.stock} / PAR: ${i.par}`).join('\n')
  return sendEmail({
    to:      storeEmail,
    subject: `⚠️ Low Stock Alert — ${storeName}`,
    message: `Low stock alert for ${storeName}\n\nThe following items are below PAR level:\n\n${itemList}\n\nPlease reorder soon.\n\nDumont Inventory App`,
  })
}

// Checklist submitted
export async function sendChecklistNotification({ storeName, storeEmail, type, staffName, date, time, checked, total }) {
  return sendEmail({
    to:      storeEmail,
    subject: `${type === 'opening' ? '🌅 Opening' : '🌙 Closing'} Checklist — ${storeName} — ${date}`,
    message: `${type === 'opening' ? 'Opening' : 'Closing'} checklist submitted for ${storeName}\n\nDate: ${date} ${time}\nSubmitted by: ${staffName}\nCompleted: ${checked}/${total} items\n\nView details in the Dumont Inventory app.\n\nDumont Inventory App`,
  })
}

// Delivery approved
export async function sendDeliveryNotification({ storeName, storeEmail, vendor, itemCount, totalCost, date }) {
  return sendEmail({
    to:      storeEmail,
    subject: `📦 Delivery Logged — ${storeName} — ${vendor}`,
    message: `Delivery logged for ${storeName}\n\nVendor: ${vendor}\nDate: ${date}\nItems updated: ${itemCount}\nTotal cost: $${totalCost.toFixed(2)}\n\nInventory has been updated.\n\nDumont Inventory App`,
  })
}
