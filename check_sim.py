import asyncio
from app.database import async_session_maker
from sqlalchemy import text

async def main():
    async with async_session_maker() as session:
        # Get nodes
        stmt = text("""
            SELECT id, name FROM nodes 
            WHERE name ILIKE '%Matrix%' OR name ILIKE '%Machine Learning%' OR name ILIKE '%AI%' OR name ILIKE '%Artificial Intelligence%';
        """)
        result = await session.execute(stmt)
        nodes = result.mappings().all()
        print("Found nodes:")
        for n in nodes:
            print(n)
            
        # Get pairwise similarity
        sim_stmt = text("""
            SELECT 
                n1.name as name1, 
                n2.name as name2, 
                ROUND((1 - (n1.embedding <=> n2.embedding))::numeric, 6)::float as similarity
            FROM nodes n1
            CROSS JOIN nodes n2
            WHERE n1.id < n2.id
              AND n1.name IN (SELECT name FROM nodes WHERE name ILIKE '%Matrix%' OR name ILIKE '%Machine Learning%' OR name ILIKE '%AI%' OR name ILIKE '%Artificial Intelligence%')
              AND n2.name IN (SELECT name FROM nodes WHERE name ILIKE '%Matrix%' OR name ILIKE '%Machine Learning%' OR name ILIKE '%AI%' OR name ILIKE '%Artificial Intelligence%')
            ORDER BY similarity DESC;
        """)
        sim_result = await session.execute(sim_stmt)
        sims = sim_result.mappings().all()
        print("\nSimilarities:")
        for s in sims:
            print(f"{s['name1']} <-> {s['name2']}: {s['similarity']}")

if __name__ == "__main__":
    asyncio.run(main())
