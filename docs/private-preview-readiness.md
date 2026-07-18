# Private Preview Readiness

This is the invitation gate for the limited friends-and-family private preview. It gathers the existing operator and participant guidance in one place so the maintainer can decide, before access is granted, whether the exact candidate is ready for invited users.

This is a private preview, not a public launch, production SaaS release, security certification, compliance claim, uptime promise, or backup guarantee. The supported deployment shape remains one Longtail Forge application server with SQLite, local Files storage, and either the inline worker or one same-host worker for roughly 50 total users and typical active use around 5-15 concurrent users.

Do not invite participants until this page, the linked operator docs, and the current roadmap gates all agree that the exact candidate is ready.

## Required Reading

- [Docker and Bare-Metal Preview Deployment](preview-deployment.md) owns the supported application installation, deployment, upgrade, and rollback procedures.
- [Reference Internet Deployment](internet-deployment.md) owns DNS, the selected direct-Caddy or bounded Nginx/WireGuard/Caddy path, TLS, firewalling, loopback binding, public health/readiness checks, proxy review, emergency containment, and known limitations.
- [Backup and Restore Operator Guide](backup-and-restore.md) and [Baseline Backup and Restore](backup-restore.md) own the complete backup archive, restore, inspection, and drill contract.
- [Operational Security](operational-security.md) owns production logs, repository scanning, incident response, manual security review, and access/session/API-key revocation expectations.
- [Runtime Configuration](runtime-configuration.md) owns environment variables, production fail-closed startup, Secure Notes key requirements, worker readiness, and file-scanner settings.
- [File Scanner Setup](file-scanner-setup.md) owns ClamAV setup and scanner failure behavior.
- [Friends-and-Family Private Preview Plan](marketing/friends-and-family-preview.md) owns invitation copy, onboarding, low-stakes-data warnings, feedback questions, and preview closeout.

## Before Invitations

Complete and record all of these against the exact candidate version, commit, artifact checksum or image digest, hostname, and data location.

- Confirm the program is labeled "private preview" in invitation, onboarding, known-limitation, and feedback material.
- Confirm the supported scale is stated as one server with SQLite, roughly 50 total users, and typical active use around 5-15 concurrent users.
- Remove or rewrite any unsupported promise of uptime, perfect security, guaranteed backups, compliance, enterprise readiness, hosted SaaS readiness, automatic rollback, or high availability.
- Promote only through the protected `nightly` -> `main` flow and select an immutable release identity from the exact verified `main` revision.
- Verify the runtime artifact checksum, container image digest or staged bare-metal artifact, `/api/app-info` version, commit SHA, and artifact SHA-256 all match the selected release metadata.
- Complete the selected reference-proxy deployment review from [Reference Internet Deployment](internet-deployment.md), including HTTPS redirect, TCP 80/443 as the only public Longtail Forge application ingress, separately recorded restricted SSH management/deployment endpoints where required, loopback-only Node, secure cookies, headers, forged-forwarding rejection, and public `/healthz`, `/readyz`, and `/api/app-info` checks. For the multi-proxy path, also record `nginx -t`, the exact WireGuard edge peer and firewall rule, private Caddy's non-edge rejection, forwarding-chain collapse, and real client-IP attribution.
- Run a complete backup, inspect its manifest and checksums, confirm the backup is outside public paths and the live data tree, and complete a representative restore drill.
- Confirm the Secure Notes master key is supplied through the protected runtime environment, is backed up through a separate protected recovery channel, and is not stored in the backup archive, repository, logs, tickets, or participant material.
- Confirm production file scanning uses a healthy `clamd` or `clamscan` configuration. Do not use `none`, `noop`, or `LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=true` for the internet preview.
- Confirm the initial bootstrap account is unique to the preview, uses a strong non-default deployment password, and is changed or replaced through the normal product workflow after first login.
- Create one unique account per invited participant. Do not share one account across users, and do not copy demo credentials, local development users, data, `.env` files, or Secure Notes keys into the preview.
- Send the known-limitations and low-stakes-data guidance before credentials or first-login instructions.
- Provide the bug-report and feedback path before access is granted, including how to report a blocking issue privately.
- Confirm the operator can pause public traffic, revoke sessions, revoke API keys, deactivate an account, rotate runtime secrets, restore the last known good backup, and roll back the selected release without inventing steps during an incident.

If any item cannot be completed, invitations stay blocked. Record the blocker and either fix it or move the preview target.

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

- candidate version, full commit SHA, artifact checksum or image digest, and release metadata path;
- hostname, deployment path, backup path classification, and operator;
- date/time of the reference-proxy review, backup inspection, restore drill, security review, and release verification;
- confirmation that unique participant accounts, known-limitations copy, bug-report path, feedback path, and revocation procedure are ready;
- unresolved risks, invite/no-invite decision, and next review date.

Do not commit participant names, secrets, incident evidence, scan exports, backup archives, private URLs, or operational credentials to this repository.
