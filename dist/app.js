"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
/**
 * Cleaned and fixed Express + LangChain + OpenAI server.
 */
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const openai_1 = require("@langchain/openai");
const textsplitters_1 = require("@langchain/textsplitters");
const memory_1 = require("langchain/vectorstores/memory");
const runnables_1 = require("@langchain/core/runnables");
const output_parsers_1 = require("@langchain/core/output_parsers");
const prompts_1 = require("@langchain/core/prompts");
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const RULEBOOK_FILENAME = "westin_rulebook.txt";
// ✅ Check API key
if (!process.env.OPENAI_API_KEY) {
    throw new Error("❌ OPENAI_API_KEY not set. Please set it before running.");
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// Load rulebook file
function loadRulebook(fileName) {
    const filePath = path_1.default.resolve(process.cwd(), fileName);
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`❌ Rulebook file not found: ${filePath}`);
    }
    return fs_1.default.readFileSync(filePath, "utf8");
}
// Format docs for retriever
const formatDocumentsAsString = (documents) => documents.map((d) => d.pageContent).join("\n\n");
// Cache vector store in memory
let vectorStore = null;
function ensureVectorStore() {
    return __awaiter(this, void 0, void 0, function* () {
        if (vectorStore)
            return vectorStore;
        console.log("📖 Loading rulebook and generating embeddings...");
        const rawText = loadRulebook(RULEBOOK_FILENAME);
        const textSplitter = new textsplitters_1.RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const docs = yield textSplitter.createDocuments([rawText]);
        console.log(`✅ Rulebook split into ${docs.length} chunks.`);
        const embeddings = new openai_1.OpenAIEmbeddings();
        vectorStore = yield memory_1.MemoryVectorStore.fromDocuments(docs, embeddings);
        console.log("✅ Vector store created and cached.");
        return vectorStore;
    });
}
function initializeChainAndAnswer(question) {
    return __awaiter(this, void 0, void 0, function* () {
        const vs = yield ensureVectorStore();
        const retriever = vs.asRetriever();
        // ✅ Use only `model` to avoid confusion
        const model = new openai_1.ChatOpenAI({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            temperature: 0,
        });
        const SYSTEM_TEMPLATE = `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. Do not invent answers.
----------------
{context}`;
        const prompt = prompts_1.ChatPromptTemplate.fromMessages([
            ["system", SYSTEM_TEMPLATE],
            ["human", "{question}"],
        ]);
        const chain = runnables_1.RunnableSequence.from([
            {
                context: retriever.pipe(formatDocumentsAsString),
                question: new runnables_1.RunnablePassthrough(),
            },
            prompt,
            model,
            new output_parsers_1.StringOutputParser(),
        ]);
        const result = yield chain.invoke(question);
        if (typeof result === "string")
            return result;
        if (result === null || result === void 0 ? void 0 : result.text)
            return result.text;
        return JSON.stringify(result);
    });
}
// Route: POST /api/ask
app.post("/api/ask", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { question } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        if (!question || typeof question !== "string") {
            return res
                .status(400)
                .json({ error: "❌ 'question' must be a non-empty string." });
        }
        console.log("❓ Incoming question:", question);
        const answer = yield initializeChainAndAnswer(question);
        return res.json({ answer });
    }
    catch (err) {
        console.error("❌ Error processing request:", err);
        return res
            .status(500)
            .json({ error: "Server error", details: String(err) });
    }
}));
// Health check
app.get("/", (req, res) => {
    res.send("✅ API is running. POST /api/ask with { question: \"...\" }");
});
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
//# sourceMappingURL=app.js.map