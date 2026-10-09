# Setting up the Apps list (for IT)

Since feature 3.2, Desktop Assist shows the apps the person sees in their **JumpCloud User
Portal**, with their logos: for Morse Micro the panel opens on them (the text box for asking
Claude is behind the **Ask Claude** icon). Clicking an app opens it in their
default browser, signed in through JumpCloud just as it would be from the portal.

The list comes from JumpCloud's **MCP Server for Users**, the documented way for an app on the
user's PC to see their portal: it lists the apps that user can access and gives each app's sign-in
link. Each person connects Desktop Assist to it once, in their browser. There's no API key or
secret in the app, and it only ever sees what that person could see in their own portal.

## 1. Turn on the MCP Server for users (once, JumpCloud admin)

In the JumpCloud Admin Portal: **Settings → JumpCloud AI** tab → turn on **MCP Server for users**.
JumpCloud's guide: [Get started: MCP Server for users](https://jumpcloud.com/support/get-started-mcp-server-users).

Until it's on, the Apps list says the list isn't turned on for the company yet.

**Can't see a JumpCloud AI tab?** Search the Admin Portal for "MCP" (older JumpCloud pages put the
switch under **Settings → Features**). If it's nowhere, check your admin role (some tabs only show
for the full **Administrator with Billing** role) or ask JumpCloud support whether your plan
includes the MCP Server for users.

Nothing else is needed in JumpCloud: Desktop Assist registers itself with the server the first
time someone connects. Which apps each person sees is decided as always, by the groups assigned
to each app in JumpCloud (and "Show in User Portal").

## 2. What each person does (once)

1. Click the bubble. (Where the panel opens on the text box instead, click the **Apps** icon, the
   grid.)
2. Click **Sign in with JumpCloud**. Their browser opens JumpCloud; if they're already signed in
   there, they just approve Desktop Assist. The browser then says they can close the tab.
3. The Apps list appears. From then on it opens straight away; the connection is saved encrypted
   for their Windows account only (`%APPDATA%\Desktop Assist\jumpcloud-apps.bin`, Windows DPAPI)
   and renewed by itself.

People can see and revoke the connection in their User Portal (JumpCloud lists active MCP
connections there). After revoking, the Apps list asks them to sign in again.

## How it works

```
 Desktop Assist ── sign in (browser, PKCE, once) ────────▶ JumpCloud MCP Server for Users
                ◀─ access + refresh token (saved, DPAPI)
                ── list_applications ───────────────────▶ the user's portal apps
                ── launch_application (on click) ───────▶ the app's sign-in link
                ── open the link in the default browser
```

- The server is `https://usermcp.jumpcloud.com/v1` (`portal.appsServer` in `tenant.json`). For a
  JumpCloud organization in the EU region use `https://usermcp.eu.jumpcloud.com/v1`, and
  `https://usermcp.in.jumpcloud.com/v1` for India; also set `portal.url` to that region's User
  Portal (`https://console.eu.jumpcloud.com/userconsole#/`, for example).
- The browser comes back to `http://127.0.0.1:47622/callback` on the user's own PC
  (`portal.redirectPort`), only while they're connecting. Change the port if something else on the
  PCs uses it.
- Only `https` links are ever opened from the list.
- **Open the JumpCloud portal** at the bottom of the list opens the User Portal itself.

## Troubleshooting

- **"The apps list isn't turned on for your company yet":** step 1.
- **"Couldn't reach JumpCloud":** the PC is offline, or a firewall blocks
  `usermcp.jumpcloud.com`.
- **The sign-in page shows an error:** usually the MCP Server for users is off, or the user isn't
  allowed to use it. The app shows JumpCloud's reason.
- **"Port 47622 is in use by another program":** change `portal.redirectPort` and rebuild.
- **An app is missing:** check it's assigned to one of the person's groups and shown in the User
  Portal; then **Refresh** (the arrow at the top of the list).
- **"Couldn't read your apps list":** JumpCloud answered in a form Desktop Assist doesn't know. The
  log (`%APPDATA%\Desktop Assist\logs\desktop-assist.log`) names the fields it got.

## Removing access

- **One person:** remove them from the app groups as usual, or revoke the Desktop Assist
  connection in their User Portal.
- **Everyone:** turn off **MCP Server for users** (step 1). The Apps list then says it isn't
  turned on; the rest of Desktop Assist keeps working.
