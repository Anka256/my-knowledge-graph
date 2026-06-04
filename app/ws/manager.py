import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Aktif WebSocket bağlantılarını yönetir ve kullanıcıya özel broadcast yapar."""

    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, user_id: int) -> None:
        await ws.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(ws)
        logger.info("WS bağlandı User %d.", user_id)

    def disconnect(self, ws: WebSocket, user_id: int) -> None:
        if user_id in self._connections:
            self._connections[user_id].discard(ws)
            if not self._connections[user_id]:
                del self._connections[user_id]
        logger.info("WS ayrıldı User %d.", user_id)

    async def broadcast(self, data: dict, user_id: int) -> None:
        if user_id not in self._connections or not self._connections[user_id]:
            return
        msg = json.dumps(data, default=str)
        dead: set[WebSocket] = set()
        for ws in list(self._connections[user_id]):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        self._connections[user_id] -= dead


# Uygulama genelinde tek instance
manager = ConnectionManager()
