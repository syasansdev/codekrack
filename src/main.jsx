import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { createQueryClient } from './lib/queryClient'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

// One client for the app's lifetime. Created here rather than in a component so
// a re-render can't swap it and throw away every cached query.
const queryClient = createQueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* ThemeProvider is outermost and outside the router: the theme is not
        route-scoped, and AuthContext calls queryClient.clear() on user change —
        nothing about signing out should reset which theme you picked.

        It does NOT apply the theme on first paint; index.html's inline script
        already did that before React existed. This takes over from there. */}
    <ThemeProvider>
      {/* QueryClientProvider must sit OUTSIDE AuthProvider: the auth context
          loads its profile through React Query and calls useQueryClient(). */}
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
