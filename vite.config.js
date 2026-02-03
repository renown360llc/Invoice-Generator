import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                auth: resolve(__dirname, 'auth.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                app: resolve(__dirname, 'app.html'),
                invoices: resolve(__dirname, 'invoices.html'),
                profile: resolve(__dirname, 'profile.html'),
                login: resolve(__dirname, 'login.html'),
                signup: resolve(__dirname, 'signup.html'),
                testConnection: resolve(__dirname, 'test-connection.html')
            }
        }
    }
})
