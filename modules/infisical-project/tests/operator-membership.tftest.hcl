mock_provider "infisical" {}
mock_provider "random" {}

variables {
  config = {
    schema_version = 1
    project = {
      name = "Operator Membership Test"
      slug = "operator-membership-test"
    }
    environments = {
      prod = { name = "Production", position = 1 }
    }
    secret_sets = {
      runtime = { path = "/runtime", secrets = {} }
    }
  }
  connections = {
    schemaVersion = 1
    organization  = { id = "00000000-0000-0000-0000-000000000001", slug = "paperkeel" }
    identities = {
      plan  = { id = "00000000-0000-0000-0000-000000000002", name = "plan" }
      apply = { id = "00000000-0000-0000-0000-000000000003", name = "apply" }
    }
  }
}

run "no_operators" {
  command = plan

  assert {
    condition     = length(infisical_project_user.operator) == 0
    error_message = "The module must not create operator memberships when operator_usernames is empty."
  }
}

run "one_operator" {
  command = plan

  variables {
    operator_usernames = ["operator@example.com"]
  }

  assert {
    condition     = length(infisical_project_user.operator) == 1
    error_message = "The module must create one membership for one operator username."
  }

  assert {
    condition     = infisical_project_user.operator["operator@example.com"].username == "operator@example.com"
    error_message = "The membership must use the declared operator username."
  }
}

run "multiple_operators" {
  command = plan

  variables {
    operator_usernames = ["first@example.com", "second@example.com"]
  }

  assert {
    condition     = length(infisical_project_user.operator) == 2
    error_message = "The module must create one membership for each distinct operator username."
  }
}

run "reject_blank_operator" {
  command = plan

  variables {
    operator_usernames = [""]
  }

  expect_failures = [var.operator_usernames]
}

run "reject_operator_whitespace" {
  command = plan

  variables {
    operator_usernames = [" operator@example.com"]
  }

  expect_failures = [var.operator_usernames]
}
