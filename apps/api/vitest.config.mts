import ts from 'typescript';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * esbuild (used by Vitest) does not emit `design:paramtypes`, so NestJS
 * dependency injection cannot resolve constructor parameters in tests.
 * Transpile TypeScript ourselves first, with decorator metadata enabled.
 */
function decoratorMetadata(): Plugin {
  return {
    name: 'typescript-decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (!file.endsWith('.ts') || file.includes('/node_modules/')) {
        return undefined;
      }

      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          sourceMap: true,
        },
      });

      return {
        code: result.outputText,
        map: result.sourceMapText ?? null,
      };
    },
  };
}

export default defineConfig({
  plugins: [decoratorMetadata()],
  test: {
    environment: 'node',
  },
});
