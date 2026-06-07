const ROLE_LABELS = {
  admin: "Администратор",
  administrator: "Администратор",
  moderator: "Модератор",
  user: "Сотрудник",
  сотрудник: "Сотрудник",
  менеджер: "Менеджер",
  директор: "Директор",
  бухгалтер: "Бухгалтер",
};

const ROLE_COLORS = {
  admin: "#6a1b9a",
  administrator: "#6a1b9a",
  moderator: "#1565c0",
  директор: "#1b5e20",
  менеджер: "#2e7d32",
  бухгалтер: "#ef6c00",
  сотрудник: "#388e3c",
  user: "#388e3c",
};

export function roleLabel(role) {
  if (!role) return "—";
  const key = role.toLowerCase();
  return ROLE_LABELS[key] || ROLE_LABELS[role] || role;
}

export function roleColor(role) {
  if (!role) return "#757575";
  const key = role.toLowerCase();
  if (ROLE_COLORS[key]) return ROLE_COLORS[key];
  if (ROLE_COLORS[role]) return ROLE_COLORS[role];

  let hash = 0;
  for (let i = 0; i < role.length; i++) {
    hash = role.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 40%)`;
}

export function isAdminRole(role) {
  return (role || "").toLowerCase() === "admin";
}

export function statusLabel(status) {
  switch (status) {
    case "online":
      return "в сети";
    case "away":
      return "нет на месте";
    default:
      return "оффлайн";
  }
}

export function statusEmoji(status) {
  switch (status) {
    case "online":
      return "🟢";
    case "away":
      return "🟡";
    default:
      return "🌙";
  }
}

export function messageStatusIcon(status) {
  switch (status) {
    case "read":
    case "delivered":
      return "✓✓";
    case "sent":
      return "✓";
    case "pending":
      return "⏳";
    default:
      return "○";
  }
}
