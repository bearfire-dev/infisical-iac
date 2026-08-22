output "project_id" {
  value = infisical_project.this.id
}

output "project_slug" {
  value = local.project_slug
}

output "environments" {
  value = { for k, v in infisical_project_environment.this : k => v.id }
}

output "folders" {
  value = { for k, v in infisical_secret_folder.this : k => v.id }
}

output "secret_slots" {
  description = "Secret object identities (never values)."
  value       = { for k, v in infisical_secret.slot : k => v.id }
}

output "identities" {
  value = { for k, v in infisical_identity.project : k => v.id }
}

output "syncs" {
  value = {
    github             = { for k, v in infisical_secret_sync_github.this : k => v.id }
    cloudflare_workers = { for k, v in infisical_secret_sync_cloudflare_workers.this : k => v.id }
    railway            = { for k, v in module.railway_sync : k => v.sync_name }
  }
}
