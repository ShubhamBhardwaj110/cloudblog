// Bundles each Lambda handler into dist/<name>/index.mjs (one small zip per function).
import { build } from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const handlersDir = join(root, 'src/handlers');
const outRoot = join(root, 'dist');

rmSync(outRoot, { recursive: true, force: true });

const handlers = readdirSync(handlersDir).filter((f) => f.endsWith('.ts'));

await Promise.all(
  handlers.map((file) => {
    const name = basename(file, '.ts');
    return build({
      entryPoints: [join(handlersDir, file)],
      outfile: join(outRoot, name, 'index.mjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      minify: true,
      sourcemap: true,
      legalComments: 'none',
      // CommonJS dependencies (e.g. sanitize-html) call require(); give ESM a real one.
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
      logLevel: 'warning',
    });
  }),
);

console.log(`Built ${handlers.length} functions -> dist/{${handlers.map((f) => basename(f, '.ts')).join(',')}}`);
