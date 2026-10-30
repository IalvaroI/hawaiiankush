import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './layout/layout.css'
import { AppShell } from './layout/AppShell.jsx'
import { MenuPage } from './routes/MenuPage.jsx'
import { NotFound } from './routes/NotFound.jsx'
import { ProductPage } from './features/product/ProductPage.jsx'
import { DealsPage } from './routes/DealsPage.jsx'
import { BrandsPage } from './routes/BrandsPage.jsx'
import { BrandPage } from './routes/BrandPage.jsx'
import { LearnPage } from './routes/LearnPage.jsx'
import { LocationsPage } from './routes/LocationsPage.jsx'
import { CheckoutPage } from './features/checkout/CheckoutPage.jsx'
import { SignInPage } from './features/account/SignInPage.jsx'
import { AccountPage } from './features/account/AccountPage.jsx'
import { OrdersPage } from './features/orders/OrdersPage.jsx'
import { OrderPage } from './features/orders/OrderPage.jsx'
import { BagPage } from './features/cart/BagPage.jsx'
import { SavedPage } from './routes/SavedPage.jsx'
import { PickerPage } from './features/picker/PickerPage.jsx'
import { initAnalytics } from './lib/analytics.js'

// The app lives under BASE_URL (/maui/). The trailing slash stays in the basename: without it the router
// writes the menu's query URLs as /maui?x=y, which the server does not serve (it expects /maui/).
const basename = import.meta.env.BASE_URL

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <MenuPage home /> },
      { path: '/shop', element: <MenuPage /> },
      { path: '/c/:slugId', element: <MenuPage /> },
      { path: '/p/:slugId', element: <ProductPage /> },
      { path: '/brands', element: <BrandsPage /> },
      { path: '/b/:slugId', element: <BrandPage /> },
      { path: '/deals', element: <DealsPage /> },
      { path: '/learn', element: <LearnPage /> },
      { path: '/locations', element: <LocationsPage /> },
      { path: '/saved', element: <SavedPage /> },
      { path: '/picker', element: <PickerPage /> },
      { path: '/bag', element: <BagPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/account', element: <AccountPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/orders/:orderId', element: <OrderPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
], { basename })

export function App() {
  useEffect(() => { initAnalytics() }, [])
  return <RouterProvider router={router} />
}
