import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    base: '/invoices/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                auth: resolve(__dirname, 'auth.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                app: resolve(__dirname, 'app.html'),
                invoices: resolve(__dirname, 'invoices.html'),
                consultants: resolve(__dirname, 'consultants.html'),
                analytics: resolve(__dirname, 'analytics.html'),
                timesheets: resolve(__dirname, 'timesheets.html'),
                profile: resolve(__dirname, 'profile.html'),
                login: resolve(__dirname, 'login.html'),
                signup: resolve(__dirname, 'signup.html'),
                templates: resolve(__dirname, 'templates.html'),
                testConnection: resolve(__dirname, 'test-connection.html')
            }
        }
    }
})
