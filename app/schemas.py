from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class NodeStatus(str, Enum):
    draft = "draft"
    in_progress = "in progress"
    consolidated = "consolidated"

class NodeCreate(BaseModel):
    """Request body for POST /nodes/."""

    name: str = Field(..., min_length=1, max_length=255, examples=["Artificial Intelligence"])
    content: str = Field(..., min_length=1, examples=["Notes on artificial intelligence..."])
    tags: Optional[List[str]] = Field(default_factory=list)
    status: Optional[NodeStatus] = Field(default=NodeStatus.draft)

class NodeUpdate(BaseModel):
    """Request body for PATCH /nodes/{id}. All fields are optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    tags: Optional[List[str]] = None
    status: Optional[NodeStatus] = None
    citations: Optional[List[Dict[str, Any]]] = None

class HighlightCreate(BaseModel):
    text: str
    comment: Optional[str] = None
    
class CitationCreate(BaseModel):
    url: Optional[str] = None
    title: Optional[str] = None
    type: str = "url"

class NodeResponse(BaseModel):
    """Response after successful node creation or update."""

    id: int
    name: str
    content: str
    created_at: datetime
    tags: List[str]
    status: NodeStatus
    highlights: List[Dict[str, Any]]
    citations: List[Dict[str, Any]]

    model_config = {"from_attributes": True}


class SimilarNodeResponse(BaseModel):
    """Response item for GET /nodes/{id}/similar."""

    id: int
    name: str
    content: str
    created_at: datetime
    similarity: float = Field(..., description="Cosine similarity score (0–1, 1 = identical)")

    model_config = {"from_attributes": True}


class EdgeResponse(BaseModel):
    """Edge record response."""

    id: int
    source_id: int
    target_id: int
    name: str
    description: str
    similarity: float
    created_at: datetime

    model_config = {"from_attributes": True}


class EdgeCreate(BaseModel):
    """Request body for manual POST /edges/."""

    source_id: int
    target_id: int
    name: str = Field(..., min_length=1, max_length=255)
    description: str
    similarity: float = 1.0


class EdgeUpdate(BaseModel):
    """Request body for PATCH /edges/{id}. All fields are optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
