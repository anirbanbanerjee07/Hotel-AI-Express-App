// @ts-nocheck
/**
 * Cleaned and fixed Express + LangChain + OpenAI server.
 */
import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";

import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { Document } from "@langchain/core/documents";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const RULEBOOK_FILENAME = "westin_rulebook.txt";

// ✅ Check API key
if (!process.env.OPENAI_API_KEY) {
  throw new Error("❌ OPENAI_API_KEY not set. Please set it before running.");
}

const app = express();
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Load rulebook file
function loadRulebook(fileName: string): string {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`❌ Rulebook file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

// Format docs for retriever
const formatDocumentsAsString = (documents: Document[]) =>
  documents.map((d) => d.pageContent).join("\n\n");

// Cache vector store in memory
let vectorStore: MemoryVectorStore | null = null;

async function ensureVectorStore() {
  if (vectorStore) return vectorStore;

  console.log("📖 Loading rulebook and generating embeddings...");
  const rawText = loadRulebook(RULEBOOK_FILENAME);

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const docs = await textSplitter.createDocuments([rawText]);
  console.log(`✅ Rulebook split into ${docs.length} chunks.`);

  const embeddings = new OpenAIEmbeddings();
  vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

  console.log("✅ Vector store created and cached.");
  return vectorStore;
}

async function initializeChainAndAnswer(question: string) {
  const vs = await ensureVectorStore();
  const retriever = vs.asRetriever();

  // ✅ Use only `model` to avoid confusion
  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    temperature: 0,
  });

  const SYSTEM_TEMPLATE = `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. Do not invent answers.
----------------
{context}`;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_TEMPLATE],
    ["human", "{question}"],
  ]);

  const chain = RunnableSequence.from([
    {
      context: retriever.pipe(formatDocumentsAsString),
      question: new RunnablePassthrough(),
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);

  const result = await chain.invoke(question);

  if (typeof result === "string") return result;
  if (result?.text) return result.text;
  return JSON.stringify(result);
}

// Route: POST /api/ask
app.post("/api/ask", async (req, res) => {
  try {
    const { question } = req.body ?? {};
    if (!question || typeof question !== "string") {
      return res
        .status(400)
        .json({ error: "❌ 'question' must be a non-empty string." });
    }

    console.log("❓ Incoming question:", question);
    const answer = await initializeChainAndAnswer(question);

    return res.json({ answer });
  } catch (err) {
    console.error("❌ Error processing request:", err);
    return res
      .status(500)
      .json({ error: "Server error", details: String(err) });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("✅ API is running. POST /api/ask with { question: \"...\" }");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
