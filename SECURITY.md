# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in OpenGraphDB, please report it privately. Do **not** open a public GitHub issue.

**Private channels:**

- Open a [GitHub Security Advisory](https://github.com/asheshgoplani/opengraphdb/security/advisories/new) (preferred — gives us a private workspace to coordinate a fix and disclosure).
- Or email: `ashesh.goplani96@gmail.com` with the subject prefix `[opengraphdb-security]`.

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
| 0.4.x   | ✅        |
| < 0.4.0 | ❌        |

## Out of Scope

- Vulnerabilities in dependencies that have already been patched upstream and where we are tracking the upgrade.
- Issues that require physical access to the server.
- Self-XSS in user-supplied query results that the user themselves rendered with `dangerouslySetInnerHTML` after copying out of the playground.
