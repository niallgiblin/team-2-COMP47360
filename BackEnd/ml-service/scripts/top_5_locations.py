import numpy as np
import pandas as pd
import torch
from sentence_transformers import SentenceTransformer, util

def top_5(query):
    location_embeddings = torch.tensor(np.load('location_embeddings.npy'))
    model = SentenceTransformer("./local_models/john-text-encoder-3")
    query = "Night Activities"
    query_embedding = model.encode(query, convert_to_tensor=True).cpu()

    # Compute similarity
    similarities = util.cos_sim(query_embedding, location_embeddings)[0]




    similarityIds = similarities.cpu().numpy()
    top_5_indices = np.argpartition(similarityIds, -5)[-5:]  # Unordered top 5 indices
    top_5_indices = top_5_indices[np.argsort(similarityIds[top_5_indices])[::-1]]  # Order them
    return top_5_indices

test = top_5("Fun Nightime activities")
print(test)

