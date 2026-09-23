# LLM Service Runtime

This document describes the LLM service Python runtime, Gunicorn worker configuration, memory behavior, and operator verification commands. It complements the artifact policy in [artifacts.md](artifacts.md).

## Python Runtime

| Setting | Value |
|---------|-------|
| **Chosen runtime** | Python 3.11 (`python:3.11-slim`) |
| **Alignment attempt** | Upgraded from Python 3.9 to match `BackEnd/busyness-service/Dockerfile` (D-13/D-14) |
| **Result** | Python 3.11 build and dependency install succeed; `faiss-cpu`, `sentence-transformers`, `torch==2.2.2`, and pinned deps compile/install in the Docker builder stage |

Dependencies are compiled from `requirements.in` via pip-tools during the Docker build. Host-side `pip-compile` may fail on Python 3.13; use the Docker build flow to regenerate `requirements.txt`.

## Gunicorn Command

The Docker image starts through `docker-entrypoint.sh`, which prepares the
Prometheus multiprocess directory, then loads the single source of Gunicorn
settings from `gunicorn.conf.py`:

```text
gunicorn -c gunicorn.conf.py app:app
```

The config sets `bind=0.0.0.0:5000`, `workers=2`, `preload_app=True`, and
`timeout=120`. It also starts/stops the JSONL event writer and marks dead
workers in Prometheus multiprocess storage.

## Memory Implications

With `--preload`, the master process loads shared read-only memory for:

- **Sentence-transformer model** (`MODEL_PATH`) — largest single allocation
- **Location DataFrame** (`DATA_PATH`) — pandas catalog from `corpus/vN/venues.csv` loaded at startup
- **Precomputed embeddings** (`EMBEDDINGS_PATH`) — NumPy float32 array from Git LFS
- **FAISS index** — loaded from a validated persisted artifact when available,
  otherwise built in-process from normalized embeddings
- **BM25 index** — loaded when hybrid retrieval and the generated sparse
  artifact are available
- **Cross-encoder** — optional; the checked-in Compose configuration disables
  it

Each forked worker inherits copy-on-write pages from preload. Under load, workers may diverge (response cache entries, request buffers), so **plan for roughly 2× the single-process RSS** when `--workers 2` is configured.

Docker Compose sets a **3 GiB memory limit** and **2 GiB reservation** on `llm-service`. If RSS approaches the limit during startup or under concurrent search/chat load, reduce workers or increase the limit.

## FAISS Index Policy

The runtime prefers `corpus/vN/index/faiss.index` plus valid metadata. If that
artifact is absent or invalid, it builds FAISS at startup from
`location_embeddings.npy` and `corpus/vN/venues.csv`. Generated index files
are not committed. See [index-pipeline.md](index-pipeline.md).

The committed encoder bundle produces 768-dimensional MPNet-family embeddings.
The MiniLM name used elsewhere refers to the optional cross-encoder, not the
dense embedding model.

## Cross-encoder latency decision

The `jev` Compose deployment sets `CROSS_ENCODER_ENABLED=true`. On the
96-question hybrid benchmark it adds ~63 ms at p50 (89.1 ms vs 25.7 ms) for
+0.056 Recall@5, +0.050 NDCG@5, and +7.3 pp hit rate. Candidates are filtered
by location/price *before* the cross-encoder, and the re-rank text carries
canonical `Area:` labels so corpus micro-zones (Lenox Hill, Yorkville) are
recognised as the Upper East Side. The cross-encoder runs on CPU inside the
`llm-service` container. See
[CROSS_ENCODER_TRADEOFF.md](CROSS_ENCODER_TRADEOFF.md) and
[JEV_INTEGRATION.md](JEV_INTEGRATION.md).

## Side-by-side compare (`jev` vs `urban-gala-v2`)

Do not start a second full stack. Keep this checkout on `jev` and add a
worktree plus a second `llm-service` only:

```bash
git worktree add ../team-2-COMP47360-v2 urban-gala-v2
docker compose up -d llm-service   # publishes jev on :5002 (macOS binds :5000)
docker compose -p urban-gala-v2 -f docker-compose.v2-sidecar.yml up -d --build
```

| Process | Address |
|---------|---------|
| `jev` llm-service | `http://localhost:5002` |
| `urban-gala-v2` llm-service | `http://localhost:5001` |
| option-1 llm-service (query analysis off, scope cap on) | `http://localhost:5003` |
| Spring / UI (still `jev`) | `http://localhost:8080` / `http://localhost:5173` |

The sidecar joins `team-2-comp47360_app-network`, reuses the running
busyness service, and is capped at 2 GiB / 2 CPUs with one Gunicorn worker
(`TOKENIZERS_PARALLELISM=false`). Prometheus scrapes both as jobs
`llm-service` and `llm-service-v2`. Host port `5000` is taken by macOS
Control Center, so `jev` is published on `5002`.

Simultaneous traffic is fine for **quality**. It is biased for **latency**
because both processes share the same 8 CPUs and the Hugging Face chat API.
For numbers you trust, idle one service or use the in-process harness below.

### Health

```bash
curl -sf http://localhost:5002/health
curl -sf http://localhost:5001/health
```

### Retrieval (no JWT)

```bash
for port in 5002 5001; do
  echo "=== :$port ==="
  curl -sS -X POST "http://localhost:$port/search" \
    -H 'Content-Type: application/json' \
    -d '{"vibeDescription":"jazz bars in the village","maxResults":5}'
  echo
done
```

### Chat (JWT from the running Spring API)

```bash
TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usernameOrEmail":"YOUR_USER","password":"YOUR_PASSWORD"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

for port in 5002 5001; do
  echo "=== :$port ==="
  time curl -sS -X POST "http://localhost:$port/api/chat" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"message":"jazz bars in the village"}'
  echo
done
```

### In-process retrieval bench (sequential, no second container)

```bash
# this checkout (jev)
python3 BackEnd/llm-service/scripts/rerank_bench.py --label jev

# urban-gala-v2 worktree
python3 ../team-2-COMP47360-v2/BackEnd/llm-service/scripts/rerank_bench.py --label none
```

`rerank_bench.py` reports retrieval quality and per-query latency. Compare
JSON reports with `--compare` as documented in the script header.

### Tear down the sidecar only

```bash
docker compose -p urban-gala-v2 -f docker-compose.v2-sidecar.yml down
```

## Operator Commands

### Build and start

```bash
docker compose up -d --build llm-service
```

### Health check

```bash
docker compose exec llm-service curl -f http://localhost:5000/health
```

From inside the container:

```bash
docker compose exec llm-service curl -f http://localhost:5000/health
```

### Process memory (RSS) per Gunicorn process

```bash
docker compose exec llm-service sh -lc 'ps -o pid,ppid,rss,vsz,cmd -C gunicorn || ps -o pid,ppid,rss,vsz,cmd'
```

On `python:3.11-slim`, `ps` is not installed. Use host-side `docker top` instead:

```bash
docker top urban-gala-llm
```

Record these fields after startup stabilizes:

| Field | Meaning |
|-------|---------|
| `PID` | Process ID |
| `PPID` | Parent (master worker is parent of forked workers when using preload) |
| `RSS` | Resident set size in kilobytes — primary memory metric |
| `VSZ` | Virtual size in kilobytes |
| `CMD` | Command line (should show `--workers 2 --preload`) |

### Container-level memory

```bash
docker stats --no-stream urban-gala-llm
```

Record `MEM USAGE / LIMIT` and `%` for capacity planning.

## Observability

Committed v2 exposes `/metrics`, propagates/returns `X-Request-ID`, records
strict search/chat events, hashes query identifiers, bounds metric labels, and
writes JSONL events through a single master-owned writer process.

Prometheus and Grafana servers are not part of committed v2 Compose. The
endpoint and instrumentation exist; collection, dashboards, retention, and
alerting still require deployment work.

## Historical measured memory (Phase 7)

Recorded in [Measured Memory Output](#measured-memory-output) (2026-05-27).

The following measurement predates hybrid retrieval, the optional
cross-encoder bundle, and Phase 19 observability. Treat it as a historical
baseline, not current capacity proof.

Phase 7 plan 07-05 verification (2026-05-27, healthy `/health` after ~20s):

**Container (`docker stats --no-stream urban-gala-llm`):**

| Field | Value |
|-------|-------|
| MEM USAGE / LIMIT | 347.8 MiB / 3 GiB |
| MEM % | 11.32% |
| PIDS | 12 |

**Processes (`docker top urban-gala-llm`):**

| Role | PPID | CMD |
|------|------|-----|
| Master (preload) | container init | Gunicorn with `gunicorn.conf.py`-equivalent settings |
| Worker 1 | master PID | same command line (forked worker) |
| Worker 2 | master PID | same command line (forked worker) |

RSS per process is not available without `procps` in the slim image; use `docker stats` for aggregate footprint and scale workers against the 3 GiB Compose limit.

**Historical verification gates from that session:**

| Gate | Result |
|------|--------|
| `PYTHONPATH=. python3 -m pytest tests/ -q` | 63 passed at that phase |
| `PYTHONPATH=. python3 -m pytest tests/test_retrieval_relevance.py -q` | 17 passed (16 examples + harness) |
| `./mvnw test -Dtest=VibeServiceTest` | 22 passed |
| `docker compose build llm-service` | Built |
| `docker compose up -d llm-service` + `curl -f http://localhost:5000/health` | Healthy, 2262 locations |
| `git status --short` | No `.faiss`/`.index`/generated `.npy` artifacts |

Current test results are maintained in [TESTING.md](TESTING.md); do not reuse
the Phase 7 counts as v2 status.
