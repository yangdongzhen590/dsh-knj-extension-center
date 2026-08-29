### Task 1: 工程脚手架 + 冒烟测试

**Files:**
- Create: `plugins/dsh-knj-extension-center/package.json`
- Create: `plugins/dsh-knj-extension-center/tsconfig.json`
- Create: `plugins/dsh-knj-extension-center/tsconfig.build.json`
- Create: `plugins/dsh-knj-extension-center/tsdown.config.ts`
- Create: `plugins/dsh-knj-extension-center/cordis.patch.yml`
- Create: `plugins/dsh-knj-extension-center/vitest.config.ts`
- Create: `plugins/dsh-knj-extension-center/src/index.ts`
- Create: `plugins/dsh-knj-extension-center/src/client/index.ts`（最小占位：`export function apply() {}` + `export const inject: string[] = []`，供 tsdown 构建出 client.js；Task 7 改为真实装配）
- Create: `plugins/dsh-knj-extension-center/src/invariant.ts`
- Create: `plugins/dsh-knj-extension-center/tests/smoke.test.ts`
- Create: `plugins/dsh-knj-extension-center/.gitignore`

**Interfaces:**
- Produces: `package.json`（scripts: build / typecheck / test）、`src/index.ts` 导出 `{ name, apply, inject }`、`invariant.ts` 导出 `invariant(cond, msg): asserts cond`。

- [ ] **Step 1: 写失败测试** `tests/smoke.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { name, inject } from '../src/index';

describe('plugin contract', () => {
  it('exports stable name and inject list', () => {
    expect(name).toBe('skill-center');
    expect(inject).toEqual(['webServer', 'skills', 'sessions']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm.cmd test`（在 `plugins/dsh-knj-extension-center/`）
Expected: FAIL —— `Cannot find module '../src/index'`

- [ ] **Step 3: 最小实现**

`src/index.ts`：
```ts
export const name = 'skill-center';
export const inject = ['webServer', 'skills', 'sessions'];
export function apply() {
  // 占位：Task 6 挂载真实路由
}
```

`src/invariant.ts`：
```ts
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm.cmd test`
Expected: PASS（1 个用例）

- [ ] **Step 5: 脚手架配置**（含真实内容）

`package.json`：
```json
{
  "name": "dsh-knj-extension-center",
  "version": "0.1.0",
  "description": "DSH skill center: browse by region, install from zip, manage (enable/disable, uninstall, trash restore, search).",
  "type": "module",
  "main": "./lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["slots", "locale"] }
  },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "dependencies": {
    "jszip": "^3.10.1",
    "yauzl": "^3.2.0"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-locale": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-client-runtime": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-host-webserver": "^0.1.1-rc.2",
    "@types/node": "^22.20.0",
    "@types/react": "~18.3.1",
    "@types/react-dom": "^18.3.5",
    "@types/yauzl": "^2.10.3",
    "jsdom": "^25.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tsdown": "0.22.2",
    "typescript": "~5.7.2",
    "vitest": "^3.0.0"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "react": "^18.2.0"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/cordis": { "optional": true },
    "react": { "optional": true }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json && tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`：`target ES2022`、`module ESNext`、`moduleResolution bundler`、`jsx react-jsx`、`strict true`、`types ["node"]`、include `src` + `tests` + `vitest.config.ts`。
`tsconfig.build.json`：extends 基础，`outDir lib`、`declaration true`、include 仅 `src`、exclude `tests`。**注意**：client 的 JSX 构建由 tsdown 处理，tsc.build 只编译 host 侧；若 tsc 对 `src/client/**/*.tsx` 报错，build 配置 exclude `src/client`，host 输出后由 tsdown 打包 client。
`tsdown.config.ts`：
```ts
import { defineConfig } from 'tsdown';
export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  format: ['esm'],
  outDir: 'lib',
  platform: 'browser',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-slots'],
});
```
`vitest.config.ts`：`{ test: { environment: 'node', include: ['tests/**/*.test.ts'] } }`。
`cordis.patch.yml`：
```yaml
- insert:
    - id: ui-skill-center
      name: dsh-knj-extension-center
```
`.gitignore`：`node_modules/`、`lib/`、`*.tgz`。

- [ ] **Step 6: 安装依赖 + 构建 + 全量测试**

Run: `npm.cmd install` 然后 `npm.cmd run build` 然后 `npm.cmd test`
Expected: install 无错；build 产出 `lib/index.js`（host）+ `lib/client.js`（client bundle）；test PASS

- [ ] **Step 7: 提交**

```bash
# 在插件目录内执行（git 仓库位于 plugins/dsh-knj-extension-center/）
git add .
git commit -m "chore: scaffold dsh-knj-extension-center plugin"
```

---
