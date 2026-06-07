import { useState } from "react";
import { addUserByUsername } from "../api/chats";

export default function AddUserPanel({ chatId }) {
  const [username, setUsername] = useState("");

  const handleAdd = async () => {
    try {
      await addUserByUsername(chatId, username);
      alert("User added");
      setUsername("");
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <div>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="username"
      />

      <button onClick={handleAdd}>
        Add user
      </button>
    </div>
  );
}