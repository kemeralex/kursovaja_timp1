import { useState } from "react";

export default function MessageInput({ ws }) {
  const [text, setText] = useState("");

  const send = () => {
    if (!text) return;
    ws.send(JSON.stringify({ content: text }));
    setText("");
  };

  return (
    <div>
      <input value={text}
        onChange={e => setText(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  );
}