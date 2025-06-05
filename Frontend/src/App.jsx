import { useEffect, useState } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import { v4 as uuid } from "uuid";

const socket = io("http://localhost:5000");
let lastApiCallTime = 0; // Timestamp to track last AI request

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// start code here");
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState("");
  const [outPut, setOutPut] = useState("");
  const [version, setVersion] = useState("*");
  const [userInput, setUserInput] = useState("");
  const [copySuccess, setCopySuccess] = useState("");

  useEffect(() => {
    socket.on("userJoined", setUsers);
    socket.on("codeUpdate", setCode);

    socket.on("cohereSuggestion", (data) => {
      console.log("Full AI suggestion received:", data); // Debugging log

      if (!data?.suggestion || data.suggestion.trim() === "") {
        alert("AI couldn't generate a valid suggestion.");
        return;
      }

      setCode((prevCode) => `${prevCode}\n\n/* AI Suggestion:\n${data.suggestion} */\n`);
    });

    socket.on("userTyping", ({ user }) => {
      if (!user) return;
      setTyping(`${user.slice(0, 8)}... is Typing`);
      setTimeout(() => setTyping(""), 2000);
    });

    socket.on("languageUpdate", setLanguage);
    socket.on("codeResponse", (response) => setOutPut(response.run.output));

    return () => {
      ["userJoined", "codeUpdate", "cohereSuggestion", "userTyping", "languageUpdate", "codeResponse"].forEach((event) =>
        socket.off(event)
      );
    };
  }, []);

  const joinRoom = () => {
    if (roomId && userName) {
      socket.emit("join", { roomId, userName });
      setJoined(true);
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setCode("// start code here");
    setLanguage("javascript");
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopySuccess("Copied!");
    setTimeout(() => setCopySuccess(""), 2000);
  };

  let typingTimeout;

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    socket.emit("codeChange", { roomId, code: newCode });
    socket.emit("typing", { roomId, userName });
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    socket.emit("languageChange", { roomId, language: newLanguage });
  };

  const runCode = () => {
    socket.emit("compileCode", { code, roomId, language, version, input: userInput });
  };

  const getAISuggestion = () => {
    if (!code.trim()) {
      alert("Cannot request AI suggestion with empty code.");
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastApiCallTime < 6000) {
      alert("Please wait a few seconds before requesting another AI suggestion.");
      return;
    }

    lastApiCallTime = currentTime; // Update timestamp
    console.log("Requesting AI suggestion with prompt:", code);

    socket.emit("getCohereSuggestion", { roomId, prompt: code });
  };


  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-form">
          <h1>Join Code Room</h1>
          <input type="text" placeholder="Room Id" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          <button onClick={() => setRoomId(uuid())}>Create ID</button>
          <input type="text" placeholder="Your Name" value={userName} onChange={(e) => setUserName(e.target.value)} />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="sidebar">
        <div className="room-info">
          <h2>Code Room: {roomId}</h2>
          <button onClick={copyRoomId} className="copy-button">Copy ID</button>
          {copySuccess && <span className="copy-success">{copySuccess}</span>}
        </div>
        <h3>Users in Room:</h3>
        <ul>{users.map((user, index) => <li key={index}>{user.slice(0, 8)}...</li>)}</ul>
        <p className="typing-indicator">{typing}</p>
        <select className="language-selector" value={language} onChange={handleLanguageChange}>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>
        <button className="leave-button" onClick={leaveRoom}>Leave Room</button>
      </div>

      <div className="editor-wrapper">
        <Editor height="60%" defaultLanguage={language} language={language} value={code} onChange={handleCodeChange} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 14 }} />
        <textarea className="input-console" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Enter input here..." />
        <button className="run-btn" onClick={runCode}>Execute</button>
        <button className="run-btn" onClick={getAISuggestion}>Get AI Suggestion</button>
        <textarea className="output-console" value={outPut} readOnly placeholder="Output will appear here ..." />
      </div>
    </div>
  );
};

export default App;