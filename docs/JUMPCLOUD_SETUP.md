# Setting up JumpCloud sign-in (for IT)

Desktop Assist signs people in with JumpCloud and then reaches Claude **without any API key**:
Anthropic's Workload Identity Federation swaps the user's JumpCloud ID token for a short-lived
Claude token. To turn that on you need to do three things, about 20 minutes in total:

1. **JumpCloud**: create an OIDC app for Desktop Assist. Gives a **client ID**.
2. **Claude Console**: trust JumpCloud and say who may use Claude. Gives an **organization ID**,
   a **federation rule ID** and a **service account ID**.
3. **Desktop Assist**: put those four values in `tenants/morse-micro/tenant.json` and rebuild.

None of these values are secret. The app has no client secret and no API key.

## How it fits together

```
 Desktop Assist ── 1. sign in (system browser, PKCE) ───▶ JumpCloud
                ◀─ ID token + refresh token
                ── 2. swap the ID token ───────────────▶ Anthropic (checks it against
                ◀─ Claude token, short-lived               your federation rule)
                ── 3. chat, using the Claude token ───▶ Claude
```

- Users sign in once, in their browser. If they're already signed in to JumpCloud there, it
  finishes by itself. The app keeps the refresh token (encrypted with Windows DPAPI) and stays
  signed in until JumpCloud ends the session.
- Every swap uses a new ID token, which Anthropic checks against your federation rule. Removing a
  user from the JumpCloud app (or their group) stops their access the next time their sign-in is
  renewed, normally within the hour.
- At Anthropic, all Desktop Assist usage is counted against one **service account** in one
  workspace. Per-user usage isn't visible there.

## 1. JumpCloud: create the OIDC app

In the JumpCloud Admin Portal:

1. Go to **SSO Applications** and select **+ Add New Application**, then **Custom Application**.
2. Choose **Manage Single Sign-On (SSO)** → **Configure SSO with OIDC**, and name it
   `Desktop Assist`. Upload the logo if you like (`tenants/morse-micro/logo.png`).
3. On the **SSO** tab:

   | Setting                        | Value                                                                              |
   | ------------------------------ | ---------------------------------------------------------------------------------- |
   | **Redirect URIs**              | `http://127.0.0.1:47621/callback`                                                  |
   | **Client Authentication Type** | **Public (None PKCE)**                                                             |
   | **Login URL**                  | Any URL; it isn't used (for example `https://www.morsemicro.com`)                  |
   | **Grant types**                | **Authorization Code** (always on) **and Refresh Token**                           |
   | **Refresh token lifetime**     | The maximum, 90 days (129,600 minutes; the default is 30 days)                     |
   | **Standard scopes**            | **Email** and **Profile** (the app asks for `openid email profile offline_access`) |

   Without the **Refresh Token** grant, users can't stay signed in and the app shows an error
   saying so. The refresh token lifetime is the longest anyone could go without signing in
   again; the app renews the sign-in at every start and while it's in use.

4. On the **User Groups** tab, assign the groups who should have Desktop Assist.
5. **Activate** the app and copy the **Client ID**.

Notes:

- The redirect URI must match exactly. The app only listens on that address on the user's own PC,
  and only while a sign-in is in progress.
- If port `47621` is used by something else on your PCs, pick another port, use it in the
  redirect URI and set `redirectPort` to match in step 3.
- **Region.** The issuer depends on where your JumpCloud organization is hosted. It's
  `https://oauth.id.jumpcloud.com/` for the US region (an Admin Portal at
  `console.jumpcloud.com`), `https://oauth.id.eu.jumpcloud.com/` for the EU region
  (`console.eu.jumpcloud.com`), and `https://oauth.id.in.jumpcloud.com/` for India. Use the same
  issuer in step 2 and in `tenant.json`. The rest of this guide shows the US one.

## 2. Claude Console: trust JumpCloud

You need the admin or owner role in the Anthropic organization that will pay for Desktop Assist.
Anthropic's guide is [Workload Identity Federation](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation).

1. **Workspace.** Create (or pick) a workspace for Desktop Assist, for example `desktop-assist`, so
   its usage, rate limits and spend limits are separate.
2. Go to **Settings → Workload identity** and select **Connect workload**, then **Custom OIDC**.
   The wizard creates the three pieces below in one go. (You can also create them one at a time
   on that page.)

   **Issuer**

   | Field       | Value                                                                                      |
   | ----------- | ------------------------------------------------------------------------------------------ |
   | Issuer URL  | `https://oauth.id.jumpcloud.com/` (exactly, **with** the trailing slash; see Region above) |
   | JWKS source | Discovery                                                                                  |

   **Service account**: for example `desktop-assist`. Make sure it is a **member of the Desktop
   Assist workspace**.

   **Federation rule**

   | Field           | Value                                                                                       |
   | --------------- | ------------------------------------------------------------------------------------------- |
   | Workspace       | The Desktop Assist workspace (just this one)                                                |
   | Audience        | The JumpCloud **Client ID** from step 1                                                     |
   | Condition (CEL) | `claims.email.endsWith("@morsemicro.com")`                                                  |
   | Scope           | **`workspace:inference`** (chat only; the wizard suggests `workspace:developer`, change it) |
   | Token lifetime  | Leave the default                                                                           |

   The audience ties the rule to this JumpCloud app, and the condition makes sure only company
   accounts get through. Anthropic insists on at least one matcher besides the audience.

3. Copy:
   - the **organization ID** (a UUID, under **Settings → Organization**),
   - the **federation rule ID** (`fdrl_...`),
   - the **service account ID** (`svac_...`),
   - the **workspace ID** (`wrkspc_...`), only needed if the rule covers more than one workspace.

## 3. Desktop Assist: fill in tenant.json

Edit `tenants/morse-micro/tenant.json`:

```json
"signIn": {
  "issuer": "https://oauth.id.jumpcloud.com/",
  "clientId": "<JumpCloud Client ID>",
  "redirectPort": 47621
},
"claudeAccess": {
  "organizationId": "<organization UUID>",
  "federationRuleId": "fdrl_...",
  "serviceAccountId": "svac_..."
}
```

Add `"workspaceId": "wrkspc_..."` to `claudeAccess` only if the rule covers several workspaces.
Then rebuild (`npm run dist`) or restart `npm run dev`. Until these are filled in, the app says
"Sign-in isn't set up yet" and lists what's missing.

## Making sign-in quicker (optional)

The laptops already run the JumpCloud Agent, so sign-in can be close to instant:

- **Signing in only happens once per laptop** (until the refresh token lifetime above runs out
  without the app being used), not at every start.
- **If the browser is already signed in to JumpCloud** (the User Portal or any other SSO app),
  clicking **Sign in with JumpCloud** finishes by itself in a second or two, with no prompts.
- **JumpCloud Go** turns the browser sign-in into a Windows Hello check (PIN or fingerprint)
  instead of a password and MFA. It works on JumpCloud Agent-managed devices with the JumpCloud Go
  browser extension, which IT can push with a JumpCloud policy. A JumpCloud Go session lasts 12
  hours and renews each time the laptop is unlocked. See
  [Use JumpCloud Go](https://jumpcloud.com/support/use-jumpcloud-go).

The app can't use the Windows sign-in directly: the JumpCloud Agent doesn't give other apps a
way to sign in silently, so the one browser step stays.

## Checking it works

1. Open Desktop Assist and click **Sign in with JumpCloud**. Your browser opens JumpCloud, then
   says you can close the tab, and the chat box reopens.
2. Send a message. In the Claude Console, **Settings → Workload identity → Authentication history**
   should show a successful exchange.
3. Quit and reopen the app: it should go straight to the chat without asking you to sign in.

## Troubleshooting

| What the user sees                                                   | Likely cause                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Sign-in isn't set up yet"                                           | `tenant.json` is missing values (listed on screen).                                                                                                                                                                                                                                                                                                  |
| The browser shows a JumpCloud error about the redirect URI           | The redirect URI in JumpCloud doesn't exactly match `http://127.0.0.1:<redirectPort>/callback`.                                                                                                                                                                                                                                                      |
| "Sign-in didn't work" with a reason from JumpCloud                   | Usually the user isn't in a group assigned to the app.                                                                                                                                                                                                                                                                                               |
| "JumpCloud didn't allow staying signed in"                           | The **Refresh Token** grant isn't enabled on the JumpCloud app.                                                                                                                                                                                                                                                                                      |
| "Port 47621 is in use by another program"                            | Change the port (JumpCloud redirect URI and `redirectPort`).                                                                                                                                                                                                                                                                                         |
| "Your JumpCloud account isn't set up to use Claude yet. Contact IT." | Anthropic refused the swap. Check **Authentication history** in the Claude Console for the reason: issuer URL not matching exactly (trailing slash), audience not the client ID, the condition not matching the user's email, the service account not in the workspace, or the ID token living longer than the issuer's maximum (1 hour by default). |
| "Your organisation's Claude account has run out of credit"           | Billing or the workspace spend limit.                                                                                                                                                                                                                                                                                                                |
| "Your JumpCloud sign-in has expired"                                 | JumpCloud ended the session (refresh token expired or revoked, or the user was removed). Signing in again fixes it.                                                                                                                                                                                                                                  |

## Removing access

- **One person:** remove them from the JumpCloud app's groups. Their access stops at the next
  renewal (within about an hour); Claude tokens already issued expire on their own.
- **Everyone:** archive the federation rule in the Claude Console. All swaps stop immediately.
