# Setting up Jira and the service desk (for IT)

Since Milestone 5, Desktop Assist works with the company's Atlassian site
(`morsemicro.atlassian.net` for Morse Micro):

- **Jira** (the bell icon): **Notifications** shows when someone else assigned you an issue or
  mentioned you in the last two weeks (not issues you assigned yourself, and not your own
  comments). **Search** finds Jira issues and Confluence pages. Clicking an issue opens it in the
  panel, where you can ask Claude to summarise it, draft a reply or suggest next steps (handed to
  Claude Desktop with the issue's details), move it to another status, comment, or log time.
- **IT service desk** (the headset icon) opens a page instead of the portal:
  - **New request**: choose the request type, write a summary and the details (filled in from
    what's in the text box), attach a screenshot, and include the PC's details. Matching how-to
    articles from IT's Confluence space appear while typing. **Continue on the portal** opens the
    portal's form for that request type, already filled in, with the screenshot copied to paste
    with Ctrl+V. The person checks it and sends it there, as themselves.
  - **My requests**: their own requests (open, and closed in the last 30 days), marked when IT
    has replied or changed the status, with a Windows notification when that happens.
- **Report to IT** under the text box starts a new request from what's typed there.
- **Issue keys in the text box** (like `ISD-1234`) get an **Open** button.

Raising a request works without connecting to Atlassian. Everything else needs each person to
connect once.

## 1. Connecting (each person, once)

1. Click the bell icon, then **Connect to Atlassian**.
2. Their browser opens Atlassian. Staff sign in to Atlassian through JumpCloud, so if they're
   already signed in it's usually just **Accept** on Atlassian's consent page ("Desktop Assist
   wants to access your Atlassian account"). The browser then says they can close the tab, and
   the panel comes back.
3. From then on it works straight away. The connection is saved encrypted for their Windows
   account only (`%APPDATA%\Desktop Assist\atlassian.bin`, Windows DPAPI) and renewed by itself.
   **Settings → Disconnect Atlassian** forgets it.

Desktop Assist connects through **Atlassian's Remote MCP server** (`https://mcp.atlassian.com`),
the documented way for apps to reach Jira and Confluence as the signed-in person. There's no API
key or secret in the app: it registers itself with the server, signs the person in with OAuth
(PKCE) through their browser, and only ever sees what that person can see in Jira and Confluence.
The browser comes back to `http://127.0.0.1:47623/callback` on their own PC, only while they're
connecting.

## 2. Atlassian admin: allow it (usually nothing to do)

Atlassian's Rovo MCP server settings decide which apps may connect. By default they allow apps on
the person's own PC (entries for `localhost` and `127.0.0.1`, any port). Check, in
**admin.atlassian.com** → **Rovo** (or **Apps → AI settings**) → **Rovo MCP server**:

- The MCP server isn't turned off for the organisation.
- **Domain settings** still has the local entries (`http://localhost:*/**`, and
  `http://127.0.0.1:*/**` if listed separately). If someone removed them, connecting fails with
  "Your organization admin must authorize access from this redirect URL"; add
  `http://127.0.0.1:47623/**` back.

Atlassian's guide: [Available Atlassian Rovo MCP server domains](https://support.atlassian.com/security-and-access-policies/docs/available-atlassian-rovo-mcp-server-domains/).

## 3. tenant.json

```json
"actions": ["ask", "jira", "servicedesk", "screenshot", "theme", "settings", "bounce", "close"],
"serviceDesk": {
  "url": "https://morsemicro.atlassian.net/servicedesk/customer/portals",
  "requests": {
    "portalId": "1",
    "projectKey": "ISD",
    "requestTypes": [
      { "id": "1561", "name": "Other IT Issue" },
      { "id": "1571", "name": "Ask IT a question" }
    ]
  }
},
"atlassian": {
  "site": "https://morsemicro.atlassian.net",
  "mcpServer": "https://mcp.atlassian.com/v1/mcp",
  "redirectPort": 47623,
  "knowledgeSpaces": ["INFRA"]
}
```

- **`serviceDesk.requests`** turns the service desk icon into the page. Without it the icon just
  opens `serviceDesk.url`, as before.
  - `portalId`: the IT portal's number, from its address
    (`…/servicedesk/customer/portal/1` for Morse Micro's IT Service Desk).
  - `projectKey`: the Jira project behind it (`ISD`), for My requests.
  - `requestTypes`: the request types offered, in order; **the first is the one "Report to IT"
    starts with**. To find a type's ID, open it on the portal: it's the number at the end of the
    address (`…/portal/1/create/1561`). Morse Micro's list came from the request types IT's
    recent tickets use; add or remove types as the portal changes.
- **`atlassian`** turns on the Jira icon, My requests, the article suggestions and issue keys.
  - `site`: the Atlassian site.
  - `mcpServer`: Atlassian's Remote MCP server (this is the default; it can be left out).
  - `redirectPort`: the loopback port for connecting. Change it if something else on the PCs uses 47623.
  - `knowledgeSpaces`: the Confluence spaces whose pages are suggested while writing a request
    (by space key; Morse Micro's IT space, "Information Technology", is `INFRA`). Search on the
    Jira page looks everywhere.

## How it works

```
 Desktop Assist ── connect (browser, PKCE, once) ────────▶ Atlassian Remote MCP server
                ◀─ access + refresh token (saved, DPAPI)        (mcp.atlassian.com)
                ── every 5 minutes, as the person: ──────▶ Jira:
                     issues assigned to them lately             searchJiraIssuesUsingJql
                     who assigned each one (its history)        getJiraIssue (changelog)
                     comments that mention them                 comment ~ currentUser()
                     their service desk requests                project = ISD AND reporter = …
                ── on request: search, an issue, move, ──▶ Jira and Confluence tools
                     comment, log time, articles
 New request ───── opens the portal form, filled in ─────▶ …/portal/1/create/<type>?summary=…
```

- **Notifications** are worked out in Desktop Assist, from Jira: the latest change of assignee to
  the person in each issue's history (or the issue's creator, for an issue created already
  assigned), skipped when they made it themselves; and comments (or descriptions) that mention
  their account, by someone else. What they've seen is remembered in
  `%APPDATA%\Desktop Assist\atlassian.json` (a time, and each request's last status and reply;
  no issue content).
- **My requests news**: a reply by a person other than the requester (automatic replies such as
  "Thanks for raising your request" don't count), or a change of status. The first check after
  connecting only learns where things are, so nothing old shows as new.
- **Asking Claude** puts the issue's summary, status, people, description and latest comments in
  the question (up to Claude Desktop's limit for a linked question, leaving out the oldest comments
  first). It goes to Claude Desktop like any other question.
- **New request** never creates anything itself: the person sends the request from the portal,
  signed in as themselves, where the request type's own form (and any extra fields IT added) is
  shown. The summary and description are filled in from the link; the PC details are the PC's
  name, Windows version and Desktop Assist version.

## Troubleshooting

- **"Connecting didn't work: …"**: Atlassian's reason follows. "authorize access from this
  redirect URL" means step 2. Nothing happens in the browser: check `mcp.atlassian.com` isn't
  blocked by a firewall or proxy.
- **"Couldn't reach Atlassian"**: the PC is offline or something blocks `mcp.atlassian.com`.
- **"Your Atlassian connection has ended. Connect again."**: the person revoked it (in their
  Atlassian account's connected apps), or Atlassian ended it. **Connect to Atlassian** again.
- **The portal form opens empty**: the person wasn't signed in to Atlassian in their browser, and
  signing in on the way lost what was filled in. This is a known Jira Service Management issue
  with single sign-on and multi-line descriptions (JSDCLOUD-19333, fixed by Atlassian and waiting
  for release). Going back and clicking **Continue on the portal** again, now signed in, fills it
  in. Request types whose portal form is built with Atlassian's "forms" don't take filled-in
  fields at all; what the person wrote is still in Desktop Assist's text box to copy.
- **A request type is missing or wrong**: edit `serviceDesk.requests.requestTypes` and rebuild.
- **No articles are suggested**: articles only come from `knowledgeSpaces`, and only once the
  summary and details have a few words.
- **Problems**: the log (`%APPDATA%\Desktop Assist\logs\desktop-assist.log`) says what failed.

## Removing access

- **One person:** Settings → **Disconnect Atlassian**, or revoke Desktop Assist in their
  Atlassian account (**Profile → Account settings → Connected apps**).
- **Everyone:** take `jira` out of `actions` and `atlassian` out of `tenant.json` (and rebuild),
  or turn off the Rovo MCP server in Atlassian administration.
