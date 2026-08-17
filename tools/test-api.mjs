// 临时脚本：测试 grok-imagine-image-lite API 可用性 + 返回格式
const API_URL = 'https://wzw.pp.ua/v1/images/generations';
const API_KEY = process.env.SHIZU_IMAGE_API_KEY ?? process.env.OPENAI_API_KEY;
const MODEL = 'grok-imagine-image-lite';

async function main() {
  if (!API_KEY) throw new Error('Set SHIZU_IMAGE_API_KEY before running this probe.');
  console.log('Testing API...');
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: '16-bit pixel art sprite, a cute round insect creature with milky white shell and cyan glowing core, idle pose, black outline, transparent background, single game asset sprite, 64x64',
      n: 1,
      size: '1024x1024',
    }),
  });

  console.log('Status:', resp.status);
  const text = await resp.text();
  try {
    const data = JSON.parse(text);
    console.log('Response keys:', Object.keys(data));
    if (data.data) {
      console.log('Image count:', data.data.length);
      console.log('First image keys:', Object.keys(data.data[0]));
      if (data.data[0].url) console.log('URL:', data.data[0].url.substring(0, 200));
      if (data.data[0].b64_json) console.log('b64_json length:', data.data[0].b64_json.length);
    } else {
      console.log('Full response:', JSON.stringify(data).substring(0, 1000));
    }
  } catch {
    console.log('Raw response (first 1000 chars):', text.substring(0, 1000));
  }
}

main().catch(e => console.error('Error:', e.message));
