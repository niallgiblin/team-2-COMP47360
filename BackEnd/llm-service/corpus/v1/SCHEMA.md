# Corpus v1 Schema

Versioned venue catalog for v0.2 RAG (RAG-01). Source of truth for embedding text,
retrieval keys, and Spring Boot location import alignment.

## Column reference

| Column | Type | Role |
|--------|------|------|
| `id` | int | **Metadata / retrieval key** — matches MySQL `Location.id` |
| `lat` | float | Metadata — map coordinates |
| `long` | float | Metadata — map coordinates |
| `name` | string | **Embed** |
| `addr` | string | Metadata — street address |
| `uri` | string | Metadata — external link |
| `reviews` | string | Metadata — review text blob |
| `num_reviews` | int | Metadata — review count |
| `loc_type` | string | **Embed** (labeled `Type:`) |
| `description` | string | **Embed** |
| `price` | string | **Embed** + structured filter column |
| `zone` | string | **Embed** + structured filter column |
| `Info` | string | **Embed** — static venue summary text |
| `summary` | string | **Embed** — static busyness summary (no live join) |
| `tags` | string | **Embed** |

## Embed fields

Order matches `manifest.json` → `document_model.embed_fields` exactly:

| CSV column | Document label |
|------------|----------------|
| `name` | `Name:` |
| `description` | `Description:` |
| `zone` | `Zone:` |
| `price` | `Price:` |
| `loc_type` | `Type:` |
| `tags` | `Tags:` |
| `summary` | `Summary:` |
| `Info` | `Info:` |

Blank or NaN values are omitted from document text.

## Metadata-only fields

Excluded from labeled-line embed text (per D-06):

- `id`
- `lat`
- `long`
- `addr`
- `uri`
- `reviews`
- `num_reviews`

## Retrieval key (D-10)

Corpus `id` is the retrieval key. It is **not** embedded as a labeled line. Values must
match MySQL `Location.id` for Phase 14 citations and Phase 15 eval gold labels. Alignment
is maintained via D-11 same-commit sync of
`BackEnd/src/main/resources/data/locations.csv`.

## Dual-role columns: `price` and `zone`

Included in embeddable document text (D-05) **and** retained as structured CSV columns
for post-retrieval filters in `search_service.py`. They are not metadata-only.

## Labeled-line document format (D-07)

One document per venue. Example:

```
Name: Museum at Eldridge Street
Description: historic synagogue, museum, architecture
Zone: Lower East Side
Price: price level moderate
Type: Museum
```

Static busyness context comes only from `summary` and `Info` columns (D-08). There is
**no live busyness join** at corpus-build time.

## DTO gap note

CSV uses `addr`, `lat`, `long`, `loc_type`. The API DTO uses different keys (`address`,
etc.). The document builder reads CSV columns only — not DTO field names.

## Version bump policy (D-03)

Material venue schema or catalog changes require a new `corpus/vN/` directory (e.g.
`corpus/v2/`). Do **not** auto-bump on every CSV edit — only when embed fields,
columns, or catalog semantics change materially.

## Row order warning

Do **not** reorder rows without a Phase 12 FAISS index rebuild. Current embeddings
use row-index (`iloc`) alignment with `venues.csv` order.

## Maintainer checklist (D-11)

When editing `venues.csv`:

1. Copy to `BackEnd/src/main/resources/data/locations.csv` in the **same commit**
2. Recompute manifest SHA-256 (`shasum -a 256 corpus/v1/venues.csv`) and update
   `manifest.json` → `venues_csv.sha256` and `row_count`
3. Material catalog changes → new `corpus/vN/` per D-03, not in-place breaking edits
