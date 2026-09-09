# Project-local third-party installation record

## CodeGraph

- Upstream: https://github.com/colbymchenry/codegraph
- Reviewed commit: `c6aaa20358cd6adcd04b87bdef8e5803ad146f3a`
- Installed npm package: `@colbymchenry/codegraph@1.5.0`
- Location: `.codex/tools/codegraph/`
- Integration: project-scoped `.codex/config.toml`
- Privacy: `DO_NOT_TRACK=1` and `CODEGRAPH_NO_UPDATE_CHECK=1`
- Dependency audit result at install time: 0 known vulnerabilities in the actual
  published Windows package tree
- Defense in depth: `picomatch@4.0.4` remains pinned as an npm override because the
  upstream source lockfile audit reported an older vulnerable range, although that
  dependency is absent from the installed platform bundle tree

Do not run `codegraph uninstall`, `codegraph uninit`, or `npm uninstall` from an
agent session in this project: upstream cleanup paths recursively delete directories,
which conflicts with this repository's `AGENTS.md` policy.

## Understand-Anything

- Upstream: https://github.com/Egonex-AI/Understand-Anything
- Reviewed commit: `797ce7969312411be2e125c39628854166f055d7`
- Upstream plugin version: `2.9.4`
- Runtime location: `.codex/third_party/understand-anything/`
- Skills location: `.codex/skills/understand*/`
- Dependency audit scope: `understand-anything-plugin/pnpm-lock.yaml`
- Dependency audit result at install time: 0 known production vulnerabilities

The repository-level homepage workspace was intentionally not installed because its
separate dependency graph contained known vulnerabilities and is not required by the
Codex skills. Local skill instructions discover this project-scoped runtime and load
the shared PowerShell and cleanup contract in `understand-anything/AENGINE-RUNTIME.md`.
`understand-figma` is the only installed skill that makes an application API request;
it sends `FIGMA_TOKEN` only to `api.figma.com` when that skill is explicitly invoked.

## Beautiful Mermaid

- Upstream: https://github.com/lukilabs/beautiful-mermaid
- Reviewed commit: `2ac8bbbb060ca0a65a6a21f3200bd99b1587b488`
- Upstream package version: `beautiful-mermaid@1.1.3` (MIT)
- Location: `.codex/third_party/beautiful-mermaid/`
- Install discipline: `npm install --ignore-scripts`; no npm lifecycle scripts were
  permitted during installation.
- Actual production dependencies: `elkjs@0.11.1`, `entities@7.0.1`.
- Dependency audit result at install time: 0 known production vulnerabilities.
- Validation: local `npm run build` completed; the ESM renderer produced valid SVG
  and ASCII output from a minimal flowchart.

The project uses only `dist/index.js` as a local rendering library. Do not run the
upstream development server, interactive editor or deploy scripts from an agent
session. The editor inserts generated SVG into browser `innerHTML`; never use that
path to display untrusted Mermaid input without a separate SVG sanitization review.
