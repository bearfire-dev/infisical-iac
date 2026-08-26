# Consumer environment contract

Read this reference before you change application code that reads an Infisical-managed environment variable.

## Find the current contract

1. Read the application repository instructions.
2. Search for `@bearfire-dev/env`, `createBearfireEnv`, `createRequestEnv`, `process.env`, Worker bindings, and workflow secret references.
3. Find the runtime that first reads the variable.
4. Find the destination that supplies the variable.
5. Use the repository package manager and check commands.

Use one typed environment module for each runtime boundary.
Replace raw access only when the changed scope already uses that pattern.
Do not rewrite unrelated environment access.

## Install the package

Use pnpm and retain both peer dependencies.

```ini
@bearfire-dev:registry=https://npm.pkg.github.com
```

```bash
pnpm add @bearfire-dev/env @t3-oss/env-core zod
```

Obey the workspace filters and dependency conventions.
Do not replace a newer approved version with an older example version.

Grant the consumer repository read access to the `@bearfire-dev/env` package in GitHub
Packages. Do not create a package PAT in repository secrets.

For each GitHub Actions job that installs dependencies, use the built-in token:

```yaml
permissions:
  contents: read
  packages: read

steps:
  - uses: actions/setup-node@<approved-pin>
    with:
      cache: pnpm
      registry-url: https://npm.pkg.github.com
      scope: "@bearfire-dev"
  - run: pnpm install --frozen-lockfile
    env:
      NODE_AUTH_TOKEN: ${{ github.token }}
```

Preserve the repository's approved action pins and Node-version settings. Configure local
GitHub Packages authentication outside tracked files.

For a new integration, also update the repository's existing environment example, binding
types, and deployment workflow contract. Add names only to an example file. Never add a
live value or an Infisical placeholder as an application default.

## Classify the variable

| Variable class | Consumer schema | Control-plane declaration |
|---|---|---|
| Private credential or signing material | `secret("NAME")` in `server` | Required |
| Managed private configuration | Specific Zod schema in `server` | Required when Infisical delivers it |
| Browser-visible or bundled value | Specific Zod schema in `client` | Required only when deployment needs Infisical delivery |
| Public source-controlled constant | Normal code or build configuration | Not required |

Examine the security boundary before you classify a `PUBLIC_` variable.
Never put `secret()` in a `client` or `shared` schema.

Validate each managed non-secret value with its real shape.
For example, validate an account ID, URL, enumeration, or port.

## Validate Node and build-tool values

Pass the actual runtime environment to `createBearfireEnv`.

```ts
import { createBearfireEnv, secret } from "@bearfire-dev/env";
import { z } from "zod";
export const env = createBearfireEnv({
	server: {
		DATABASE_URL: z.url(),
		SESSION_SECRET: secret("SESSION_SECRET"),
	},
	runtimeEnv: process.env,
});
```

Some deployment tools cannot validate during module import.
For those tools, expose a small validation function.
Call that function before the tool changes infrastructure.
Match the repository lifecycle.

## Validate Cloudflare Worker bindings

Read runtime values from the request bindings.
Create the validator once, then call it for each request.

```ts
import { createRequestEnv, secret } from "@bearfire-dev/env";
const getEnv = createRequestEnv({
	server: {
		SHARED_KEY: secret("SHARED_KEY"),
	},
});
export default {
	fetch(_request: Request, bindings: Env) {
		const env = getEnv(bindings);
		return new Response(env.SHARED_KEY.length.toString());
	},
};
```

Do not use `process.env` in a Worker runtime.
Keep the bindings type consistent with the schema.

## Add focused tests

Use synthetic values only.

- Make sure that a valid synthetic value passes.
- Make sure that the value has the expected TypeScript type.
- Make sure that a malformed non-secret value fails with the correct key name.
- Make sure that a secret rejects `replace_default_key_${"a".repeat(256)}`.
- Make sure that no `client` or `shared` schema contains `secret()`.

Do not snapshot or log a runtime environment.
Use a simple synthetic string instead of a token-shaped fixture.

## Respect destination ownership

Read Infisical-managed GitHub keys through `${{ secrets.KEY_NAME }}` in application workflows.
Read Cloudflare Worker values from runtime bindings.
Read Railway values from service variables.

After Infisical owns a destination folder, do not write its keys with another tool.
Treat a direct destination edit as drift.

During onboarding, keep the current destination writer until the Infisical project exists
and the operator populates its values. Remove the old writer only after readiness and sync
checks pass. Never let two systems write the same destination keys after migration.
