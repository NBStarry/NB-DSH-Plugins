# Plugin discovery index

The Pages workflow publishes a DSH format-1 JSON index. It reads committed package manifests and patches at the workflow's exact commit, and publishes the result as a Pages artifact; it never commits the index back to the source branch. The index identifies `NBStarry/NB-DSH-Plugins` and cannot accidentally advertise a fork under that name. A fork must explicitly review and change both the workflow and generator repository checks before publishing its own index.

## Admission

`allowlist.json` lists the packages selected for discovery. Listing does not guarantee that a package will activate or work in a particular DSH profile. To add a package, independently test installation from a public Git commit using the exact DSH-generated target, including its actual dependencies and built files, and review its contents for publication. Then add exactly `{ "path": "plugins/example", "name": "package-name", "version": "1.2.3" }` to the allowlist in a later commit. Only package paths below `plugins/` or `forks/` are accepted. `private: true` is retained; it does not establish Git installation either way. A new version, changed dependency, build requirement, or renamed/moved package requires renewed validation before updating the allowlist. The generator checks the committed name, version and bundle patch files, and fails on duplicate names, invalid paths or mismatches. It preserves a manifest's `engines.dsh` verbatim, and the separately installed official DSH validator checks the resulting index including SemVer ranges. An absent engine declaration is not a compatibility guarantee; DSH also evaluates peer dependencies during installation. The generator does not parse patches, verify runtime compatibility, execute installation or ensure an older test still applies to later source changes.

Cards use `meta.title` and `meta.description` from the committed `locale/en.json` and `locale/zh.json`; missing English values fall back to the package name or manifest description. The committed `icon.svg` is embedded when it is a regular file no larger than 32 KiB. Missing or oversized optional resources and malformed locale JSON produce warnings and use the fallback; SVG content is not sanitized or checked for valid artwork, and other locale paths and icon formats are not supported. The repository link identifies this repository and package directory, not an inferred author. The index does not imply the plugin has been activated or is safe for every profile.

The index pins the commit that produced the artifact, **not** the earlier commit tested before allowlisting. Therefore test again against the final published SHA, and remove an entry or do not enable Pages if that exact SHA fails. A protected release process should review every subsequent source change before it reaches `main`; automatic deployment cannot establish that an earlier test applies to changed code. Same-name forks cannot coexist in this index, even at different versions: choose and review one source rather than relabeling it. Only one current version per package is listed; this is not a release-history generator.

## Publish

After creating and reviewing the repository, set its default branch to `main`, select **Settings → Pages → Build and deployment → Source → GitHub Actions**, then push reviewed commits. Once the workflow succeeds, configure `https://nbstarry.github.io/NB-DSH-Plugins/index.json` under **Plugins → Discover → Manage index sources**. Check the actual deployed URL and JSON in a browser first; redirects are not accepted by DSH. Publishing requires Pages to be available under the account's GitHub plan and repository settings. The site and all metadata are public; never add credentials or private content.

For a local check in a committed checkout, run `node market/generate.mjs NBStarry/NB-DSH-Plugins <full-commit-sha> /tmp/dsh-market/index.json`. It reads blobs from Git, not the working tree. Generated files are not tracked by this repository. `node market/test.mjs` exercises the generator in an isolated temporary repository.

## Checks and records

`market/check.mjs` reports two distinct records without publishing either one:

- **published**: a tracked bundle whose path is in `allowlist.json` with the same name and exact version;
- **unpublished**: a tracked bundle intentionally listed in `market/not-published.json` with a non-empty reason.

Every tracked bundle must be in exactly one class; an unclassified bundle or a stale record fails the check. A missing package is a coverage record, not a version drift. The current allowlist has **13 entries and is not changed** by these checks; the four currently tracked but unpublished bundles stay unpublished until a separately reviewed allowlist change.

For an already-published same-name package, a candidate that changes installation- or runtime-relevant files must advance that package's SemVer. Only the package-root `README.md` is exempt; nested `README.md` files and all other package files are treated conservatively as changes.

Local commands (committed checkout, full SHAs readable by Git):

```sh
node market/check.mjs <full-candidate-sha> [full-base-sha]
node market/check.test.mjs
node market/test.mjs
node market/verify-deployed.test.mjs
node market/verify-deployed.mjs <generated-index.json>
```

## Pull requests

The `market-check` job in `.github/workflows/market-check.yml` runs for every pull request targeting `main`. It is a read-only `pull_request` job (not `pull_request_target`), has no Pages permissions, checks out the exact PR event commit (`GITHUB_SHA`) with full history and disabled persisted credentials, verifies the base commit is available, and compares that exact candidate with `pull_request.base.sha`. It installs only the market validator dependencies, runs generator, market-check and deployment-verifier tests, runs the candidate/base comparison, then generates and validates the index from the exact candidate. It never deploys. It does not use a moving `refs/pull/.../merge` checkout.

To make this required, configure a branch protection rule or ruleset for `main`: **Require a pull request before merging**, require the **`market-check`** status check, and require the branch to be up to date before merging. Do not allow direct-push bypasses if every release must pass the gate. Adding the workflow alone does not change these repository settings.

## Pages publish and post-deploy readback

The Pages workflow still only publishes from `main` (push or manual dispatch). On a push it uses `github.event.before` as the base; a manual dispatch has no `before`, so it uses the candidate's parent commit when available, otherwise coverage-only. Immediately before Deploy it reads the current remote `main` SHA and refuses runs whose candidate is a stale rerun; normal current-main manual runs and reruns are still allowed. It runs the same coverage/check/generator/validator steps before deploying.

After a successful deployment, `market/verify-deployed.mjs` reads the canonical public URL, rejects redirects and non-200 responses, and requires the complete deployed body to be byte-for-byte equal to the generated artifact. Retries are bounded; a valid empty-plugins index is compared exactly, not treated as a zero-byte file. No response body, token, or private content is printed.

A deployment step that succeeds is a successful deployment even if the following readback fails; readback failure makes the job fail and is reported separately. It does not roll back the deployment, and it is not evidence that generation or deployment failed.

Publishing an index does not install, enable, or upgrade any plugin; installed profiles remain unchanged. The checks do not add packages to the allowlist and do not publish new packages automatically.
