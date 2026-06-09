# Demo Plan — RAG Chatbot Upgrade (urban-gala-v2)

This file plans a 5–10-minute demo video and three LinkedIn posts documenting the
journey of upgrading Urban Gala's AI Concierge from a basic chatbot into a
retrieval-augmented generation (RAG) pipeline.

---

## Demo Video Script (~8 minutes)

### 1. Introduction — What is Urban Gala? (~0:45)

**On screen:** Urban Gala homepage (dark theme, map with Manhattan pins).

**Narration:**

> Urban Gala is a Manhattan venue-discovery app. It has 2,262 bars, clubs,
> lounges, and restaurants. You can search by vibe, check live busyness, plan
> routes with friends, and — this is what I want to show you — ask an AI
> Concierge for recommendations grounded in real data.

**Actions:**
- Scroll the home page, show the venue cards on the map.
- Click into a venue card, show the detail panel (busyness forecast, hours).
- Mention the tech stack: React frontend, Spring Boot API, Flask LLM service, MySQL.

---

### 2. The AI Concierge in Action (~2:00)

**On screen:** AI Chat Widget (bottom-right drawer), typing queries.

**Narration:**

> Instead of giving generic advice, this chatbot actually searches our venue
> database before answering. Let me show you.

**Queries to demo (perform live):**

| # | Query | What to highlight |
|---|-------|-------------------|
| 1 | `"find me a romantic rooftop bar in Midtown"` | Zone detection (Midtown), venue category matching, inline `[1]` citations appearing in the response |
| 2 | `"what's good for dancing this weekend in the East Village"` | Query expansion appends "dance club nightlife electronic music DJ", zone alias matching (yorkville, alphabet city etc.) |
| 3 | `"any speakeasy with live music"` | Hybrid retrieval (BM25 catches "speakeasy" as a rare term that dense embeddings might blur) |
| 4 | `"is it busy at the places you mentioned"` | Multi-turn conversation — chat history preserves prior Q&A, busyness context injected into prompt |
| 5 | `"add the first two to my plan"` | Citation venue cards hydrate into the itinerary panel |

**Actions to capture:**
- Show the typing indicator / token-by-token streaming (SSE).
- Show the citation footnotes `[1]`, `[2]`, `[3]` appearing at the bottom of the response.
- Click a citation card — it opens the venue detail.
- Show the "Add to plan" button working for cited venues.

**Transitions to show:**
- Dark theme, responsive card layout, citation expansion, clear-chat flow.

---

### 3. Behind the Scenes — The RAG Pipeline (~2:00)

**On screen:** Split screen — left: diagram, right: code in `chat_service.py` / `search_service.py`.

**Narration:**

> Let me walk you through what happens when you hit enter.

**Diagram to show (draw or animate slide by slide):**

```
User Query
    │
    ├── 1. General chat detection ──→ meta questions bypass retrieval
    │
    ├── 2. Zone extraction
    │    "Midtown" → location_filter = "midtown"
    │
    ├── 3. Query reformulation (Hugging Face)
    │    Uses chat history to resolve pronouns and ambiguous references
    │
    ├── 4. Query expansion (heuristic keyword map)
    │    "dancing" → "dancing dance club nightlife electronic music DJ"
    │
    ├── 5. Hybrid retrieval
    │    ├── BM25 (lexical, rare keyword matching)
    │    ├── MPNet 768-dim FAISS IndexFlatIP (dense, semantic)
    │    └── RRF (Reciprocal Rank Fusion, k=60) → merged candidate list
    │
    ├── 6. [OPTIONAL — DISABLED] Cross-encoder re-ranking
    │    MiniLM scores every query-document pair on CPU
    │
    ├── 7. Prompt assembly
    │    System prompt + bounded chat history + retrieval context + busyness context
    │
    ├── 8. LLM generation (Hugging Face chat completions, SSE streaming)
    │
    └── 9. Post-processing
         Inline citation parsing [N] → footnotes + venue cards
```

**Code snippets to show on screen (30s each):**

- `search_service.py` — `_hybrid_collect()` method showing BM25 + FAISS + RRF fusion.
- `search_service.py` — `_re_rank()` method (cross-encoder code, but explain it's gated behind an env flag).
- `chat_service.py` — `stream_chat_response()` SSE generator.
- `query_expander.py` — the expansion map (`_EXPANSION_MAP` dict).

---

### 4. The Cross-Encoder Decision (~1:15)

**On screen:** `docker-compose.yml` line 119-120: `CROSS_ENCODER_ENABLED=false`.

**Narration:**

> Here's a decision I want to highlight. The retrieval pipeline supports an
> optional cross-encoder — a MiniLM transformer that re-scores every
> query-document pair for better ranking.

> **Why I built it:** cross-encoders can improve ranking precision because they
> see the query and document together — unlike bi-encoders that embed them
> separately.

> **Why I disabled it:** it runs on CPU, and with the default overfetch
> multiplier of 3×, a request for 10 results scores ~30 document pairs through
> a transformer forward pass — *before* citations, filtering, or generation
> can even start. Interactive testing showed it added noticeable retrieval and
> first-token latency, but the ranking benefit over hybrid retrieval (BM25 +
> MPNet + RRF) was marginal for this domain.

> The hybrid pipeline already gave useful results. So I made it a
> configuration toggle — the code is there, but the standard Compose deploy
> sets `CROSS_ENCODER_ENABLED=false`. If someone wants to run it on GPU later,
> it's one env var away.

**Actions:**
- Show the env var in `docker-compose.yml`.
- Show the `_re_rank()` method in `search_service.py` (the code that would run if enabled).
- Show the early-return guard: `if self._cross_encoder is None: return candidates`.

---

### 5. Observability & Production Readiness (~1:00)

**On screen:** Terminal with `docker compose exec llm-service curl localhost:5000/metrics`.

**Narration:**

> I also instrumented the service for production. Every search and chat request
> now records structured events with hashed query identifiers, bounded metric
> labels, and an `X-Request-ID` that propagates through the call chain.

> The `/metrics` endpoint exports Prometheus-compatible counters and
> histograms — search latency, chat tokens, error counts, degradation events.
> I added a Gunicorn config with 2 workers, preload for shared model memory,
> and a multiprocess Prometheus directory.

**Actions:**
- `curl localhost:5000/metrics` — show the counters.
- Show `observability.py` briefly — the `SearchExecutionResult` data class.
- Show `gunicorn.conf.py` — `workers=2`, `preload_app=True`, `timeout=120`.
- Show `docker-compose.yml` — `deploy.resources.limits.memory: 3Gi`.

**Slide transition — what this enables:**
> Combined with the RAGAS evaluation harness (Phase 20) and Grafana dashboard
> (Phase 21), the system can now track retrieval quality degradation, model
> drift, and latency regressions over time — not just at launch.

---

### 6. Evaluation — Did It Actually Improve? (~0:45)

**On screen:** Table from `docs/EVALUATION_STRATEGY.md`.

| Metric | Dense baseline | Improved (v2) | Delta |
|--------|---------------:|--------------:|------:|
| Recall@5 | 0.2495 | 0.2874 | **+15.2%** |
| NDCG@5 | 0.2492 | 0.2899 | **+16.3%** |
| MRR | 0.3182 | 0.3747 | **+17.8%** |
| Precision@5 | 0.2121 | 0.2242 | +5.7% |
| Hit Rate | 0.4545 | 0.4848 | +6.7% |

**Narration:**

> I ran a retrieval benchmark with 41 curated questions across five categories
> — date/romantic, dancing, budget, upscale, live music, rooftop, speakeasy,
> comedy. The improved hybrid pipeline showed meaningful gains.

> MRR improved the most — that means the first relevant result appears higher
> in the list. Hybrid retrieval is especially good at exact-name and rare-term
> queries that pure dense search misses.

> But I want to be honest: 41 questions is a development benchmark, not a
> statistical proof. The absolute Recall@5 is still ~29%. There is a lot of
> room left to improve — better embeddings, graded relevance labels, larger
> eval sets. And the cross-encoder ablation I mentioned? That's explicitly
> listed as remaining evaluation work.

**Actions:**
- Show `scripts/run_eval.py` output or a terminal screenshot of the metrics table.
- Show the `benchmark.jsonl` file briefly (41 curated questions).

---

### 7. Wrap-Up — Lessons Learned (~0:30)

**On screen:** Urban Gala homepage again. Fade to takeaways.

**Narration:**

> **Three things I learned building this:**

> 1. **Hybrid retrieval (dense + sparse) is a surprisingly effective baseline.**
>    Before jumping to cross-encoders or re-rankers, try BM25 + FAISS + RRF.
>    It costs almost nothing and catches the rare keywords that embeddings miss.

> 2. **Don't ship features that don't pull their weight.** The cross-encoder
>    was architecturally correct, but the latency cost wasn't justified by the
>    ranking improvement in this domain. I kept the code, made it a toggle,
>    and moved on.

> 3. **Observability is not optional.** Structured events, bounded metrics,
>    and `X-Request-ID` propagation let you debug issues across 5 services
>    without guessing. Build it in from the start.

**End screen:**
> GitHub: [team-2-COMP47360](https://github.com/...)
> Branch: `urban-gala-v2`
> Stack: React · Spring Boot · Flask · FAISS · Hugging Face · Docker

---

## Demo Recording Checklist

### Pre-recording setup

- [ ] `docker compose up -d --build` — full stack healthy.
- [ ] Verify `curl -f http://localhost:5000/health` returns 2,262 locations.
- [ ] Clear browser chat history (open AI Concierge, click clear).
- [ ] Have terminal windows ready (split: metrics, logs, code).
- [ ] Dark theme active (Urban Gala dark visual system).
- [ ] Quiet environment, no notification pop-ups.

### During recording

- [ ] Query 1: `"find me a romantic rooftop bar in Midtown"` — show citations.
- [ ] Query 2: `"what's good for dancing this weekend in the East Village"` — mention query expansion.
- [ ] Query 3: `"any speakeasy with live music"` — mention hybrid retrieval.
- [ ] Query 4: `"is it busy at the places you mentioned"` — show multi-turn context.
- [ ] Query 5: `"add the first two to my plan"` — show itinerary integration.
- [ ] Switch to code: show `_hybrid_collect()`, `_re_rank()`, `stream_chat_response()`.
- [ ] Show `docker-compose.yml` — `CROSS_ENCODER_ENABLED=false`.
- [ ] Show `curl localhost:5000/metrics` — structured events.
- [ ] Show evaluation table.
- [ ] Wrap-up screen.

### Post-recording

- [ ] Trim dead air, add chapter markers.
- [ ] Export screenshots for LinkedIn posts.

---

## LinkedIn Post #1 — "Why I Upgraded a Chatbot to a RAG Pipeline"

### Topic: The Problem & Motivation

### Draft:

```
I just rebuilt the AI chatbot on my team's venue-discovery app from scratch.

Here's why — and what I learned along the way.

---

THE PROBLEM

The old chatbot was a simple prompt → LLM → response loop. It sounded smart but
had no idea what venues actually existed in our database. Ask it for a rooftop
bar in Midtown and it would invent a name, describe a place that doesn't exist,
or give generic advice.

That's the hallucination problem everyone talks about — and it hits hard when
your app is supposed to recommend *real* places.

---

THE SOLUTION: Retrieval-Augmented Generation (RAG)

Instead of asking the LLM to guess, I gave it a search engine:

1. User asks a question
2. System searches 2,262 real Manhattan venues (dense + sparse retrieval)
3. Retrieved venues are injected into the prompt as grounded context
4. LLM generates a response *based on actual data*
5. Citations link back to real venue cards

The chatbot went from "confidently wrong" to "verifiably grounded."

---

THE HARD PART

Building the retrieval pipeline wasn't the hard part. The hard part was:

• Balancing retrieval quality against latency (every millisecond matters in chat)
• Deciding what NOT to ship (more on this in post #2)
• Making it observable — if a user gets bad results, how do you debug it?

---

The result: a chatbot that actually knows what it's talking about.

Next post: the architecture decisions, including why I disabled a feature
I spent days building.

[Link to GitHub / demo video]

#RAG #AIChatbot #SoftwareEngineering #VectorSearch #FAISS
```

### Screenshot for Post #1

- The Urban Gala AI Concierge answering a query with citations visible.
- Or a before/after split: old chatbot generic response vs. new RAG response with `[1]`, `[2]` markers.

---

## LinkedIn Post #2 — "The Architecture: Hybrid Search, Cross-Encoders, and Citations"

### Topic: Technical Architecture & the Cross-Encoder Decision

### Draft:

```
Post #2 on my RAG chatbot upgrade — the architecture decisions.

---

THE RETRIEVAL PIPELINE

When you type "find me a speakeasy with live jazz in Greenwich Village," here's
what happens under the hood:

🔍 ZONE EXTRACTION
"Greenwich Village" is detected as a Manhattan neighborhood. The search is
scoped to that zone.

🔍 QUERY EXPANSION
"live jazz" → "live music band concert performance jazz". A heuristic keyword
map appends related terms so both dense and sparse retrieval have more signal.

🔍 HYBRID RETRIEVAL (the secret sauce)
Two search engines run in parallel:
  • BM25 — classical lexical search, great for rare keywords like "speakeasy"
  • MPNet 768-dim FAISS — semantic similarity, understands "cozy wine spot"
    even when the venue description uses different words

Then Reciprocal Rank Fusion (RRF, k=60) merges both result lists into one
ranked candidate set. No single retrieval method dominates — they complement
each other.

🔍 PROMPT ASSEMBLY
Retrieved venues, chat history (last N Q&A pairs), and live busyness data are
injected into a structured prompt template. The LLM sees real data before it
writes a single word.

🔍 SSE STREAMING + CITATIONS
The response streams token-by-token. Inline [1], [2], [3] markers are parsed
into clickable venue cards on the frontend.

---

THE CROSS-ENCODER DECISION

I built cross-encoder re-ranking (MiniLM) into the pipeline. It's
architecturally correct — cross-encoders score query-document pairs jointly,
which should produce better rankings than bi-encoders.

I disabled it.

Why? In the standard Docker Compose deploy, the entire stack runs on CPU.
Cross-encoder re-ranking runs a transformer forward pass for every
query-document pair before results, citations, or generation can finish.
With the default overfetch multiplier, a single chat request scores ~30 pairs.

Interactive testing showed the latency was noticeable. The hybrid pipeline
(BM25 + MPNet + RRF) already produced useful rankings, and the cross-encoder
improvement wasn't enough to justify the wait.

So I left the code in, made it an environment variable toggle
(`CROSS_ENCODER_ENABLED=false`), and documented the tradeoff. If someone
deploys on GPU hardware later, it's one flag flip away.

---

KEY METRICS (41-question benchmark)

Recall@5:  0.2495 → 0.2874  (+15.2%)
MRR:       0.3182 → 0.3747  (+17.8%)
NDCG@5:    0.2492 → 0.2899  (+16.3%)

The biggest jump was MRR — the first relevant result appears notably higher
in the list. Hybrid retrieval + query expansion earned these gains, not the
cross-encoder.

---

Lesson: building features is easy. Knowing which ones to ship is the real work.

Next post: observability, production hardening, and the 470+ tests that
keep this thing honest.

#RAG #MachineLearning #InformationRetrieval #FAISS #HuggingFace
```

### Screenshot for Post #2

- Architecture diagram (the flowchart from section 3 of the demo).
- Or a code screenshot of `_hybrid_collect()` showing BM25 + FAISS + RRF fusion.
- Or the `docker-compose.yml` lines showing `CROSS_ENCODER_ENABLED=false`.

---

## LinkedIn Post #3 — "Observability, Evaluation, and the Honest Parts"

### Topic: Production Readiness, Testing, and What's Still Broken

### Draft:

```
Post #3 (final) on my RAG upgrade — the parts nobody posts about:
observability, testing, and honest limitations.

---

OBSERVABILITY FROM DAY ONE

Every search and chat request in the v2 pipeline records:

• Structured JSONL events (query hash, retrieved candidates, response length,
  effective retrieval mode, degradation flags)
• X-Request-ID propagation across 5 services (React → Nginx → Spring →
  Flask LLM → Flask Busyness)
• Prometheus metrics (/metrics endpoint): search latency histograms, chat
  token counts, error rates, cache hit ratios
• Bounded metric labels — no unbounded cardinality from raw query text

When a user says "the chatbot gave me bad results," I can trace the exact
request ID through every service, see what was retrieved, and check if the
issue was retrieval, generation, or post-processing. No guessing.

---

TESTING AT SCALE

• 470 pytest tests for the LLM service (retrieval, citations, query
  expansion, prompt loading, SSE streaming, observability, security)
  — **438 passed, 32 skipped (all green on Python 3.11)**
• 41-question retrieval benchmark across 5 venue categories
• Contract fixtures between Flask and Spring (payload compatibility)
• Docker Compose smoke test that exercises the full production topology
• Artifact verification: 71 model, embedding, corpus, and index checksums

---

THE HONEST PART

Not everything is green. I'm documenting this because I think it's important
to show what real engineering looks like:

• ✅ Spring Boot: **285 run, 0 failures, 0 errors** (verified 2026-06-09)
• ✅ All four unit/integration suites fully green
• ✅ LLM suite: **438 passed, 32 skipped** on Python 3.11 (verified 2026-06-09)
• The Nginx production bundle has a large-chunk webpack warning (~945 KiB)
• The 41-question benchmark is enough for regression testing but NOT enough
  for a statistical claim about all users
• Absolute Recall@5 is still only ~29% — there's real room to improve

---

WHAT'S NEXT

1. Run Cypress E2E specs and Compose smoke test
2. Expand the retrieval benchmark (100+ questions, independently labeled)
2. Expand the retrieval benchmark (100+ questions, independently labeled)
3. Add answer-level groundedness evaluation (RAGAS faithfulness)
4. Run a controlled cross-encoder ablation (quality vs. P50/P95/P99 latency)
5. CI-gated evaluation reports instead of hand-maintained test counts

---

The goal wasn't to build a perfect system. It was to build a measurable one —
where every improvement has a number attached, every degradation is traceable,
and every tradeoff is documented.

If you're building RAG systems, my biggest advice: build the evaluation
harness FIRST. Everything else follows from knowing whether you're actually
improving.

[Link to GitHub / docs/EVALUATION_STRATEGY.md]

#RAG #Observability #SoftwareTesting #MLOps #Prometheus
```

### Screenshot for Post #3

- Terminal showing `curl localhost:5000/metrics` output.
- Or the evaluation metrics comparison table.
- Or a screenshot of `docs/TESTING.md` showing the test inventory.

---

## LinkedIn Post #4 — "The Evaluation Trap: When Your Benchmark Lies to You"

### Topic: Honest evaluation, why recall numbers are pessimistic, and what actually matters

### Draft:

```
Post #4 (bonus) on my RAG upgrade — the evaluation chapter nobody writes.

After building the pipeline, I spent two days hardening the evaluation
infrastructure: 96-question benchmark, graded relevance labels, RAGAS
faithfulness scoring, cross-encoder ablation, CI-gated reports. The works.

Then I hit a wall that every ML engineer eventually hits:

The numbers looked bad, but the pipeline was good.

---

THE PROBLEM

My benchmark measures exact-ID Recall@5 — did the pipeline return the
SPECIFIC venue IDs I labeled as "correct"? With 2,262 venues in the corpus
and only 3–5 labeled per question, it's a brutal metric.

Result: 0.43 recall. Looks terrible on paper.

But when I dug into the failures, 24 out of 27 "misses" were returning the
RIGHT type of venue — just different specific ones than the benchmark expected.

- Query: "comedy clubs for a fun night out"
- Expected: Comedy Club A, B, C, D, E (the 5 I labeled)
- Retrieved: Broadway Comedy Club, Best Comedy Tickets (real comedy clubs,
  at different addresses)
- Verdict: ❌ FAIL — because the IDs don't match

This isn't a retrieval failure. It's a benchmark labeling failure.

---

WHAT ACTUALLY MATTERS

So I measured what the pipeline ACTUALLY does:

📊 Exact-ID Recall@5:       0.43  (strict, pessimistic)
📊 Category-Type Recall:    0.61  (finds right kind of venue)
📊 MRR:                     0.53  (first relevant result ~rank 2)
📊 Hit Rate:                0.63  (63% of queries find something)
📊 Empty filtered results:  0     (every query returns something)

The pipeline finds the right type of venue 61% of the time. The remaining
gap isn't an algorithm problem — it's that venue descriptions average 15
words. You can't teach a model to distinguish "craft cocktail bar" from
"generic bar" with a 15-word Google Maps snippet.

---

LESSONS LEARNED

1. **Exact-ID recall is a regression detector, not a quality measure.**
   It tells you when you broke something. It doesn't tell you if users
   are happy. For that, you need category-level metrics and human judgment.

2. **Write your benchmark labels carefully.** I auto-generated mine from
   CSV tag matching and spent hours fixing labels that didn't match query
   intent. "Cheap eats in East Village" labeled art galleries because they
   were cheap and in East Village. Embarrassing but fixable.

3. **Measure what the pipeline actually does, not what the benchmark says.**
   My pipeline finds comedy clubs for comedy queries, wine bars for wine
   queries, Italian restaurants for Italian queries. The benchmark just
   doesn't give it credit because I labeled 5 out of 2,262 venues.

4. **Don't chase numbers you can't improve with code.** I could spend
   weeks trying to squeeze another 0.05 recall through model tuning. Or I
   could accept that the limiting factor is 15-word venue descriptions,
   not the retrieval architecture.

---

THE HONEST CONCLUSION

The RAG pipeline works. It finds relevant venues, grounds answers in real
data, streams responses with citations, and handles conversational context.
The benchmark says 0.43 recall. The reality is better.

Building evaluation infrastructure was the right call — it caught a
real bug (price filters had substring matching backwards, silently
eliminating every budget/luxury query) and prevented regressions.

But the most important lesson: understand what your benchmark actually
measures before you optimize to it.

[Link to GitHub / docs/EVALUATION_STRATEGY.md]

#RAG #MachineLearning #Evaluation #MLOps #SoftwareEngineering
```

### Screenshot for Post #4

- The category-level recall comparison table from EVALUATION_STRATEGY.md.
- Or a side-by-side: a query that "failed" exact-ID recall but returned correct venues.
- Or the terminal output of `run_eval.py --metrics-only` showing the full breakdown.

---

## Key Talking Points for Interviews / Conversations

Use these if someone asks follow-up questions:

### Why RAG instead of fine-tuning?
> Fine-tuning a model on 2,262 venue descriptions would bake the data into the
> model weights. RAG keeps the knowledge external — update the venue CSV, rebuild
> the index, and the chatbot immediately reflects new data. No retraining needed.

### Why BM25 + FAISS instead of just FAISS?
> Dense embeddings are great at semantic similarity but terrible at exact keyword
> matching. A query for "speakeasy" might match "hidden cocktail bar" via embeddings,
> but BM25 guarantees the literal word "speakeasy" gets a high score. RRF combines
> both worlds gracefully.

### Why MiniLM for the cross-encoder?
> It's the standard lightweight option from Sentence-Transformers — 6 layers,
> 384 hidden dims, trained on MS MARCO passage ranking. Runs on CPU at acceptable
> speed for offline evaluation but adds ~200-500ms per batch in interactive use.

### Why not use a managed vector database (Pinecone, Weaviate)?
> This is a university team project with zero infrastructure budget. FAISS runs
> in-process, costs nothing, and handles 2,262 vectors trivially. For a production
> app at scale, a managed vector DB would make sense — but the retrieval
> architecture (hybrid + RRF + optional re-ranking) would stay the same.

### What model generates the chat responses?
> Llama 3.1 8B Instruct via Hugging Face's chat completions API. It's not hosted
> locally — the service calls the HF inference API. The prompt template is
> versioned in YAML (`prompts/rag-v1.5.yaml`) and can be swapped without code changes.

---

## Resources to Reference

| Resource | Path |
|----------|------|
| Project README | `docs/README.md` |
| Evaluation Strategy | `docs/EVALUATION_STRATEGY.md` |
| Cross-Encoder Trade-off | `docs/CROSS_ENCODER_TRADEOFF.md` |
| Testing Inventory | `docs/TESTING.md` |
| Security Notes | `docs/SECURITY.md` |
| LLM Runtime | `docs/llm-runtime.md` |
| Index Pipeline | `docs/index-pipeline.md` |
| Retrieval code | `BackEnd/llm-service/search_service.py` |
| Chat service code | `BackEnd/llm-service/chat_service.py` |
| Query expander | `BackEnd/llm-service/query_expander.py` |
| Prompt templates | `BackEnd/llm-service/prompts/` |
| Config / env vars | `BackEnd/llm-service/config.py` |
| Docker Compose | `docker-compose.yml` (lines 112-130 for LLM service env) |
| CI Workflow | `.github/workflows/ci.yml` |
| Ablation Script | `BackEnd/llm-service/scripts/ablate_cross_encoder.py` |
| RAGAS Eval | `BackEnd/llm-service/scripts/eval_ragas.py` |
| Eval Runner | `BackEnd/llm-service/scripts/run_eval.py` |

---

## Status Update (2026-06-09 — M004 + M005 Complete)

Since the initial demo plan was written, the evaluation infrastructure has been
hardened and retrieval quality measurably improved:

### ✅ Benchmark Expansion (M004)
- Expanded from 41 → **96 independently labeled questions** across 5 categories
- Added graded relevance labels (3=perfect, 2=good, 1=partial) for graded NDCG

### ✅ RAGAS Faithfulness (M004)
- LLM-as-judge pipeline: faithfulness, answer relevancy, context precision
- Mock judge mode for CI smoke testing; CI job: `ragas-smoke`

### ✅ Cross-Encoder Ablation (M004)
- `scripts/ablate_cross_encoder.py`: quality vs. P50/P95/P99 latency
- Cross-encoder adds ~97ms P50, ~227ms P95; quality deltas are small
- Documented in `docs/CROSS_ENCODER_TRADEOFF.md`

### ✅ Retrieval Quality Improvements (M005)
- **Enriched embeddings** with structured metadata (name, type, zone, price, tags)
- **Score-Weighted RRF** — weights ranker contributions by confidence
- **LLM query rewriting** — "cozy date night spot" → "intimate restaurants in Manhattan"
- **Pre-filtering fix** — eliminated 10→0 empty filtered results
- **Price filter bug fix** — `_matches_price_range` had substring check backwards
- **Fine-tuning spike** — NO-GO recommendation at 2,262-venue scale

### ✅ CI-Gated Evaluation (M004)
- 7 CI jobs: java, python×2, frontend, artifact-verify, ragas-smoke, ablation, eval-report
- `eval-report` gates on recall@5 >= 0.25, uploads JSON artifact

### Current Retrieval Quality

| Metric | Value |
|--------|-------|
| Exact-ID Recall@5 | 0.43 |
| Category-Type Recall | 0.61 |
| MRR | 0.53 |
| Hit Rate | 0.63 |

Exact-ID recall is a strict metric — the benchmark labels 3–5 specific venue IDs
per question, but the corpus has 2,262 venues with many equally good matches.
The pipeline finds the right **type** of venue 61% of the time. Further
improvement requires richer venue descriptions, not better code.

### ✅ Test Suite Status
- ✅ Cypress E2E: **all passing** (2026-06-09)
- ✅ Compose smoke test: **passing** (2026-06-09)
- ✅ Artifact verification: **passing** (71 checksums verified)
- ✅ LLM pytest: **438 passed, 32 skipped** (all green)
- ✅ Spring Boot: **285 run, 0 failures, 0 errors**
