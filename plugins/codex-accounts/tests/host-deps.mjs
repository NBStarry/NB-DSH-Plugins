/** Resolve existing source-checkout dependencies without installing local copies. */
import { createRequire, registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = new URL('../../dsh-upstream/package.json', import.meta.url);
const require = createRequire(source);
const zod = pathToFileURL(join(dirname(require.resolve('zod')), 'index.js')).href;
const project = new URL('../', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'zod' && context.parentURL?.startsWith(project)) return nextResolve(zod, context);
    return nextResolve(specifier, context);
  },
});
