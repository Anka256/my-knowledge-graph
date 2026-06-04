import asyncio
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Node
from app.services.embedding import get_embedding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post(
    "/backfill-embeddings",
    summary="Backfill embeddings",
    description=(
        "Finds all nodes without an embedding and computes one using "
        "OpenAI text-embedding-3-small. Nodes that fail are skipped and reported."
    ),
)
async def backfill_embeddings(
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(Node).where(Node.embedding.is_(None)))
    nodes: list[Node] = list(result.scalars().all())

    if not nodes:
        return {"message": "All nodes already have embeddings.", "updated": 0}

    updated = 0
    failed: list[dict] = []

    for node in nodes:
        try:
            embedding = await get_embedding(node.content)
            node.embedding = embedding
            updated += 1
            logger.info("Embedding computed for node %d.", node.id)
        except Exception as exc:
            logger.warning("Embedding failed for node %d: %s", node.id, exc)
            failed.append({"id": node.id, "name": node.name, "error": str(exc)})

        # Brief pause to avoid OpenAI rate limits
        await asyncio.sleep(0.3)

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        return {
            "message": "Commit failed.",
            "error": str(exc),
            "updated": 0,
            "failed": failed,
        }

    return {
        "message": f"{updated} node(s) updated, {len(failed)} skipped.",
        "updated": updated,
        "failed": failed,
    }
