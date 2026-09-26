# atlas.wiki

An interactive map and timeline of the Middle East, 1900 to the present:
events from Wikipedia and historically dated borders, with the source and
status of every border shown honestly.

Structure: `app/` (React + MapLibre frontend), `worker/` (Cloudflare Worker
API), `server/` (Express version of the same API), `scripts/` and `data/`
(ingestion and the cited border-corrections pipeline). See DEPLOYMENT.md.

## Licenses

- **Source code:** GNU AGPL v3.0 - see [LICENSE](LICENSE).
- **Data:** non-commercial only (CC BY-NC-SA 4.0 for the borders, derived from
  CShapes 2.0; CC BY-SA 4.0 for Wikipedia text) - see [data/LICENSE](data/LICENSE)
  and [NOTICE](NOTICE) for all credits.
