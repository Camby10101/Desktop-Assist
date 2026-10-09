# Tenants

Each folder here holds the branding for one business. The build bundles exactly one tenant,
chosen with the `TENANT` environment variable (default `morse-micro`):

```powershell
$env:TENANT = 'morse-micro'; npm run dev
```

A tenant folder contains:

- `tenant.json`: Company and app names, accent colour, the action icons shown above the bubble (listed from the bubble upward), where chats happen, and the sign-in settings. Validated at startup and by `npm test`.
- `logo.png` or `logo.svg`: The logo. `logo.png` is also the tray icon and the `.exe` icon. If both exist, `logo.png` is used.

Available actions: `ask`, `apps`, `servicedesk`, `screenshot`, `settings`, `bounce`, `close`.
`servicedesk` needs `serviceDesk`: `{ "url": "https://…" }`, the company's IT service desk (Morse
Micro's Jira Service Management portal), opened in the browser.

`startPage`: what the panel opens on, `ask` (the text box, the default) or `apps` (the Apps list,
Morse Micro). The other page is behind its icon: `ask` ("Ask Claude") when starting on the apps,
which then needs that action; `apps` ("Your apps") when starting on the text box. The Apps list
needs `portal`:

- `portal`: the company's app portal for the Apps list (JumpCloud's User Portal): `name` (shown
  to users, e.g. `JumpCloud`), `url` (the User Portal), `appsServer` (JumpCloud's MCP Server for
  Users: `https://usermcp.jumpcloud.com/v1` in the US region) and `redirectPort` (the local port
  the browser returns to while connecting, `47622`). See
  [docs/APPS_SETUP.md](../docs/APPS_SETUP.md).

`chatApp`, where questions are answered:

- `"claude-desktop"` (Morse Micro, since feature 3.1): Desktop Assist opens each question in the
  Claude Desktop app, in the person's own Claude account, so it counts against their own usage
  limit. No sign-in in Desktop Assist, and `signIn` and `claudeAccess` aren't needed. See
  [docs/CLAUDE_DESKTOP_SETUP.md](../docs/CLAUDE_DESKTOP_SETUP.md).
- `"built-in"` (the default): the chat runs in the panel through the Claude API, after a JumpCloud
  sign-in, billed to the company's Claude Console account. Needs `signIn` and `claudeAccess`.

Optional: `systemPrompt`, extra instructions added to what Claude is told at the start of every
conversation in the built-in chat (for example, house style or company-specific context). Up to
8,000 characters. With Claude Desktop, use claude.ai's Organization instructions instead.

Sign-in settings for the built-in chat (none of them secret):

- `signIn`: the company's OpenID Connect sign-in: `issuer` (JumpCloud's is
  `https://oauth.id.jumpcloud.com/` in the US region; see the setup guide for EU and India), the app's `clientId`, and `redirectPort` (the local port the
  browser returns to after sign-in, `47621` unless something else on the PCs uses it).
- `claudeAccess`: the Claude Console `organizationId`, `federationRuleId` and `serviceAccountId`
  (and `workspaceId` if the rule covers several workspaces).

Until these are filled in, the app says sign-in isn't set up yet. How to get the values:
[docs/JUMPCLOUD_SETUP.md](../docs/JUMPCLOUD_SETUP.md).

## Changing the logo

`morse-micro/logo.png` is the Morse Micro "Mμ" mark, cut to a circle (512×512, transparent
corners). To change it, replace that file and restart `npm run dev`. No code changes are needed.

The bubble is a 56px circle with no background of its own, and the image is scaled to fit
inside it without cropping. A square image of the logo mark (not the full wordmark), already cut
to a circle with its own background colour and transparent corners, at least 256×256 pixels,
looks best.
