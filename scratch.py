import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as db:
        stmt = text("""
            SELECT
                n1.name as name1,
                n2.name as name2,
                1 - (n1.embedding <=> n2.embedding) AS similarity
            FROM nodes n1
            CROSS JOIN nodes n2
            WHERE n1.name ILIKE '%Matrix%' 
              AND (n2.name ILIKE '%Machine Learning%' OR n2.name ILIKE '%AI%' OR n2.name ILIKE '%Artificial Intelligence%')
        """)
        result = await db.execute(stmt)
        rows = result.mappings().all()
        for row in rows:
            print(f"{row['name1']} <-> {row['name2']}: {row['similarity']}")

if __name__ == "__main__":
    asyncio.run(main())
