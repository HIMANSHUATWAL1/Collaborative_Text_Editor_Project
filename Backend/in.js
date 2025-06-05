//<------------------------------------------------------- This is not usable code ---------------------------------------------------------->
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import { CohereClientV2 } from "cohere-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialize OpenAI client with your API key from .env
const cohere = new CohereClientV2({
  token: process.env.COHERE_API_KEY,
});

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", ({ roomId, userName }) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit(
        "userJoined",
        Array.from(rooms.get(currentRoom).users)
      );
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), code: "// start code here" });
    }

   rooms.get(roomId)?.users.add(userName);
    socket.emit("codeUpdate", rooms.get(roomId)?.code);
    io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId)?.users || []));

  });

  socket.on("codeChange", ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
    }
    socket.to(roomId).emit("codeUpdate", code);
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit(
        "userJoined",
        Array.from(rooms.get(currentRoom).users)
      );
      socket.leave(currentRoom);
      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  socket.on("languageChange", ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);
  });

  socket.on(
    "compileCode",
    async ({ code, roomId, language, version, input }) => {
      if (rooms.has(roomId)) {
        try {
          const response = await axios.post(
            "https://emkc.org/api/v2/piston/execute",
            {
              language,
              version,
              files: [{ content: code }],
              stdin: input,
            }
          );

          rooms.get(roomId).output = response.data.run.output;
          io.to(roomId).emit("codeResponse", response.data);
        } catch (err) {
          console.error("Code compilation error:", err.message);
          socket.emit("codeResponse", { run: { output: "Error running code." } });
        }
      }
    }
  );

 // Cohere AI suggestion handler with rate limiter
  let lastApiCallTime = 0;
  socket.on("getCohereSuggestion", async ({ roomId, prompt }) => {
    console.log("Received prompt for Cohere suggestion:", prompt);

    if (!prompt || prompt.trim() === "") {
      socket.emit("cohereSuggestionError", { error: "AI request failed: Empty prompt provided." });
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastApiCallTime < 6000) {
      socket.emit("cohereSuggestionError", { error: "Rate limit exceeded. Try again in a few seconds." });
      return;
    }

    lastApiCallTime = currentTime;

    try {
      const response = await cohere.chat({
        model: "command-a-03-2025",
        messages: [
          { role: "system", content: "You are an AI coding assistant. Provide clear and functional code suggestions." },
          { role: "user", content: prompt }
        ],
      });

      console.log("Full Cohere API Response:", JSON.stringify(response, null, 2)); // Debugging log

      // Extract the AI-generated text properly
      const suggestion = response.message?.content?.[0]?.text || "AI couldn't generate a suggestion.";

      console.log("Final AI Suggestion being sent:", suggestion);
      io.to(roomId).emit("cohereSuggestion", { suggestion });

    } catch (err) {
      console.error("Cohere AI Suggestion Error:", err.message);
      socket.emit("cohereSuggestionError", { error: "Failed to fetch AI suggestion from Cohere." });
    }
  });



   socket.on("disconnect", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom)?.users.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom)?.users || []));
    }
    console.log("User Disconnected", socket.id);
  });
  
});

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
