import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://greencert.ro';

function slugify(text) {
  return text.toLowerCase()
    .replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i')
    .replace(/ș/g, 's').replace(/ț/g, 't')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function generateSitemapIndex() {
  const today = new Date().toISOString().split('T')[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_URL}/post-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/category-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;
}

function generatePostSitemap(articles) {
  const urls = articles.map(article => {
    const slug = slugify(article.keyword);
    const date = (article.modifiedDate || article.date) ? (article.modifiedDate || article.date).split('T')[0] : new Date().toISOString().split('T')[0];

    return `  <url>
    <loc>${SITE_URL}/${slug}/</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <image:image>
      <image:loc>${SITE_URL}/images/articles/${slug}.webp</image:loc>
      <image:title>${article.keyword.charAt(0).toUpperCase() + article.keyword.slice(1)}</image:title>
    </image:image>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

function generateCategorySitemap() {
  const today = new Date().toISOString().split('T')[0];
  const categories = [
    'alimentatie-sanatoasa',
    'fitness-acasa',
    'cosmetice-naturale',
    'casa-eco-friendly',
    'remedii-naturiste'
  ];

  const urls = categories.map(cat => `  <url>
    <loc>${SITE_URL}/${cat}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function generateSitemapXsl() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html>
      <head>
        <title>Sitemap - GreenCert</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f4; }
          h1 { color: #059669; }
          table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e7e5e4; }
          th { background: #059669; color: white; }
          tr:hover { background: #ecfdf5; }
          a { color: #059669; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Sitemap GreenCert</h1>
        <table>
          <tr>
            <th>URL</th>
            <th>Last Modified</th>
            <th>Priority</th>
          </tr>
          <xsl:for-each select="//sitemap:url">
            <tr>
              <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
              <td><xsl:value-of select="sitemap:lastmod"/></td>
              <td><xsl:value-of select="sitemap:priority"/></td>
            </tr>
          </xsl:for-each>
          <xsl:for-each select="//sitemap:sitemap">
            <tr>
              <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
              <td><xsl:value-of select="sitemap:lastmod"/></td>
              <td>-</td>
            </tr>
          </xsl:for-each>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;
}

// Inject images into Astro's sitemap-0.xml
function injectImagesIntoAstroSitemap() {
  const distPath = path.join(process.cwd(), 'dist');
  const sitemapPath = path.join(distPath, 'sitemap-0.xml');
  if (!fs.existsSync(sitemapPath)) return;

  let xml = fs.readFileSync(sitemapPath, 'utf-8');

  if (!xml.includes('xmlns:image')) {
    xml = xml.replace(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    );
  }

  let injected = 0;
  xml = xml.replace(/<url><loc>(https?:\/\/[^<]+)<\/loc><\/url>/g, (match, loc) => {
    const urlPath = new URL(loc).pathname.replace(/^\/|\/$/g, '');
    if (!urlPath || urlPath.includes('/')) return match;
    const imagePath = path.join(distPath, 'images', 'articles', `${urlPath}.webp`);
    if (fs.existsSync(imagePath)) {
      injected++;
      const origin = new URL(loc).origin;
      return `<url><loc>${loc}</loc><image:image><image:loc>${origin}/images/articles/${urlPath}.webp</image:loc></image:image></url>`;
    }
    return match;
  });

  fs.writeFileSync(sitemapPath, xml, 'utf-8');
  console.log(`Injected images into sitemap-0.xml: ${injected} articles`);
}

function main() {
  console.log('Generating sitemaps...');

  const keywordsPath = path.join(process.cwd(), 'keywords.json');
  const distPath = path.join(process.cwd(), 'dist');

  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }

  let articles = [];
  if (fs.existsSync(keywordsPath)) {
    const keywordsData = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));
    articles = keywordsData.completed || [];
  }

  // Generate all sitemaps
  fs.writeFileSync(path.join(distPath, 'sitemap_index.xml'), generateSitemapIndex());
  fs.writeFileSync(path.join(distPath, 'post-sitemap.xml'), generatePostSitemap(articles));
  fs.writeFileSync(path.join(distPath, 'category-sitemap.xml'), generateCategorySitemap());
  fs.writeFileSync(path.join(distPath, 'sitemap.xsl'), generateSitemapXsl());
  injectImagesIntoAstroSitemap();

  console.log(`Sitemaps generated: ${articles.length} articles indexed`);
}

main();
