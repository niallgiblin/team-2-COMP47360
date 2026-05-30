#!/usr/bin/env python3
"""Standalone script to pre-download and cache the cross-encoder model.

Usage:
    python scripts/download_cross_encoder.py [--model MODEL_NAME] [--output OUTPUT_DIR]

Default model: cross-encoder/ms-marco-MiniLM-L6-v2
Default output: models/cross-encoder/

Used for Docker pre-baking so the cross-encoder is available at container
startup without a network dependency.
"""

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

DEFAULT_MODEL = "cross-encoder/ms-marco-MiniLM-L6-v2"
DEFAULT_OUTPUT = str(Path(__file__).resolve().parent.parent / "models" / "cross-encoder")


def main():
    parser = argparse.ArgumentParser(
        description="Pre-download cross-encoder model for Docker pre-baking"
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Cross-encoder model name (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"Output directory for saved model (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()

    logger.info("Downloading cross-encoder model: %s", args.model)
    try:
        from sentence_transformers import CrossEncoder
    except ImportError as exc:
        logger.error(
            "sentence_transformers not installed. Install with: "
            "pip install sentence-transformers"
        )
        sys.exit(1)

    try:
        model = CrossEncoder(args.model)
        logger.info(
            "Cross-encoder loaded: model=%s device=%s",
            args.model,
            getattr(model, "_target_device", "cpu"),
        )
    except Exception as exc:
        logger.error("Failed to download/load cross-encoder: %s", exc)
        sys.exit(1)

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        model.save(str(output_dir))
        logger.info("Cross-encoder saved to %s", output_dir)
    except Exception as exc:
        logger.error("Failed to save cross-encoder to %s: %s", output_dir, exc)
        sys.exit(1)

    logger.info("Cross-encoder pre-bake complete: model=%s output=%s", args.model, output_dir)


if __name__ == "__main__":
    main()
