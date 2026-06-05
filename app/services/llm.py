import json
import logging
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

logger = logging.getLogger(__name__)


async def generate_edge_metadata(
    source_name: str,
    source_content: str,
    target_name: str,
    target_content: str,
) -> dict[str, str]:
    """
    Uses an LLM to generate a name and description for the relationship
    between two knowledge graph nodes.
    Returns {"name": "...", "description": "..."}.
    """
    prompt = (
        "You are an expert knowledge extraction system. "
        "Your task is to analyze the following two entities and identify the core semantic relationship connecting their underlying concepts. "
        "Provide a concise, descriptive label for the connection and a brief explanation of how they conceptually relate.\n\n"
        f"Source Entity: '{source_name}'\nContent: {source_content}\n\n"
        f"Target Entity: '{target_name}'\nContent: {target_content}\n\n"
        'Respond strictly in JSON format matching the following schema: '
        '{"name": "<Short conceptual label>", "description": "<Brief conceptual explanation>"}'
    )

    response = await _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    try:
        data = json.loads(raw)
        return {
            "name": str(data.get("name", "Related"))[:255],
            "description": str(data.get("description", "")),
        }
    except (json.JSONDecodeError, KeyError) as exc:
        logger.warning("Failed to parse LLM response: %s | raw: %s", exc, raw)
        return {
            "name": f"{source_name} ↔ {target_name}",
            "description": "Automatically detected semantic relationship.",
        }
