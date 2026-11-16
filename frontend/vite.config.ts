import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite (puerto 5173) reenvía las llamadas a la API (puerto 3000).
const api = 'http://localhost:3000';
const rutasApi = ['/auth', '/vales', '/sectores', '/proveedores', '/usuarios', '/facturas', '/publico', '/v/'];

export default defineConfig({
  plugins: [react()],
  server: { proxy: Object.fromEntries(rutasApi.map((r) => [r, api])) },
});
