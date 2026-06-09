# Cross-Encoder Re-Ranking Trade-off

Decision status: implemented, retained as optional, disabled in the standard
Docker Compose deployment.

Verified against `urban-gala-v2` at `4abc29f5` on 2026-06-09.

## Decision

Urban Gala supports `cross-encoder/ms-marco-MiniLM-L6-v2` as a final
re-ranking stage, but `docker-compose.yml` sets:

```text
CROSS_ENCODER_ENABLED=false
```

Interactive testing showed that venue discovery remained useful with MPNet
dense retrieval plus BM25/RRF hybrid search, while enabling the cross-encoder
added too much request latency for search and chat.

No controlled cross-encoder on/off latency report is committed, so this
document does not claim an exact millisecond delta. The decision is based on
observed interactive latency and the execution cost described below.

## Why it slowed the application

The dense and BM25 stages are retrieval-oriented:

- Venue embeddings are precomputed.
- Each request requires one query embedding.
- FAISS searches a small exact vector index.
- BM25 searches a prebuilt lexical index.
- RRF combines existing ranks with inexpensive arithmetic.

A cross-encoder does different work. It combines the query with each candidate
document and runs a transformer forward pass for every query-document pair.
Document representations cannot be precomputed because each score depends on
the query and document jointly.

In this implementation:

1. Retrieval over-fetches candidates before re-ranking.
2. With the default cross-encoder multiplier of 3, a request for 10 results can
   produce roughly 30 query-document pairs.
3. Full venue text is composed for every candidate.
4. `CrossEncoder.predict()` scores the pair batch on the blocking request path.
5. Filtering, citation construction, and generation wait for the batch.

The standard container is CPU-only. Transformer inference therefore competes
with query encoding, Flask/Gunicorn workers, citation processing, and other
requests for the same CPU allocation. Concurrent workers can run separate
re-ranking batches, increasing contention and tail latency.

For chat, this work happens before generation. SSE improves perceived latency
after tokens begin arriving, but it cannot hide a blocking retrieval stage
before the first generated token.

## Quality versus latency

### Potential benefit

A cross-encoder can improve fine-grained ordering because it evaluates the
query and document together. This can help when the initial candidate set
contains several semantically similar venues.

### Why it was not worth enabling here

Urban Gala already uses:

- A 768-dimensional MPNet-family dense encoder.
- Exact FAISS search over only 2,262 venues.
- BM25 for names, neighborhoods, and rare terms.
- RRF to combine semantic and lexical rankings.
- Structured zone and price filters.

That stack produced acceptable venue discovery without an additional model
pass. At this corpus size and product stage, lower response and first-token
latency was more valuable than a possible small improvement in the order of
the top few results.

The recorded “improved pipeline” benchmark is not an isolated cross-encoder
ablation. It also includes BM25/RRF, query expansion, and other pipeline
changes. The metric gain therefore cannot be attributed to the cross-encoder
alone.

## Trade-off summary

| Dimension | Enabled | Disabled |
|-----------|---------|----------|
| Ranking | May improve subtle top-result ordering | Uses MPNet + BM25/RRF ordering |
| CPU | Transformer inference per candidate pair | One query embedding plus index lookups |
| Latency | Higher retrieval and first-token latency | Lower interactive latency |
| Concurrency | More worker CPU contention | More predictable request handling |
| Memory/startup | Loads another model | Cross-encoder is not loaded |
| Complexity | More tuning and failure modes | Simpler production path |
| v2 decision | Optional experiment | Standard deployment |

## When to reconsider

Re-enable it only after a controlled ablation shows that the quality gain is
worth the cost. Measure:

- Retrieval metrics with only the cross-encoder setting changed.
- Retrieval p50, p95, and p99 latency.
- End-to-end chat time to first token.
- Throughput and CPU use at realistic concurrency.
- Memory and startup impact.
- Quality by query category.

Lower-cost options include re-ranking fewer candidates, enabling it only for
ambiguous or low-confidence searches, using a smaller model, or moving
re-ranking to GPU-backed infrastructure.

Until those measurements show a material product benefit, keeping
`CROSS_ENCODER_ENABLED=false` is the appropriate latency-quality trade-off.

