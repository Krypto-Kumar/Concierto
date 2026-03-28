import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow specific host(s), e.g., Docker container name or custom domain
    allowedHosts: ['hyperlustrous-unsuspectfully-denny.ngrok-free.dev'], // Replace with your actual host (e.g., 'localhost', 'myapp.dev', '192.168.1.100')
    
    // Optional: Allow all hosts (use only in development)
    // allowedHosts: true,
    
    // Important: Set host to '0.0.0.0' to allow external access
    host: '0.0.0.0',
    port: 5173,
  },
})
