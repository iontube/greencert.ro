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

function stripFakeLinks(html, pagesDir) {
  return html.replace(/<a\s+href="\/([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, linkPath, text) => {
    const slug = linkPath.replace(/\/$/, '');
    if (fs.existsSync(path.join(pagesDir, `${slug}.astro`))) return match;
    if (fs.existsSync(path.join(pagesDir, slug))) return match;
    return text;
  });
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

async function generateArticleContent(keyword, category, completedArticles = []) {
  
  // Build interlink list from completed articles
  const currentSlug = keyword.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const interlinkCandidates = completedArticles
    .filter(a => a.keyword !== keyword)
    .map(a => {
      const aSlug = a.keyword.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return { title: a.keyword.charAt(0).toUpperCase() + a.keyword.slice(1), slug: aSlug, category: a.category, categorySlug: a.categorySlug };
    });
  // Prioritize same category, then others, max 15
  const sameCategory = interlinkCandidates.filter(a => a.categorySlug === completedArticles.find(c => c.keyword === keyword)?.categorySlug);
  const otherCategory = interlinkCandidates.filter(a => !sameCategory.includes(a));
  const interlinkList = [...sameCategory, ...otherCategory].slice(0, 15)
    .map(a => `- <a href="/${a.slug}/">${a.title}</a> (categorie: ${a.category})`)
    .join('\n');

const prompt = `Scrii articole pe un site romanesc despre produse bio, organice si naturale - cosmetice, suplimente, alimente eco si produse de curatare naturale. Stilul e informativ dar directionat spre conversie.

Keyword: "${keyword}"
Categorie: "${category}"

=== TONUL SI STILUL ===

INTRO:
- Prima propozitie = raspunsul direct la ce cauta userul. Fara "bun venit", fara preambul.
- Introul are 2-3 paragrafe scurte care dau contextul si recomandarea principala.
- Excerptul = primele 2-3 propozitii din intro. Asta apare in Google ca snippet.

REVIEW-URI PRODUSE:
- Fiecare produs are un review scris ca o mini-poveste: cum l-ai descoperit, ce ti-a placut, ce te-a deranjat.
- Include detalii senzoriale: textura, miros, consistenta, ambalaj.
- Fiecare produs are minim 2 plusuri si 2 minusuri REALE. Nu critici false gen "singurul minus e ca e prea bun".
- Mentioneaza pret real in lei si unde se gaseste.

CONVERSIE:
- Dupa fiecare review, include o propozitie naturala care indeamna la actiune: "Daca vrei sa-l testezi...", "Merita incercat daca...", "Il gasesti la..."
- In ghidul de cumparare, ofera criterii clare de decizie.
- Compara produsele intre ele in tabelul comparativ.

=== ANTI-AI (FOARTE IMPORTANT) ===
Articolul TREBUIE sa para scris de un om real, nu de AI. Reguli concrete:
- INTERZIS TOTAL: "in era actuala", "descopera", "fara indoiala", "ghid complet", "in concluzie", "in acest articol", "hai sa exploram", "sa aprofundam", "merita mentionat", "este esential", "este crucial", "o alegere excelenta", "Asadar", "In primul rand", "De asemenea", "Cu toate acestea", "Este important de mentionat", "Nu in ultimul rand"
- INTERZIS: liste de 3 adjective consecutive, inceperea a doua propozitii la rand cu acelasi cuvant, folosirea aceluiasi pattern de inceput de paragraf
- Foloseste limbaj conversational: "na", "uite", "stai putin", "pe bune", "sincer", "daca ma intrebi pe mine", "uite care-i treaba", "bon, stai", "pana la urma", "ma rog", "zic si eu"
- Amesteca propozitii FOARTE scurte (3-5 cuvinte) cu propozitii lungi (18-22 cuvinte)
- Include anecdote personale CONCRETE: "am testat X vreo 3 saptamani", "o prietena si-a luat Y si dupa 2 luni..."
- Recunoaste incertitudine: "n-am testat personal, dar din ce am auzit...", "pe asta nu pun mana in foc, dar..."

=== PARAGRAFE CU INTREBARI ===
- Presara intrebari retorice prin text: "Dar merita pretul?", "Si atunci ce faci?", "Pare mult, nu?"
- Maxim 3-4 propozitii per paragraf. Alterna lungimile.
- Foloseste bullet points (<ul><li>) pentru liste de criterii, avantaje, dezavantaje.

=== STRUCTURA JSON ===
Returneaza DOAR JSON valid, fara markdown, fara \`\`\`:
{
  "intro": "2-3 paragrafe HTML cu <p>. Raspunsul direct + context. Keyword in <strong>. Prima propozitie = recomandarea directa.",
  "items": [
    {
      "name": "Numele complet al produsului",
      "specs": {
        "tip": "ex: crema de fata bio / ulei esential / supliment alimentar",
        "cantitate": "ex: 50ml / 250g / 60 capsule",
        "ingrediente": "ex: aloe vera bio, ulei de argan, vitamina E",
        "certificari": "ex: ECOCERT, COSMOS Organic, vegan",
        "pret_per_unitate": "ex: ~2.5 lei/ml sau ~0.8 lei/capsula"
      },
      "review": "HTML cu <p>. Review detaliat 150-250 cuvinte. Experienta personala, textura, miros, rezultate. Keyword in <strong> unde e natural.",
      "pros": ["Avantaj real 1", "Avantaj real 2", "Avantaj real 3"],
      "cons": ["Dezavantaj real 1", "Dezavantaj real 2"],
      "price": "~XX lei"
    }
  ],
  "comparison": {
    "heading": "Titlu comparativ creativ cu keyword",
    "rows": [
      {"model":"Nume produs", "tip":"tip produs", "cantitate":"50ml", "certificari":"ECOCERT, vegan", "ingrediente":"ingrediente cheie", "potrivitPentru":"ten uscat / piele sensibila"}
    ]
  },
  "guide": {
    "heading": "Titlu ghid de cumparare cu keyword",
    "content": "HTML cu <p>, <h3>, <ul>/<li>. Ghid detaliat 300-500 cuvinte. Criterii de alegere, ce sa eviti, sfaturi practice. Keyword in <strong>."
  },
  "faq": [
    {
      "question": "Intrebare EXACT cum ar tasta-o un roman in Google",
      "answer": "Prima propozitie = raspuns direct. Apoi 1-2 propozitii cu detalii si cifre. 40-70 cuvinte."
    }
  ]
}

=== CERINTE PRODUSE ===
- 5-7 produse bio/organice/naturale reale, disponibile in Romania
- Preturi reale in LEI, actualizate
- Specs obligatorii: tip, cantitate, ingrediente, certificari, pret_per_unitate
- Review cu experienta personala, detalii senzoriale
- Minim 2 pros si 2 cons per produs

=== CERINTE FAQ ===
- 5 intrebari naturale, formulari de cautare Google reale
- Formulari: "cat costa...", "care e diferenta intre...", "merita sa...", "ce ... e mai bun", "cum sa..."
- Raspunsuri cu structura featured snippet, 40-70 cuvinte
- Include cifre concrete: preturi in lei, procente, durate

=== REGULI ===
- Scrie FARA diacritice (fara ă, î, ș, ț, â - foloseste a, i, s, t)
- Preturile in LEI, realiste pentru Romania
- Keyword principal: "${keyword}" - apare de 4-6 ori in <strong>, DOAR in <p>, NICIODATA in headings/questions
- NICIODATA <strong> in titluri, intrebari FAQ, sau TOC
- Comparison rows: include TOATE produsele din items

${interlinkList.length > 0 ? `=== INTERLINK-URI INTERNE (SEO) ===
Mentioneaza NATURAL in text 2-4 articole de pe site, cu link-uri <a href="/{slug}/">{titlu}</a>.
Integreaza in propozitii, NU ca lista separata. Max 4 link-uri. Doar unde are sens contextual.
NU forta link-uri daca nu au legatura cu subiectul. Mai bine 0 link-uri decat link-uri fortate.

Articole disponibile:
${interlinkList}` : ''}`;

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
      if (!parsed.intro || !parsed.items || !parsed.faq) {
        console.log(`JSON structure invalid (attempt ${parseAttempt + 1}), retrying...`);
        await delay(2000);
        continue;
      }

      // Helper: normalize HTML content block
      function normalizeHtmlContent(content) {
        if (!content) return '';

        // Convert markdown bold to strong
        content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Normalize: if content already has <p> tags, strip them first
        if (content.includes('<p>') || content.includes('<p ')) {
          content = content
            .replace(/<\/p>\s*<p>/g, '\n')
            .replace(/<p[^>]*>/g, '')
            .replace(/<\/p>/g, '\n');
        }

        // Insert breaks around block-level elements
        content = content
          .replace(/(<(?:h[1-6]|ul|ol|blockquote|table|div)[\s>])/gi, '\n\n$1')
          .replace(/(<\/(?:h[1-6]|ul|ol|blockquote|table|div)>)/gi, '$1\n\n');

        // Split into blocks and wrap text in <p>
        let blocks = content.split(/\n\n+/).map(p => p.trim()).filter(p => p);
        if (blocks.length <= 1 && content.includes('\n')) {
          blocks = content.split(/\n/).map(p => p.trim()).filter(p => p);
        }
        content = blocks.map(p => {
          if (p.match(/^<(?:ul|ol|h[1-6]|table|blockquote|div|section)/i)) {
            return p;
          }
          return `<p>${p}</p>`;
        }).join('\n        ');

        // Split overly long paragraphs
        content = content.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
          if (inner.length < 500) return match;
          const sentences = inner.split(/(?<=\.)\s+(?=[A-Z])/);
          if (sentences.length <= 3) return match;
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

        return content;
      }

      // Normalize intro HTML
      parsed.intro = normalizeHtmlContent(parsed.intro);

      // Normalize review HTML in items
      if (parsed.items) {
        parsed.items = parsed.items.map(item => ({
          ...item,
          review: normalizeHtmlContent(item.review || '')
        }));
      }

      // Normalize guide content HTML
      if (parsed.guide) {
        parsed.guide.content = normalizeHtmlContent(parsed.guide.content || '');
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


// Strip brand names from image prompt to avoid Cloudflare AI content filter
function stripBrands(text) {
  return text
    .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, '')  // camelCase brands: HyperX, PlayStation
    .replace(/\b[A-Z]{2,}\b/g, '')            // ALL CAPS: ASUS, RGB, LED
    .replace(/\s{2,}/g, ' ')                   // collapse double spaces
    .trim();
}

// Use Gemini to rephrase a title into a generic description without brand names
async function rephraseWithoutBrands(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Rephrase the following into a short, generic English description for an image prompt. Remove ALL brand names, trademarks, product names, and game names. Replace them with generic descriptions of what they are. Return ONLY the rephrased text, nothing else.\n\nExample: "Boggle classic word game" -> "classic letter dice word game on a table"\nExample: "Kindle Paperwhite review" -> "slim e-reader device with paper-like screen"\nExample: "Duolingo app for learning languages" -> "colorful language learning mobile app interface"\n\nText: "${text}"` }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 100 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const result = data.candidates[0].content.parts[0].text.trim();
        console.log(`  Rephrased prompt (no brands): ${result}`);
        return result;
      }
    } catch (error) {
      console.error(`  Rephrase attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  // Fallback to basic stripBrands
  return stripBrands(text);
}

async function generateSafePrompt(text, categorySlug) {
  const categoryFallbacks = {
    'alimentatie-sanatoasa': 'fresh organic vegetables and fruits arranged on a wooden table with natural light',
    'fitness-acasa': 'yoga mat, resistance bands, and water bottle on a clean wooden floor',
    'cosmetice-naturale': 'natural skincare glass bottles with botanical leaves on a marble surface',
    'casa-eco-friendly': 'sustainable home decor with green plants, wooden furniture, and soft natural light',
    'remedii-naturiste': 'dried herbs, essential oil bottles, and mortar on a rustic wooden surface',
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a short, safe English image prompt for a stock photo related to this topic. The prompt must describe ONLY objects, scenery, and atmosphere. NEVER mention people, children, babies, faces, hands, or any human body parts. NEVER use brand names. Focus on products, objects, books, devices, furniture, or abstract scenes. Return ONLY the description.\n\nTopic: "${text}"` }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 100 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const result = data.candidates[0].content.parts[0].text.trim();
        console.log(`  Safe prompt generated: ${result}`);
        return result;
      }
    } catch (error) {
      console.error(`  Safe prompt attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  // Fallback to category-based safe description
  return categoryFallbacks[categorySlug] || 'natural organic products arranged on a clean wooden surface with soft lighting';
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

  const MAX_IMAGE_RETRIES = 4;
  let promptFlagged = false;

  for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {

    if (attempt > 1) {

      console.log(`  Image retry attempt ${attempt}/${MAX_IMAGE_RETRIES}...`);

      await new Promise(r => setTimeout(r, 3000 * attempt));

    }


  try {
    let prompt;
    if (attempt >= 3) {
      const safeSubject = await generateSafePrompt(titleEn, categorySlug);
      prompt = `Realistic photograph of ${safeSubject}, no text, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional photography.`;
    } else {
      const setting = categoryPrompts[categorySlug] || 'in a modern home setting, soft natural lighting, clean contemporary background';
      const subject = promptFlagged ? await rephraseWithoutBrands(titleEn) : titleEn;
      prompt = `Realistic photograph of ${subject} ${setting}, no text, no brand name, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional product photography.`;
    }

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
      if (errorText.includes('flagged')) promptFlagged = true;
      continue;
    }

    const data = await response.json();
    if (!data.result?.image) {
      console.error('  No image in response');
      continue;
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
    continue;
  }


  }

  console.error('  Image generation failed after all retries');

  return null;
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

  // Extract excerpt from first <p> in intro
  const introFirstP = content.intro.match(/<p>([\s\S]*?)<\/p>/);
  const excerpt = introFirstP ? introFirstP[1].replace(/<[^>]*>/g, '') : title;
  const escapedExcerpt = escapeForHtml(excerpt);

  const faqArray = content.faq.map(f =>
    `    { question: "${escapeForJson(stripStrong(f.question))}", answer: "${escapeForJson(stripStrong(f.answer))}" }`
  ).join(',\n');

  // Build TOC entries
  const tocEntries = [];
  let tocIndex = 1;

  // Items (each product)
  if (content.items) {
    content.items.forEach((item) => {
      tocEntries.push(`          <li><a href="#product-${tocIndex}"><span class="toc-number">${tocIndex}</span>${escapeForHtml(stripStrong(item.name))}</a></li>`);
      tocIndex++;
    });
  }

  // Comparison
  if (content.comparison) {
    tocEntries.push(`          <li><a href="#comparison"><span class="toc-number">${tocIndex}</span>${escapeForHtml(stripStrong(content.comparison.heading))}</a></li>`);
    tocIndex++;
  }

  // Guide
  if (content.guide) {
    tocEntries.push(`          <li><a href="#guide"><span class="toc-number">${tocIndex}</span>${escapeForHtml(stripStrong(content.guide.heading))}</a></li>`);
    tocIndex++;
  }

  // FAQ
  tocEntries.push(`          <li><a href="#faq"><span class="toc-number">${tocIndex}</span>Intrebari frecvente</a></li>`);

  const tocItems = tocEntries.join('\n');

  // Build items HTML
  let productIndex = 0;
  const itemsHtml = (content.items || []).map((item) => {
    productIndex++;
    const specsHtml = item.specs ? `
        <div class="specs-grid">
          ${item.specs.tip ? `<div class="spec-item"><span class="spec-label">Tip</span><span class="spec-value">${escapeForHtml(item.specs.tip)}</span></div>` : ''}
          ${item.specs.cantitate ? `<div class="spec-item"><span class="spec-label">Cantitate</span><span class="spec-value">${escapeForHtml(item.specs.cantitate)}</span></div>` : ''}
          ${item.specs.ingrediente ? `<div class="spec-item"><span class="spec-label">Ingrediente</span><span class="spec-value">${escapeForHtml(item.specs.ingrediente)}</span></div>` : ''}
          ${item.specs.certificari ? `<div class="spec-item"><span class="spec-label">Certificari</span><span class="spec-value">${escapeForHtml(item.specs.certificari)}</span></div>` : ''}
          ${item.specs.pret_per_unitate ? `<div class="spec-item"><span class="spec-label">Pret/unitate</span><span class="spec-value">${escapeForHtml(item.specs.pret_per_unitate)}</span></div>` : ''}
        </div>` : '';

    const prosHtml = (item.pros || []).map(p => `            <li>${escapeForHtml(p)}</li>`).join('\n');
    const consHtml = (item.cons || []).map(c => `            <li>${escapeForHtml(c)}</li>`).join('\n');

    return `    <article class="product-review" id="product-${productIndex}">
      <div class="product-header">
        <h2>${stripStrong(item.name)}</h2>
        ${item.price ? `<span class="section-tag">${escapeForHtml(item.price)}</span>` : ''}
      </div>
      ${specsHtml}
      <div class="product-review-content">
        ${item.review}
      </div>
      <div class="pros-cons">
        <div class="pros">
          <h4>Avantaje</h4>
          <ul>
${prosHtml}
          </ul>
        </div>
        <div class="cons">
          <h4>Dezavantaje</h4>
          <ul>
${consHtml}
          </ul>
        </div>
      </div>
    </article>`;
  }).join('\n\n');

  // Build comparison HTML
  const comparisonHtml = content.comparison ? (() => {
    const rows = content.comparison.rows || [];
    const columns = [
      { key: 'model', label: 'Produs' },
      { key: 'tip', label: 'Tip' },
      { key: 'cantitate', label: 'Cantitate' },
      { key: 'certificari', label: 'Certificari' },
      { key: 'ingrediente', label: 'Ingrediente' },
      { key: 'potrivitPentru', label: 'Potrivit pentru' }
    ];

    const headerCells = columns.map(c => `<th>${c.label}</th>`).join('');
    const bodyRows = rows.map(row =>
      `          <tr>${columns.map(c => `<td>${escapeForHtml(row[c.key] || '-')}</td>`).join('')}</tr>`
    ).join('\n');

    return `    <section id="comparison" class="comparison-section">
      <h2>${stripStrong(content.comparison.heading)}</h2>
      <div class="comparison-scroll">
        <table class="comparison-table">
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
${bodyRows}
          </tbody>
        </table>
      </div>
    </section>`;
  })() : '';

  // Build guide HTML
  const guideHtml = content.guide ? `    <section id="guide" class="guide-section">
      <h2>${stripStrong(content.guide.heading)}</h2>
      ${content.guide.content}
    </section>` : '';

  const authorInitials = author.name.split(' ').map(n => n[0]).join('');

  let template = `---
import Layout from '../layouts/Layout.astro';
import SimilarArticles from '../components/SimilarArticles.astro';
import PrevNextNav from '../components/PrevNextNav.astro';
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

      <section class="article-intro">
        ${content.intro}
      </section>

${itemsHtml}

${comparisonHtml}

${guideHtml}

      <section id="faq" class="faq-section">
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

  <PrevNextNav
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

  // Comparison table horizontal scroll indicator
  document.addEventListener('DOMContentLoaded', function() {
    const scrollContainer = document.querySelector('.comparison-scroll');
    if (scrollContainer) {
      const table = scrollContainer.querySelector('table');
      if (table && table.scrollWidth > scrollContainer.clientWidth) {
        scrollContainer.classList.add('has-scroll');
      }
      scrollContainer.addEventListener('scroll', function() {
        if (this.scrollLeft > 0) {
          this.classList.add('scrolled-right');
        } else {
          this.classList.remove('scrolled-right');
        }
      });
    }

    // TOC active tracking
    const tocLinks = document.querySelectorAll('.toc-list a');
    const sections = [];
    tocLinks.forEach(link => {
      const id = link.getAttribute('href').replace('#', '');
      const el = document.getElementById(id);
      if (el) sections.push({ id, el, link });
    });

    if (sections.length > 0) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            tocLinks.forEach(l => l.classList.remove('active'));
            const match = sections.find(s => s.id === entry.target.id);
            if (match) match.link.classList.add('active');
          }
        });
      }, { rootMargin: '-20% 0px -60% 0px' });
      sections.forEach(s => observer.observe(s.el));
    }
  });
</script>
`;

  const outputPath = path.join(process.cwd(), 'src', 'pages', `${slug}.astro`);
  template = stripFakeLinks(template, path.join(process.cwd(), 'src', 'pages'));
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
    const content = await generateArticleContent(keyword, category, keywordsData?.completed || []);
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
      excerpt: (() => { const m = (content.intro || '').match(/<p>([\s\S]*?)<\/p>/); return m ? m[1].replace(/<[^>]*>/g, '') : keyword; })(),
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
