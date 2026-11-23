# Contributing and local development

This repository keeps exactly one copy of each package: our own plugins at
`plugins/<package>`, maintained third-party forks at `forks/<package>`. A package
is the unit of ownership: its manifest, source, tests, and commits live in that
same path. A variant of a package is a branch that changes that path, not a
second directory.

## Work in place

1. Create a topic branch from the package's current baseline.
2. Edit, test, and commit in `plugins/<package>`; do not create a parallel `dev/`
   source tree or make a second copy of the package.
3. Shared test tools may be used from a shared location, but must not become a
   second source of truth for a package.
4. Do not change a package's identity, version, or release metadata as part of an
   unrelated workflow change.

Tests run against the package path:

```sh
npm --prefix plugins/<package> test
```

Use a temporary HOME and do not download or install dependencies unless the
package explicitly declares how to provision them.

Repository-wide test entrypoint: `node scripts/test-plugins.mjs`. It runs only
Git-tracked packages that declare `scripts.test`, each with a fresh HOME and
offline npm. It is not a sandbox; tests must not use the network or write
outside their package. Packages that have tests must declare `scripts.test`. A
test that needs a DSH source checkout or installed dependencies stays out of
`scripts.test` and documents its own command.

## Third-party forks and old live sources

If a third-party fork is brought into maintenance, keep its upstream license and
attribution, verify whether it belongs in the market separately, and migrate its
source on its own. Do not edit, move, or re-point a live installed old source as
part of this workflow.

## Local state

`.gitignore` protects known private runtime trees, account selections, and old
development material from accidental addition. It is not an access boundary.
Do not use force-add to bypass it; verify rules with synthetic paths in a clean
checkout.

No launcher or CI workflow is maintained by this repository.
