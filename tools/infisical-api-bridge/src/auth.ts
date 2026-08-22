// Authentication for the API bridge: reuses the CLI's Infisical client so the
// credential resolution order (INFISICAL_TOKEN, OIDC, universal auth) is
// defined in exactly one place.
import { InfisicalClient } from "../../cli/src/lib/infisical.js";

export { InfisicalApiError, InfisicalClient } from "../../cli/src/lib/infisical.js";

export async function authenticatedClient(): Promise<InfisicalClient> {
  return InfisicalClient.fromEnv();
}
