// Fast post-upgrade triage. Run through scripts/check-host.mjs (npm run
// compat:host), which installs the test-only host resolver first. This is
// the question to ask after every DSH update: if every check passes, the
// bump changed only version labels and no plugin change is needed; if a
// fingerprint differs, the adapter seam really moved and must be re-read
// before the hashes are refreshed. Nothing here mutates the host.
import { VERIFIED_BASIC_METHOD_HASH_SETS, methodHash } from '../src/global-adapter.js';
import { CORDIS_RANGE, DSH_RANGE, isSupportedCordisVersion, isSupportedDshVersion } from '../src/host-version.js';

const failures = [];
function report(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}
async function load(label, specifier, options) {
  try {
    return await import(specifier, options);
  } catch (error) {
    report(false, label, error instanceof Error ? error.message : String(error));
    return null;
  }
}
const json = { with: { type: 'json' } };

const basicPackage = (await load('load @deepseek-ai/dsh-compaction-basic manifest', '@deepseek-ai/dsh-compaction-basic/package.json', json))?.default;
const compactionPackage = (await load('load @deepseek-ai/dsh-compaction manifest', '@deepseek-ai/dsh-compaction/package.json', json))?.default;
const registryPackage = (await load('load @deepseek-ai/dsh-agent-preset-registry manifest', '@deepseek-ai/dsh-agent-preset-registry/package.json', json))?.default;
const cordisPackage = (await load('load @deepseek-ai/cordis manifest', '@deepseek-ai/cordis/package.json', json))?.default;
const schemasteryPackage = (await load('load @deepseek-ai/schemastery manifest', '@deepseek-ai/schemastery/package.json', json))?.default;

report(isSupportedDshVersion(basicPackage?.version), `dsh-compaction-basic in ${DSH_RANGE}`, String(basicPackage?.version));
report(isSupportedDshVersion(compactionPackage?.version), `dsh-compaction in ${DSH_RANGE}`, String(compactionPackage?.version));
report(isSupportedDshVersion(registryPackage?.version), `dsh-agent-preset-registry in ${DSH_RANGE}`, String(registryPackage?.version));
report(isSupportedCordisVersion(cordisPackage?.version), `cordis in ${CORDIS_RANGE}`, String(cordisPackage?.version));
console.log(`INFO  schemastery — ${schemasteryPackage?.version ?? 'unavailable'} (peer-declared, not version-gated at runtime)`);

const basicModule = await load('load @deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-compaction-basic');
const compactionModule = await load('load @deepseek-ai/dsh-compaction', '@deepseek-ai/dsh-compaction');
const cordisModule = await load('load @deepseek-ai/cordis', '@deepseek-ai/cordis');

const Basic = basicModule?.BasicCompactionEngine;
report(typeof Basic === 'function', 'BasicCompactionEngine export');
report(Boolean(Basic?.Config), 'BasicCompactionEngine.Config present (root backend)');
report(typeof compactionModule?.toolPairingBalancedBefore === 'function', 'toolPairingBalancedBefore export');
report(typeof compactionModule?.toolPairingBalancedAfter === 'function', 'toolPairingBalancedAfter export');
report(typeof cordisModule?.Service === 'function', 'Cordis Service export');

if (typeof Basic === 'function') {
  const descriptor = Object.getOwnPropertyDescriptor(Basic.prototype, 'compactIfNeeded');
  report(Boolean(descriptor?.writable && descriptor?.configurable), 'compactIfNeeded descriptor writable + configurable');
  const matching = VERIFIED_BASIC_METHOD_HASH_SETS.find(set => (Basic.prototype.compactPressure === undefined || typeof set.compactPressure === 'string')
    && Object.entries(set).every(([name, expected]) => methodHash(Basic.prototype[name]) === expected));
  report(Boolean(matching), 'Basic complete fingerprint tuple', matching ? Object.keys(matching).join(', ') : 'no verified tuple matches');
  for (const name of new Set(VERIFIED_BASIC_METHOD_HASH_SETS.flatMap(set => Object.keys(set)))) {
    const actual = methodHash(Basic.prototype[name]);
    const expected = VERIFIED_BASIC_METHOD_HASH_SETS.map(set => set[name]).filter(Boolean);
    const absent = Basic.prototype[name] === undefined && expected.length < VERIFIED_BASIC_METHOD_HASH_SETS.length;
    report(absent || expected.includes(actual), `Basic.${name} fingerprint`, absent ? 'absent on legacy host' : actual?.slice(0, 12) ?? 'not a function');
  }
}

if (failures.length) {
  console.error(`\nINCOMPATIBLE: ${failures.length} check(s) failed. The global plugin will stay disabled and stock Basic will run unchanged. Re-read the upstream seam before refreshing fingerprints; do not only widen a version range.`);
  process.exit(1);
}
console.log('\nCOMPATIBLE: admitted versions, host seam shape and a complete Basic fingerprint tuple match. Run npm run test:host for the full behavioral suite before a release.');
