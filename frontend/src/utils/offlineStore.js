const CHATS_KEY = "kmb_chats";
const MESSAGES_PREFIX = "kmb_messages_";
const QUEUE_KEY = "kmb_outbox";

export function saveChats(chats) {
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
}

export function updateChatPreview(chatId, text, createdAt) {
  const chats = loadChats();
  const idx = chats.findIndex((c) => Number(c.id) === Number(chatId));
  if (idx === -1) return;

  chats[idx] = {
    ...chats[idx],
    last_message: text,
    last_message_at: createdAt || new Date().toISOString(),
  };

  chats.sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  saveChats(chats);
  return chats;
}

export function loadChats() {
  try {
    return JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveMessages(chatId, messages) {
  localStorage.setItem(`${MESSAGES_PREFIX}${chatId}`, JSON.stringify(messages));
}

export function loadMessages(chatId) {
  try {
    return JSON.parse(localStorage.getItem(`${MESSAGES_PREFIX}${chatId}`) || "[]");
  } catch {
    return [];
  }
}

export function queueMessage(chatId, text) {
  const queue = loadQueue();
  const item = {
    id: `local-${Date.now()}`,
    chat_id: Number(chatId),
    text,
    status: "pending",
    created_at: new Date().toISOString(),
    local: true,
  };
  queue.push(item);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return item;
}

export function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function removeFromQueue(localId) {
  const queue = loadQueue().filter((item) => item.id !== localId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueueForChat(chatId) {
  const queue = loadQueue().filter((item) => item.chat_id !== Number(chatId));
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearMessages(chatId) {
  localStorage.removeItem(`${MESSAGES_PREFIX}${chatId}`);
}

export function removeChatFromList(chatId) {
  const chats = loadChats().filter((c) => Number(c.id) !== Number(chatId));
  saveChats(chats);
  clearMessages(chatId);
  clearQueueForChat(chatId);
}
