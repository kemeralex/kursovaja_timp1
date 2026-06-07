from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}
        self.user_connections: dict[int, set[WebSocket]] = {}
        self.ws_meta: dict[WebSocket, tuple[int, int]] = {}

    async def connect(self, chat_id: int, websocket: WebSocket, user_id: int):
        await websocket.accept()

        if chat_id not in self.active_connections:
            self.active_connections[chat_id] = []
        self.active_connections[chat_id].append(websocket)

        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)
        self.ws_meta[websocket] = (chat_id, user_id)

    def disconnect(self, chat_id: int, websocket: WebSocket, user_id: int):
        if chat_id in self.active_connections and websocket in self.active_connections[chat_id]:
            self.active_connections[chat_id].remove(websocket)
            if not self.active_connections[chat_id]:
                del self.active_connections[chat_id]

        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

        self.ws_meta.pop(websocket, None)

    async def disconnect_user_from_chat(self, chat_id: int, user_id: int):
        to_close = [
            ws
            for ws, (cid, uid) in list(self.ws_meta.items())
            if cid == chat_id and uid == user_id
        ]
        for ws in to_close:
            try:
                await ws.close(code=1008)
            except Exception:
                pass
            self.disconnect(chat_id, ws, user_id)

    def is_user_online(self, user_id: int) -> bool:
        return bool(self.user_connections.get(user_id))

    async def broadcast(self, chat_id: int, message: dict, exclude: WebSocket | None = None):
        if chat_id not in self.active_connections:
            return

        dead_connections = []
        for connection in self.active_connections[chat_id]:
            if connection is exclude:
                continue
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)

        for connection in dead_connections:
            self.active_connections[chat_id].remove(connection)


manager = ConnectionManager()
