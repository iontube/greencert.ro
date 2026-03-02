import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const ARTICLES_PER_RUN = parseInt(process.env.ARTICLES_PER_RUN || '1');

// Full paths for cron compatibility
const NODE_PATH = process.execPath;
const NODE_BIN_DIR = path.dirname(NODE_PATH);
const NPM_PATH = path.join(NODE_BIN_DIR, 'npm');
const NPX_PATH = path.join(NODE_BIN_DIR, 'npx');

// Load .env manually (cron doesn't have it)
function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  } catch (e) {}
}

loadEnv();

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  const logPath = path.join(process.cwd(), 'generation.log');
  fs.appendFileSync(logPath, logMessage + '\n');
}

function runCommand(command, args, cwd) {
  let actualCommand = command;
  if (command === 'node') actualCommand = NODE_PATH;
  else if (command === 'npm') actualCommand = NPM_PATH;
  else if (command === 'npx') actualCommand = NPX_PATH;

  return new Promise((resolve, reject) => {
    const proc = spawn(actualCommand, args, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: `${NODE_BIN_DIR}:${process.env.PATH || ''}`
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
    proc.on('error', reject);
  });
}

// Check if enough time has passed since last article (minimum 2 days)
function shouldRunToday(keywordsPath) {
  try {
    const keywordsData = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));
    const completed = keywordsData.completed || [];
    if (completed.length === 0) return true;

    // Find the most recent article date
    let lastDate = null;
    for (const item of completed) {
      const d = item.date || item.pubDate;
      if (d) {
        const parsed = new Date(d);
        if (!lastDate || parsed > lastDate) lastDate = parsed;
      }
    }

    if (!lastDate) return true;

    const daysSinceLast = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    // Randomize: skip if today, 50% chance if 1 day ago, always run if 2+ days
    if (daysSinceLast < 1) return false;
    // Post every day, skip only if already posted today
    return true;
  } catch (e) {
    return true; // If can't read, run anyway
  }
}

// Generate stats.json with article count for the panou sync
function generateStats() {
  const pagesDir = path.join(process.cwd(), 'src', 'pages');
  const publicDir = path.join(process.cwd(), 'public');
  const excludePages = new Set(['index', 'contact', 'cookies', 'privacy-policy', 'privacy', 'gdpr', 'sitemap', '404', 'about', 'terms']);

  const files = fs.readdirSync(pagesDir);
  const articles = files.filter(f => {
    if (!f.endsWith('.astro')) return false;
    const name = f.replace('.astro', '');
    if (name.startsWith('[')) return false;
    if (excludePages.has(name)) return false;
    return true;
  });

  const stats = { articlesCount: articles.length, lastUpdated: new Date().toISOString() };
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'stats.json'), JSON.stringify(stats, null, 2));
  log(`Stats generated: ${articles.length} articles`);
}

async function main() {
  log('='.repeat(60));
  log('AUTO-GENERATE STARTED - greencert.ro');
  log('='.repeat(60));

  // Check if we should run today (minimum 2 days since last article)
  if (!shouldRunToday(path.join(process.cwd(), 'keywords.json'))) {
    log('Last article was less than 2 days ago. Skipping.');
    return;
  }

  // Random delay 0-45 minutes to avoid patterns
  const delayMs = Math.floor(Math.random() * 20 * 60 * 1000);
  const delayMin = Math.round(delayMs / 60000);
  log(`Random delay: ${delayMin} minutes`);
  await new Promise(r => setTimeout(r, delayMs));

  const keywordsPath = path.join(process.cwd(), 'keywords.json');

  if (!fs.existsSync(keywordsPath)) {
    log('ERROR: keywords.json not found');
    return;
  }

  const keywordsData = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));
  const pending = keywordsData.pending || [];

  log(`Pending keywords: ${pending.length}`);

  if (pending.length === 0) {
    log('No pending keywords. Consider removing the cron job.');
    return;
  }

  // Get unique categories with pending articles
  const categoriesWithPending = [...new Set(pending.map(k => k.categorySlug))];

  // Select articles using round-robin by category
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const selectedArticles = [];

  for (let i = 0; i < ARTICLES_PER_RUN && pending.length > selectedArticles.length; i++) {
    const categoryIndex = (dayOfYear + i) % categoriesWithPending.length;
    const targetCategory = categoriesWithPending[categoryIndex];

    const availableInCategory = pending.filter(
      k => k.categorySlug === targetCategory && !selectedArticles.find(s => s.keyword === k.keyword)
    );

    if (availableInCategory.length > 0) {
      selectedArticles.push(availableInCategory[0]);
    } else {
      const anyAvailable = pending.find(k => !selectedArticles.find(s => s.keyword === k.keyword));
      if (anyAvailable) selectedArticles.push(anyAvailable);
    }
  }

  if (selectedArticles.length === 0) {
    log('No articles selected. Exiting.');
    return;
  }

  log(`Selected: ${selectedArticles.map(a => `${a.keyword} (${a.category})`).join(', ')}`);

  // Create temp file for generate-batch
  const tempPath = path.join(process.cwd(), 'temp-articles.json');
  fs.writeFileSync(tempPath, JSON.stringify(selectedArticles, null, 2));

  // Run generate-batch
  try {
    log('Running generate-batch.js...');
    await runCommand('node', ['scripts/generate-batch.js'], process.cwd());
    log('Articles generated successfully');
  } catch (error) {
    log(`ERROR generating articles: ${error.message}`);
    return;
  }

  // Read successful keywords
  const successPath = path.join(process.cwd(), 'successful-keywords.json');
  if (!fs.existsSync(successPath)) {
    log('No successful keywords file found');
    return;
  }

  const successful = JSON.parse(fs.readFileSync(successPath, 'utf-8'));

  if (successful.length === 0) {
    log('No articles generated successfully. Skipping build and deploy.');
    try { fs.unlinkSync(tempPath); } catch (e) {}
    try { fs.unlinkSync(successPath); } catch (e) {}
    return;
  }

  // Update keywords.json
  const newPending = pending.filter(
    p => !successful.find(s => s.keyword === p.keyword)
  );

  keywordsData.pending = newPending;
  keywordsData.completed = [...(keywordsData.completed || []), ...successful];

  fs.writeFileSync(keywordsPath, JSON.stringify(keywordsData, null, 2));
  log(`Keywords updated. Generated: ${successful.length}, Failed: ${selectedArticles.length - successful.length}, Remaining: ${newPending.length}`);

  // Generate stats.json before build
  generateStats();

  // Build site
  try {
    log('Building site...');
    await runCommand('npm', ['run', 'build'], process.cwd());
    log('Build completed');
  } catch (error) {
    log(`ERROR building site: ${error.message}`);
    return;
  }

  // Deploy to Cloudflare
  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
  const projectName = process.env.CLOUDFLARE_PROJECT_NAME || 'greencert-ro';

  if (cloudflareToken) {
    try {
      log(`Deploying to Cloudflare (project: ${projectName})...`);
      await runCommand('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', projectName], process.cwd());
      log('Deployment completed');
    } catch (error) {
      log(`ERROR deploying: ${error.message}`);
    }
  } else {
    log('CLOUDFLARE_API_TOKEN not set. Skipping deployment.');
  }

  // Cleanup temp files
  try { fs.unlinkSync(tempPath); } catch (e) {}
  try { fs.unlinkSync(successPath); } catch (e) {}

  log('='.repeat(60));
  log('AUTO-GENERATE COMPLETED SUCCESSFULLY');
  log(`Remaining keywords: ${newPending.length}`);
  if (newPending.length === 0) {
    log('All keywords processed! Consider removing the cron job.');
  }
  log('='.repeat(60));
}

main().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  console.error(error);
  process.exit(1);
});
