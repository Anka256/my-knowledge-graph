from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_db
from app.models import Edge, Node, User
from app.schemas import EdgeResponse, EdgeCreate, EdgeUpdate
from app.auth import get_current_user
from app.services.llm import generate_edge_metadata

router = APIRouter(prefix="/edges", tags=["edges"])


@router.get(
    "/generate-metadata",
    summary="Generate edge metadata via LLM",
)
async def generate_metadata_endpoint(
    source_id: int,
    target_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Node).where(Node.id.in_([source_id, target_id]), Node.user_id == current_user.id))
    nodes = result.scalars().all()
    if len(nodes) != 2:
        raise HTTPException(status_code=404, detail="Nodes not found")
    
    n1, n2 = nodes
    source = n1 if n1.id == source_id else n2
    target = n2 if n2.id == target_id else n1

    try:
        metadata = await generate_edge_metadata(
            source_name=source.name,
            source_content=source.content or "",
            target_name=target.name,
            target_content=target.content or "",
        )
        return metadata
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/",
    response_model=list[EdgeResponse],
    summary="Tüm edge'leri listele",
    description="Veritabanındaki tüm otomatik oluşturulan edge'leri döndürür.",
)
async def list_edges(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
) -> list[EdgeResponse]:
    result = await db.execute(
        select(Edge).where(Edge.user_id == current_user.id).order_by(Edge.similarity.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


@router.get(
    "/node/{node_id}",
    response_model=list[EdgeResponse],
    summary="Node'a ait edge'leri listele",
    description="Belirtilen node'un kaynak veya hedef olduğu tüm edge'leri döndürür.",
)
async def list_node_edges(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EdgeResponse]:
    result = await db.execute(
        select(Edge)
        .where(Edge.user_id == current_user.id)
        .where((Edge.source_id == node_id) | (Edge.target_id == node_id))
        .order_by(Edge.similarity.desc())
    )
    return list(result.scalars().all())


@router.get(
    "/graph",
    summary="Graf verisi (Cytoscape.js formatı)",
    description=(
        "Tüm node ve edge'leri Cytoscape.js'in beklediği `elements` formatında döndürür. "
        "Doğrudan `cytoscape({ elements: response.elements })` ile kullanılabilir."
    ),
    response_model=dict,
)
async def get_graph(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    # Tüm node'ları çek
    nodes_result = await db.execute(select(Node).where(Node.user_id == current_user.id).order_by(Node.id))
    nodes = nodes_result.scalars().all()

    # Tüm edge'leri çek
    edges_result = await db.execute(select(Edge).where(Edge.user_id == current_user.id).order_by(Edge.id))
    edges = edges_result.scalars().all()

    cy_nodes = [
        {
            "data": {
                "id": str(n.id),
                "label": n.name,
                "name": n.name,
                "content": n.content,
                "tags": n.tags,
                "status": n.status,
                "citations": n.citations,
                "highlights": n.highlights,
                "created_at": n.created_at.isoformat(),
                "has_embedding": n.embedding is not None,
            }
        }
        for n in nodes
    ]

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
        for e in edges
    ]

    return {
        "elements": {
            "nodes": cy_nodes,
            "edges": cy_edges,
        },
        "meta": {
            "node_count": len(cy_nodes),
            "edge_count": len(cy_edges),
        },
    }


@router.post(
    "/",
    response_model=EdgeResponse,
    summary="Manually create an edge",
    description="Creates a custom connection between two nodes with a given name and description.",
)
async def create_edge(
    payload: EdgeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EdgeResponse:
    # Validate source node
    result = await db.execute(select(Node).where(Node.id == payload.source_id, Node.user_id == current_user.id))
    source_node = result.scalar_one_or_none()
    if not source_node:
        raise HTTPException(status_code=400, detail="Source node not found or does not belong to user.")
    
    # Validate target node
    result = await db.execute(select(Node).where(Node.id == payload.target_id, Node.user_id == current_user.id))
    target_node = result.scalar_one_or_none()
    if not target_node:
        raise HTTPException(status_code=400, detail="Target node not found or does not belong to user.")

    stmt = pg_insert(Edge).values(
        source_id=payload.source_id,
        target_id=payload.target_id,
        name=payload.name,
        description=payload.description,
        similarity=payload.similarity,
        user_id=current_user.id
    ).on_conflict_do_update(
        constraint="uq_edge_source_target",
        set_={
            "name": payload.name,
            "description": payload.description,
            "similarity": payload.similarity,
        },
    ).returning(Edge)
    
    try:
        result = await db.execute(stmt)
        await db.commit()
        return result.scalar_one()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


@router.patch(
    "/{edge_id}",
    response_model=EdgeResponse,
    summary="Update an edge",
    description="Partially updates an edge's name or description.",
)
async def update_edge(
    edge_id: int,
    payload: EdgeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EdgeResponse:
    result = await db.execute(select(Edge).where(Edge.id == edge_id, Edge.user_id == current_user.id))
    edge = result.scalar_one_or_none()
    if edge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found.")

    if payload.name is not None:
        edge.name = payload.name
    if payload.description is not None:
        edge.description = payload.description

    try:
        await db.commit()
        await db.refresh(edge)
        return edge
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


@router.delete(
    "/{edge_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an edge",
)
async def delete_edge(
    edge_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(select(Edge).where(Edge.id == edge_id, Edge.user_id == current_user.id))
    edge = result.scalar_one_or_none()
    if edge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found.")

    await db.delete(edge)

