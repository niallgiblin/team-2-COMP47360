"""Wave 0 tests for per-venue document text composition."""

from conftest import _LocRow

from venue_corpus.document import compose_document_text


def test_compose_document_labeled_lines():
    row = _LocRow(
        name="Blue Note Jazz Club",
        zone="Greenwich Village",
        loc_type="Bar",
        price="price level moderate",
        description="jazz club, live music, bar",
        tags="jazz, music, nightlife, bar",
        summary="Legendary jazz club with nightly live performances.",
        Info="Name of location: Blue Note Jazz Club. Zone in NYC: Greenwich Village",
    )
    text = compose_document_text(row)
    assert "Name: Blue Note Jazz Club" in text
    assert "Zone: Greenwich Village" in text
    assert "Type: Bar" in text
    assert "Description: jazz club, live music, bar" in text


def test_metadata_fields_excluded():
    row = _LocRow(
        id=9001,
        lat=40.7308,
        long=-74.0020,
        addr="131 W 3rd St",
        name="Blue Note Jazz Club",
        zone="Greenwich Village",
        loc_type="Bar",
        price="price level moderate",
        description="jazz club",
    )
    text = compose_document_text(row)
    assert "9001" not in text
    assert "40.7308" not in text
    assert "131 W 3rd St" not in text
    assert "id:" not in text.lower()
    assert "lat:" not in text.lower()
    assert "addr:" not in text.lower()


def test_empty_info_skipped():
    row = _LocRow(
        name="Smalls Jazz Club",
        zone="Greenwich Village",
        loc_type="Bar",
        price="price level moderate",
        description="jazz club",
        summary="Intimate basement jazz club.",
        Info="",
    )
    text = compose_document_text(row)
    assert "Info:" not in text
    assert "Name: Smalls Jazz Club" in text
