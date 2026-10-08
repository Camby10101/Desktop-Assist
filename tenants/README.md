# Tenants

Each folder here holds the branding for one business. The build bundles exactly one tenant,
chosen with the `TENANT` environment variable (default `morse-micro`):

```powershell
$env:TENANT = 'morse-micro'; npm run dev
```

A tenant folder contains:

| File                     | Purpose                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant.json`            | Company and app names, accent colour, and the action icons shown above the bubble (listed from the bubble upward). Validated at startup and by `npm test`. |
| `logo.png` or `logo.svg` | The bubble logo. If both exist, `logo.png` is used.                                                                                                        |

Available actions: `screenshot`, `settings`, `bounce`, `close`.

Optional: `systemPrompt`, extra instructions added to what Claude is told at the start of every
conversation (for example, house style or company-specific context). Up to 8,000 characters.

## Changing the logo

`morse-micro/logo.png` is the Morse Micro "Mμ" mark, cut to a circle (512×512, transparent
corners). To change it, replace that file and restart `npm run dev`. No code changes are needed.

The bubble is a 56px circle with no background of its own, and the image is scaled to fit
inside it without cropping. A square image of the logo mark (not the full wordmark), already cut
to a circle with its own background colour and transparent corners, at least 256×256 pixels,
looks best.
