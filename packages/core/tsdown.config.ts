import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['cjs', 'esm'],
  sourcemap: true,
  noExternal: ['ansis', 'unconfig-core', 'wait-on', 'check-package-exists'],
  external: ['electron', 'electron-builder'],
  tsconfig: './tsconfig.json',
});
