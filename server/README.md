# API server (Redis-backed)

Serves `data/events.json` and `data/boundaries.json` to the frontend out of
Redis (RediSearch + RedisJSON — i.e. a "redis-stack" instance), replacing the
static chunked-JSON pipeline (`app/scripts/split-data.mjs` /
`app/public/data/`) as the app's default data source. That static pipeline is
left in place, untouched, as a fallback/reference.

## How the pieces fit together

1. `../scripts/load-redis.js` reads `../data/events.json` and
   `../data/boundaries.json` and loads them into Redis, building two
   RediSearch indexes (`idx:events`, `idx:boundaries`). Re-run it any time the
   source data changes — it's idempotent (drops and rebuilds both indexes and
   their documents each run).
2. This server (`index.js`) queries those indexes and exposes them over HTTP:
   - `GET /api/events?start=<year>&end=<year>&bbox=<minLon,minLat,maxLon,maxLat>&q=<text>`
   - `GET /api/boundaries?year=<year>` (also accepts `start`/`end` as a range
     union, for decade-chunk-style client caching — see `app/src/lib/dataClient.js`)
   - `GET /api/health`
3. `app/src/lib/dataClient.js` calls this server instead of fetching static
   JSON files.

## Running locally against Docker (verified)

```bash
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack-server:latest

# from the repo root
node scripts/load-redis.js          # loads data/events.json + data/boundaries.json

# from server/
npm install
npm start                            # listens on :3001 by default
```

Then run the frontend (`app/`) with `npm run dev` — it reads `VITE_API_URL`
(defaults to `http://localhost:3001`, see `app/.env`).

## Pointing this at a real Redis Cloud instance (not done in this session)

This was intentionally **not** done automatically — it requires a human to
create an account. Steps:

1. Go to <https://redis.io/cloud/> and sign up for Redis Cloud (the free tier
   is 30MB and includes RediSearch + RedisJSON — confirmed from Redis's own
   docs: a free database "comes with all the Redis Open Source features,
   including Redis Search and JSON").
2. Create a new free database (any region close to wherever the API server
   will run). Redis Cloud provisions it with search/JSON modules enabled by
   default on the free tier — no extra configuration needed.
3. From the database's "Connect" page, copy the connection string. It looks
   like:
   ```
   redis://default:<password>@<host>.cloud.redislabs.com:<port>
   ```
4. Set `REDIS_URL` to that value wherever the loader and the API server run:
   ```bash
   export REDIS_URL="redis://default:<password>@<host>.cloud.redislabs.com:<port>"
   node scripts/load-redis.js     # loads data into the cloud instance
   cd server && npm start          # API server now serves from the cloud instance
   ```
5. Set `VITE_API_URL` in `app/.env` (or the deployed frontend's env) to
   wherever this API server ends up hosted (Redis Cloud is just the database —
   this Express server still needs to run somewhere; that's a separate
   deployment decision, deliberately left open per the task brief).
6. Re-run `node scripts/load-redis.js` any time the source data in `data/`
   changes — it's safe to re-run against the cloud instance the same way it
   is against local Docker.

### Sizing note

The full validated dataset (113 curated events + 84 boundaries) used ~8MB of
Redis memory in this session's local test — comfortably inside the 30MB free
tier, with room for the corpus to grow roughly 3-4x before needing a paid
tier or trimming (e.g. dropping the `extract` TEXT field's stored copy, since
RediSearch's document store re-stores indexed field values by default in
addition to indexing them).

## Environment variables

| Variable    | Default                  | Used by                          |
|-------------|---------------------------|-----------------------------------|
| `REDIS_URL` | `redis://localhost:6379` | `scripts/load-redis.js`, `server/index.js` |
| `PORT`      | `3001`                    | `server/index.js`                 |

For local overrides, copy `server/.env.example` to `server/.env` (gitignored -
never commit real credentials there) and edit it. `npm start`/`npm run dev`
here, and the root `npm run load-redis`, all load it automatically via
Node's built-in `--env-file-if-exists` flag - no `dotenv` dependency needed.
In production, set `REDIS_URL` as a real environment variable/secret on
whatever platform ends up running this server (the exact steps depend on
that platform - a dashboard field, a CLI like `fly secrets set` or
`wrangler secret put`, etc.) rather than via a committed file.
