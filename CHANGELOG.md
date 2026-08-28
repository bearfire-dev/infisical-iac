# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Changed

- GitHub OIDC trust, package scopes, repository targets, and secret syncs now use the `paperkeel` organization.
- Each new secret slot now gets a unique `replace_default_key_` placeholder with 256 random hexadecimal characters.
- Drift detection now handles Terraform detailed exit codes without an early shell exit.
- The state backup workflow now prunes snapshots for all roots.
- The provider compatibility document now shows one acceptance result.
- The bootstrap workflow can install the Infisical CLI and run provider acceptance with its OIDC identity.
- Terraform ignores write-only placeholder expression changes after creation unless `placeholder_version` requests a reset.
- Drift checks now use project-scoped APIs and locked connection IDs, so the restricted plan identity does not require organization App Connection access.
- Drift plans now retain project-state backend credentials after Terraform initialization.
- Managed projects now grant the Bearfire operator admin membership for direct local CLI actions.
- Global applies now tolerate organization policy that blocks workflow-created lock-file pull requests.
- The connection lock generator now emits formatter-compatible JSON.

## [0.1.0] - Unreleased

### Added

- Initial scaffold: bootstrap (Alchemy R2 state buckets, platform-bootstrap project, plan/apply identities with GitHub OIDC), global root (GitHub and Cloudflare App Connections, Railway bridge connection, tag catalogue, `connections.lock.json`), shared `infisical-project` module with write-only placeholder secrets, Railway sync bridge, `projects/_template`, `sigla-writer`, `vex-machina`.
- TypeScript CLI (`pnpm validate`, `changed-roots`, `backend-config`, `plan`/`apply`, `secrets:check`, `sync:status`, `connections:lock|check`, `state:snapshot`, `plan-guard`) and the Infisical API bridge.
- GitHub Actions: `ci`, `plan`, `apply`, `bootstrap`, `drift`, `state-backup`; composite `infisical-auth` action (secretless OIDC).
- Documentation: architecture, bootstrap, runbooks, migration, operations, PR SOP, provider compatibility, state recovery, troubleshooting, security policy.

[Unreleased]: https://github.com/paperkeel/infisical-iac/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/paperkeel/infisical-iac/releases/tag/v0.1.0
