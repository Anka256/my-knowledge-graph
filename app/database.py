import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

print(f"[database.py] DATABASE_URL prefix received: '{DATABASE_URL[:30] if DATABASE_URL else 'EMPTY'}'", flush=True)

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set! "
        "Set it in Railway → App service → Variables."
    )

# Railway provides postgres:// — asyncpg needs postgresql+asyncpg://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif not DATABASE_URL.startswith("postgresql+asyncpg://"):
    raise RuntimeError(f"Unrecognized DATABASE_URL format: {DATABASE_URL[:40]}")

print(f"[database.py] Final URL prefix: '{DATABASE_URL[:35]}'", flush=True)

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency: veritabanı oturumu sağlar."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
