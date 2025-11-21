import { defineConfig } from 'tsdown';

export default defineConfig({
  format: ['cjs', 'esm'],
  sourcemap: true,
  tsconfig: './tsconfig.json',
});
