# Shared tag catalogue. Infisical tags are project-scoped, so each project
# creates its own copies; this list is the organization-wide naming convention
# exported into connections.lock.json for tooling and documentation.
locals {
  shared_tags = [
    "terraform-managed",
    "rotate-quarterly",
    "third-party",
  ]
}
