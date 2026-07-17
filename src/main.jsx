import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { createQueryClient } from './lib/queryClient'
import './index.css'

// One client for the app's lifetime. Created here rather than in a component so
// a re-render can't swap it and throw away every cached query.
const queryClient = createQueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* QueryClientProvider must sit OUTSIDE AuthProvider: the auth context
        loads its profile through React Query and calls useQueryClient(). */}
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
