# Global root: organization-wide shared resources (App Connections, shared
# conventions). State is SENSITIVE: the provider persists App Connection
# credentials in state. Never give project workflows access to this state;
# projects consume IDs via global/connections.lock.json instead.
provider "infisical" {
  host = var.infisical_host
}
