# Setting up Claude Desktop for Desktop Assist (for IT)

Since feature 3.1, Desktop Assist doesn't chat with Claude itself. When someone asks a question in
the bubble, it opens a new chat in the **Claude Desktop** app with the question typed in, and
sends it there (with any screenshots pasted in). The chat happens in their own Claude account, so
it counts against their own usage limit (the one their group gives them in claude.ai), like
everything else they do in Claude.

Each PC needs two things:

1. **Claude Desktop** installed.
2. The person **signed in to Claude Desktop** with their Morse Micro account.

Nothing has to be set up in the Claude Console or in a JumpCloud OIDC app for this. Those are only
for the built-in chat ([JUMPCLOUD_SETUP.md](JUMPCLOUD_SETUP.md)), which Morse Micro no longer uses.

## How it works

```
 Desktop Assist ── claude://claude.ai/new?q=<question> ──▶ Claude Desktop: a new chat with
                ── screenshots → clipboard (one image)       the question filled in
                ── once Claude's box shows the question:
                   Ctrl+V (screenshot), then Enter ───────▶ sent; Claude answers
```

- The link is Claude Desktop's documented way for other apps to open it
  ([Open Claude Desktop with a link](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link)).
  It fills in the question but doesn't send it, so the person can check it first. Claude Desktop
  shows its own caution notice above any question that arrives by link (links can also come from
  web pages); it's expected, and the question is still the person's own.
- A link can't carry pictures, so attached screenshots are copied to the clipboard (several are
  stacked into one image) and a Windows notification says to press **Ctrl+V** in Claude.
- The link only fills the question in, so Desktop Assist then presses the keys itself: Ctrl+V for
  a screenshot, then Enter. A hidden Windows PowerShell helper uses Windows UI Automation (the
  accessibility interface) to check that the focused text box belongs to Claude Desktop and
  already shows the question; it presses nothing otherwise, so keys never land in another app.
  If it can't within 20 seconds, a notification says what's left (paste, or press Enter). Each
  person can turn this off in Settings (**Send in Claude automatically**) and send it themselves.
- Claude Desktop cuts a question in a link off at about 14,000 characters, so Desktop Assist
  refuses anything over 12,000 and says so.
- Desktop Assist stores no Claude sign-in and sends nothing to Anthropic itself.

## 1. Install Claude Desktop

- **One PC:** download it from [claude.com/download](https://claude.com/download) (or the
  Microsoft Store).
- **All PCs:** deploy the MSIX package machine-wide with `Add-AppxProvisionedPackage` through your
  device management (JumpCloud can run PowerShell commands on managed devices). Anthropic's guide:
  [Deploy Claude Desktop for Windows](https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows).

When it isn't installed, Desktop Assist says so as soon as its panel opens ("Claude Desktop isn't
installed on this PC…"), with a **Download** button, and won't try to open it.

## 2. Make sure people use the company account

- People sign in to Claude Desktop with their Morse Micro email; single sign-on takes them through
  JumpCloud.
- **Recommended:** set the `forceLoginOrgUUID` policy, so Claude Desktop can only be signed in to
  the Morse Micro organization. Then a question can never end up in someone's personal account
  (and its usage on their personal plan). It's a `REG_SZ` value under
  `HKLM\SOFTWARE\Policies\Claude`, set to the claude.ai organization ID. See
  [Enterprise configuration for Claude Desktop](https://support.claude.com/en/articles/12622667-enterprise-configuration-for-claude-desktop).
  This is the **claude.ai** organization ID, not the Console one in `tenant.json`'s
  `claudeAccess`.

## 3. Usage limits

Nothing to set in Desktop Assist. Its questions are ordinary Claude chats, so the limits you
already give people in claude.ai apply: the organization, group and individual spend limits
(an individual limit overrides their group's). Their usage shows under their name in claude.ai's
usage analytics, as Chat.

## 4. Company context (optional)

The built-in chat could add instructions from `systemPrompt` in `tenant.json`. With Claude
Desktop, use claude.ai's **Organization instructions** instead (Owners: Organization settings →
Organization and access; up to 3,000 characters; they apply to everyone's chats within about an
hour): see [Set organization instructions](https://support.claude.com/en/articles/14546867-set-organization-instructions).
Organization skills and plugins also reach Claude Desktop chats.

## Checking it works

1. Click the bubble, type `Hello` and press Enter. Claude Desktop comes to the front with a new
   chat, `Hello` is sent within a few seconds, and Claude answers.
2. Take a screenshot with the camera icon, click **Attach latest screenshot**, type a question
   and press Enter. Claude opens, the screenshot is pasted under the question, and it's sent.
   (With **Send in Claude automatically** off: a notification says the screenshot was copied;
   press Ctrl+V in Claude, then Enter.)
3. In claude.ai's usage analytics, the usage shows under that person.

## Troubleshooting

- **"Claude Desktop isn't installed on this PC":** install it (step 1). Installing it for one
  Windows user doesn't install it for the others on the same PC.
- **Claude opens but the question isn't filled in:** update Claude Desktop (versions before
  1.20186.0, July 2026, ignored a link that started the app), or check it's signed in; then ask
  again.
- **The question is filled in but not sent** (a notification says "Press Enter in Claude to send
  it"): Claude didn't come to the front, or the person clicked somewhere else in the meantime.
  The log says why ("Sending in Claude Desktop stopped: …"). If it never sends on any PC,
  check PowerShell isn't blocked for users (Constrained Language Mode or AppLocker rules stop
  the helper); everything else still works, people just press Enter themselves.
- **Nothing happens, or "Couldn't open Claude Desktop":** the reason is in
  `%APPDATA%\Desktop Assist\logs\desktop-assist.log` ("Opening Claude Desktop failed").
- **Ctrl+V adds nothing, or something else:** something was copied after the question was sent.
  Attach the screenshot again and ask again, or drag the file from `Pictures\Desktop Assist` into
  Claude.
- **The chat went to a personal account:** set `forceLoginOrgUUID` (step 2).

## Going back to the built-in chat

Set `"chatApp": "built-in"` in `tenants/morse-micro/tenant.json` and rebuild. Questions are then
answered in the panel through the Claude API, usage is billed to the Claude Console account, and
[JUMPCLOUD_SETUP.md](JUMPCLOUD_SETUP.md) applies again.

## What the built-in chat used

Desktop Assist 3.1 deletes the JumpCloud sign-in the built-in chat saved on each PC. The Claude
Console pieces (workspace, service account, federation rule) and the JumpCloud OIDC app are no
longer used. Keep them if you might switch back; otherwise archive the federation rule in the
Console (Settings → Workload identity), so the Console credit can no longer be spent through it.
