import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.database import get_db
from app.models import Node, User
from app.schemas import NodeCreate, NodeUpdate, NodeResponse, SimilarNodeResponse
from app.services.embedding import get_embedding
from app.services.graph import create_auto_edges_for_node
from app.ws.manager import manager
from app.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.post(
    "/",
    response_model=NodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a node",
    description=(
        "Saves a new node with the given name and content. "
        "An embedding is automatically computed via OpenAI text-embedding-3-small. "
        "After saving, edges to semantically similar nodes (cosine > 0.7) are created "
        "asynchronously via a background task."
    ),
)
async def create_node(
    payload: NodeCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NodeResponse:
    try:
        embedding = await get_embedding(payload.content)
    except Exception as exc:
        logger.warning("Embedding failed, saving without it: %s", exc)
        embedding = None

    node = Node(name=payload.name, content=payload.content, embedding=embedding, user_id=current_user.id)
    db.add(node)
    try:
        await db.commit()
        await db.refresh(node)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )

    if embedding is not None:
        await manager.broadcast({
            "type": "node_status",
            "node_id": node.id,
            "status": "embedding_done",
        }, current_user.id)
        background_tasks.add_task(create_auto_edges_for_node, node.id, current_user.id)
        logger.info("Auto-edge background task queued for node %d", node.id)

    return node


@router.patch(
    "/{node_id}",
    response_model=NodeResponse,
    summary="Update a node",
    description=(
        "Partially updates a node's name and/or content. "
        "If content changes, the embedding is recomputed and edge relationships are rebuilt."
    ),
)
async def update_node(
    node_id: int,
    payload: NodeUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NodeResponse:
    result = await db.execute(select(Node).where(Node.id == node_id, Node.user_id == current_user.id))
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")

    if payload.name is not None:
        node.name = payload.name

    content_changed = payload.content is not None and payload.content != node.content
    if payload.content is not None:
        node.content = payload.content
        try:
            node.embedding = await get_embedding(payload.content)
        except Exception as exc:
            logger.warning("Embedding recomputation failed: %s", exc)

    try:
        await db.commit()
        await db.refresh(node)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )

    if content_changed and node.embedding is not None:
        await manager.broadcast({
            "type": "node_status",
            "node_id": node.id,
            "status": "embedding_done",
        }, current_user.id)
        background_tasks.add_task(create_auto_edges_for_node, node.id, current_user.id)

    return node


@router.delete(
    "/{node_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a node",
    description="Permanently deletes a node and all its associated edges.",
)
async def delete_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(select(Node).where(Node.id == node_id, Node.user_id == current_user.id))
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")
    await db.delete(node)
    await db.commit()


@router.get(
    "/{node_id}/similar",
    response_model=list[SimilarNodeResponse],
    summary="Find similar nodes",
    description=(
        "Uses the node's embedding and pgvector cosine similarity to return "
        "the closest matching nodes. Nodes without embeddings are excluded."
    ),
)
async def get_similar_nodes(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    top_k: int = 5,
    current_user: User = Depends(get_current_user),
) -> list[SimilarNodeResponse]:
    result = await db.execute(select(Node).where(Node.id == node_id, Node.user_id == current_user.id))
    source = result.scalar_one_or_none()

    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")
    if source.embedding is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Node {node_id} has no embedding. "
                "Run POST /admin/backfill-embeddings first."
            ),
        )

    stmt = text("""
        SELECT
            n.id,
            n.name,
            n.content,
            n.created_at,
            ROUND((1 - (n.embedding <=> src.embedding))::numeric, 6)::float AS similarity
        FROM nodes n
        CROSS JOIN (SELECT embedding FROM nodes WHERE id = :source_id) AS src
        WHERE n.id != :node_id
          AND n.user_id = :user_id
          AND n.embedding IS NOT NULL
        ORDER BY n.embedding <=> src.embedding
        LIMIT :top_k
    """)

    rows = await db.execute(stmt, {"source_id": node_id, "node_id": node_id, "user_id": current_user.id, "top_k": top_k})
    records = rows.mappings().all()

    return [SimilarNodeResponse(**row) for row in records]
