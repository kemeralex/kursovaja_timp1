import { useEffect } from "react";
import Chat from "../components/Chat";

export default function ChatPage() {
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
    }
  }, []);

  return <Chat />;
}