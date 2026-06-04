import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.manager import manager
from app.auth import SECRET_KEY, ALGORITHM

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/events")
async def websocket_events(ws: WebSocket, token: str) -> None:
    """
    Real-time event stream. Authenticated via token query param.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except Exception:
        await ws.close(code=1008)
        return
        
    await manager.connect(ws, user_id)
    try:
        while True:
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        manager.disconnect(ws, user_id)
