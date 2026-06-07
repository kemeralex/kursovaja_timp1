from app.core.config import settings

_redis = None
_status_fallback: dict[int, str] = {}


def get_redis():
    global _redis
    if _redis is not None:
        return _redis

    try:
        import redis

        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.ping()
        _redis = client
        return _redis
    except Exception:
        return None


def set_user_status(user_id: int, status: str):
    """status: online | away | offline"""
    client = get_redis()
    key = f"user:status:{user_id}"

    if client:
        if status == "offline":
            client.delete(key)
        else:
            client.setex(key, 300, status)
    else:
        if status == "offline":
            _status_fallback.pop(user_id, None)
        else:
            _status_fallback[user_id] = status


def get_user_status(user_id: int) -> str:
    client = get_redis()
    if client:
        value = client.get(f"user:status:{user_id}")
        if value:
            return value
    return _status_fallback.get(user_id, "offline")


def is_user_online(user_id: int) -> bool:
    return get_user_status(user_id) == "online"


def cache_session(token: str, user_id: int, ttl: int = 1800):
    client = get_redis()
    if client:
        client.setex(f"session:{token}", ttl, str(user_id))


def invalidate_session(token: str):
    client = get_redis()
    if client:
        client.delete(f"session:{token}")


# обратная совместимость
def set_user_online(user_id: int, online: bool = True):
    set_user_status(user_id, "online" if online else "offline")
