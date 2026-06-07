import { useEffect, useState } from "react";
import { getChats } from "../api/chats";

export default function ChatList({ onSelect }) {
  const [chats, setChats] = useState([]);

  useEffect(() => {
    getChats().then(res => setChats(res.data));
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  return (
    <div style={{ width: "30%", borderRight: "1px solid gray" }}>
      <button onClick={logout}>Выйти</button>

      <hr />

      {chats.map(chat => (
  <div
    key={chat.id}
    onClick={() => onSelect(chat)}
    style={{ padding: "10px", cursor: "pointer" }}
  >
    {chat.name}
  </div>
))}
    </div>
  );
}