import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import JSZip from "jszip";
import axios from "axios";
import cors from "cors";
import fs from "fs";

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// --- Analysis Logic ---

const EXT_MAP: Record<string, string> = {
  ".js": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript (React)",
  ".jsx": "JavaScript (React)",
  ".py": "Python",
  ".php": "PHP",
  ".java": "Java",
  ".kt": "Kotlin",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C/C++",
  ".cs": "C#",
  ".go": "Go",
  ".rs": "Rust",
  ".swift": "Swift",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sql": "SQL",
  ".rb": "Ruby",
  ".sh": "Shell",
};

const FRAMEWORK_MARKERS = [
  { file: "package.json", name: "React", search: '"react":' },
  { file: "package.json", name: "Vue", search: '"vue":' },
  { file: "package.json", name: "Angular", search: '"@angular/core":' },
  { file: "package.json", name: "Next.js", search: '"next":' },
  { file: "package.json", name: "Express", search: '"express":' },
  { file: "composer.json", name: "Laravel", search: '"laravel/framework":' },
  { file: "composer.json", name: "Symfony", search: '"symfony/symfony":' },
  { file: "requirements.txt", name: "Django", search: "Django" },
  { file: "requirements.txt", name: "Flask", search: "Flask" },
  { file: "Gemfile", name: "Rails", search: "rails" },
];

function analyzeFiles(files: { name: string; content?: string }[]) {
  const languageCounts: Record<string, number> = {};
  const frameworksFound = new Set<string>();
  let totalValidFiles = 0;

  files.forEach((file) => {
    const ext = path.extname(file.name).toLowerCase();
    if (EXT_MAP[ext]) {
      const lang = EXT_MAP[ext];
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      totalValidFiles++;
    }

    // Framework detection
    if (file.content) {
      FRAMEWORK_MARKERS.forEach((marker) => {
        if (file.name.endsWith(marker.file) && file.content?.includes(marker.search)) {
          frameworksFound.add(marker.name);
        }
      });
    }
  });

  const languagePercentages: Record<string, number> = {};
  if (totalValidFiles > 0) {
    for (const lang in languageCounts) {
      languagePercentages[lang] = Math.round((languageCounts[lang] / totalValidFiles) * 100);
    }
  }

  // Structural Originality Score (Mock Logic: Based on folder complexity and file variety)
  const uniqueLangs = Object.keys(languageCounts).length;
  const folderDepth = files.length > 0 ? Math.max(...files.map(f => f.name.split("/").length)) : 0;
  const score = totalValidFiles > 0 
    ? Math.min(100, (uniqueLangs * 10) + (folderDepth * 5) + (totalValidFiles / 20))
    : 0;

  return {
    languages: languagePercentages,
    frameworks: Array.from(frameworksFound),
    originalityScore: Math.round(score),
    fileCount: totalValidFiles
  };
}

// --- Endpoints ---

app.post("/api/analyze/zip", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const zip = await JSZip.loadAsync(req.file.buffer);
    const files: { name: string; content?: string }[] = [];

    const promises: Promise<void>[] = [];
    zip.forEach((relativePath, file) => {
      if (!file.dir) {
        promises.push(
          file.async("string").then((content) => {
            files.push({ name: relativePath, content });
          })
        );
      }
    });

    await Promise.all(promises);
    const analysis = analyzeFiles(files);
    res.json({ ...analysis, projectName: req.file.originalname, source: "zip" });
  } catch (err) {
    res.status(500).json({ error: "Failed to analyze ZIP" });
  }
});

app.post("/api/analyze/github", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    // Robust extraction of owner/repo from URL
    const urlParts = url.replace(/\/$/, "").split("/");
    const repoWithGit = urlParts.pop() || "";
    const owner = urlParts.pop() || "";
    const repo = repoWithGit.replace(/\.git$/, "");

    if (!owner || !repo) return res.status(400).json({ error: "Invalid GitHub URL format." });

    // GitHub API Headers (User-Agent is REQUIRED)
    const githubHeaders: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "PageOver-Analyzer",
    };
    if (process.env.GITHUB_TOKEN) {
      githubHeaders["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    // 1. Fetch Repo Metadata to find default branch
    let repoInfo;
    try {
      repoInfo = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, { headers: githubHeaders });
    } catch (err: any) {
      const githubMsg = err.response?.data?.message || err.message;
      console.error("GitHub Repo Info Error:", githubMsg);
      
      const isRateLimit = err.response?.status === 403 && err.response?.headers["x-ratelimit-remaining"] === "0";
      if (isRateLimit) {
        return res.status(403).json({ error: "GitHub Rate limit exceeded. Please add a GITHUB_TOKEN in Secrets." });
      }
      
      if (err.response?.status === 404) {
        return res.status(404).json({ error: `Repository '${owner}/${repo}' not found. Verify the URL is public.` });
      }

      return res.status(err.response?.status || 500).json({ error: `GitHub API Error: ${githubMsg}` });
    }

    const defaultBranch = repoInfo.data.default_branch || "main";
    const isLive = !!repoInfo.data.homepage;

    // 2. Fetch recursive tree
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
    let response;
    try {
      response = await axios.get(apiUrl, { headers: githubHeaders });
    } catch (err: any) {
      console.error("GitHub Tree Error:", err.response?.data || err.message);
      // Fallback if the tree is too large for recursive API
      if (err.response?.status === 409) {
        return res.status(409).json({ error: "Repository tree is too large for recursive scanning." });
      }
      return res.status(err.response?.status || 500).json({ error: "Failed to fetch repository structure." });
    }

    const tree = response.data.tree;
    const files = tree.filter((f: any) => f.type === "blob").map((f: any) => ({ name: f.path }));
    
    // We fetch marker files to detect frameworks.
    const markers = ["package.json", "composer.json", "requirements.txt", "Gemfile"];
    const fileWithContentPromises = tree
        .filter((f: any) => markers.some(m => f.path.endsWith(m)))
        .map(async (f: any) => {
            try {
              const contentRes = await axios.get(f.url, { headers: githubHeaders });
              const content = Buffer.from(contentRes.data.content, "base64").toString("utf-8");
              return { name: f.path, content };
            } catch (markerErr) {
              return { name: f.path, content: "" };
            }
        });

    const markerFiles = await Promise.all(fileWithContentPromises);
    const analysis = analyzeFiles([...files, ...markerFiles]);
    
    res.json({ ...analysis, projectName: repo, source: "github", isLive });
  } catch (err: any) {
    console.error("General GitHub Error:", err);
    res.status(500).json({ error: "Internal Analysis Error" });
  }
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
