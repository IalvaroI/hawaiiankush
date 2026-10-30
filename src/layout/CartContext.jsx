import { createContext, useContext } from 'react'

// Shared shop state for the layout and the routes: the cart, categories, toasts and the bag/checkout actions.
// AppShell provides it; the top bar, cart rail, menu and nav read it.
const CartContext = createContext(null)

export function CartProvider({ value, children }) {
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside AppShell')
  return value
}
