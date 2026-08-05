# Private Preview Readiness

This is the invitation gate for the limited friends-and-family private preview. It gathers the existing operator and participant guidance in one place so the maintainer can decide, before access is granted, whether the exact candidate is ready for invited users.

This is a private preview, not a public launch, production SaaS release, security certification, compliance claim, uptime promise, or backup guarantee. The supported deployment shape remains one Longtail Forge application server with SQLite, local Files storage, and either the inline worker or one same-host worker for roughly 50 total users and typical active use around 5-15 concurrent users.

Do not invite participants until this page, the linked operator docs, and the current roadmap gates all agree that the exact candidate is ready.

## Required Reading

- [Compose Production Support](preview-deployment.md) owns the sole supported production/self-hosted deployment, upgrade, rollback, and recovery boundary.
- [Reference Internet Deployment](internet-deployment.md) owns DNS, the selected direct-Caddy or bounded Nginx/WireGuard/Caddy path, TLS, firewalling, loopback binding, public health/readiness checks, proxy review, emergency containment, and known limitations.
- [Backup and Restore Operator Guide](backup-and-restore.md) and [Baseline Backup and Restore](backup-restore.md) own the complete backup archive, restore, inspection, and drill contract.
- [Operational Security](operational-security.md) owns production logs, repository scanning, incident response, manual security review, and access/session/API-key revocation expectations.
- [Runtime Configuration](runtime-configuration.md) owns environment variables, production fail-closed startup, Secure Notes key requirements, worker readiness, and file-scanner settings.
- [File Scanner Setup](file-scanner-setup.md) owns ClamAV setup and scanner failure behavior.
- [Friends-and-Family Private Preview Plan](marketing/friends-and-family-preview.md) owns invitation copy, onboarding, low-stakes-data warnings, feedback questions, and preview closeout.

## Before Invitations

Complete and record all of these against the exact candidate version, commit, runtime-artifact checksum, image-index and platform-manifest digests, hostname, and data location.

- Confirm the program is labeled "private preview" in invitation, onboarding, known-limitation, and feedback material.
- Confirm the supported scale is stated as one server with SQLite, roughly 50 total users, and typical active use around 5-15 concurrent users.
- Remove or rewrite any unsupported promise of uptime, perfect security, guaranteed backups, compliance, enterprise readiness, hosted SaaS readiness, automatic rollback, or high availability.
- Promote only through the protected `nightly` -> `main` flow and select an immutable release identity from the exact verified `main` revision.
- Verify schema-2 release metadata binds the protected `main` commit, runtime-artifact checksum, GHCR image-index digest, one `linux/amd64` platform manifest, native `better-sqlite3` proof, and attached SPDX/SLSA evidence. Confirm the running container uses those exact image/platform digests and `/api/app-info` version, commit SHA, and artifact SHA-256 match.
- Decide deliberately whether the bounded private preview uses the clearly labeled neutral operator templates or installation-specific Terms and Privacy Markdown supplied through protected runtime configuration. Record the selected document checksums and operator review in the private readiness record, and verify the public pages match those bytes. Professional legal review is not a current private-preview prerequisite and is not claimed; the review path appropriate to public analytics, feedback, or interest capture is deferred to 0.33.32.
- Verify every public and authenticated footer links to Terms, Privacy, and Corresponding Source for the exact running commit. Keep hostnames, review correspondence, approval records, and deployment paths out of this repository.
- Complete the selected reference-proxy deployment review from [Reference Internet Deployment](internet-deployment.md), including HTTPS redirect, TCP 80/443 as the only public Longtail Forge application ingress, separately recorded restricted SSH management/deployment endpoints where required, loopback-only Node, secure cookies, headers, forged-forwarding rejection, and public `/healthz`, `/readyz`, and `/api/app-info` checks. For the multi-proxy path, also record `nginx -t`, the exact WireGuard edge peer and firewall rule, private Caddy's non-edge rejection, forwarding-chain collapse, and real client-IP attribution.
- Run a complete backup, inspect its manifest and checksums, confirm the backup is outside public paths and the live data tree, and complete a representative restore drill.
- Confirm the Secure Notes master key is supplied through the protected runtime environment, is backed up through a separate protected recovery channel, and is not stored in the backup archive, repository, logs, tickets, or participant material.
- Confirm production file scanning uses a healthy `clamd` or `clamscan` configuration. Do not use `none`, `noop`, or `LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=true` for the internet preview.
- Confirm the initial bootstrap account is unique to the preview, uses a strong non-default deployment password, and is changed or replaced through the normal product workflow after first login.
- Create one unique account per invited participant. Do not share one account across users, and do not copy demo credentials, local development users, data, `.env` files, or Secure Notes keys into the preview.
- Send the known-limitations and low-stakes-data guidance before credentials or first-login instructions.
- Provide the bug-report and feedback path before access is granted, including how to report a blocking issue privately.
- Confirm the operator can pause public traffic, revoke sessions, revoke API keys, deactivate an account, rotate runtime secrets, rotate or revoke the host's pull-only registry credential without exposing it to the deployment account, restore the last known good backup, and roll back the selected release digest without inventing steps during an incident.
- Require the exact candidate's clean-Ubuntu `npm run maintenance:rehearse` result. Retain its commit, Caddy/Nginx/OpenSSL versions, timestamps, outcome, and any protected failure references in the private operational record. This proves the disposable marker, response-owner, deploy-recovery, rollback, and stale-state transitions; it does not replace live certificate, firewall, WireGuard, backup, scanner, or identity evidence.

If any item cannot be completed, invitations stay blocked. Record the blocker and either fix it or move the preview target.

## 0.33.17.9 Release Evidence

The non-sensitive technical closeout record for the 2026-07-18 candidate is:

- Preview deploy run `29650387252` installed main commit `12112780ab2125d8ff0aff6a61b5e2070eab84fd`, version `0.33.17.9-main`, artifact SHA-256 `fd6c1cfa2426d0d7cd70b28a48fa101bb2142ff4fbf30d796add689a61e198c0`.
- Preview rollback run `29650513803` restored the recorded known-good commit `cfe8930e0853a32525d932c94abe1e6b0202b103`, version `0.33.17.8.4-main`, artifact SHA-256 `5de87470bbc4634b6c6ae65928233f03840e9961484a52895a5a61a2c079a212`; restore-forward run `29650577402` returned to the exact `12112780` candidate.
- Reconciliation PR #23 returned focused preview hotfix PRs #20-#22 to `nightly`. Integration run `29650754873` passed the full and browser gates and deployed nightly commit `c82622b2b8f82cdb86c2c580e2bff513030497d7`, version `0.33.17.9-nightly`, artifact SHA-256 `0817eb0cdd17b34d6730669d764d879b692616b09927ffc6eba08eeb6474f706`.
- Both public hosts returned green `/healthz` and `/readyz` responses and exact `/api/app-info` version, source-branch, commit, and artifact identities.
- Live review proved valid Nginx configuration and unknown-SNI rejection, the exact WireGuard peer/firewall boundary, private Caddy rejection of non-edge traffic, forwarding-chain collapse, real client-IP attribution, and forged-forwarding rejection.

This repository record proves the release mechanics and public-path checks without publishing host credentials, private addresses, backup paths, recovery keys, participant details, or security evidence. Before any invitation, the operator must still complete and retain the private signed readiness record below, including the Secure Notes recovery channel, healthy production scanner, unique participant accounts, participant guidance, and the explicit invite/no-invite decision. No invitation was issued as part of this closeout.

## 0.33.24.9 Maintenance Boundary Release Evidence

The non-sensitive technical closeout record for the maintenance-boundary rollout is:

- The isolated demo canary passed first. The friends-and-family preview and shared public edge were then backed up before installation; the new preview whole-instance database+Files archive was inspected as restorable before any proxy or helper change.
- Both bounded hosts now use the reviewed root-owned maintenance page, independent operator/deployment markers, deployment recovery helper, private-Caddy Node fallback, and public-Nginx transport fallback. Live proof covered ownership/modes, exact diagnostic behavior, marker independence, Node and private-Caddy outages, rollback, restore-forward, and recovery without proxy reload.
- The complete repository revision passed the protected topic -> `nightly` -> `main` flow, including the clean-Ubuntu maintenance rehearsal. Preview was deployed only by the manual workflow against one full immutable `main` SHA, and its public health, readiness, version, commit, and artifact checksum matched the workflow metadata.
- Exact hostnames, private addresses, backup paths, operation IDs, tool output, and checksummed private evidence remain in the root-only operational record rather than this repository.

This technical completion does not authorize invitations. The private signed readiness record, participant-account review, scanner/recovery evidence, and explicit invite/no-invite decision remain separate and unchanged; no invitation was issued as part of the `0.33.24` rollout.

## 0.33.28.4 Compose Replacement Evidence

The non-sensitive technical closeout record for the Compose replacement gate is:

- Demo passed first, then preview. Both native `linux/amd64` hosts completed immutable-digest Compose cutover, protected whole-instance backup and inspection, durable SQLite/Files persistence, backup-first upgrade, restore-based rollback, and final candidate deployment behind their existing reviewed edges.
- The final pre-closeout candidate on both hosts is protected-main commit `c1ce4538b17cfcfffdab372bdfe31ae990d65827`, image index `sha256:6ae3294d86f5612f96466feccebcfb016f9eb510fb0f7c1debd21d5c2827e8fd`, `linux/amd64` platform manifest `sha256:afc36e2c9a264bba4c67a212ef4459d5d6f63acf8f90bf95bccb9e8265176300`, and runtime-artifact SHA-256 `e7183f7ddb118a4122ef09445c329b4c6657a02f65fa6dac6b5f934bd7b4a7ce`. Direct and public `/healthz`, `/readyz`, and `/api/app-info` matched that identity.
- Container inspection proved UID/GID 10001, read-only root, dropped capabilities, `no-new-privileges`, loopback-only port 8001, the external reviewed bridge, and a private 512 MB `/tmp` tmpfs. The exact bridge gateway is the sole proxy/scanner handoff; public access to the scanner and Node port remains denied.
- Demo retained its expected users/workspaces/tasks/notes/Files counts and two stored Files objects. Preview retained SQLite integrity, zero foreign-key violations, its exact users/workspaces/tasks/notes/Files counts, and all 3,071 stored Files objects across cutover, upgrade, restored rollback, and final deployment.
- The prior bare-metal services were stopped and disabled during cutover. After the successful observation period, their repository-supported service, helper, cutover, smoke, workflow, and documentation contracts were retired in 0.33.28.5. Required host backups, Secure Notes recovery material, historical releases, and protected operation records remain private retention evidence rather than a supported fallback runtime.
- The host cut includes product features through 0.33.27 plus the 0.33.28 deployment/release work. Secure Catalogs (`0.33.29`) and Support View (`0.33.30`) are not included.

On 2026-08-05, both hosts still reported the `longtail-forge` Compose project running from the reviewed Compose file while the former `longtail-forge` systemd units remained inactive and disabled. Both public origins remained healthy and ready with the exact protected-main 0.33.28.3 identity recorded above. Exact host paths, private addresses, backup and operation identifiers, recovery material, credentials, and detailed security output remain in the root-only operational records.

This replacement and retirement proof does not authorize invitations or an announcement. The private signed readiness record, participant/account checks, and explicit invite decision remain separate; no invitation was issued as part of this closeout.

## First Login And Accounts

The preview uses ordinary Longtail Forge accounts. Operators create a unique user for each invited participant and assign only the workspace access they should have. A participant should never receive a shared account, bootstrap account, owner account, API key, server credential, database file, backup archive, Secure Notes recovery key, or deployment secret.

For the maintained preview:

1. Confirm the preview hostname and candidate release are verified.
2. Create the participant account through the protected user administration flow.
3. Give the participant the private-preview known-limitations text and the five-minute first-use path before credentials.
4. Require a real password change when applicable, then confirm the participant can sign in, reach the intended workspace, and sign out.
5. Record who was invited, when access was granted, and how to revoke that participant's sessions and account if the preview pauses.

The fresh-start bootstrap values in `.env` are an installation mechanism, not the invitation workflow. Changing `SUPER_ADMIN_PASSWORD` after users exist does not rotate participant passwords.

## Participant Guidance

Participants should understand these points before access:

- This is early, invitation-only, and private.
- Use it only for light, low-stakes work.
- Do not store sensitive client, financial, legal, medical, private family, credential, or irreplaceable data.
- Keep a separate copy of anything important.
- Do not share the link, screenshots, or generated content publicly.
- Secure Notes are encrypted at rest but are not zero-knowledge; the server can decrypt them when the runtime key is present.
- Uploaded files are scanned before normal download/preview in the supported preview, but scanning is not a guarantee that every malicious file is detected.
- Bug reports should include steps, expected result, actual result, page/module, rough time, severity, and scrubbed screenshots only when helpful.

Use [Friends-and-Family Private Preview Plan](marketing/friends-and-family-preview.md) for the invitation copy, five-minute first-use path, bug-report template, feedback questions, and interview guide.

## Emergency Pause Or Revocation

For suspected compromise, leaked credentials, harmful bug, participant data concern, or unclear deployment state:

1. Stop new invitations.
2. Remove public traffic at the selected TLS edge or stop the app if exploitation may be active, preserving data and logs.
3. Revoke affected sessions and API keys through the supported admin surfaces when the app is safe to use.
4. Deactivate affected accounts or reset credentials as needed.
5. Rotate exposed runtime or external credentials through the secret store.
6. Restore only from a verified backup when data integrity is in doubt.
7. Communicate privately with affected participants using confirmed facts and the next update time.

Do not edit raw session rows, database credentials, Secure Notes payloads, or backup contents as a substitute for the supported revocation and restore procedures.

## Readiness Record

Keep the signed readiness record private. It should include:

- candidate version, full commit SHA, artifact checksum, image-index/platform-manifest digests, attestation/native-proof status, and release metadata path;
- hostname, deployment path, backup path classification, and operator;
- date/time of the reference-proxy review, backup inspection, restore drill, security review, and release verification;
- Terms/Privacy source, operator review date, deployed document checksums, and the private record location; if professional review is later selected, record that reviewer and approval separately;
- confirmation that unique participant accounts, known-limitations copy, bug-report path, feedback path, and revocation procedure are ready;
- unresolved risks, invite/no-invite decision, and next review date.

Do not commit participant names, secrets, incident evidence, scan exports, backup archives, private URLs, or operational credentials to this repository.
