import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  format: ['esm'],
  outDir: 'lib',
  platform: 'browser',
  // 不清理 outDir：host 侧由 tsc 产出 lib/index.js（见 package.json build 脚本），
  // tsdown 只负责追加 client bundle，避免 tsc 产物被清空。
  clean: false,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-slots',
  ],
});
