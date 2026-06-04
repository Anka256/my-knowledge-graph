import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


async def get_embedding(text: str) -> list[float]:
    """
    OpenAI text-embedding-3-small kullanarak metin için embedding vektörü üretir.
    1536 boyutlu float listesi döner.
    """
    text = text.replace("\n", " ").strip()
    response = await _client.embeddings.create(
        input=text,
        model=EMBEDDING_MODEL,
    )
    return response.data[0].embedding
