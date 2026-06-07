import api from "./client";
import client from "./client";

export const getChats = async () => {
  const response = await api.get("/chats");
  return response.data;
};


export const addUserByUsername = (chatId, username) => {
    return client.post(`/chats/${chatId}/add-by-username`, {
        username
    });
};