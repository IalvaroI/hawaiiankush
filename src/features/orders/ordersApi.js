import { api } from '../../api/client.js'
import { ORDERS_PAGE_SIZE } from './orderModel.js'

// Order requests through the shared store client (the proxy adds the shopper's token). Orders are never cached.
// Pages are 1-based; the API requires both Pagination fields on this list.
export function fetchOrders(page) {
  return api(`/orders?${new URLSearchParams({ 'Pagination.Page': String(page), 'Pagination.PageSize': String(ORDERS_PAGE_SIZE) })}`, { cache: 'no-store' })
}

export async function fetchOrder(orderId) {
  const result = await api(`/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' })
  return result?.order || null
}

export function createPaymentLink(orderId, redirectUrl) {
  return api(`/orders/${encodeURIComponent(orderId)}/payment-link`, { method: 'POST', body: JSON.stringify({ redirectUrl }) })
}
