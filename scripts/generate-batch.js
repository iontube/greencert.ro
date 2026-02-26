import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Load .env for standalone usage
try {
  const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0 && !process.env[key.trim()]) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
} catch (e) {}

// API Keys
const GEMINI_API_KEYS = [
  'AIzaSyAbRzbs0WRJMb0gcojgyJlrjqOPr3o2Cmk',
  'AIzaSyDZ2TklBMM8TU3FA6aIS8vdUc-2iMyHWaM',
  'AIzaSyBdmChQ0ARDdDAqSMSlDIit_xz5ucrWjkY',
  'AIzaSyAE57AIwobFO4byKbeoa-tVDMV5lMgcAxQ',
  'AIzaSyBskPrKeQvxit_Rmm8PG_NO0ZhMQsrktTE',
  'AIzaSyAkUcQ3YiD9cFiwNh8pkmKVxVFxEKFJl2Q',
  'AIzaSyDnX940N-U-Sa0202-v3_TOjXf42XzoNxE',
  'AIzaSyAMl3ueRPwzT1CklxkylmTXzXkFd0A_MqI',
  'AIzaSyA82h-eIBvHWvaYLoP26zMWI_YqwT78OaI',
  'AIzaSyBRI7pd1H2EdCoBunJkteKaCDSH3vfqKUg',
  'AIzaSyA3IuLmRWyTtygsRJYyzHHvSiTPii-4Dbk',
  'AIzaSyB6RHadv3m1WWTFKb_rB9ev_r4r2fM9fNU',
  'AIzaSyCexyfNhzT2py3FLo3sXftqKh0KUdAT--A',
  'AIzaSyC_SN_RdQ2iXzgpqng5Byr-GU5KC5npiAE',
  'AIzaSyBOV9a_TmVAayjpWemkQNGtcEf_QuiXMG0',
  'AIzaSyCFOafntdykM82jJ8ILUqY2l97gdOmwiGg',
  'AIzaSyACxFhgs3tzeeI5cFzrlKmO2jW0l8poPN4',
  'AIzaSyBhZXBhPJCv9x8jKQljZCS4b5bwF3Ip3pk',
  'AIzaSyDF7_-_lXcAKF81SYpcD-NiA5At4Bi8tp8',
  'AIzaSyAwinD7oQiQnXeB2I5kyQsq_hEyJGhSrNg',
];

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

let currentKeyIndex = 0;

function getNextApiKey() {
  const key = GEMINI_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
  return key;
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i')
    .replace(/ș/g, 's').replace(/ț/g, 't')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function stripStrong(str) {
  return str.replace(/<\/?strong>/g, '');
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGemini(prompt, temperature = 0.7, maxRetries = 10) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const apiKey = getNextApiKey();
    const keyIndex = currentKeyIndex === 0 ? GEMINI_API_KEYS.length : currentKeyIndex;

    try {
      console.log(`  Using API key ${keyIndex}/${GEMINI_API_KEYS.length}...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: 16000
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        // Check if rate limited
        if (response.status === 429) {
          // Extract retry delay from response
          let retryDelay = 5000; // default 5 seconds
          try {
            const errorJson = JSON.parse(errorText);
            const retryInfo = errorJson.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
            if (retryInfo?.retryDelay) {
              const seconds = parseFloat(retryInfo.retryDelay.replace('s', ''));
              retryDelay = Math.ceil(seconds * 1000) + 1000; // Add 1 second buffer
            }
          } catch (e) {}

          console.log(`  Rate limited on key ${keyIndex}. Waiting ${Math.ceil(retryDelay/1000)}s and trying next key...`);
          await delay(Math.min(retryDelay, 10000)); // Wait max 10 seconds then try next key
          continue;
        }

        console.log(`API error (attempt ${attempt + 1}): ${errorText.substring(0, 200)}`);
        await delay(2000);
        continue;
      }

      const data = await response.json();
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (result) {
        console.log(`  Success with key ${keyIndex}!`);
        return result;
      }
    } catch (error) {
      console.log(`Request error (attempt ${attempt + 1}): ${error.message}`);
      await delay(2000);
    }
  }
  return null;
}

async function translateToEnglish(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextApiKey();
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Translate the following Romanian text to English. Return ONLY the English translation, nothing else:\n\n${text}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      }
      console.error(`  Translation attempt ${attempt + 1} failed: no candidates`);
    } catch (error) {
      console.error(`  Translation attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  return text;
}

async function generateArticleContent(keyword, category) {
  const prompt = `Esti un expert in stil de viata sanatos, produse naturale si ecologice care scrie pe un blog romanesc. Scrii intr-un stil direct, conversational, ca un prieten care se pricepe si iti da sfaturi concrete. NU esti un AI. Esti un om real cu experienta reala.

Keyword: "${keyword}"
Categorie: "${category}"

GENEREAZA un articol complet in format JSON cu structura de mai jos. Articolul trebuie sa fie informativ, natural, scris de un om care chiar stie domeniul. Fara diacritice. Intre 1500-2500 de cuvinte.

=== 1. SEARCH INTENT MAPPING (CRITIC) ===
Structura articolului urmeaza EXACT ce cauta userul cand tasteaza "${keyword}" in Google:
- PRIMA sectiune = raspunsul direct, concret, fara introducere, fara "bun venit", fara preambul. Userul vrea raspunsul ACUM.
- Dupa raspunsul direct, vin detaliile, comparatiile, criteriile de alegere.
- Fiecare sectiune raspunde la o sub-intrebare pe care userul o are in minte.
- NU incepe NICIODATA cu o introducere generica. Prima propozitie = recomandarea ta directa sau raspunsul la intentia de cautare.
- Excerptul = primele 2-3 propozitii din articol care dau raspunsul direct. Asta apare in Google ca snippet.

=== 2. ANTI-AI FOOTPRINT (FOARTE IMPORTANT) ===
Articolul TREBUIE sa para scris de un om real, nu de AI. Reguli concrete:
- FARA tranzitii generice: NU folosi "Asadar", "In primul rand", "De asemenea", "Cu toate acestea", "Este important de mentionat", "Trebuie sa tinem cont", "Nu in ultimul rand"
- FARA structura predictibila: nu toate paragrafele sa aiba aceeasi lungime. Amesteca: un paragraf de 2 propozitii, urmat de unul de 4, apoi unul de 1 propozitie.
- IMPERFECTIUNI NATURALE: include formulari imperfecte dar naturale: "bon, stai", "cum sa zic", "pana la urma", "na, asta e", "ma rog", "zic si eu"
- Amesteca propozitii FOARTE scurte (3-5 cuvinte: "Merita. Punct." / "Nu-i rau." / "Depinde de buget.") cu propozitii lungi (18-22 cuvinte)
- Foloseste MULT limbaj conversational romanesc: "na", "uite", "stai putin", "pe bune", "sincer", "daca ma intrebi pe mine", "am sa fiu direct", "uite care-i treaba"
- INTERZIS TOTAL: "in era actuala", "descopera", "fara indoiala", "ghid complet", "in concluzie", "in acest articol", "hai sa exploram", "sa aprofundam", "merita mentionat", "este esential", "este crucial", "o alegere excelenta"
- INTERZIS: liste de 3 adjective consecutive, inceperea a doua propozitii la rand cu acelasi cuvant, folosirea aceluiasi pattern de inceput de paragraf
- Include anecdote personale CONCRETE: "am avut un X care a tinut 4 ani", "un prieten si-a luat un Y si dupa 2 luni...", "am testat personal modelul asta vreo 3 saptamani"
- Include critici ONESTE: fiecare produs sa aiba minim 1-2 minusuri reale, nu critici false gen "singurul minus e ca e prea bun"
- Recunoaste incertitudine: "n-am testat personal, dar din ce am auzit...", "pe asta nu pun mana in foc, dar..."
- Vorbeste ca pe un forum romanesc, nu ca o enciclopedie

=== 3. FAQ OPTIMIZAT PEOPLE ALSO ASK ===
8 intrebari formatate EXACT cum le tasteaza oamenii in Google Romania:
- Foloseste formulari naturale de cautare: "cat costa...", "care e diferenta intre...", "merita sa...", "ce ... e mai bun", "de ce...", "cum sa...", "unde gasesc..."
- FARA intrebari artificiale sau formale. Gandeste-te: ce ar tasta un roman in Google?
- Raspunsurile au structura de FEATURED SNIPPET: prima propozitie = raspunsul direct si clar, apoi 1-2 propozitii cu detalii si cifre concrete
- Raspuns = 40-70 cuvinte, auto-suficient (sa poata fi afisat singur ca snippet fara context)
- Include cifre concrete: preturi in lei, procente, durate, dimensiuni
- Acoperiti: pret, comparatie, durabilitate, alegere, probleme frecvente, intretinere, autenticitate, unde sa cumperi

=== 4. LIZIBILITATE PERFECTA PARAGRAFE ===
- MAXIM 3-4 propozitii per paragraf. Niciodata mai mult.
- Paragrafele lungi sunt INTERZISE. Daca un paragraf are mai mult de 4 propozitii, sparge-l.
- Alterna paragrafele: unul mai lung (3-4 prop), unul scurt (1-2 prop), unul mediu (2-3 prop)
- Intre sectiuni lasa "aer" - nu pune paragraf dupa paragraf fara pauza
- Foloseste bullet points (<ul><li>) pentru liste de criterii, avantaje, dezavantaje - nu le pune in text continuu
- Subtitlurile (H3) sparg monotonia - foloseste-le in cadrul sectiunilor pentru a crea sub-puncte

=== 5. CUVINTE CHEIE IN STRONG ===
- Pune keyword-ul principal si variatiile lui in <strong> tags de fiecare data cand apar natural in text
- Keyword principal: "${keyword}" - trebuie sa apara de 4-6 ori in tot articolul, in <strong>
- Variatii naturale ale keyword-ului: pune si ele in <strong>
- NU pune in strong cuvinte random sau irelevante. Doar keyword-urile si variatiile lor.
- Nu forta keyword density. Trebuie sa sune natural, ca si cum ai sublinia ce e important.
- NICIODATA nu pune <strong> in titluri de sectiuni (heading), in intrebarile FAQ, sau in textul din cuprins/TOC. Strong se foloseste DOAR in paragrafe de text (<p>), nu in <h2>, <h3>, "question", sau "heading".

=== REGULI SUPLIMENTARE ===
- Scrie FARA diacritice (fara ă, î, ș, ț, â - foloseste a, i, s, t)
- Preturile sa fie in LEI si realiste pentru piata din Romania
- Fiecare sectiune minim 250 cuvinte

STRUCTURA JSON (returneaza DOAR JSON valid, fara markdown, fara \`\`\`):
{
  "excerpt": "Primele 2-3 propozitii care dau raspunsul direct la ce cauta userul. Recomandarea concreta + context scurt. FARA introducere.",
  "sections": [
    {
      "title": "Titlu sectiune cu keyword integrat natural",
      "content": "HTML formatat cu <p>, <strong>, <ul>/<li>. Minim 250 cuvinte per sectiune. Paragrafele separate cu </p><p>. Maxim 3-4 propozitii per paragraf."
    }
  ],
  "faq": [
    {
      "question": "Intrebare EXACT cum ar tasta-o un roman in Google",
      "answer": "Prima propozitie = raspuns direct (featured snippet). Apoi 1-2 propozitii cu detalii si cifre. Total 40-70 cuvinte."
    }
  ]
}

SECTIUNI OBLIGATORII (6 sectiuni, titluri creative, NU generice):
1. [Raspuns direct] - recomandarea ta principala cu explicatie, fara preambul (titlu creativ legat de keyword, NU "raspunsul direct")
2. [Top recomandari] - 4-5 produse cu preturi reale in lei, avantaje si dezavantaje oneste (cu minusuri reale)
3. [Criterii de alegere] - pe ce sa te uiti cand alegi, explicat pe intelesul tuturor, cu exemple concrete
4. [Comparatie] - head-to-head intre 2-3 optiuni populare, cu preturi si diferente clare
5. [Greseli si tips] - ce sa eviti, sfaturi de insider, greseli pe care le fac toti
6. [Verdict pe buget] - recomandare finala pe 3 categorii de buget: mic, mediu, mare (NU folosi cuvantul "concluzie")

FAQ: 8 intrebari naturale, formulari de cautare Google reale, raspunsuri cu structura featured snippet.`;

  // Retry up to 3 times for JSON parsing errors
  for (let parseAttempt = 0; parseAttempt < 3; parseAttempt++) {
    const result = await callGemini(prompt, 0.7);
    if (!result) continue;

    try {
      // Clean the response - remove markdown code blocks
      let cleaned = result
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Find JSON boundaries
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}') + 1;
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd);
      }

      const parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.excerpt || !parsed.sections || !parsed.faq) {
        console.log(`JSON structure invalid (attempt ${parseAttempt + 1}), retrying...`);
        await delay(2000);
        continue;
      }

      // Validate and fix HTML content in sections
      if (parsed.sections) {
        parsed.sections = parsed.sections.map(section => {
          let content = section.content || '';

          // Convert markdown bold to strong
          content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

          // Normalize: if content already has <p> tags, strip them first
          if (content.includes('<p>') || content.includes('<p ')) {
            content = content
              .replace(/<\/p>\s*<p>/g, '\n')
              .replace(/<p[^>]*>/g, '')
              .replace(/<\/p>/g, '\n');
          }

          // Insert breaks around block-level elements so they get properly separated
          content = content
            .replace(/(<(?:h[1-6]|ul|ol|blockquote|table|div)[\s>])/gi, '\n\n$1')
            .replace(/(<\/(?:h[1-6]|ul|ol|blockquote|table|div)>)/gi, '$1\n\n');

          // Split into blocks and wrap text in <p>, leave block elements as-is
          let blocks = content.split(/\n\n+/).map(p => p.trim()).filter(p => p);
          // Fallback: if \n\n split produced a single large block, try splitting on \n
          if (blocks.length <= 1 && content.includes('\n')) {
            blocks = content.split(/\n/).map(p => p.trim()).filter(p => p);
          }
          content = blocks.map(p => {
            if (p.match(/^<(?:ul|ol|h[1-6]|table|blockquote|div|section)/i)) {
              return p;
            }
            return `<p>${p}</p>`;
          }).join('\n        ');

          // Split overly long paragraphs for better readability
          content = content.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
            if (inner.length < 500) return match;
            // Split on sentence boundaries (. followed by space and uppercase letter)
            const sentences = inner.split(/(?<=\.)\s+(?=[A-Z])/);
            if (sentences.length <= 3) return match;
            // Group sentences into paragraphs of 2-4 sentences
            const paragraphs = [];
            let current = [];
            let currentLen = 0;
            for (const s of sentences) {
              current.push(s);
              currentLen += s.length;
              if (current.length >= 3 || currentLen > 400) {
                paragraphs.push(current.join(' '));
                current = [];
                currentLen = 0;
              }
            }
            if (current.length > 0) paragraphs.push(current.join(' '));
            if (paragraphs.length <= 1) return match;
            return paragraphs.map(p => `<p>${p}</p>`).join('\n        ');
          });

          return { ...section, content };
        });
      }

      return parsed;
    } catch (error) {
      console.log(`JSON parse error (attempt ${parseAttempt + 1}): ${error.message.substring(0, 50)}`);
      if (parseAttempt < 2) {
        await delay(2000);
      }
    }
  }

  console.log('Failed to generate valid JSON after 3 attempts');
  return null;
}

async function generateImage(titleEn, slug, categorySlug) {
  const categoryPrompts = {
    'alimentatie-sanatoasa': 'on a rustic wooden table with fresh ingredients, natural daylight, organic kitchen aesthetic',
    'fitness-acasa': 'in a bright airy home workout space, natural lighting, plants, clean minimalist background',
    'cosmetice-naturale': 'on a marble surface with botanical elements, soft natural lighting, spa-like aesthetic, green plants',
    'casa-eco-friendly': 'in a sustainable modern home interior, natural materials, green plants, soft daylight',
    'remedii-naturiste': 'on a rustic wooden surface with herbs and natural elements, warm natural lighting, apothecary aesthetic',
  };

  console.log(`  Generating image for: ${titleEn}`);

  try {
    const setting = categoryPrompts[categorySlug] || 'in a modern home setting, soft natural lighting, clean contemporary background';
    const prompt = `Realistic photograph of ${titleEn} ${setting}, no text, no brand name, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional product photography.`;

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('steps', '20');
    formData.append('width', '1024');
    formData.append('height', '768');

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-dev`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  Image API error: ${response.status} - ${errorText.slice(0, 200)}`);
      return false;
    }

    const data = await response.json();
    if (!data.result?.image) {
      console.error('  No image in response');
      return false;
    }

    const imageBuffer = Buffer.from(data.result.image, 'base64');

    // Process with Sharp
    const outputPath = path.join(process.cwd(), 'public', 'images', 'articles', `${slug}.webp`);

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await sharp(imageBuffer)
      .resize(800, 600, { fit: 'cover' })
      .webp({ quality: 82, effort: 6 })
      .toFile(outputPath);

    console.log(`  Image saved: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`  Image generation error: ${error.message}`);
    return false;
  }
}

function escapeForTemplate(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/"/g, '\\"');
}

function escapeForHtml(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;');
}

function escapeForJson(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ');
}

function createArticlePage(keyword, slug, content, category, categorySlug, author, date) {
  const title = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const escapedTitle = escapeForHtml(title);
  const cleanExcerpt = content.excerpt.replace(/<[^>]*>/g, '');  // Strip HTML tags
  const escapedExcerpt = escapeForHtml(cleanExcerpt);

  const faqArray = content.faq.map(f =>
    `    { question: "${escapeForJson(stripStrong(f.question))}", answer: "${escapeForJson(stripStrong(f.answer))}" }`
  ).join(',\n');

  const tocItems = content.sections.map((s, i) =>
    `          <li><a href="#section-${i + 1}"><span class="toc-number">${i + 1}</span>${escapeForHtml(stripStrong(s.title))}</a></li>`
  ).join('\n');

  const sectionsHtml = content.sections.map((s, i) =>
    `    <section id="section-${i + 1}">
      <h2>${stripStrong(s.title)}</h2>
      ${s.content}
    </section>`
  ).join('\n\n');

  const authorInitials = author.name.split(' ').map(n => n[0]).join('');

  const template = `---
import Layout from '../layouts/Layout.astro';
import SimilarArticles from '../components/SimilarArticles.astro';
import fs from 'fs';
import path from 'path';

const keywordsPath = path.join(process.cwd(), 'keywords.json');
const keywordsData = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));

const allArticles = keywordsData.completed.map((item) => {
  const articleSlug = item.keyword.toLowerCase()
    .replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i')
    .replace(/ș/g, 's').replace(/ț/g, 't')
    .replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return {
    title: item.keyword.charAt(0).toUpperCase() + item.keyword.slice(1),
    slug: articleSlug,
    excerpt: item.excerpt || '',
    image: \`/images/articles/\${articleSlug}.webp\`,
    category: item.category,
    categorySlug: item.categorySlug,
    date: item.date
  };
});

const faq = [
${faqArray}
];

const formattedDate = new Date("${date}").toLocaleDateString('ro-RO', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
---

<Layout
  title="${escapedTitle} - GreenCert"
  description="${escapedExcerpt}"
  image="/images/articles/${slug}.webp"
  type="article"
  publishedTime="${date}"
  modifiedTime="${date}"
  author="${escapeForHtml(author.name)}"
  faq={faq}
>
  <article>
    <header class="article-header">
      <div class="container">
        <nav class="breadcrumb">
          <a href="/">Acasa</a>
          <span class="breadcrumb-separator">/</span>
          <a href="/${categorySlug}/">${escapeForHtml(category)}</a>
          <span class="breadcrumb-separator">/</span>
          <span>${escapedTitle}</span>
        </nav>

        <div class="article-meta">
          <span class="article-category-badge">${escapeForHtml(category)}</span>
          <span class="article-date">{formattedDate}</span>
        </div>

        <h1 class="article-title">${escapedTitle}</h1>
      </div>
    </header>

    <div class="article-featured-image">
      <img src="/images/articles/${slug}.webp" alt="${escapedTitle}" width="900" height="563" loading="eager" />
    </div>

    <div class="article-content">
      <nav class="toc">
        <h2 class="toc-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Cuprins
        </h2>
        <ol class="toc-list">
${tocItems}
        </ol>
      </nav>

${sectionsHtml}

      <section class="faq-section">
        <h2 class="faq-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Intrebari frecvente
        </h2>

        {faq.map((item, index) => (
          <div class="faq-item" data-faq={index}>
            <button class="faq-question" onclick={\`toggleFaq(\${index})\`}>
              <span>{item.question}</span>
              <span class="faq-icon">+</span>
            </button>
            <div class="faq-answer">
              <p>{item.answer}</p>
            </div>
          </div>
        ))}
      </section>

      <div class="author-box">
        <div class="author-avatar">${authorInitials}</div>
        <div class="author-info">
          <h4>${escapeForHtml(author.name)}</h4>
          <p class="author-role">${escapeForHtml(author.role)}</p>
          <p class="author-bio">${escapeForHtml(author.bio)}</p>
        </div>
      </div>
    </div>
  </article>

  <SimilarArticles
    currentSlug="${slug}"
    currentCategory="${categorySlug}"
    articles={allArticles}
  />
</Layout>

<script is:inline>
  function toggleFaq(index) {
    const item = document.querySelector(\`[data-faq="\${index}"]\`);
    item.classList.toggle('active');
  }
</script>
`;

  const outputPath = path.join(process.cwd(), 'src', 'pages', `${slug}.astro`);
  fs.writeFileSync(outputPath, template);
  console.log(`Article page created: ${outputPath}`);
}

async function main() {
  console.log('Starting article generation...\n');

  // Read temp articles file
  const tempPath = path.join(process.cwd(), 'temp-articles.json');
  if (!fs.existsSync(tempPath)) {
    console.log('No temp-articles.json found. Nothing to generate.');
    return;
  }

  const articlesToGenerate = JSON.parse(fs.readFileSync(tempPath, 'utf-8'));
  const keywordsPath = path.join(process.cwd(), 'keywords.json');
  const keywordsData = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));

  const successfulKeywords = [];

  for (const article of articlesToGenerate) {
    const { keyword, category, categorySlug } = article;
    const slug = slugify(keyword);
    const date = new Date().toISOString();

    console.log(`\n========================================`);
    console.log(`Processing: ${keyword}`);
    console.log(`Category: ${category}`);
    console.log(`========================================`);

    // Find author for this category
    const author = keywordsData.authors.find(a => a.categories.includes(categorySlug)) || keywordsData.authors[0];

    // Step 1: Generate content
    console.log('\n[1/4] Generating article content...');
    const content = await generateArticleContent(keyword, category);
    if (!content) {
      console.log('Failed to generate content. Skipping.');
      continue;
    }
    console.log('Content generated successfully.');

    // Step 2: Translate title
    console.log('\n[2/4] Translating title...');
    const titleEn = await translateToEnglish(keyword);
    console.log(`Translated: ${titleEn}`);

    // Step 3: Generate image
    console.log('\n[3/4] Generating image...');
    const imageGenerated = await generateImage(titleEn, slug, categorySlug);
    if (!imageGenerated) {
      console.log('Image generation failed, but continuing...');
    }

    // Step 4: Create article page
    console.log('\n[4/4] Creating article page...');
    createArticlePage(keyword, slug, content, category, categorySlug, author, date);

    // Add to successful list
    successfulKeywords.push({
      keyword,
      category,
      categorySlug,
      excerpt: content.excerpt,
      date
    });

    console.log(`\nArticle "${keyword}" completed!`);

    // Small delay between articles
    await delay(1000);
  }

  // Save successful keywords for auto-generate to process
  const successPath = path.join(process.cwd(), 'successful-keywords.json');
  fs.writeFileSync(successPath, JSON.stringify(successfulKeywords, null, 2));

  console.log(`\n========================================`);
  console.log(`Generation complete!`);
  console.log(`Successful: ${successfulKeywords.length}/${articlesToGenerate.length}`);
  console.log(`========================================`);
}

main().catch(console.error);
