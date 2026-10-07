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

## Changing the logo

`morse-micro/logo.svg` is currently a **placeholder** "M". To use the real logo, save it as
`tenants/morse-micro/logo.png` (or overwrite `logo.svg`), then restart `npm run dev`. No code
changes are needed.

The bubble is a 56px circle on a white background, and the image is scaled to fit inside it
without cropping. A square icon (the logo mark, not the full wordmark) with a transparent
background and at least 256×256 pixels looks best. A wide wordmark will still work, but it will
be very small.
