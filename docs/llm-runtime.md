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
