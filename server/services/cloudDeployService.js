import fs from 'fs';
import path from 'path';

const parentDir = path.resolve(process.cwd());
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

export const PROVIDERS = {
  vercel: {
    id: 'vercel',
    name: 'Vercel',
    icon: '▲',
    free: true,
    limits: '100K visits/mo, 100GB bandwidth',
    needsToken: !!VERCEL_TOKEN,
    urlPattern: (name) => `https://keycode-${name}.vercel.app`,
  },
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare Pages',
    icon: '☁️',
    free: true,
    limits: 'Unlimited bandwidth, 500 builds/mo',
    needsToken: !!CLOUDFLARE_API_TOKEN,
    urlPattern: (name) => `https://keycode-${name}.pages.dev`,
  },
  oracle: {
    id: 'oracle',
    name: 'Oracle Cloud',
    icon: '🟢',
    free: true,
    limits: '2 AMD VMs, 4 ARM VMs (24GB RAM), 200GB storage',
    needsToken: false,
    urlPattern: (name) => `https://${name}.keycode.oracle`,
    comingSoon: true,
  },
  render: {
    id: 'render',
    name: 'Render',
    icon: '🔄',
    free: true,
    limits: 'Static sites, 512MB RAM services',
    needsToken: false,
    urlPattern: (name) => `https://keycode-${name}.onrender.com`,
    comingSoon: true,
  },
};

export function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([_, p]) => !p.comingSoon)
    .map(([id, p]) => ({
      id,
      name: p.name,
      icon: p.icon,
      free: p.free,
      limits: p.limits,
      available: p.needsToken,
      urlExample: p.urlPattern('demo'),
    }));
}

export async function deployToProvider(projectDir, projectName, providerId) {
  const cleanName = projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().slice(0, 60);

  switch (providerId) {
    case 'vercel':
      return deployVercel(projectDir, cleanName);
    case 'cloudflare':
      return deployCloudflare(projectDir, cleanName);
    default:
      return deployStatic(projectDir, cleanName, providerId);
  }
}

// ===== VERCEL =====
async function deployVercel(projectDir, projectName) {
  const vercelProjectName = 'keycode-' + projectName;

  if (!VERCEL_TOKEN) {
    return deployStatic(projectDir, projectName, 'vercel');
  }

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
        devCommand: null,
      },
      target: 'production',
    };
    if (VERCEL_TEAM_ID) body.teamId = VERCEL_TEAM_ID;

    const res = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + VERCEL_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error('Vercel deploy failed: ' + err);
    }

    const data = await res.json();
    return {
      success: true,
      provider: 'vercel',
      providerName: 'Vercel',
      liveUrl: `https://${vercelProjectName}.vercel.app`,
      deploymentId: data.id,
      inspectorUrl: data.inspectorUrl,
    };
  } catch (e) {
    console.warn('[Vercel] API failed, fallback to static:', e.message);
    return deployStatic(projectDir, projectName, 'vercel');
  }
}

// ===== CLOUDFLARE PAGES =====
async function deployCloudflare(projectDir, projectName) {
  const cfProjectName = 'keycode-' + projectName;

  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
    return deployStatic(projectDir, projectName, 'cloudflare');
  }

  try {
    const apiBase = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`;
    const headers = {
      'Authorization': 'Bearer ' + CLOUDFLARE_API_TOKEN,
      'Content-Type': 'application/json',
    };

    // 1. Create or get project
    let projectRes = await fetch(`${apiBase}/${cfProjectName}`, { headers });
    if (projectRes.status === 404) {
      const createRes = await fetch(apiBase, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: cfProjectName,
          production_branch: 'main',
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error('Cloudflare create project failed: ' + err);
      }
      projectRes = createRes;
    }

    // 2. Create deployment with direct upload
    const formData = new FormData();
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(projectDir, entry.name);
        const content = fs.readFileSync(filePath);
        const blob = new Blob([content], { type: getMimeType(entry.name) });
        formData.append(entry.name, blob, entry.name);
      }
    }

    const deployRes = await fetch(
      `${apiBase}/${cfProjectName}/deployments`,
      { method: 'POST', headers: { 'Authorization': 'Bearer ' + CLOUDFLARE_API_TOKEN }, body: formData }
    );

    if (!deployRes.ok) {
      const err = await deployRes.text();
      throw new Error('Cloudflare deploy failed: ' + err);
    }

    const deployData = await deployRes.json();
    return {
      success: true,
      provider: 'cloudflare',
      providerName: 'Cloudflare Pages',
      liveUrl: `https://${cfProjectName}.pages.dev`,
      deploymentId: deployData.result?.id,
      inspectorUrl: `https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/pages/view/${cfProjectName}`,
    };
  } catch (e) {
    console.warn('[Cloudflare] API failed, fallback to static:', e.message);
    return deployStatic(projectDir, projectName, 'cloudflare');
  }
}

// ===== STATIC FALLBACK =====
function deployStatic(projectDir, projectName, providerId) {
  const previewDir = path.join(parentDir, 'preview', projectName);
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

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

  const providerName = (providerId && PROVIDERS[providerId]?.name) || 'KEYCODE';
  return {
    success: true,
    provider: providerId || 'static',
    providerName,
    liveUrl: `/preview/${projectName}/`,
    deploymentId: null,
  };
}

// ===== DEPLOYMENT STATUS CHECKING =====
export async function checkDeploymentStatus(provider, deploymentId, projectName) {
  const cleanName = projectName ? projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().slice(0, 60) : '';

  switch (provider) {
    case 'vercel':
      return checkVercelStatus(deploymentId);
    case 'cloudflare':
      return checkCloudflareStatus(deploymentId, cleanName);
    default:
      return { status: 'unknown', ready: false };
  }
}

async function checkVercelStatus(deploymentId) {
  if (!VERCEL_TOKEN) {
    return { status: 'unknown', ready: false, error: 'Vercel not configured' };
  }
  try {
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
      headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN },
    });
    if (!res.ok) {
      if (res.status === 404) return { status: 'not_found', ready: false };
      return { status: 'error', ready: false, error: await res.text() };
    }
    const data = await res.json();
    return {
      status: data.readyState || data.state || 'unknown',
      ready: data.readyState === 'READY',
      url: data.url || null,
      createdAt: data.createdAt,
      inspectorUrl: data.inspectorUrl,
    };
  } catch (e) {
    return { status: 'error', ready: false, error: e.message };
  }
}

async function checkCloudflareStatus(deploymentId, projectName) {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
    return { status: 'unknown', ready: false, error: 'Cloudflare not configured' };
  }
  try {
    const cfProjectName = 'keycode-' + projectName;
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${cfProjectName}/deployments/${deploymentId}`,
      { headers: { 'Authorization': 'Bearer ' + CLOUDFLARE_API_TOKEN } }
    );
    if (!res.ok) {
      if (res.status === 404) return { status: 'not_found', ready: false };
      return { status: 'error', ready: false, error: await res.text() };
    }
    const data = await res.json();
    const stage = data.result?.latest_stage?.status || 'unknown';
    return {
      status: stage,
      ready: stage === 'success',
      url: data.result?.url || null,
      createdAt: data.result?.created_on,
      inspectorUrl: `https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/pages/view/${cfProjectName}`,
    };
  } catch (e) {
    return { status: 'error', ready: false, error: e.message };
  }
}

// ===== HELPERS =====
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
        const encoding = isBinary(entry.name) ? 'base64' : 'utf8';
        files.push({
          file: filePath,
          data: encoding === 'base64' ? content.toString('base64') : content.toString('utf8'),
          encoding,
        });
      }
    }
  }
  walk(projectDir, '');
  return files;
}

function isBinary(name) {
  const ext = path.extname(name).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'].includes(ext);
}

function getMimeType(name) {
  const ext = path.extname(name).toLowerCase();
  const mimes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  return mimes[ext] || 'application/octet-stream';
}
