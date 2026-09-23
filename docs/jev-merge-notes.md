# Merging `jev` into `urban-gala-v2`

**Goal:** bring the retrieval fixes, busyness fixes, and the three Jev safety
decisions onto `urban-gala-v2` — without carrying the Jev pieces that measured
neutral-to-negative.

Companion documents: [JEV_INTEGRATION.md](JEV_INTEGRATION.md) (design + results),
[Cross-Encoder Trade-off](CROSS_ENCODER_TRADEOFF.md) (re-ranking numbers).

## Runtime target (option 1)

| Setting | Value | Why |
|---|---|---|
| `CROSS_ENCODER_ENABLED` | `true` | +0.056 Recall@5 for +63 ms p50 on hybrid |
| `HYBRID_SEARCH_ENABLED` | `true` | biggest quality lift on the branch |
| `JEV_ENABLED` | `true` | required for scope/abstention/guardrail |
| `JEV_QUERY_ANALYSIS_ENABLED` | **`false`** | no quality win; removed the micro-zone regression |
| `HF_QUERY_REWRITE_ENABLED` | **`false`** | Recall@5 0.495 → 0.414, ~1 s |
| `JEV_ABSTENTION_ENABLED` | `true` | out-of-catalog safety |
| `JEV_GUARDRAIL_ENABLED` | `true` | +0.020 faithfulness, replaces fabricated venues |
| `CHAT_SCOPE_GATE_ENABLED` | `true` | declines off-topic/harmful before retrieval |
| `JEV_RERANK_ENABLED` | `false` | 8–15× slower, no quality edge |
| `JEV_SEARCH_COMPOSE_ENABLED` | `false` | underperforms static `expand_query` |

A plain `git merge jev` brings the *code*; the table above is what keeps the
regressions dormant. No code has to be excluded.

## Carry over

### Retrieval (the highest-value items)

| File | Change |
|---|---|
| `BackEnd/llm-service/search_service.py` | `location_filter_group_terms` (micro-zone → group); `canonical_area_labels` + `compose_rerank_text` (reranker zone labels); filter-before-rerank in `_hybrid_collect` / `_dense_collect`; single normalized SW-RRF loop (fixes the raw-score refusion) |
| `BackEnd/llm-service/corpus/v1/index/bm25/` | rebuilt BM25 artifact (`build_index.py --force --with-bm25`, 2,262 docs) — **gitignored**, must be rebuilt on each checkout |
| `BackEnd/llm-service/tests/test_search_service.py` | regression tests for micro-zone filter + reranker area labels |

### Busyness

| File | Change |
|---|---|
| `BackEnd/llm-service/config.py` | `BUSYNESS_FETCH_TIMEOUT_SECONDS` default 5 → 15 |
| `BackEnd/llm-service/chat_service.py` | `data/zone_names.json` mapping; forecast + focus zone in the prompt context; `build_busyness_context(location_filter=…)` |
| `BackEnd/llm-service/data/zone_names.json` | new; LocationID → neighbourhood (generated from `manhattanZones.geojson`) |
| `BackEnd/busyness-service/app.py` | background cache warmup thread (`BUSYNESS_WARM_REFRESH_SECONDS`, `BUSYNESS_WARMUP_ENABLED`) |
| `BackEnd/busyness-service/tests/conftest.py` | disables warmup under test |

### Jev safety layer

| File | Change |
|---|---|
| `BackEnd/llm-service/jev_service.py` | `classify_scope` / `build_scope_questions` (scope cap Choice); `ScopeDecision` |
| `BackEnd/llm-service/chat_service.py` | `resolve_scope_decision`, venue-name follow-up rule, `OUT_OF_SCOPE_MESSAGE` / `HARMFUL_SCOPE_MESSAGE` / `UNKNOWN_ATTRIBUTE_MESSAGE`; scope gate wiring in both chat paths; `JEV_QUERY_ANALYSIS_ENABLED` gate |
| `BackEnd/llm-service/app.py` | `_resolve_search_query` decoupled from Jev via `HF_QUERY_REWRITE_ENABLED` |
| `BackEnd/llm-service/observability.py` | `scope_gate` metric label |
| `BackEnd/llm-service/tests/test_jev_service.py`, `test_jev_integration.py` | scope tests, follow-up-rule tests, wiring tests |

### Config / Compose / docs

| File | Change |
|---|---|
| `BackEnd/llm-service/config.py` | `JEV_QUERY_ANALYSIS_ENABLED`, `HF_QUERY_REWRITE_ENABLED`, `CHAT_SCOPE_*`, `BUSYNESS_*` |
| `docker-compose.yml` | passthrough for the flags above; `CROSS_ENCODER_ENABLED=true` |
| `env.example` | documented flags |
| `docs/JEV_INTEGRATION.md` | rewritten to the final design + results |
| `docs/jev-merge-notes.md` | this file |
| `docs/CROSS_ENCODER_TRADEOFF.md` | hybrid re-measurement |

### Harnesses / reports (evidence, optional to carry)

`scripts/rerank_bench.py`, `scripts/guardrail_ab.py`, `scripts/query_rewrite_ab.py`,
`scripts/pipeline_ab.py`, `scripts/scope_probe.py`, `scripts/eval_ragas.py`,
`scripts/run_eval.py`, plus `reports/*.json`.

## Leave behind (do not enable / do not rely on)

- **Jev runtime query analysis** (`JEV_QUERY_ANALYSIS_ENABLED=true`). It scored
  below plain expansion and its 64-micro-zone Choice drove the location-filter
  regression. The code can merge; the flag must stay `false`.
- **Jev re-ranking** (`JEV_RERANK_ENABLED=true`) — slower, no quality edge.
- **HF `rewrite_query`** (`HF_QUERY_REWRITE_ENABLED=true`) — measured worse.
- **Jev search composition** (`JEV_SEARCH_COMPOSE_ENABLED=true`).
- The old **rerank-then-filter** order and the **unnormalized hybrid expansion**
  — these are replaced by the fixes, so nothing to do beyond merging.
- Local sidecar files (`docker-compose.v2-sidecar.yml`,
  `docker-compose.option1-sidecar.yml`, the `docs/llm-runtime.md` sidecar
  section, `config/prometheus/prometheus.yml` scrape jobs) are development
  scaffolding; carry only if the side-by-side comparison should remain
  reproducible.

## Merge procedure

From a worktree on `urban-gala-v2`:

```bash
# 0. Make sure the jev work is committed first (the merge cannot see a dirty tree).
cd /path/to/team-2-COMP47360
git add -A && git commit -m "feat(llm-service): scope cap, retrieval/busyness fixes, docs"

# 1. Merge.
cd /path/to/team-2-COMP47360-v2
git fetch
git merge --no-ff jev

# 2. Rebuild the BM25 artifact in the v2 worktree (gitignored, not merged).
cd BackEnd/llm-service
python3 scripts/build_index.py --force --with-bm25     # if present
# or copy corpus/v1/index/bm25 from the jev checkout

# 3. Set the option-1 flags (Compose defaults already match):
#    JEV_QUERY_ANALYSIS_ENABLED=false
#    HF_QUERY_REWRITE_ENABLED=false
#    CHAT_SCOPE_GATE_ENABLED=true
#    JEV_ABSTENTION_ENABLED=true
#    JEV_GUARDRAIL_ENABLED=true
#    CROSS_ENCODER_ENABLED=true

# 4. Rebuild + start.
docker compose up -d --build llm-service busyness-service
```

**Conflict hotspots** (both branches touched): `chat_service.py`,
`search_service.py`, `app.py`, `config.py`, `docker-compose.yml`,
`docs/llm-runtime.md`, `docs/README.md`, tests. `docker-compose.yml` and
`llm-runtime.md` were also edited locally for the side-by-side setup — resolve
by hand, keeping the sidecar blocks and the new env passthroughs.

## Validation checklist

```bash
# unit suites
cd BackEnd/llm-service && PYTHONPATH=. python3 -m pytest tests/ -q     # expect 562 passed, 32 skipped
cd BackEnd/busyness-service && .venv-test/bin/python -m pytest tests -q # expect 20 passed, 1 skipped

# retrieval quality (hybrid + cross-encoder)
cd BackEnd/llm-service
CROSS_ENCODER_ENABLED=true PYTHONPATH=. python3 scripts/rerank_bench.py --label ce
#   expect p50 ~89 ms, Recall@5 ~0.554, Hit ~0.802

# scope cap
PYTHONPATH=. python3 scripts/scope_probe.py
#   expect 0 off-topic/harmful allowed through, 0 legit benchmark declines

# live smoke (ports per the local setup)
curl -sf http://localhost:5002/health   # hybrid_search_enabled=true
curl -sf http://localhost:5003/health
# venue query -> answer + citations
# "emergency plumbers in Brooklyn" -> out-of-scope refusal, 0 citations
# "capacity of Pianos?" -> "I don't have that detail…", 0 citations
```

## Rollback

`git revert -m 1 <merge-commit>` restores the previous `urban-gala-v2` tree.
Because every new behaviour is flag-gated, a faster rollback is to set
`JEV_ENABLED=false` (restores pre-Jev routing) or `CHAT_SCOPE_GATE_ENABLED=false`
(disables only the cap) and redeploy.
