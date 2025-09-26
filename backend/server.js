// server.js (or app.js)
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors()); // Add this line
app.use(express.json());

// Example route
app.post("/api/ask", (req, res) => {
  const { question } = req.body;
  res.json({ answer: "This is a test answer for: " + question });
});

app.listen(3000, () => console.log("Server running on port 3000"));
