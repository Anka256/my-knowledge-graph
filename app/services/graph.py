import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.models import Node, Edge
from app.services.llm import generate_edge_metadata
from app.ws.manager import manager

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.15


async def create_auto_edges_for_node(new_node_id: int, user_id: int) -> None:
    """
    Yeni kaydedilen node için cosine similarity > 0.7 olan tüm
    node'larla otomatik edge oluşturur. BackgroundTask olarak çalışır.
    WS üzerinden real-time durum güncelleri gönderir.
    """
    async with AsyncSessionLocal() as db:
        try:
            await _create_edges(db, new_node_id, user_id)
        except Exception as exc:
            logger.error("Auto-edge oluşturma hatası (node %d): %s", new_node_id, exc)
            await manager.broadcast({
                "type": "node_status",
                "node_id": new_node_id,
                "status": "error",
                "message": str(exc),
            }, user_id)


async def _create_edges(db: AsyncSession, new_node_id: int, user_id: int) -> None:
    result = await db.execute(select(Node).where(Node.id == new_node_id))
    source = result.scalar_one_or_none()

    if source is None or source.embedding is None:
        logger.warning("Node %d yok ya da embedding'i eksik, edge atlanıyor.", new_node_id)
        await manager.broadcast({
            "type": "node_status",
            "node_id": new_node_id,
            "status": "done",
            "edge_count": 0,
            "new_edges": [],
        }, user_id)
        return

    # Benzer node'ları bul
    similar_stmt = text("""
        SELECT
            n.id,
            n.name,
            n.content,
            ROUND((1 - (n.embedding <=> src.embedding))::numeric, 6)::float AS similarity
        FROM nodes n
        CROSS JOIN (SELECT embedding FROM nodes WHERE id = :source_id) AS src
        WHERE n.id != :source_id
          AND n.user_id = :user_id
          AND n.embedding IS NOT NULL
          AND (1 - (n.embedding <=> src.embedding)) > :threshold
        ORDER BY similarity DESC
    """)

    rows = await db.execute(
        similar_stmt,
        {"source_id": new_node_id, "user_id": source.user_id, "threshold": SIMILARITY_THRESHOLD},
    )
    similar_nodes = rows.mappings().all()

    if not similar_nodes:
        logger.info("Node %d için eşik üzeri benzer node bulunamadı.", new_node_id)
        await manager.broadcast({
            "type": "node_status",
            "node_id": new_node_id,
            "status": "done",
            "edge_count": 0,
            "new_edges": [],
        }, user_id)
        return

    # İşleme başlandığını bildir
    await manager.broadcast({
        "type": "node_status",
        "node_id": new_node_id,
        "status": "processing_edges",
        "total": len(similar_nodes),
    }, user_id)

    logger.info("Node %d için %d benzer node, edge'ler oluşturuluyor...",
                new_node_id, len(similar_nodes))

    for idx, row in enumerate(similar_nodes):
        target_id = row["id"]
        similarity = float(row["similarity"])
        sid, tid = sorted([new_node_id, target_id])

        # Her edge için LLM ilerleme bildirimi
        await manager.broadcast({
            "type": "node_status",
            "node_id": new_node_id,
            "status": "edge_progress",
            "current": idx + 1,
            "total": len(similar_nodes),
        }, user_id)

        try:
            metadata = await generate_edge_metadata(
                source_name=source.name,
                source_content=source.content,
                target_name=row["name"],
                target_content=row["content"],
            )
        except Exception as exc:
            logger.warning("LLM hatası (node %d ↔ %d): %s", sid, tid, exc)
            metadata = {
                "name": f"{source.name} ↔ {row['name']}",
                "description": "Otomatik tespit edilmiş semantik ilişki.",
            }

        stmt = pg_insert(Edge).values(
            source_id=sid,
            target_id=tid,
            name=metadata["name"],
            description=metadata["description"],
            similarity=similarity,
            user_id=source.user_id,
        ).on_conflict_do_update(
            constraint="uq_edge_source_target",
            set_={
                "name": metadata["name"],
                "description": metadata["description"],
                "similarity": similarity,
            },
        )
        await db.execute(stmt)

    await db.commit()

    # Commit sonrası oluşan edge'leri çek ve broadcast et
    edges_result = await db.execute(
        select(Edge).where(
            (Edge.source_id == new_node_id) | (Edge.target_id == new_node_id)
        )
    )
    created_edges = edges_result.scalars().all()

    cy_edges = [
        {
            "data": {
                "id": f"e{e.id}",
                "source": str(e.source_id),
                "target": str(e.target_id),
                "name": e.name,
                "description": e.description,
                "similarity": e.similarity,
                "created_at": e.created_at.isoformat(),
            }
        }
        for e in created_edges
    ]

    await manager.broadcast({
        "type": "node_status",
        "node_id": new_node_id,
        "status": "done",
        "edge_count": len(cy_edges),
        "new_edges": cy_edges,
    }, user_id)

    logger.info("Node %d için %d edge tamamlandı.", new_node_id, len(cy_edges))
