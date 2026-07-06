const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

// .env 파일을 직접 파싱 (dotenv가 없을 수도 있으므로)
const envPath = 'C:\\ecams-ai-multi\\.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const GEMINI_API_KEY = envContent.split('\n').find(line => line.startsWith('GEMINI_API_KEY=')).split('=')[1].trim();

const modelsToTest = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.0-pro',
  'gemini-pro',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest'
];

async function listModels() {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  try {
    console.log('Fetching model list from Google...');
    // listModels method is available on the genAI object in newer SDK versions
    // or we might need to use a different approach. Let's try this:
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
    const data = await response.json();
    if (data.models) {
        console.log('Available Models:');
        data.models.forEach(m => console.log(` - ${m.name}`));
    } else {
        console.log('No models returned. Response:', JSON.stringify(data));
    }
  } catch (e) {
    console.error('Fetch Failed:', e.message);
  }
}

listModels();
