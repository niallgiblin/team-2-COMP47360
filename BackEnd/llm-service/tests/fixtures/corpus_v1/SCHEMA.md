# Corpus v1 Schema

## Embed fields

These columns are included in labeled-line document text for embedding:

- name
- description
- zone
- price
- loc_type
- tags
- summary
- Info

## Metadata fields

These columns are retained in CSV but excluded from embed text:

- id
- lat
- long
- addr
- uri
- reviews
- num_reviews

## Field mapping

CSV column `loc_type` maps to document label `Type:`.
