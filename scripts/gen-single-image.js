import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const IMAGE_ROUTER_TOKEN = '941d0f4b13aaa3b3e115136ded0515336bd3fe804db1c010cbf69d333bde4b8c';

async function generateImage() {
  const titleEn = 'Teas for the immune system';
  const slug = 'ceaiuri-pentru-sistemul-imunitar';
  const prompt = `Ultra-realistic, high-quality photo illustrating: ${titleEn}. The image must be clean, clear, visually appealing, suitable for a professional blog post about healthy lifestyle, natural products, and eco-friendly living. Natural lighting, no text overlays, no logos, no cartoons, no watermarks. Photorealistic style.`;

  const models = ['openai/gpt-image-1.5:free', 'openai/gpt-image-1.5'];

  for (const model of models) {
    console.log('Trying model:', model);
    try {
      const response = await fetch('https://api.imagerouter.io/v1/openai/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${IMAGE_ROUTER_TOKEN}`
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          n: 1,
          size: '1024x1024'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.log('Response error:', error);
        if (error.includes('rate_limit') || error.includes('limit')) {
          console.log('Rate limited, trying next model...');
          continue;
        }
        continue;
      }

      const data = await response.json();
      const imageData = data.data?.[0];

      if (!imageData) {
        console.log('No image data in response');
        continue;
      }

      let imageBuffer;
      if (imageData.b64_json) {
        imageBuffer = Buffer.from(imageData.b64_json, 'base64');
      } else if (imageData.url) {
        console.log('Downloading from URL...');
        const imgResponse = await fetch(imageData.url);
        imageBuffer = Buffer.from(await imgResponse.arrayBuffer());
      }

      const outputPath = path.join(process.cwd(), 'public', 'images', 'articles', `${slug}.webp`);
      await sharp(imageBuffer)
        .resize(800, 600, { fit: 'cover' })
        .webp({ quality: 65, effort: 6 })
        .toFile(outputPath);

      console.log('Image saved:', outputPath);
      return true;
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
  return false;
}

generateImage().then(r => console.log('Done:', r));
