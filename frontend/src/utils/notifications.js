let permissionRequested = false;
const activeNotifications = new Map();

export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (permissionRequested) return false;

  permissionRequested = true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function clearChatNotification(chatId) {
  const key = String(chatId);
  const existing = activeNotifications.get(key);
  if (existing) {
    existing.close();
    activeNotifications.delete(key);
  }
}

export function clearAllNotifications() {
  activeNotifications.forEach((n) => n.close());
  activeNotifications.clear();
}

export function showMessageNotification({ title, body, chatId }) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && window.location.pathname === `/chats/${chatId}`) {
    return;
  }

  clearChatNotification(chatId);

  const notification = new Notification(title, {
    body,
    tag: `kmb-chat-${chatId}`,
    renotify: true,
  });

  activeNotifications.set(String(chatId), notification);

  notification.onclose = () => {
    activeNotifications.delete(String(chatId));
  };

  notification.onclick = () => {
    window.focus();
    window.location.assign(`/chats/${chatId}`);
    clearChatNotification(chatId);
  };

  setTimeout(() => clearChatNotification(chatId), 8000);
}

export function updateDocumentTitle(unreadTotal) {
  const base = "KMB";
  document.title = unreadTotal > 0 ? `(${unreadTotal}) ${base}` : base;
}
