"""BM25 sparse lexical index for exact keyword/name matching.

Pure-Python, numpy-backed implementation with zero new pip dependencies.
Uses standard BM25 scoring with configurable k1 and b parameters,
English stop-word filtering, and simple word-boundary tokenization.
"""

import math
import re
from collections import Counter

import numpy as np

# ~150 common English stop words filtered during tokenization.
_STOP_WORDS: frozenset[str] = frozenset(
    {
        "a", "about", "above", "after", "again", "against", "all", "am", "an",
        "and", "any", "are", "aren", "as", "at", "be", "because", "been",
        "before", "being", "below", "between", "both", "but", "by", "can",
        "cannot", "could", "couldn", "did", "didn", "do", "does", "doesn",
        "doing", "don", "down", "during", "each", "few", "for", "from",
        "further", "had", "hadn", "has", "hasn", "have", "haven", "having",
        "he", "her", "here", "hers", "herself", "him", "himself", "his",
        "how", "i", "if", "in", "into", "is", "isn", "it", "its", "itself",
        "just", "ll", "m", "ma", "me", "might", "mightn", "more", "most",
        "must", "mustn", "my", "myself", "need", "needn", "no", "nor", "not",
        "now", "o", "of", "off", "on", "once", "only", "or", "other", "our",
        "ours", "ourselves", "out", "over", "own", "re", "s", "same", "shan",
        "she", "should", "shouldn", "so", "some", "such", "t", "than", "that",
        "the", "their", "theirs", "them", "themselves", "then", "there",
        "these", "they", "this", "those", "through", "to", "too", "under",
        "until", "up", "ve", "very", "was", "wasn", "we", "were", "weren",
        "what", "when", "where", "which", "while", "who", "whom", "why",
        "will", "with", "won", "would", "wouldn", "y", "you", "your",
        "yours", "yourself", "yourselves",
    }
)

_WORD_RE = re.compile(r"\b\w+\b")


def _tokenize(text: str) -> list[str]:
    """Lowercase, extract word-boundary tokens, and remove stop words.

    Args:
        text: Raw input text.

    Returns:
        List of lowercased, non-stop-word tokens.
    """
    if not text:
        return []
    tokens = _WORD_RE.findall(text.lower())
    return [t for t in tokens if t not in _STOP_WORDS]


class Bm25Index:
    """BM25 sparse lexical index for keyword-driven document retrieval.

    Builds per-document term frequencies, computes IDF values across the
    corpus, and scores documents using the standard BM25 formula.

    Attributes:
        k1: Term frequency saturation parameter (default 1.5).
        b: Length normalisation parameter (default 0.75).
        doc_count: Number of documents in the corpus.
        avgdl: Average document length in tokens.
    """

    def __init__(self, documents: list[str], k1: float = 1.5, b: float = 0.75):
        """Build the BM25 index from a list of document texts.

        Args:
            documents: List of document strings to index.
            k1: Term frequency saturation parameter.
            b: Length normalisation parameter (0 = no normalisation, 1 = full).
        """
        self.k1 = float(k1)
        self.b = float(b)
        self._doc_count = len(documents)
        self._doc_lengths: np.ndarray
        self._avgdl: float
        self._idf: dict[str, float] = {}
        self._doc_term_freqs: list[dict[str, int]] = []

        if self._doc_count == 0:
            self._doc_lengths = np.array([], dtype="float64")
            self._avgdl = 0.0
            return

        # Tokenize all documents and build term frequencies.
        tokenized_docs: list[list[str]] = []
        doc_lengths_list: list[int] = []
        for doc in documents:
            tokens = _tokenize(doc)
            tokenized_docs.append(tokens)
            doc_lengths_list.append(len(tokens))
            self._doc_term_freqs.append(dict(Counter(tokens)))

        self._doc_lengths = np.array(doc_lengths_list, dtype="float64")
        self._avgdl = float(np.mean(self._doc_lengths)) if self._doc_count > 0 else 0.0

        # Compute IDF for each unique term in the corpus.
        N = self._doc_count
        for tokens in tokenized_docs:
            for term in set(tokens):
                if term in self._idf:
                    continue
                n = sum(1 for tf in self._doc_term_freqs if term in tf)
                # Standard BM25 IDF: ln((N - n + 0.5) / (n + 0.5) + 1)
                self._idf[term] = math.log((N - n + 0.5) / (n + 0.5) + 1)

    @property
    def doc_count(self) -> int:
        """Number of indexed documents."""
        return self._doc_count

    @property
    def avgdl(self) -> float:
        """Average document length in tokens."""
        return self._avgdl

    def search(
        self, query: str, top_k: int = 10
    ) -> list[tuple[int, float]]:
        """Score all documents against a query using BM25 and return top results.

        Args:
            query: Free-text query string.
            top_k: Maximum number of results to return.

        Returns:
            Sorted list of (doc_idx, bm25_score) tuples, descending by score.
            Documents with score 0 are omitted. Returns empty list when the
            corpus is empty or the query produces no matching terms.
        """
        if self._doc_count == 0:
            return []

        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        k1 = self.k1
        b = self.b
        avgdl = self._avgdl

        scores: list[tuple[int, float]] = []

        for idx, term_freqs in enumerate(self._doc_term_freqs):
            doc_len = self._doc_lengths[idx]
            score = 0.0

            for term in set(query_tokens):
                if term not in self._idf:
                    continue
                f_qd = term_freqs.get(term, 0)
                if f_qd == 0:
                    continue
                idf = self._idf[term]
                # BM25 term score
                numerator = f_qd * (k1 + 1)
                denominator = f_qd + k1 * (1 - b + b * doc_len / avgdl if avgdl > 0 else 1.0)
                score += idf * numerator / denominator

            if score > 0:
                scores.append((idx, score))

        scores.sort(key=lambda item: item[1], reverse=True)
        return scores[:top_k]

    def __repr__(self) -> str:
        return (
            f"Bm25Index(doc_count={self._doc_count}, "
            f"avgdl={self._avgdl:.1f}, "
            f"k1={self.k1}, b={self.b})"
        )
