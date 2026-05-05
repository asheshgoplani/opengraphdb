# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in OpenGraphDB, please report it privately. Do **not** open a public GitHub issue.

**Private channels:**

- **Preferred:** open a [GitHub Security Advisory](https://github.com/asheshgoplani/opengraphdb/security/advisories/new). This gives a private workspace to coordinate a fix + disclosure. The repo's *Private vulnerability reporting* setting must be enabled on github.com for this URL to render the report form — verify the link returns a 200 (not a 404) before relying on it. The release runbook checks this.
- **Fallback:** email `security@opengraphdb.dev` (or, until that alias is provisioned, the maintainer at `ashesh.goplani96@gmail.com`) with the subject prefix `[opengraphdb-security]`. The fallback address goes to one human's inbox, so response time may be longer than the GHSA path; if you have a critical or actively-exploited issue, please use both channels.

## What to Include

- A description of the vulnerability + the impact.
- Steps to reproduce (a minimal `.cypher` query, sample input, or test case).
- The OpenGraphDB version (`ogdb --version`) and platform.
- Whether you believe the issue is exploitable remotely or requires local access.

## What to Expect

- **Acknowledgement** within 72 hours.
- **Triage** within 7 days — we will tell you whether we accept the report and the severity we assign.
- **Fix timeline** depends on severity:
  - Critical (remote code exec, data corruption): patch within 14 days.
  - High (auth bypass, integrity loss): patch within 30 days.
  - Medium / Low: patch in the next minor release.
- **Disclosure**: coordinated. We will credit you in the release notes unless you prefer to remain anonymous.

## Supported Versions

We patch security issues in the latest minor release only. Users on older versions should upgrade.

| Version | Supported |
| ------- | --------- |
| 0.5.x   | ✅        |
| < 0.5.0 | ❌        |

## Out of Scope

- Vulnerabilities in dependencies that have already been patched upstream and where we are tracking the upgrade.
- Issues that require physical access to the server.
- Self-XSS in user-supplied query results that the user themselves rendered with `dangerouslySetInnerHTML` after copying out of the playground.
