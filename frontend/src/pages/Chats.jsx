import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, authHeaders } from "../api/config";
import { apiFetch, isServerReachable } from "../api/fetch";
import { loadChats, saveChats } from "../utils/offlineStore";
import {
  ensureNotificationPermission,
  clearChatNotification,
  showMessageNotification,
  updateDocumentTitle,
} from "../utils/notifications";
import { roleLabel, roleColor, statusEmoji, statusLabel } from "../utils/roles";

function sortChats(list) {
  return [...list].sort(
    (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
  );
}

export default function Chats() {
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [me, setMe] = useState(null);
  const [chatName, setChatName] = useState("");
  const [connectionStatus, setConnectionStatus] = useState(navigator.onLine ? "online" : "offline");

  const [showPassword, setShowPassword] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showDirect, setShowDirect] = useState(false);
  const [directUserId, setDirectUserId] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [regForm, setRegForm] = useState({
    email: "",
    username: "",
    full_name: "",
    password: "",
    role: "сотрудник",
  });

  const navigate = useNavigate();
  const connectionStatusRef = useRef(connectionStatus);
  const loadingChatsRef = useRef(false);
  const lastSuccessRef = useRef(0);
  const prevChatsRef = useRef([]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  const notifyNewMessages = (newChats) => {
    const prevMap = new Map(prevChatsRef.current.map((c) => [c.id, c.unread_count || 0]));

    newChats.forEach((chat) => {
      const prevUnread = prevMap.get(chat.id) || 0;
      const nextUnread = chat.unread_count || 0;

      if (nextUnread === 0) {
        clearChatNotification(chat.id);
      } else if (nextUnread > prevUnread) {
        const diff = nextUnread - prevUnread;
        showMessageNotification({
          title: chat.name,
          body: diff === 1 ? "Новое сообщение" : `${diff} новых сообщений`,
          chatId: chat.id,
        });
      }
    });

    prevChatsRef.current = newChats;
    const totalUnread = newChats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    updateDocumentTitle(totalUnread);
  };

  const getColor = (name) => {
    const colors = ["#FF6B6B", "#4ECDC4", "#FFD93D", "#6C5CE7", "#00B894", "#43a047"];
    return colors[(name?.length || 0) % colors.length];
  };

  const postStatus = async (status) => {
    try {
      await fetch(`${API_BASE}/users/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      });
    } catch {
      // ignore
    }
  };

  const loadChatsFromServer = async ({ silent = false } = {}) => {
    if (loadingChatsRef.current) return connectionStatusRef.current === "online";

    loadingChatsRef.current = true;
    try {
      const res = await apiFetch("/chats", {}, { retries: 0 });

      if (res.status === 429) {
        if (lastSuccessRef.current && Date.now() - lastSuccessRef.current < 120000) {
          setConnectionStatus("online");
        }
        return false;
      }

      if (!res.ok) {
        if (!silent && Date.now() - lastSuccessRef.current > 30000) {
          setConnectionStatus("connecting");
        }
        return false;
      }

      const data = sortChats(await res.json());
      if (!silent || prevChatsRef.current.length) {
        notifyNewMessages(data);
      } else {
        prevChatsRef.current = data;
        updateDocumentTitle(data.reduce((s, c) => s + (c.unread_count || 0), 0));
      }
      setChats(data);
      saveChats(data);
      lastSuccessRef.current = Date.now();
      setConnectionStatus("online");
      return true;
    } catch (err) {
      if (err?.message === "unauthorized") return false;

      const cached = sortChats(loadChats());
      if (cached.length) setChats(cached);

      if (Date.now() - lastSuccessRef.current < 60000) {
        setConnectionStatus("online");
      } else {
        const reachable = await isServerReachable();
        setConnectionStatus(reachable ? "connecting" : "offline");
      }
      return false;
    } finally {
      loadingChatsRef.current = false;
    }
  };

  const loadContacts = async () => {
    try {
      const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
      if (res.ok) setContacts(await res.json());
    } catch {
      setContacts([]);
    }
  };

  useEffect(() => {
    ensureNotificationPermission();

    apiFetch("/auth/me", {}, { retries: 0 })
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});

    loadChatsFromServer();
    loadContacts();
    postStatus("online");

    const onOnline = () => {
      loadChatsFromServer();
      loadContacts();
      postStatus("online");
    };
    const onOffline = () => {
      setConnectionStatus("offline");
      postStatus("offline");
    };
    const onVisibility = () => {
      postStatus(document.hidden ? "away" : "online");
      if (!document.hidden) {
        loadChatsFromServer({ silent: true });
      }
    };

    const pollTimer = setInterval(() => {
      if (!document.hidden) {
        loadChatsFromServer({ silent: true });
      }
    }, 5000);

    const recoveryTimer = setInterval(() => {
      if (connectionStatusRef.current !== "online") {
        loadChatsFromServer();
      }
    }, 45000);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(pollTimer);
      clearInterval(recoveryTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      postStatus("away");
      updateDocumentTitle(0);
    };
  }, []);

  const createChat = async () => {
    if (!chatName.trim()) return;

    const res = await fetch(`${API_BASE}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: chatName }),
    });

    if (res.ok) {
      setChatName("");
      loadChatsFromServer();
    }
  };

  const openDirectChat = async (contactId) => {
    const res = await fetch(`${API_BASE}/chats/direct/${contactId}`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      const chat = await res.json();
      setShowDirect(false);
      navigate(`/chats/${chat.id}`);
    } else {
      const err = await res.json();
      alert(err.detail || "Не удалось открыть личную беседу");
    }
  };

  const startDirectChat = () => {
    if (!directUserId) {
      alert("Выберите сотрудника");
      return;
    }
    openDirectChat(Number(directUserId));
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: authHeaders() });
    } catch {
      // ignore
    }
    localStorage.removeItem("token");
    navigate("/login");
  };

  const changePassword = async () => {
    const res = await fetch(`${API_BASE}/users/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
    if (res.ok) {
      alert("Пароль изменён");
      setShowPassword(false);
      setOldPassword("");
      setNewPassword("");
    } else {
      const err = await res.json();
      alert(err.detail || "Ошибка");
    }
  };

  const registerUser = async () => {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(regForm),
    });
    if (res.ok) {
      alert("Пользователь зарегистрирован");
      setShowRegister(false);
      setRegForm({ email: "", username: "", full_name: "", password: "", role: "сотрудник" });
      loadContacts();
    } else {
      const err = await res.json();
      alert(err.detail || "Ошибка");
    }
  };

  const connectionText =
    connectionStatus === "online"
      ? "Подключено к серверу"
      : connectionStatus === "connecting"
        ? "Подключение..."
        : "Автономный режим";

  const connectionClass =
    connectionStatus === "online"
      ? "kmb-status-online"
      : connectionStatus === "connecting"
        ? "kmb-status-connecting"
        : "kmb-status-offline";

  const isAdmin = Boolean(me?.is_admin);
  const loginModeLabel = me?.login_mode === "admin" ? "администратор" : "сотрудник";

  return (
    <div className="kmb-page">
      <div className="kmb-header">
        <h1>KMB — Корпоративный мессенджер</h1>
        <div className="kmb-header-actions">
          <button className="kmb-btn kmb-btn-secondary" onClick={() => setShowPassword(true)}>
            Сменить пароль
          </button>
          {isAdmin && (
            <button className="kmb-btn kmb-btn-secondary" onClick={() => setShowRegister(true)}>
              Регистрация
            </button>
          )}
          <button className="kmb-btn kmb-btn-danger" onClick={logout}>
            Выйти
          </button>
        </div>
      </div>

      {me && (
        <div className="kmb-user-card">
          <div className="kmb-user-card-avatar">
            {(me.full_name || me.username || "?")[0].toUpperCase()}
          </div>
          <div className="kmb-user-card-text">
            <div className="kmb-user-card-greeting">Вы вошли как {loginModeLabel}</div>
            <div className="kmb-user-card-name">{me.full_name || me.username}</div>
            <span className="kmb-role-badge" style={{ background: roleColor(me.role) }}>
              {roleLabel(me.role)}
            </span>
          </div>
        </div>
      )}

      <div className={`kmb-status-bar ${connectionClass}`}>
        {connectionStatus === "online" ? "🟢" : connectionStatus === "connecting" ? "🟡" : "🔴"} {connectionText}
      </div>

      <div className="kmb-card">
        <h3 style={{ marginTop: 0 }}>Новая беседа</h3>
        <div className="kmb-actions-row">
          <input
            className="kmb-input"
            style={{ flex: 1, marginBottom: 0 }}
            value={chatName}
            onChange={(e) => setChatName(e.target.value)}
            placeholder="Название группового чата"
          />
          <button className="kmb-btn" onClick={createChat}>
            Групповой чат
          </button>
          <button className="kmb-btn kmb-btn-secondary" onClick={() => setShowDirect(true)}>
            Личная беседа
          </button>
        </div>
      </div>

      <h3 className="kmb-section-title">Беседы</h3>
      {chats.length === 0 && <p style={{ color: "#999" }}>Пока нет чатов</p>}
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={`kmb-list-item ${chat.unread_count ? "kmb-list-item-unread" : ""}`}
          onClick={() => navigate(`/chats/${chat.id}`)}
        >
          <div className="kmb-avatar" style={{ background: getColor(chat.name) }}>
            {chat.name[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kmb-chat-title">
              <span className={chat.unread_count ? "kmb-chat-title-unread" : ""}>{chat.name}</span>
              <span className={`kmb-chat-type-badge ${chat.type === "private" ? "kmb-chat-type-private" : ""}`}>
                {chat.type === "private" ? "личная" : "группа"}
              </span>
            </div>
            <div className={`kmb-chat-preview ${chat.last_message ? "" : "kmb-chat-preview-empty"}`}>
              {chat.left_at ? "Вы вышли из беседы" : chat.last_message || "Нет сообщений"}
            </div>
          </div>
          {chat.unread_count > 0 && (
            <span className="kmb-unread-badge" title="Непрочитанные сообщения">
              {chat.unread_count > 99 ? "99+" : chat.unread_count}
            </span>
          )}
        </div>
      ))}

      <h3 className="kmb-section-title">Контакты</h3>
      {contacts.map((contact) => (
        <div key={contact.id} className="kmb-list-item kmb-contact-row">
          <div className="kmb-avatar" style={{ background: getColor(contact.full_name || contact.username) }}>
            {(contact.full_name || contact.username || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{contact.full_name}</div>
            <div style={{ fontSize: 13, color: "#666" }}>
              @{contact.username}
              <span className="kmb-role-badge" style={{ background: roleColor(contact.role), marginLeft: 8, fontSize: 10, padding: "2px 8px" }}>
                {roleLabel(contact.role)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              {statusEmoji(contact.status)} {statusLabel(contact.status)}
            </div>
          </div>
          <button
            className="kmb-btn kmb-btn-secondary"
            style={{ fontSize: 12, padding: "6px 10px" }}
            onClick={() => openDirectChat(contact.id)}
          >
            Написать
          </button>
        </div>
      ))}

      {showDirect && (
        <div className="kmb-modal-overlay" onClick={() => setShowDirect(false)}>
          <div className="kmb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Личная беседа</h3>
            <p style={{ fontSize: 13, color: "#666" }}>Выберите сотрудника для личного чата</p>
            <select
              className="kmb-input"
              value={directUserId}
              onChange={(e) => setDirectUserId(e.target.value)}
            >
              <option value="">— выберите —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({roleLabel(c.role)})
                </option>
              ))}
            </select>
            <button className="kmb-btn kmb-btn-full" onClick={startDirectChat}>
              Открыть личную беседу
            </button>
          </div>
        </div>
      )}

      {showPassword && (
        <div className="kmb-modal-overlay" onClick={() => setShowPassword(false)}>
          <div className="kmb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Смена пароля</h3>
            <input className="kmb-input" type="password" placeholder="Текущий пароль" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
            <input className="kmb-input" type="password" placeholder="Новый пароль (мин. 6)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <button className="kmb-btn kmb-btn-full" onClick={changePassword}>Сохранить</button>
          </div>
        </div>
      )}

      {showRegister && isAdmin && (
        <div className="kmb-modal-overlay" onClick={() => setShowRegister(false)}>
          <div className="kmb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Регистрация сотрудника</h3>
            <input className="kmb-input" placeholder="Email" value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} />
            <input className="kmb-input" placeholder="Логин" value={regForm.username} onChange={(e) => setRegForm({ ...regForm, username: e.target.value })} />
            <input className="kmb-input" placeholder="ФИО" value={regForm.full_name} onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })} />
            <input className="kmb-input" type="password" placeholder="Пароль" value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} />
            <input className="kmb-input" placeholder="Роль (например: бухгалтер, сотрудник)" value={regForm.role} onChange={(e) => setRegForm({ ...regForm, role: e.target.value })} />
            <button className="kmb-btn kmb-btn-full" onClick={registerUser}>Зарегистрировать</button>
          </div>
        </div>
      )}
    </div>
  );
}
