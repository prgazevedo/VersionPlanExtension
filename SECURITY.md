# Security Policy

## Supported Versions

We actively maintain and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | ✅ Yes            |
| 1.x     | ❌ No             |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly:

### 🔒 **Private Disclosure (Preferred)**

1. **GitHub Security Advisories**: Report via GitHub's private vulnerability reporting
   - Go to: https://github.com/prgazevedo/VersionPlanExtension/security/advisories
   - Click "Report a vulnerability"
   - Provide detailed information about the vulnerability

2. **Email**: Send details to prg.azevedo@icloud.com
   - Subject: "[SECURITY] Claude Config Manager Vulnerability"
   - Include steps to reproduce
   - Include potential impact assessment

### 📋 **What to Include**

- **Vulnerability Description**: Clear explanation of the issue
- **Steps to Reproduce**: Detailed reproduction steps
- **Impact Assessment**: Potential security impact
- **Suggested Fix**: If you have ideas for remediation
- **CVE Information**: If applicable

### ⏱️ **Response Timeline**

- **Initial Response**: Within 48 hours
- **Vulnerability Assessment**: Within 1 week
- **Fix Development**: Depends on severity
  - **Critical/High**: 1-2 weeks
  - **Medium**: 2-4 weeks  
  - **Low**: Next scheduled release

### 🛡️ **Security Measures**

Our extension includes several security measures:

- **Input Validation**: All user inputs are sanitized and validated
- **Path Protection**: Prevention of path traversal attacks
- **URL Validation**: Git repository URLs are validated for safety
- **Dependency Scanning**: Automated dependency vulnerability scanning
- **Code Analysis**: Static code analysis via CodeQL
- **No Telemetry**: Extension operates entirely locally

### 🏆 **Security Recognition**

We believe in recognizing security researchers who help improve our software:

- **Public Recognition**: With your permission, we'll acknowledge your contribution
- **CVE Credit**: Proper attribution in any assigned CVEs
- **Security Hall of Fame**: Listed in our security acknowledgments

### ❌ **Out of Scope**

- **Social Engineering**: Attacks targeting users rather than the software
- **Physical Access**: Issues requiring physical access to user machines
- **Denial of Service**: DoS attacks against Git repositories
- **Third-party Dependencies**: Issues in dependencies (report to respective maintainers)

### 📚 **Security Resources**

- [VS Code Extension Security Best Practices](https://code.visualstudio.com/api/references/extension-manifest)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)

## Security Updates

Security updates will be released as patch versions and announced via:
- GitHub Release Notes
- Repository Security Advisories
- Commit messages tagged with `[SECURITY]`

Thank you for helping keep Claude Config Manager secure! 🛡️