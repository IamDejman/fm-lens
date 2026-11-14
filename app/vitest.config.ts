import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', testTimeout: 20_000, setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.tsx'], environmentOptions: { jsdom: { url: 'http://localhost/?writable' } } },
});
