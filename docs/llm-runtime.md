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

The effective production command is identical in the Dockerfile and Docker Compose:

```text
gunicorn --bind 0.0.0.0:5000 --workers 2 --preload --timeout 120 app:app
```

| Flag | Purpose |
|------|---------|
| `--bind 0.0.0.0:5000` | Listen on all interfaces, port 5000 |
| `--workers 2` | Two worker processes for concurrent requests |
| `--preload` | Load Flask app, sentence-transformer model, DataFrame, embeddings, and FAISS index once in the master process before forking workers |
| `--timeout 120` | Allow up to 120 seconds for slow ML startup and inference |

Compose overrides the Dockerfile `CMD` with the same command string so runtime behavior does not drift between image defaults and Compose deployments.

## Memory Implications

With `--preload`, the master process loads shared read-only memory for:

- **Sentence-transformer model** (`MODEL_PATH`) — largest single allocation
- **Location DataFrame** (`DATA_PATH`) — pandas catalog loaded at startup
- **Precomputed embeddings** (`EMBEDDINGS_PATH`) — NumPy float32 array from Git LFS
- **FAISS index** — built in-process from normalized embeddings at startup (not committed to Git)

Each forked worker inherits copy-on-write pages from preload. Under load, workers may diverge (response cache entries, request buffers), so **plan for roughly 2× the single-process RSS** when `--workers 2` is configured.

Docker Compose sets a **3 GiB memory limit** and **2 GiB reservation** on `llm-service`. If RSS approaches the limit during startup or under concurrent search/chat load, reduce workers or increase the limit.

## FAISS Index Policy

The FAISS vector index is **built at startup** from the committed `location_embeddings.npy` artifact and the location catalog. Generated index files (`.faiss`, `.index`, or new `.npy` outputs) are **not committed**. See [artifacts.md](artifacts.md#llm-service-runtime-and-faiss-index).

## Operator Commands

### Build and start

```bash
docker compose up -d --build llm-service
```

### Health check

```bash
curl -f http://localhost:5000/health || docker compose logs --tail=120 llm-service
```

From inside the container:

```bash
docker compose exec llm-service curl -f http://localhost:5000/health
```

### Process memory (RSS) per Gunicorn process

```bash
docker compose exec llm-service sh -lc 'ps -o pid,ppid,rss,vsz,cmd -C gunicorn || ps -o pid,ppid,rss,vsz,cmd'
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

## Measured Memory (Phase 7 verification)

<!-- Updated by plan 07-05 Task 3 -->

See [Measured Memory Output](#measured-memory-output) below after final gates run.

## Measured Memory Output

_To be filled by Task 3 verification._
