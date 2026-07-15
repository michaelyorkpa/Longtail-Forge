# Security Policy

## Supported versions

Longtail Forge is under active private-preview development. Security fixes are made on the current supported release line; older versions do not receive a separate security-support commitment.

## Report a vulnerability privately

Do not open a public issue, discussion, or pull request for a suspected vulnerability. Use GitHub's private vulnerability-reporting form for this repository:

<https://github.com/michaelyorkpa/Longtail-Forge/security/advisories/new>

If the **Report a vulnerability** form is not available, contact the repository owner through an existing private channel and ask for a private security-reporting channel. Do not include exploit details or secrets in a public message. Private vulnerability reporting must be enabled and tested before any friends-and-family invitation is sent.

Include, when safe and available:

- the affected version and deployment shape;
- the observed behavior and expected security boundary;
- minimal reproduction steps;
- the likely impact and whether exploitation is ongoing;
- sanitized logs or screenshots with credentials, cookies, tokens, personal data, private content, paths, and storage details removed.

Do not access data that is not yours, disrupt a deployment, persist after proving the issue, or publish the report before the maintainer has had a reasonable opportunity to investigate and coordinate a fix.

## Response expectations

The maintainer will acknowledge the private report as soon as practical, validate and classify it, coordinate remediation and disclosure privately, and communicate when it is safe to disclose. This is a small project and does not promise a fixed service-level response time.

The minimum private-preview incident procedure, operational logging contract, health/readiness behavior, and pre-invitation security checklist are documented in [Operational security](docs/operational-security.md).
