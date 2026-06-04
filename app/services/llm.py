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
        "You are a knowledge graph assistant. "
        "Given two knowledge nodes, describe the semantic relationship between them. "
        "Respond ONLY with a JSON object, nothing else.\n\n"
        f"Node A — {source_name}:\n{source_content}\n\n"
        f"Node B — {target_name}:\n{target_content}\n\n"
        'Format: {"name": "short relationship label (max 8 words)", '
        '"description": "one or two sentences explaining the relationship"}'
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
