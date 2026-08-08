# Public Demo Operator Runbook

This runbook assembles the repository-owned rt-ltf-demo contracts into one
candidate. It does not authorize publishing the URL. Live-host acceptance and
the launch decision belong to roadmap slice 0.33.31.15.

## Ownership and capability boundary

- The private installation Super Administrator is an operator recovery identity.
  Keep its username and password in the separately protected role-credential
  document; never show it in the visitor catalog, evidence, logs, or messages.
- The six shared visitor accounts are the exact Workspace Admin, Client Admin,
  Project Admin, Client User, Project User, and Client External User fixtures.
  The application-owned login catalog presents them only in the exact verified
  demo runtime. Do not copy credentials into this runbook or operational logs.
- Visitor record workflows are permission-scoped and abuse-bounded. Shared
  identity mutation, installation/workspace administration, API keys, exports,
  imports, backups/restores, Files ingress, private feeds, Secure Notes key
  management, Support View, and outbound email/webhooks/integrations/URL fetch,
  analytics, feedback, and interest capture are disabled.
- DEMO_MODE=false is the ordinary default. Local development,
  Friends-and-Family Preview, supported self-hosted production, and future SaaS
  do not inherit the exact-demo origin, account catalog, capability denials,
  runtime allowlist, budgets, reset, or isolation policy.

The canonical classifications and environment contract are in
[Runtime Configuration](runtime-configuration.md). The exact redacted profile is
[public-demo-compose.env.example](public-demo-compose.env.example).

## Candidate and installation order

1. Select an immutable release image digest and exact protected main SHA.
   Build the repository candidate with
   npm run demo:release-candidate:smoke -- --source-branch main --container.
   A missing native Docker engine is a failed container-proof prerequisite, not
   permission to substitute a manifest-only check.
2. Install the released Compose file, exact-demo environment, deploy helper,
   isolation helper, reset helper, reset scheduler helper, alert helper, systemd
   service/timer, and scheduler environment from the same immutable release.
   Follow [Demo Data Operations](demo-data-operations.md) for root ownership,
   modes, locations, and the separately protected role-credential document.
3. Create only the named external internal IPv4 bridge and data volume from the
   redacted profile. Install and prove the reviewed ClamAV gateway handoff.
4. Install the host-only scheduler disabled, run candidate build/validation,
   isolation enforcement, guarded Compose deployment, representative-role
   proof, and one manual reset. Enable the timer only after all evidence passes.
5. Prove the timer is Persistent=false, fires at the top of each UTC hour, and
   has no application Admin setting. Confirm the next and previous trigger with
   systemctl list-timers longtail-forge-public-demo-reset.timer.

## Normal operation

Deploy, rollback, backup, and reset share one non-blocking root-owned Compose
operation lock. Lock contention must exit without mutation and produce the
bounded failure classification. Never bypass the lock or run two lifecycle
helpers concurrently.

Each hourly reset builds and validates a fresh database-and-Files candidate,
enters the deployment-owned maintenance curtain, captures a protected
whole-instance backup, stops every SQLite user, promotes the candidate as one
unit, starts and verifies the runtime, rejects the pre-reset session, proves a
representative role, and only then finalizes. Visitors should expect a short
unavailable window around the top of the UTC hour. The operator maintenance
marker is independent and must never be cleared by automated reset.

Candidate construction runs in an ephemeral root container with only the
filesystem capabilities `CAP_CHOWN` and `CAP_DAC_OVERRIDE` added back
after the Compose-wide capability drop so its private tree can be verified and
owned by runtime UID/GID 10001. Activation and recovery add only
`CAP_DAC_OVERRIDE` to inspect and move that UID-owned `0700` tree.
The application and backup containers remain capability-free; privileged
containers are not part of this workflow.

The guarded deploy path also stops the application before an exact-demo-only,
ephemeral root container prepares the mounted data root as UID/GID 10001 mode
`0700` with only `CAP_CHOWN` and `CAP_DAC_OVERRIDE`. This makes the first
Compose backup and SQLite WAL/SHM creation possible without broadening the
long-running application or applying the handoff to non-demo installations.

The prior unit and failed/recovery units are protected operational evidence.
Retain only the current policy-approved set after a successful later reset and
backup inspection; never delete the only verified last-known-good unit. Reset
JSONL evidence is root-owned 0600, capped at 336 records (two records per
hourly run for seven days). Container local logs are capped at 10 MiB across
seven files. Caddy and host logs require the same seven-day maximum, disk cap,
credential/session/header/body/path redaction, and operator-only access.

## Alerts, rollback, and recovery

Treat any missed trigger, failed candidate validation, lock contention,
maintenance state after the expected window, health/readiness/version mismatch,
old-session acceptance, role-login failure, isolation drift, or alert-helper
failure as an incident. Disable the scheduler before manual work:

1. Preserve the bounded scheduler record, operation ID, semantic fingerprint,
   image digest, app version, and health/recovery classifications. Do not retain
   cookies, credentials, request bodies, full paths, or submitted content.
2. Inspect the shared lock and active operation marker. Do not remove either
   while an owner is alive or while phase reconciliation is incomplete.
3. Run the documented reset inspection/recovery command. Automatic recovery
   must restore and verify the prior database-and-Files unit. If the maintenance
   curtain remains, keep it closed and use the protected whole-instance backup
   restore path from [Backup and Restore](backup-restore.md).
4. Re-enforce isolation, verify direct and public health/readiness/app identity,
   confirm old-session rejection and a fresh representative login/logout, then
   run a manual reset before re-enabling the timer.
5. Rotate any material that may have escaped, remove temporary evidence, record
   the incident disposition, and retain the normal bounded evidence only.

Never repair a failing reset by enabling Docker auto-restart, attaching another
network peer, broadening egress, disabling the scanner, using another
installation's data, or publishing the private operator identity.

## Visitor messaging

Before publication, the login surface must communicate only these safe facts:

> Public demo using shared fictional accounts. Do not enter personal,
> confidential, or production information. Changes are visible to other
> visitors and reset near the top of every UTC hour. A short reset interruption
> is expected. File uploads and external messaging are unavailable.

Do not promise exact uptime, private workspaces, durable changes, support
response times, analytics collection, feedback capture, or newsletter signup.
Do not publish the URL until the live gate and explicit launch decision pass.
