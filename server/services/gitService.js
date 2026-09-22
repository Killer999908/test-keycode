/**
 * KEYCODE Studio — Project Version Control Service
 * =================================================
 * Real version control for user projects without requiring a git binary.
 * - Content-addressable object store (blobs, trees, commits) backed by Mongo
 * - Commit / log / branch / checkout / diff
 * - Push & pull to GitHub via REST API (user-supplied PAT, encrypted at rest)
 *
 * All storage is per-user. Objects are deduplicated by SHA-256 of content.
 */
import mongoose from "mongoose";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Models ----------
const gitObjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true, required: true },
  projectId: { type: String, index: true, required: true },
  sha: { type: String, index: true },
  type: { type: String, enum: ["blob", "tree", "commit"] },
  data: mongoose.Schema.Types.Mixed, // blob: content string; tree: [{path,sha,mode}]; commit: {message, tree, parents, ts}
  createdAt: { type: Date, default: Date.now }
});
gitObjectSchema.index({ userId: 1, projectId: 1, sha: 1 }, { unique: true });
const GitObject = mongoose.models.GitObject || mongoose.model("GitObject", gitObjectSchema);

const gitRefSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true, required: true },
  projectId: { type: String, index: true, required: true },
  name: { type: String, default: "main" }, // branch or "HEAD"
  commitSha: String,
  updatedAt: { type: Date, default: Date.now }
});
gitRefSchema.index({ userId: 1, projectId: 1, name: 1 }, { unique: true });
const GitRef = mongoose.models.GitRef || mongoose.model("GitRef", gitRefSchema);

const gitRepoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true, required: true },
  projectId: { type: String, required: true },
  title: String,
  defaultBranch: { type: String, default: "main" },
  remotes: [{
    name: { type: String, default: "origin" },
    provider: { type: String, default: "github" },
    url: String,            // https://github.com/owner/repo
    owner: String,
    repo: String,
    branch: { type: String, default: "main" },
    encryptedToken: String, // enc:<aes payload>
    createdAt: { type: Date, default: Date.now },
    lastPushAt: Date,
    lastPullAt: Date
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
gitRepoSchema.index({ userId: 1, projectId: 1 }, { unique: true });
const GitRepo = mongoose.models.GitRepo || mongoose.model("GitRepo", gitRepoSchema);

// ---------- Crypto helpers (same envelope as server.js encryptField) ----------
function getEncryptionKey() {
  let key = process.env.ENCRYPTION_KEY || process.env.PROJECT_ENCRYPTION_KEY || "";
  if (!key || key.length < 32) key = crypto.randomBytes(32).toString("hex");
  return key;
}
export function encryptSecret(plaintext) {
  const key = Buffer.from(getEncryptionKey().slice(0, 32), "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(String(plaintext), "utf8", "hex");
  enc += cipher.final("hex");
  return "enc:v2:" + iv.toString("hex") + ":" + enc + ":" + cipher.getAuthTag().toString("hex");
}
export function decryptSecret(payload) {
  if (!payload || typeof payload !== "string") return "";
  if (!payload.startsWith("enc:v2:")) return payload; // legacy/plain
  try {
    const [, , ivHex, encHex, tagHex] = payload.split(":");
    const key = Buffer.from(getEncryptionKey().slice(0, 32), "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let dec = decipher.update(encHex, "hex", "utf8");
    dec += decipher.final("utf8");
    return dec;
  } catch {
    return "";
  }
}

// ---------- Object store ----------
export async function putObject(userId, projectId, type, data) {
  const json = JSON.stringify({ type, data });
  const sha = crypto.createHash("sha256").update(json).digest("hex");
  await GitObject.updateOne(
    { userId, projectId, sha },
    { $setOnInsert: { type, data } },
    { upsert: true }
  );
  return sha;
}

export async function getObject(userId, projectId, sha) {
  const o = await GitObject.findOne({ userId, projectId, sha }).lean();
  return o ? { sha: o.sha, type: o.type, data: o.data } : null;
}

// ---------- Core operations ----------
/** Store a snapshot of working files as a commit. files: { "path": "content" } */
export async function commit(userId, projectId, files, message, author = "user", opts = {}) {
  if (!files || typeof files !== "object") throw new Error("files object required");
  const entries = Object.entries(files);
  if (!entries.length) throw new Error("nothing to commit");

  const tree = [];
  for (const [p, content] of entries) {
    const safe = String(p).replace(/\\/g, "/").replace(/\.\.+/g, ".").replace(/^\/+/, "");
    if (!safe) continue;
    const blobSha = await putObject(userId, projectId, "blob", String(content));
    tree.push({ path: safe, sha: blobSha, mode: "100644", size: String(content).length });
  }
  tree.sort((a, b) => a.path.localeCompare(b.path));
  const treeSha = await putObject(userId, projectId, "tree", tree);

  const ref = await GitRef.findOne({ userId, projectId, name: "HEAD" });
  const parentSha = ref ? ref.commitSha : null;

  const commitData = {
    message: String(message || "Update").slice(0, 500),
    tree: treeSha,
    parents: parentSha ? [parentSha] : [],
    author,
    timestamp: new Date().toISOString()
  };
  const commitSha = await putObject(userId, projectId, "commit", commitData);

  await GitRef.updateOne(
    { userId, projectId, name: "HEAD" },
    { $set: { commitSha, updatedAt: new Date() } },
    { upsert: true }
  );

  // Track repo meta
  await GitRepo.updateOne(
    { userId, projectId },
    { $set: { updatedAt: new Date() }, $setOnInsert: { title: opts.title || projectId, defaultBranch: "main" } },
    { upsert: true }
  );

  return { commitSha, treeSha, parent: parentSha, message: commitData.message, files: tree.length };
}

/** History (newest first) */
export async function log(userId, projectId, limit = 30) {
  const commits = [];
  let ref = await GitRef.findOne({ userId, projectId, name: "HEAD" }).lean();
  let sha = ref ? ref.commitSha : null;
  let hops = 0;
  while (sha && hops < Math.min(limit, 100)) {
    const c = await getObject(userId, projectId, sha);
    if (!c || c.type !== "commit") break;
    commits.push({ sha: c.sha.slice(0, 12), fullSha: c.sha, message: c.data.message, author: c.data.author, timestamp: c.data.timestamp, parents: c.data.parents });
    sha = c.data.parents?.[0] || null;
    hops++;
  }
  return commits;
}

/** Checkout: reconstruct full file map at a commit */
export async function checkout(userId, projectId, commitSha) {
  const c = commitSha ? await getObject(userId, projectId, commitSha) : null;
  const sha = c ? c.sha : (await GitRef.findOne({ userId, projectId, name: "HEAD" }))?.commitSha;
  if (!sha) return null;
  const commitObj = await getObject(userId, projectId, sha);
  if (!commitObj || commitObj.type !== "commit") return null;
  const treeObj = await getObject(userId, projectId, commitObj.data.tree);
  if (!treeObj || treeObj.type !== "tree") return null;
  const files = {};
  for (const entry of treeObj.data) {
    const blob = await getObject(userId, projectId, entry.sha);
    if (blob) files[entry.path] = blob.data;
  }
  return { commit: { sha: commitObj.sha.slice(0, 12), fullSha: commitObj.sha, message: commitObj.data.message, timestamp: commitObj.data.timestamp }, files };
}

/** Diff summary between HEAD and a proposed file map */
export async function diffStats(userId, projectId, files) {
  const head = await checkout(userId, projectId, null);
  const old = head ? head.files : {};
  const added = [], modified = [], removed = [];
  const paths = new Set([...Object.keys(old), ...Object.keys(files)]);
  for (const p of paths) {
    if (!(p in old)) added.push(p);
    else if (!(p in files)) removed.push(p);
    else if (old[p] !== files[p]) modified.push(p);
  }
  return { added, modified, removed };
}

// ---------- GitHub remote (REST API — no binary git needed) ----------
const GH_API = "https://api.github.com";

async function ghFetch(token, url, opts = {}) {
  const resp = await fetch(url.startsWith("http") ? url : GH_API + url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "KEYCODE-Studio",
      ...(opts.headers || {})
    }
  });
  const text = await resp.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  return { ok: resp.ok, status: resp.status, json, headers: resp.headers };
}

/** Verify a GitHub PAT and return login info */
export async function verifyGithubToken(token) {
  const r = await ghFetch(token, "/user");
  if (!r.ok) return { ok: false, error: r.status === 401 ? "Invalid GitHub token" : `GitHub error ${r.status}` };
  return { ok: true, login: r.json.login, name: r.json.name };
}

/** List user's GitHub repos (for picker UI) */
export async function listGithubRepos(token) {
  const r = await ghFetch(token, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator");
  if (!r.ok) return { ok: false, error: `GitHub error ${r.status}` };
  return {
    ok: true,
    repos: r.json.map(x => ({
      fullName: x.full_name, name: x.name, private: x.private,
      defaultBranch: x.default_branch || "main",
      url: x.html_url, permissions: x.permissions
    }))
  };
}

export async function addRemote(userId, projectId, { provider = "github", url, token, branch = "main" }) {
  const m = String(url || "").match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (provider === "github" && !m) return { ok: false, error: "Invalid GitHub URL" };
  if (token) {
    const v = await verifyGithubToken(token);
    if (!v.ok) return v;
  }
  const owner = m ? m[1] : "";
  const repo = m ? m[2] : "";
  const remote = {
    name: "origin", provider, url: m ? m[0] : url, owner, repo, branch,
    encryptedToken: token ? encryptSecret(token) : ""
  };
  await GitRepo.updateOne(
    { userId, projectId },
    { $set: { updatedAt: new Date() }, $push: { remotes: remote } },
    { upsert: true }
  );
  return { ok: true, remote: { ...remote, encryptedToken: undefined, hasToken: !!token } };
}

function getRemote(repo, name = "origin") {
  return (repo.remotes || []).find(r => r.name === name) || repo.remotes?.[0];
}

/** Push working tree as a single commit to GitHub (creates repo file tree via API) */
export async function push(userId, projectId, { message } = {}) {
  const repo = await GitRepo.findOne({ userId, projectId });
  if (!repo) return { ok: false, error: "No remote configured — connect a GitHub repo first" };
  const remote = getRemote(repo);
  if (!remote || !remote.encryptedToken) return { ok: false, error: "Remote has no token — reconnect with a valid GitHub token" };
  const token = decryptSecret(remote.encryptedToken);
  if (!token) return { ok: false, error: "Stored token could not be decrypted" };

  const head = await checkout(userId, projectId, null);
  if (!head) return { ok: false, error: "Nothing to push — make a commit first" };

  const branch = remote.branch || repo.defaultBranch || "main";
  const owner = remote.owner, repoName = remote.repo;
  if (!owner || !repoName) return { ok: false, error: "Remote URL missing owner/repo" };

  // 1. Ensure repo exists (auto-create if missing & token has scope)
  let repoInfo = await ghFetch(token, `/repos/${owner}/${repoName}`);
  if (!repoInfo.ok) {
    const created = await ghFetch(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name: repoName, private: false, auto_init: false, description: `Created via KEYCODE Studio — ${repo.title || projectId}` })
    });
    if (!created.ok) return { ok: false, error: `Could not create repo: ${created.json.message || created.status}` };
    repoInfo = created;
  }

  // 2. Get current branch head on remote
  const refResp = await ghFetch(token, `/repos/${owner}/${repoName}/git/ref/heads/${branch}`);
  let baseCommitSha = null;
  if (refResp.ok) baseCommitSha = refResp.json.object?.sha || null;

  // 3. Get base commit tree
  let baseTreeSha = null;
  if (baseCommitSha) {
    const c = await ghFetch(token, `/repos/${owner}/${repoName}/git/commits/${baseCommitSha}`);
    if (c.ok) baseTreeSha = c.json.tree?.sha || null;
  }

  // 4. Upload blobs
  const treeItems = [];
  for (const [p, content] of Object.entries(head.files)) {
    const b = await ghFetch(token, `/repos/${owner}/${repoName}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: String(content), encoding: "utf-8" })
    });
    if (!b.ok) return { ok: false, error: `Blob upload failed for ${p}: ${b.json.message || b.status}` };
    treeItems.push({ path: p, mode: "100644", type: "blob", sha: b.json.sha });
  }
  if (!treeItems.length) return { ok: false, error: "No files to push" };

  // 5. Create tree
  const treeResp = await ghFetch(token, `/repos/${owner}/${repoName}/git/trees`, {
    method: "POST",
    body: JSON.stringify(baseTreeSha ? { base_tree: baseTreeSha, tree: treeItems } : { tree: treeItems })
  });
  if (!treeResp.ok) return { ok: false, error: `Tree creation failed: ${treeResp.json.message || treeResp.status}` };

  // 6. Create commit
  const commitResp = await ghFetch(token, `/repos/${owner}/${repoName}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: message || `Sync from KEYCODE Studio — ${new Date().toISOString()}`,
      tree: treeResp.json.sha,
      parents: baseCommitSha ? [baseCommitSha] : []
    })
  });
  if (!commitResp.ok) return { ok: false, error: `Commit failed: ${commitResp.json.message || commitResp.status}` };

  // 7. Update branch ref (fast-forward)
  if (baseCommitSha) {
    const upd = await ghFetch(token, `/repos/${owner}/${repoName}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitResp.json.sha, force: false })
    });
    if (!upd.ok && upd.status === 422) {
      // Non fast-forward — force only if branch had diverged; safer: report conflict
      return { ok: false, error: "Remote branch diverged — pull before pushing", conflict: true };
    }
    if (!upd.ok) return { ok: false, error: `Ref update failed: ${upd.json.message || upd.status}` };
  } else {
    const create = await ghFetch(token, `/repos/${owner}/${repoName}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitResp.json.sha })
    });
    if (!create.ok) return { ok: false, error: `Branch creation failed: ${create.json.message || create.status}` };
  }

  remote.lastPushAt = new Date();
  await repo.save();
  return {
    ok: true,
    commit: commitResp.json.sha,
    url: `https://github.com/${owner}/${repoName}/commit/${commitResp.json.sha}`,
    files: Object.keys(head.files).length
  };
}

/** Pull: fetch remote files into a local commit (returns files; caller merges into working copy) */
export async function pull(userId, projectId) {
  const repo = await GitRepo.findOne({ userId, projectId });
  if (!repo) return { ok: false, error: "No remote configured" };
  const remote = getRemote(repo);
  if (!remote || !remote.encryptedToken) return { ok: false, error: "Remote has no token" };
  const token = decryptSecret(remote.encryptedToken);
  const branch = remote.branch || repo.defaultBranch || "main";

  const refResp = await ghFetch(token, `/repos/${owner0(remote)}/git/ref/heads/${branch}`);
  if (!refResp.ok) return { ok: false, error: `Cannot read remote branch: ${refResp.status}` };
  const remoteHead = refResp.json.object?.sha;
  const c = await ghFetch(token, `/repos/${owner0(remote)}/git/commits/${remoteHead}`);
  if (!c.ok) return { ok: false, error: `Cannot read remote commit: ${c.status}` };
  const treeResp = await ghFetch(token, c.json.tree?.url);
  if (!treeResp.ok) return { ok: false, error: `Cannot read remote tree: ${treeResp.status}` };

  const files = {};
  const entries = (treeResp.json.tree || []).filter(t => t.type === "blob").slice(0, 200);
  for (const t of entries) {
    const raw = await fetch(t.url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw", "User-Agent": "KEYCODE-Studio" }
    });
    if (raw.ok) files[t.path] = await raw.text();
  }

  // Record as local commit so history stays linear
  const local = await commit(userId, projectId, files, `Pull from origin/${branch} (github ${remoteHead.slice(0, 7)})`, "github");
  remote.lastPullAt = new Date();
  await repo.save();

  return { ok: true, files, count: Object.keys(files).length, commit: local.commitSha.slice(0, 12), remoteHead: remoteHead.slice(0, 7) };
}

function owner0(remote) {
  return `${remote.owner}/${remote.repo}`;
}

// ---------- Workspace filesystem bridge (legacy preview dirs) ----------
const workspaceRoot = path.join(__dirname, "..", "..", "agent-workspace");

/** Import a preview/agent-workspace project folder into version control */
export async function importWorkspaceProject(userId, projectId, dirName) {
  const safe = String(dirName).replace(/[^a-zA-Z0-9_-]/g, "");
  const candidates = [
    path.join(workspaceRoot, safe),
    path.join(__dirname, "..", "..", "preview", safe),
    path.join(__dirname, "..", "..", "generated", safe)
  ];
  const dir = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isDirectory());
  if (!dir) return { ok: false, error: "Project folder not found" };
  const files = {};
  const walk = (d, prefix = "") => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.name.startsWith(".") || f.name === "node_modules") continue;
      const full = path.join(d, f.name);
      if (f.isDirectory()) walk(full, prefix + f.name + "/");
      else if (f.isFile()) {
        const stat = fs.statSync(full);
        if (stat.size <= 512 * 1024) {
          try { files[prefix + f.name] = fs.readFileSync(full, "utf8"); } catch { /* binary skip */ }
        }
      }
    }
  };
  walk(dir);
  if (!Object.keys(files).length) return { ok: false, error: "No importable text files" };
  const result = await commit(userId, projectId, files, `Import project ${dirName}`, "import");
  return { ok: true, ...result, fileCount: Object.keys(files).length };
}

/** List projects that have version control enabled for a user */
export async function listRepos(userId) {
  return GitRepo.find({ userId }).sort({ updatedAt: -1 }).limit(50).lean();
}
