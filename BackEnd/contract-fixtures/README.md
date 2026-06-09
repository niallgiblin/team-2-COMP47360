# Contract Fixtures — Flask ↔ Spring Field Glossary

Single source of truth for ML response JSON shapes consumed by JUnit (`MlContractTest`), documented for pytest alignment, and mirrored under `BackEnd/src/test/resources/contract-fixtures/` for classpath loading.

## Envelope Shapes

### Flask `POST /search`

```json
{
  "success": true,
  "query": "<vibeDescription>",
  "results": [ { ...MlLocationDto... } ],
  "confidence": 0.91,
  "explanation": "optional human-readable summary"
}
```

### Flask `POST /similar`

Aligns with `/search` results array (no `query` field required):

```json
{
  "success": true,
  "results": [ { ...MlLocationDto... } ],
  "confidence": 0.89
}
```

**Exclude-self scenario:** When Spring posts venue fields for "Blue Note Jazz Club", `similar-success.json` returns peer venues only — the base venue must not appear in `results[]`.

### Busyness `GET /busyness` (minimal)

```json
{
  "success": true,
  "predictions": { "<zoneId>": 0.72, ... },
  "forecast": [ { "zoneId": "...", "hour": 18, "busyness": 0.65 } ],
  "cached": false
}
```

## Field Mapping Table

| Canonical JSON (fixtures) | Flask CSV column | Java `VibeService.mapToLocation` legacy | Notes |
|---------------------------|------------------|----------------------------------------|-------|
| `latitude` | `lat` | `latitude` | Fixtures use canonical keys; CSV may use `lat` |
| `longitude` | `long` | `longitude` | Fixtures use canonical keys; CSV may use `long` |
| `address` | `addr` | `address` | Normalize once in `MlResponseMapper` (Wave 2+) |
| `type` | `loc_type` | description/type flags | Public Spring type derived from entity flags |
| `rating` | `reviews` ("Rating: 4.7") | regex parse | Optional on `MlLocationDto` |
| `similarity` | — | ML score only | Present on search/similar results |
| `zone` / `zoneId` | `zone` / `zoneId` | zone on entity | Used for busyness and similar context |

## Fixture Files

| File | Purpose |
|------|---------|
| `llm/search-success.json` | Canonical `/search` success with 2 results |
| `llm/search-empty.json` | Empty results, zero confidence |
| `llm/similar-success.json` | `/similar` success; excludes base venue by name |
| `busyness/report-minimal.json` | Minimal predictions + forecast for DTO typing |

## Classpath Mirror

Copy (not symlink) these into `BackEnd/src/test/resources/contract-fixtures/`:

- `llm/search-success.json`
- `llm/similar-success.json`
- `busyness/report-minimal.json`

Keep authoritative JSON in this directory; update both locations when shapes change.

## Flask `POST /chat` (Flask-only — no Spring proxy)

Chat is served directly by the LLM Flask service. Spring does not proxy chat requests (D-12). Document here for pytest and Vitest alignment.

**Request:**

```json
{
  "message": "<user message>",
  "previous_questions": ["<prior user question 1>", "<prior user question 2>"],
  "previous_responses": ["<prior assistant reply 1>", "<prior assistant reply 2>"],
  "location": "<optional zone or neighborhood filter>"
}
```

- `previous_questions` is the canonical history field (not `history`).
- `previous_responses` is optional. When supplied, it is paired with prior
  questions to create alternating conversation history.
- Both history arrays are normalized and truncated to the latest three
  non-empty entries.
- `location` is optional; the service can also infer a supported location from
  the message.
- The route requires a valid Bearer JWT.

**Response:**

```json
{
  "response": "<assistant reply>",
  "citations": [
    {
      "venue_id": 123,
      "name": "<canonical venue name>",
      "snippet": "<retrieved venue context>",
      "score": 0.82
    }
  ]
}
```

The frontend treats structured citations as authoritative for venue hydration.
Inline `[N]` markers may appear in the response text. The service does not
promise a generated footnote source block.

## Forecast Array

Minimal busyness forecast entries in `report-minimal.json`:

```json
{
  "zoneId": "<zone identifier>",
  "hour": 18,
  "busyness": 0.65
}
```

Contract tests should load fixtures rather than inline JSON when shapes grow.
