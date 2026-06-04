from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from sqlalchemy import text

from app.database import engine, Base
from app.routers import nodes, admin, edges, ws, auth
from app.models import User
from app.auth import get_password_hash


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Uygulama başlarken:
    1. Tabloları oluştur (yoksa)
    2. Mevcut tabloya embedding kolonu ekle (yoksa)

    NOT: pgvector extension'ı bir kez superuser olarak elle kurulmalıdır:
         sudo -i -u postgres psql -d knowledge_graph -c "CREATE EXTENSION IF NOT EXISTS vector;"
    """
    async with engine.begin() as conn:
        # Tabloları oluştur
        await conn.run_sync(Base.metadata.create_all)
        # Mevcut nodes tablosuna yeni kolonları ekle (migration)
        await conn.execute(text(
            "ALTER TABLE nodes ADD COLUMN IF NOT EXISTS embedding vector(1536);"
        ))
        await conn.execute(text(
            "ALTER TABLE nodes ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;"
        ))
        await conn.execute(text(
            "ALTER TABLE edges ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;"
        ))
        await conn.execute(text(
            "ALTER TABLE nodes ADD COLUMN IF NOT EXISTS tags VARCHAR[] DEFAULT '{}';"
        ))
        await conn.execute(text(
            "ALTER TABLE nodes ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'seedling';"
        ))
        await conn.execute(text(
            "ALTER TABLE nodes ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb;"
        ))
        await conn.execute(text(
            "ALTER TABLE nodes ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]'::jsonb;"
        ))
        
        # Create a default user if none exist, so we can assign existing data to it
        result = await conn.execute(text("SELECT id FROM users WHERE username = 'admin'"))
        admin_id = result.scalar_one_or_none()
        if not admin_id:
            hashed = get_password_hash("admin")
            await conn.execute(text(f"INSERT INTO users (username, hashed_password) VALUES ('admin', '{hashed}')"))
            res = await conn.execute(text("SELECT id FROM users WHERE username = 'admin'"))
            admin_id = res.scalar_one()
            
        # Update existing nodes/edges to belong to admin to prevent null constraint errors
        await conn.execute(text(f"UPDATE nodes SET user_id = {admin_id} WHERE user_id IS NULL;"))
        await conn.execute(text(f"UPDATE edges SET user_id = {admin_id} WHERE user_id IS NULL;"))
    yield
    await engine.dispose()


app = FastAPI(
    title="My Knowledge Graph API",
    description="Bilgi grafiği düğümlerini yönetmek için REST API.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(auth.router)
app.include_router(nodes.router)
app.include_router(admin.router)
app.include_router(edges.router)
app.include_router(ws.router)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/ui", include_in_schema=False)
async def graph_ui():
    return FileResponse("static/index.html")


@app.get("/", tags=["health"])
async def root():
    return {"status": "ok", "message": "Knowledge Graph API çalışıyor.", "ui": "/ui"}
