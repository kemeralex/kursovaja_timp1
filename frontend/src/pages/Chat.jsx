import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, WS_BASE, authHeaders, fileUrl } from "../api/config";
import { apiFetch } from "../api/fetch";
import {
  loadMessages,
  saveMessages,
  queueMessage,
  loadQueue,
  removeFromQueue,
  updateChatPreview,
  clearMessages,
  removeChatFromList,
} from "../utils/offlineStore";
import { clearChatNotification } from "../utils/notifications";
import { roleLabel, roleColor, statusEmoji, statusLabel, messageStatusIcon } from "../utils/roles";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".txt", ".zip", ".xlsx"];

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [chatName, setChatName] = useState("");
  const [chatType, setChatType] = useState("group");
  const [input, setInput] = useState("");
  const [members, setMembers] = useState([]);
  const [newUser, setNewUser] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [leftAt, setLeftAt] = useState(null);
  const [me, setMe] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pollTimerRef = useRef(null);
  const apiOnlineRef = useRef(false);
  const wsFailCountRef = useRef(0);
  const intentionalWsCloseRef = useRef(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const MAX_TEXTAREA_HEIGHT = 132;

  const getAvatar = (name) => (name ? name[0].toUpperCase() : "?");

  const getColor = (name) => {
    const colors = ["#66bb6a", "#81c784", "#a5d6a7", "#4db6ac"];
    return colors[(name?.length || 0) % colors.length];
  };

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  const formatTime = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const mergeMessages = useCallback((serverMessages) => {
    const cached = loadMessages(id);
    const pending = loadQueue().filter((m) => m.chat_id === Number(id));
    const map = new Map();

    [...cached, ...serverMessages, ...pending].forEach((m) => {
      const key = m.id || `${m.text}-${m.created_at}`;
      map.set(key, m);
    });

    return Array.from(map.values()).sort((a, b) => {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
  }, [id]);

  const markChatRead = useCallback((messageId) => {
    const body = messageId ? JSON.stringify({ message_id: messageId }) : "{}";
    fetch(`${API_BASE}/chats/${id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body,
    }).catch(() => {});
  }, [id]);

  const markAsRead = useCallback((messageIds) => {
    if (!messageIds.length) return;

    setMessages((prev) =>
      prev.map((m) => (messageIds.includes(m.id) ? { ...m, status: "read" } : m))
    );

    const lastId = Math.max(...messageIds);
    markChatRead(lastId);
    clearChatNotification(id);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "read", message_ids: messageIds }));
    }

    fetch(`${API_BASE}/messages/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ chat_id: Number(id), message_ids: messageIds, status: "read" }),
    }).catch(() => {});
  }, [id, markChatRead]);

  const refreshMessages = useCallback(async () => {
    try {
      const res = await apiFetch(`/messages/${id}`, {}, { retries: 0 });
      if (!res.ok) return;

      apiOnlineRef.current = true;
      setConnectionStatus("online");

      const data = await res.json();
      const merged = mergeMessages(data);
      setMessages((prev) => {
        const prevIds = new Set(prev.map((m) => m.id).filter(Boolean));
        const hasNew = merged.some((m) => m.id && !prevIds.has(m.id));
        if (hasNew || merged.length !== prev.length) {
          saveMessages(id, merged);
          return merged;
        }
        return prev;
      });
    } catch {
      if (!apiOnlineRef.current) {
        setConnectionStatus(navigator.onLine ? "connecting" : "offline");
      }
    }
  }, [id, mergeMessages]);

  const flushQueue = useCallback(async () => {
    const queue = loadQueue().filter((item) => item.chat_id === Number(id));
    for (const item of queue) {
      try {
        const res = await fetch(`${API_BASE}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ chat_id: Number(id), text: item.text }),
        });
        if (res.ok) {
          const data = await res.json();
          removeFromQueue(item.id);
          setMessages((prev) => [...prev.filter((m) => m.id !== item.id), data]);
        }
      } catch {
        break;
      }
    }
  }, [id]);

  const connectWs = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (wsFailCountRef.current >= 5) return;

    const existing = wsRef.current;
    if (
      existing
      && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (existing) {
      intentionalWsCloseRef.current = true;
      existing.close();
    }

    intentionalWsCloseRef.current = false;
    const ws = new WebSocket(`${WS_BASE}/ws/${id}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      wsFailCountRef.current = 0;
      apiOnlineRef.current = true;
      setConnectionStatus("online");
      flushQueue();
    };

    ws.onclose = () => {
      if (intentionalWsCloseRef.current) return;

      wsFailCountRef.current += 1;
      if (!apiOnlineRef.current) {
        setConnectionStatus(navigator.onLine ? "connecting" : "offline");
      }
      if (wsFailCountRef.current < 5) {
        reconnectTimer.current = setTimeout(connectWs, 10000);
      }
    };

    ws.onerror = () => {
      // ошибки прокси/сокета обрабатываем через onclose
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "typing") {
        setTypingUsers((prev) => {
          if (prev.includes(data.full_name)) return prev;
          return [...prev, data.full_name];
        });
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== data.full_name));
        }, 2000);
        return;
      }

      if (data.type === "status") {
        setOnlineUsers((prev) => ({
          ...prev,
          [data.user_id]: data.status || (data.online ? "online" : "offline"),
        }));
        return;
      }

      if (data.type === "status_update") {
        setMessages((prev) =>
          prev.map((m) => {
            if (data.message_id && m.id === data.message_id) return { ...m, status: data.status };
            if (data.message_ids?.includes(m.id)) return { ...m, status: data.status };
            return m;
          })
        );
        return;
      }

      if (data.type === "message" || data.text || data.file_url) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });

        const preview = data.preview || data.text || (data.file_name ? `📎 ${data.file_name}` : "");
        updateChatPreview(id, preview, data.created_at);

        if (data.sender_id !== me?.id && data.id) {
          ws.send(JSON.stringify({ type: "delivered", message_id: data.id }));
        }
      }
    };
  }, [id, flushQueue, me?.id]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    const cached = loadMessages(id);
    if (cached.length) setMessages(cached);

    clearChatNotification(id);

    apiFetch("/auth/me", {}, { retries: 0 }).then((r) => r.json()).then(setMe).catch(() => {});

    apiFetch(`/chats/${id}`, {}, { retries: 0 })
      .then((r) => r.json())
      .then((data) => {
        setChatName(data.name);
        setChatType(data.type || "group");
        setLeftAt(data.left_at || null);
        apiOnlineRef.current = true;
        setConnectionStatus("online");
      })
      .catch(() => {});

    refreshMessages().catch(() => setMessages(loadMessages(id)));

    apiFetch(`/chats/${id}/members`, {}, { retries: 0 })
      .then((r) => r.json())
      .then((data) => {
        setMembers(data);
        const online = {};
        data.forEach((m) => {
          online[m.id] = m.status || (m.online ? "online" : "offline");
        });
        setOnlineUsers(online);
      })
      .catch(() => {});

    connectWs();

    pollTimerRef.current = setInterval(() => {
      if (!document.hidden) refreshMessages();
    }, 4000);

    const onOnline = () => {
      wsFailCountRef.current = 0;
      connectWs();
      refreshMessages();
    };
    const onOffline = () => {
      apiOnlineRef.current = false;
      setConnectionStatus("offline");
    };
    const onVisibility = () => {
      if (!document.hidden && navigator.onLine) {
        refreshMessages();
        if (wsFailCountRef.current < 5 && wsRef.current?.readyState !== WebSocket.OPEN) {
          connectWs();
        }
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      intentionalWsCloseRef.current = true;
      wsRef.current?.close();
      clearTimeout(reconnectTimer.current);
      clearInterval(pollTimerRef.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [id, navigate, connectWs, refreshMessages]);

  useEffect(() => {
    if (!me?.id || !messages.length) return;
    const unread = messages
      .filter((m) => Number(m.sender_id ?? m.user_id) !== Number(me.id) && m.status !== "read" && m.id)
      .map((m) => m.id);
    if (unread.length) markAsRead(unread);
  }, [me, messages, markAsRead]);

  useEffect(() => {
    if (messages.length) saveMessages(id, messages);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, id]);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const sendMessage = async () => {
    if (hasLeft || !input.trim()) return;

    const text = input.trim();
    setInput("");

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", message: text }));
      updateChatPreview(id, text, new Date().toISOString());
      return;
    }

    if (apiOnlineRef.current) {
      try {
        const res = await fetch(`${API_BASE}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ chat_id: Number(id), text }),
        });
        if (res.ok) {
          const msg = await res.json();
          setMessages((prev) => [...prev, msg]);
          updateChatPreview(id, text, msg.created_at || new Date().toISOString());
          return;
        }
      } catch {
        // fall through to queue
      }
    }

    const pending = queueMessage(id, text);
    setMessages((prev) => [
      ...prev,
      { ...pending, sender_id: me?.id, full_name: me?.full_name, role: me?.role, status: "pending" },
    ]);
  };

  const handleFile = async (e) => {
    if (hasLeft) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      alert(`Тип файла не разрешён. Допустимо: ${ALLOWED_EXT.join(", ")}`);
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert("Файл слишком большой (максимум 10 МБ)");
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "Ошибка загрузки");
        return;
      }

      const data = await res.json();

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "message",
          message: input.trim(),
          file_url: data.url,
          file_name: data.file_name,
        }));
        updateChatPreview(id, input.trim() || `📎 ${data.file_name}`, new Date().toISOString());
      } else {
        await fetch(`${API_BASE}/messages/file`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            chat_id: Number(id),
            text: input.trim(),
            file_url: data.url,
            file_name: data.file_name,
          }),
        }).then((r) => r.json()).then((msg) => setMessages((prev) => [...prev, msg]));
      }
      setInput("");
    } catch {
      alert("Не удалось отправить файл");
    }

    e.target.value = "";
  };

  const addMember = async () => {
    if (!newUser.trim()) return;

    const res = await fetch(`${API_BASE}/chats/${id}/add-by-username`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ username: newUser.trim() }),
    });

    if (res.ok) {
      const updated = await fetch(`${API_BASE}/chats/${id}/members`, { headers: authHeaders() });
      setMembers(await updated.json());
      setNewUser("");
    } else {
      const err = await res.json();
      alert(err.detail || "Ошибка добавления");
    }
  };

  const toggleAdmin = async (member) => {
    const isAdmin = member.chat_role === "admin";
    await fetch(`${API_BASE}/chats/${id}/members/${member.id}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ is_admin: !isAdmin }),
    });
    const updated = await fetch(`${API_BASE}/chats/${id}/members`, { headers: authHeaders() });
    setMembers(await updated.json());
  };

  const removeMember = async (memberId) => {
    await fetch(`${API_BASE}/chats/${id}/members/${memberId}`, { method: "DELETE", headers: authHeaders() });
    const updated = await fetch(`${API_BASE}/chats/${id}/members`, { headers: authHeaders() });
    setMembers(await updated.json());
  };

  const deleteMessageForMe = async (messageId) => {
    if (!messageId || !window.confirm("Удалить это сообщение только у вас?")) return;

    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (res.ok) {
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== messageId);
        saveMessages(id, next);
        return next;
      });
    } else {
      const err = await res.json();
      alert(err.detail || "Не удалось удалить сообщение");
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Очистить всю историю сообщений только у вас?")) return;

    const res = await fetch(`${API_BASE}/messages/chat/${id}/history`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (res.ok) {
      setMessages([]);
      clearMessages(id);
      setShowChatMenu(false);
    } else {
      const err = await res.json();
      alert(err.detail || "Не удалось очистить историю");
    }
  };

  const leaveChat = async () => {
    if (!window.confirm("Выйти из беседы? Она останется в списке, но вы не сможете писать.")) return;

    const res = await fetch(`${API_BASE}/chats/${id}/leave`, {
      method: "POST",
      headers: authHeaders(),
    });

    if (res.ok) {
      setLeftAt(new Date().toISOString());
      setShowChatMenu(false);
    } else {
      const err = await res.json();
      alert(err.detail || "Не удалось выйти из беседы");
    }
  };

  const hideChat = async () => {
    if (!window.confirm("Удалить беседу из вашего списка?")) return;

    const res = await fetch(`${API_BASE}/chats/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (res.ok) {
      removeChatFromList(id);
      navigate("/chats");
    } else {
      const err = await res.json();
      alert(err.detail || "Не удалось удалить беседу");
    }
  };

  const myMembership = members.find((m) => m.id === me?.id);
  const isChatAdmin = myMembership?.chat_role === "admin";
  const isGroup = chatType !== "private";
  const hasLeft = Boolean(leftAt);

  const connectionText =
    connectionStatus === "online"
      ? "в сети"
      : connectionStatus === "connecting"
        ? "подключение..."
        : "автономный режим";

  const connectionClass =
    connectionStatus === "online"
      ? "kmb-chat-status-online"
      : connectionStatus === "connecting"
        ? "kmb-chat-status-connecting"
        : "kmb-chat-status-offline";

  return (
    <div className="kmb-chat-layout">
      <div className="kmb-chat-header">
        <button className="kmb-chat-back" onClick={() => navigate("/chats")} aria-label="Назад">
          ←
        </button>
        <div className="kmb-chat-header-center">
          <div className="kmb-chat-header-avatar" style={{ background: getColor(chatName) }}>
            {getAvatar(chatName)}
          </div>
          <div>
            <div className="kmb-chat-header-name">{chatName}</div>
            <div className={`kmb-chat-header-status ${connectionClass}`}>{connectionText}</div>
          </div>
        </div>
        <button className="kmb-chat-members-btn" onClick={() => setShowChatMenu(true)} aria-label="Меню беседы">
          ⋮
        </button>
      </div>

      {hasLeft && (
        <div className="kmb-chat-left-banner">
          Вы вышли из этой беседы. Новые сообщения отправлять нельзя.
        </div>
      )}

      <div className="kmb-messages">
        {messages.map((m, i) => {
          const senderId = m.sender_id ?? m.user_id;
          const isMine = Number(senderId) === Number(me?.id);
          const senderName = m.full_name || m.sender_name;
          return (
            <div
              key={m.id || i}
              className={`kmb-message-row ${isMine ? "kmb-message-row-mine" : "kmb-message-row-other"}`}
            >
              {!isMine && (
                <div className="kmb-message-avatar" style={{ background: getColor(senderName) }}>
                  {getAvatar(senderName)}
                </div>
              )}
              <div className={`kmb-message-bubble ${isMine ? "kmb-message-mine" : "kmb-message-other"}`}>
                {!isMine && isGroup && (
                  <div className="kmb-message-sender">
                    <span>{senderName}</span>
                    <span className="kmb-message-role" style={{ background: roleColor(m.role) }}>
                      {roleLabel(m.role)}
                    </span>
                  </div>
                )}

                {m.text && <div className="kmb-message-text">{m.text}</div>}

                {m.file_url && (
                  <a className="kmb-message-file" href={fileUrl(m.file_url)} target="_blank" rel="noreferrer">
                    📎 {m.file_name || "Файл"}
                  </a>
                )}

                <div className="kmb-message-meta">
                  {m.created_at && <span className="kmb-message-time">{formatTime(m.created_at)}</span>}
                  {isMine && <span className="kmb-message-status">{messageStatusIcon(m.status)}</span>}
                  {m.id && (
                    <button
                      type="button"
                      className="kmb-message-delete"
                      title="Удалить у себя"
                      onClick={() => deleteMessageForMe(m.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className="kmb-typing-indicator">
          <span className="kmb-typing-dots"><span /><span /><span /></span>
          {typingUsers.join(", ")} печатает...
        </div>
      )}

      <div className={`kmb-composer ${hasLeft ? "kmb-composer-disabled" : ""}`}>
        {hasLeft ? (
          <div className="kmb-composer-disabled-text">Вы вышли из беседы</div>
        ) : (
        <>
        <div className="kmb-file-hint">
          pdf, doc, png, jpg, txt, zip — до 10 МБ
        </div>
        <div className="kmb-composer-row">
          <input type="file" ref={fileInputRef} onChange={handleFile} hidden />
          <button
            className="kmb-composer-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Прикрепить файл"
            type="button"
          >
            📎
          </button>

          <div className="kmb-composer-field">
            <textarea
              ref={textareaRef}
              className="kmb-composer-input"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (connectionStatus === "online") {
                  wsRef.current?.send(JSON.stringify({ type: "typing" }));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Напишите сообщение..."
            />
          </div>

          <button
            className={`kmb-composer-send ${input.trim() ? "kmb-composer-send-active" : ""}`}
            onClick={sendMessage}
            type="button"
            aria-label="Отправить"
          >
            ➤
          </button>
        </div>
        </>
        )}
      </div>

      {showChatMenu && (
        <div className="kmb-modal-overlay" onClick={() => setShowChatMenu(false)}>
          <div className="kmb-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h3>Беседа</h3>
            <button className="kmb-btn kmb-btn-secondary kmb-btn-full" onClick={() => { setShowChatMenu(false); setShowMembers(true); }}>
              👥 Участники
            </button>
            <button className="kmb-btn kmb-btn-secondary kmb-btn-full" onClick={clearHistory}>
              🗑 Очистить историю (только у меня)
            </button>
            {isGroup && !hasLeft && (
              <button className="kmb-btn kmb-btn-secondary kmb-btn-full" onClick={leaveChat}>
                🚪 Выйти из беседы
              </button>
            )}
            <button className="kmb-btn kmb-btn-danger kmb-btn-full" onClick={hideChat}>
              ✕ Удалить из списка
            </button>
          </div>
        </div>
      )}

      {showMembers && (
        <div className="kmb-modal-overlay" onClick={() => setShowMembers(false)}>
          <div className="kmb-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>Участники</h3>

            {isGroup && isChatAdmin && (
              <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
                <input
                  className="kmb-input"
                  value={newUser}
                  onChange={(e) => setNewUser(e.target.value)}
                  placeholder="логин пользователя"
                  style={{ marginBottom: 0 }}
                />
                <button className="kmb-btn" onClick={addMember}>Добавить</button>
              </div>
            )}

            {members.map((m) => {
              const st = onlineUsers[m.id] || m.status || "offline";

              return (
                <div key={m.id} style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
                  <div className="kmb-avatar" style={{ width: 40, height: 40, background: getColor(m.full_name) }}>
                    {getAvatar(m.full_name)}
                  </div>

                  <div style={{ flex: 1 }}>
                    <b>{m.full_name}</b>
                    <div style={{ fontSize: 12, color: roleColor(m.role) }}>
                      {roleLabel(m.role)}
                      {isGroup && m.chat_role === "admin" && " • админ чата"}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {statusEmoji(st)} {statusLabel(st)}
                      {m.left_at && " • вышел из беседы"}
                    </div>
                  </div>

                  {isGroup && isChatAdmin && m.id !== me?.id && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button className="kmb-btn kmb-btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => toggleAdmin(m)}>
                        {m.chat_role === "admin" ? "Снять админа" : "Сделать админом"}
                      </button>
                      <button className="kmb-btn kmb-btn-danger" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => removeMember(m.id)}>
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
