import fs from 'fs';
import path from 'path';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;

const parentDir = path.resolve(process.cwd());

/**
 * Deploy a project to Vercel using their REST API.
 * Falls back to local static serving if VERCEL_TOKEN is not set.
 */
export async function deployToVercel(projectDir, projectName) {
  const vercelProjectName = 'keycode-' + projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().slice(0, 60);

  if (!VERCEL_TOKEN) {
    // Fallback: serve files statically from our own Express server
    return deployStatic(projectDir, projectName);
  }

  // Vercel API: create deployment
  try {
    const files = await prepareFiles(projectDir);
    const body = {
      name: vercelProjectName,
      project: vercelProjectName,
      files,
      projectSettings: {
        framework: null,
        buildCommand: null,
        outputDirectory: '.',
        installCommand: null,
        devCommand: null
      },
      target: 'production'
    };

    if (TEAM_ID) body.teamId = TEAM_ID;

    const res = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + VERCEL_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error('Vercel deploy failed: ' + err);
    }

    const data = await res.json();
    return {
      success: true,
      provider: 'vercel',
      liveUrl: `https://${vercelProjectName}.vercel.app`,
      deploymentId: data.id,
      projectId: data.projectId,
      inspectorUrl: data.inspectorUrl
    };
  } catch (e) {
    console.warn('[Vercel] API deploy failed, falling back to static:', e.message);
    return deployStatic(projectDir, projectName);
  }
}

/**
 * Local static serving fallback
 */
function deployStatic(projectDir, projectName) {
  const previewDir = path.join(parentDir, 'preview', projectName);
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

  // Copy project files to preview directory
  if (fs.existsSync(projectDir)) {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const src = path.join(projectDir, entry.name);
        const dst = path.join(previewDir, entry.name);
        fs.copyFileSync(src, dst);
      }
    }
  }

  return {
    success: true,
    provider: 'static',
    liveUrl: `/preview/${projectName}/`,
    deploymentId: null,
    projectId: null
  };
}

/**
 * Prepare files for Vercel API deployment
 */
async function prepareFiles(projectDir) {
  const files = [];

  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const filePath = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, filePath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath);
        const encoding = isBinaryFile(entry.name) ? 'base64' : 'utf8';
        files.push({
          file: filePath,
          data: encoding === 'base64' ? content.toString('base64') : content.toString('utf8'),
          encoding
        });
      }
    }
  }

  walk(projectDir, '');
  return files;
}

function isBinaryFile(name) {
  const ext = path.extname(name).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'].includes(ext);
}
