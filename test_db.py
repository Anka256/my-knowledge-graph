import asyncio
from app.database import AsyncSessionLocal
from app.models import Node
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Node.id))
        print("ALL NODES:", result.scalars().all())

asyncio.run(main())
