import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Firebase dev-bypass is gone.
//
// It aliased 'firebase/app' | 'firebase/auth' | 'firebase/firestore' to
// in-memory mocks in src/mocks/, so the UI could be browsed with no Firebase
// project behind it. The app no longer imports Firebase at all — the mocks were
// aliasing modules nothing requires — so the aliases and src/mocks/ are deleted.
//
// The equivalent today is pointing VITE_SUPABASE_* / VITE_API_URL at a scratch
// Supabase project, which exercises the real code paths rather than a hand-
// written imitation of them.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
