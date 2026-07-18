# Self-Hosting Longtail Forge

Longtail Forge supports one-server SQLite operation for a small office or limited private preview: roughly 50 total users and typically 5-15 active at once. It does not claim horizontal scaling, high availability, or hosted-SaaS readiness. PostgreSQL remains future work.

Use [Docker and Bare-Metal Preview Deployment](preview-deployment.md) for the authoritative installation shapes. Docker Compose is the primary reproducible path; a staged checksummed runtime artifact and systemd service are the supported bare-metal alternative. Node listens only behind the selected reviewed edge: direct Caddy may own public TLS, or the exact Nginx -> WireGuard -> private Caddy chain may own it as divided in [Reference Internet Deployment](internet-deployment.md). Application data and local Files stay on local durable storage, and backups use a separate protected path.

Before inviting anyone, complete [Private Preview Readiness](private-preview-readiness.md): provide unique production secrets, a separately protected Secure Notes recovery key, malware scanning, restricted host and backup access, off-host backup export, a tested restore, monitoring, participant guidance, unique invited accounts, and the manual security review. Do not copy demo data, credentials, database files, keys, or environment files into the preview installation.

GitHub deployment is optional for a self-hosted operator. When used for the maintained friends-and-family instance, [GitHub Workflow](development/github-workflow.md) defines the supported low-privilege SSH handoff and root-owned host helper. The workflow starts disabled: configure its isolated environment and prove deployment plus rollback before setting `DEPLOY_ENABLED=true` or sending invitations.
