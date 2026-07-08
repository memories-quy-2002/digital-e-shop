# Cold-Start Spike Results

Date: 2026-07-08

## Methodology note (read before interpreting numbers)

This measurement was taken within a single task session, not across a real idle-then-cold gap.
The "Nest cold" sample below is the first `curl` after the Vercel deployment finished
provisioning (fresh infrastructure, no prior invocation on this deployment) — a reasonable proxy
for a cold Lambda init, but **not** a true cold start after 10+ minutes of inactivity, since a
`/health` request had already been made moments earlier in Step 3 to verify the deployment, which
may have partially warmed the underlying Lambda. The "Express baseline cold" sample has the same
caveat, and is weaker: the baseline server had already been hit once for a manual sanity check
(and once more, indirectly, while probing for a working URL) before the "cold" sample was taken,
so it is likely **already warm**, not cold. Treat the baseline "cold" number as a second warm
sample, not a true cold measurement. A true idle-then-cold comparison (10+ minute gap) was not
performed — see brief for why (single subagent invocation, no long-sleep step).

All numbers include full network RTT from the local machine to Vercel's edge (East US region),
so absolute values reflect network latency in addition to server-side cold/warm behavior. Relative
deltas between Nest and Express are more meaningful than absolute values.

## Nest spike (Vercel, cached instance)

Deployed URL: https://digital-e-nestjs-spike.vercel.app (aliased); build/deploy hash URL:
https://digital-e-nestjs-spike-9mvcauk9j-memories-projects-2002.vercel.app

- Cold (proxy, see note above): 0.754932s
- Warm (5 samples): 0.511031s, 0.457753s, 0.769326s, 0.454020s, 0.749963s, avg 0.588419s

## Express baseline (current production server)

URL used: https://e-commerce-express-server-app.vercel.app/api/health (stable aliased production
domain referenced in `server/src/config/cors.config.ts` and `server/src/config/scalarDocs.ts`)

- Cold (proxy, see note above — likely already warm, see methodology note): 0.702364s
- Warm (5 samples): 0.303875s, 0.570883s, 0.547191s, 0.292332s, 0.274570s, avg 0.397770s

## Bundle size

- Nest spike `dist/`: 13K
- Express server `dist/`: 721K

(Note: the Nest spike is a minimal one-route app with a single `AppModule`/`AppController`, while
the Express server `dist/` contains the full production application — routes, controllers,
services, etc. This size comparison reflects app scope, not a fair apples-to-apples framework
overhead comparison. `node_modules` size — which is where NestJS's framework weight actually
shows up — was not measured here and would be a more meaningful comparison for future work.)

## Delta

- Cold-start overhead (proxy measurement): Nest cold - Express cold = 0.754932s - 0.702364s =
  +0.052568s (Nest ~53ms slower, but both samples are contaminated by prior warm requests per the
  methodology note — this delta should not be treated as a reliable cold-start signal)
- Warm-request overhead: Nest warm avg - Express warm avg = 0.588419s - 0.397770s = +0.190649s
  (Nest ~191ms slower on warm requests in this single-sample run)

## Caveats / what this data does NOT show

- No true cold-start (10+ min idle) measurement was captured. The numbers above are a same-session
  proxy only, as explained in Methodology.
- Sample size is small (1 cold-proxy + 5 warm per target); no statistical confidence interval.
- Network variance to Vercel's edge (East US, `iad1`) is included in every number and was not
  isolated from server-side processing time.
- The bundle-size comparison is scope-mismatched (minimal spike vs. full production app) and
  should not be read as "NestJS is 55x smaller" — it reflects route count, not framework overhead.
