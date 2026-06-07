import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../api/config";
export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("user"); // user | admin
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);
      formData.append("grant_type", "password");

      const loginMode = mode === "admin" ? "admin" : "employee";
      const res = await fetch(`${API_BASE}/auth/login?mode=${loginMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Ошибка входа");
        return;
      }

      if (!data.access_token) {
        alert("Ошибка входа");
        return;
      }

      localStorage.setItem("token", data.access_token);
      navigate("/chats");
    } catch {
      alert("Ошибка подключения к серверу. Убедитесь, что backend запущен на порту 8000");
    }
  };

  return (
    <div className="kmb-page kmb-login-page">
      <div className="kmb-card kmb-login-card">
        <h1 className="kmb-logo">KMB</h1>
        <p className="kmb-subtitle">Корпоративный мессенджер</p>

        <div className="kmb-login-tabs">
          <button
            type="button"
            className={mode === "user" ? "kmb-tab active" : "kmb-tab"}
            onClick={() => setMode("user")}
          >
            Сотрудник
          </button>
          <button
            type="button"
            className={mode === "admin" ? "kmb-tab active" : "kmb-tab"}
            onClick={() => setMode("admin")}
          >
            Администратор
          </button>
        </div>

        {mode === "admin" && (
          <p className="kmb-login-hint">Вход только для учётных записей с role = admin в базе данных</p>
        )}

        <input
          className="kmb-input"
          placeholder="Email или логин"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className="kmb-input"
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />

        <button className="kmb-btn kmb-btn-full" onClick={handleLogin}>
          {mode === "admin" ? "Войти как администратор" : "Войти"}
        </button>
      </div>
    </div>
  );
}
