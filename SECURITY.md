# Security policy

## Supported versions

Security fixes are provided for the current 1.x release line. Homepage Studio is desktop-only and requires Obsidian 1.8.7 or later.

## Reporting a vulnerability

After the repository becomes public, use the repository's **Security → Report a vulnerability** private advisory form. Do not disclose a suspected vulnerability in a public issue before a fix is available.

Include the Homepage Studio version, Obsidian version, operating system, reproduction steps, impact, and whether the problem requires a particular vault file or plugin configuration. Remove personal vault content, access tokens, and other secrets from logs or samples.

If private advisories are temporarily unavailable, contact the repository owner through the GitHub profile linked in `manifest.json` and request a private reporting channel without including exploit details in the initial public message.

## Data and network boundary

Homepage Studio stores its configuration in its own plugin directory and edits only explicitly configured Markdown sources. It does not collect telemetry or upload vault data. A user-configured remote Banner URL is the only optional external request.
