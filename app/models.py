from datetime import datetime
from sqlalchemy import String, Text, DateTime, Float, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from app.database import Base

from app.database import Base


from sqlalchemy.dialects.postgresql import JSONB, ARRAY
import enum

class NodeStatus(str, enum.Enum):
    draft = "draft"
    in_progress = "in progress"
    consolidated = "consolidated"

class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="owner", cascade="all, delete-orphan")
    edges: Mapped[list["Edge"]] = relationship("Edge", back_populates="owner", cascade="all, delete-orphan")

class Node(Base):
    """Bilgi grafiğindeki bir düğümü temsil eder."""

    __tablename__ = "nodes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(1536), nullable=True
    )
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), server_default='{}')
    status: Mapped[NodeStatus] = mapped_column(String(50), server_default="draft")
    highlights: Mapped[list[dict]] = mapped_column(JSONB, server_default='[]')
    citations: Mapped[list[dict]] = mapped_column(JSONB, server_default='[]')

    # İlişkiler (edge'ler)
    owner: Mapped["User"] = relationship("User", back_populates="nodes")
    outgoing_edges: Mapped[list["Edge"]] = relationship(
        "Edge", foreign_keys="Edge.source_id", back_populates="source", cascade="all, delete-orphan"
    )
    incoming_edges: Mapped[list["Edge"]] = relationship(
        "Edge", foreign_keys="Edge.target_id", back_populates="target", cascade="all, delete-orphan"
    )


class Edge(Base):
    """İki düğüm arasındaki ilişkiyi temsil eder."""

    __tablename__ = "edges"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    similarity: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    source: Mapped["Node"] = relationship("Node", foreign_keys=[source_id], back_populates="outgoing_edges")
    target: Mapped["Node"] = relationship("Node", foreign_keys=[target_id], back_populates="incoming_edges")
    owner: Mapped["User"] = relationship("User", back_populates="edges")

    # source_id her zaman küçük id, target_id büyük id — simetrik tekrarı önler
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", name="uq_edge_source_target"),
    )
