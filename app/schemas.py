from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class NodeCreate(BaseModel):
    """Request body for POST /nodes/."""

    name: str = Field(..., min_length=1, max_length=255, examples=["Artificial Intelligence"])
    content: str = Field(..., min_length=1, examples=["Notes on artificial intelligence..."])


class NodeUpdate(BaseModel):
    """Request body for PATCH /nodes/{id}. All fields are optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1)


class NodeResponse(BaseModel):
    """Response after successful node creation or update."""

    id: int
    name: str
    content: str
    created_at: datetime

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


class EdgeUpdate(BaseModel):
    """Request body for PATCH /edges/{id}. All fields are optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
