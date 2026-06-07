import api from "./client";

export const getMessages = (chatId) =>
  api.get(`/messages/${chatId}`);