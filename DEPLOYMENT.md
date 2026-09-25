# Deployment

This is a static site (`app/` builds to `app/dist/` via Vite - no backend, no
database, no server-side code). It can be hosted anywhere that serves static
files. These instructions use **Cloudflare Pages**, the recommended host -
see "Why Cloudflare Pages" below for the reasoning and alternatives.

## Before you start: the license constraint

This project's map borders derive from [CShapes 2.0](https://icr.ethz.ch/data/cshapes/)
(CC BY-NC-SA 4.0) and UN OCHA data distributed under HDX's legacy terms.
**Both require non-commercial use.** That means:

- No ads, paywalls, or "pro tier" bolted onto this site.
- No selling access, embedding it in a paid product, or using it to promote
  a commercial offering.
- The attribution in the footer (`app/src/App.jsx`) must stay visible - don't
  remove or bury it.

If anyone ever wants to monetize this project, the borders (and the Wikipedia
event summaries, CC BY-SA 4.0) would need to be re-licensed or replaced
first. Free/non-commercial hosting (as below) keeps the project compliant
without anyone having to think about it.

## What's already done for you

- The app builds cleanly (`npm run build` in `app/`) and has been verified
  with a real headless-browser check of the production build (not just the
  dev server) - the map, timeline, and event panel all render and are
  interactive with zero console errors.
- `.github/workflows/ci.yml` builds and lints the app on every push and pull
  request, so a broken commit gets caught before it ever reaches main.
- No host-specific config file is needed - see "Why no `wrangler.toml`"
  below. Cloudflare Pages auto-detects this as a Vite app once you point it
  at the `app/` directory (one field in its setup screen).
- `app/.nvmrc` and `app/package.json`'s `engines` field pin the Node version
  this app needs (Vite 8 requires Node ^20.19 or >=22.12) so the host's build
  environment doesn't silently pick an older Node and fail.

## What you need to do (one-time setup, ~5 minutes)

1. **Push this repo to GitHub** if it isn't already there (Cloudflare Pages
   deploys from a GitHub - or GitLab - repo).
2. **Create a free Cloudflare account** at [cloudflare.com](https://dash.cloudflare.com/sign-up)
   if you don't have one.
3. In the Cloudflare dashboard, go to **Workers & Pages -> Create -> Pages ->
   Connect to Git**, and authorize/select this repository.
4. In the build configuration screen, set:
   - **Framework preset:** Vite
   - **Root directory:** `app`
   - **Build command:** `npm run build` (Cloudflare should fill this in from
     the Vite preset)
   - **Build output directory:** `dist`
   - Leave everything else default - no environment variables are required.
5. Click **Save and Deploy**. First build takes a minute or two; Cloudflare
   gives you a `*.pages.dev` URL immediately.
6. **(Optional) Custom domain:** in the Pages project's **Custom domains**
   tab, add your domain and follow the DNS instructions (trivial if the
   domain is already on Cloudflare DNS; otherwise it's a CNAME record). Free
   on Cloudflare's plan - no upgrade needed.

That's it. From here on:

- **Every push to `main`** triggers a new production deploy automatically.
- **Every pull request** gets its own preview URL automatically, so you can
  see changes live before merging.
- The GitHub Actions build-check (step above) runs independently and will
  show a red X on a PR if the build breaks - it doesn't block Cloudflare's
  deploy by itself, but it's the signal to hold off merging.

## Why Cloudflare Pages

Compared against Vercel, Netlify, and GitHub Pages for this specific app
(static Vite build, likely-spiky/unpredictable traffic if it gets shared
publicly, must stay free/non-commercial):

| | Cloudflare Pages | Vercel | Netlify | GitHub Pages |
|---|---|---|---|---|
| Connect GitHub repo, auto-deploy on push | Yes, one click | Yes, one click | Yes, one click | No native build step - needs a GitHub Actions workflow to build and push to a `gh-pages` branch |
| Custom domain on free tier | Yes | Yes | Yes | Yes (via `CNAME` file) |
| Zero-config for a standard Vite app | Yes, auto-detected | Yes, auto-detected | Yes, auto-detected | N/A - not a build platform, just a file host |
| Bandwidth limit (free tier) | **Unlimited** | 100 GB/mo (Hobby), then throttled | 100 GB/mo, then throttled | ~100 GB/mo soft cap, unofficial/unenforced precisely |
| Build minutes (free tier) | 500 builds/mo | ~6,000 min/mo | 300 min/mo | N/A (Actions has its own free minutes budget) |
| PR preview deploys | Yes | Yes | Yes | Not built-in |

The deciding factor is **bandwidth**: if this site ever gets shared widely
(a history/current-events map is exactly the kind of thing that can spike on
social media), Cloudflare's free tier has no bandwidth ceiling to hit or
scaling-protection pause to worry about. Vercel and Netlify are both
excellent and would work fine at normal traffic levels - either is a
reasonable fallback if Cloudflare doesn't suit you for some reason - but
their free-tier bandwidth caps are the one scenario where a popular history
site could actually hit a wall. GitHub Pages is free and fine for bandwidth,
but it isn't a build platform - you'd be maintaining a separate Actions
workflow just to produce and push the `dist/` output, which duplicates what
Cloudflare/Vercel/Netlify give you for free out of the box.

None of the four require paying anything or push you toward an ad-supported
tier - all are compatible with the project's non-commercial constraint.

### Why no `wrangler.toml`

Cloudflare's `wrangler.toml` config file is for **Workers** (and Pages
Functions / advanced Pages features like custom headers, redirects, or
server-side logic). This app has none of that - it's a plain static build
with a single route. Cloudflare Pages auto-detects Vite projects and needs
only the four fields entered in the dashboard during setup (framework, root
directory, build command, output directory). Adding a `wrangler.toml` here
would be configuring for capabilities the app doesn't use.

## If you deploy somewhere else instead

The build is entirely standard (`cd app && npm ci && npm run build`, output
in `app/dist/`), so any static host works. The main things to configure on
any host:

- **Root/base directory:** `app` (the site is in a subdirectory, not the
  repo root).
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** 22 (or anything satisfying `^20.19.0 || >=22.12.0` - see
  `app/.nvmrc`)

## Verifying a deploy worked

After the first deploy, open the URL the host gives you and confirm:

- The map renders with country shapes and event markers (not a blank pale
  blue box - if you ever see that, the MapLibre worker script likely isn't
  being served correctly; see the comments in
  `app/src/components/MapView.jsx` and `app/vite.config.js` for why that
  matters and how it's handled).
- Clicking an event marker opens its detail panel.
- The footer's attribution and non-commercial notice are visible.
