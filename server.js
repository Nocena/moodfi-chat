import express from 'express'
import cors from 'cors'
import fs from 'fs'
import https from 'https'
import dotenv from 'dotenv'
import { OpenAI } from 'openai'
import path from 'path'
import { fileURLToPath } from 'url'

// Setup __dirname in ES Module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config()

const app = express()
const port = process.env.PORT || 3001

// Load SSL certs created by mkcert
const httpsOptions = {
  key: fs.readFileSync(path.resolve(__dirname, '../MoodFi/localhost-key.pem')),
  cert: fs.readFileSync(path.resolve(__dirname, '../MoodFi/localhost.pem')),
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// CORS config
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://localhost:5173',
      'https://localhost:5174',
      'http://localhost:5173',
      'http://localhost:5174',
    ]
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`)
  next()
})

/**
 * Creates a comprehensive system prompt with emotion-aware instructions
 * @param {Object[]} emotionData - Recent emotion data from facial analysis
 * @returns {string} - Tailored system prompt
 */
function createEmotionAwareSystemPrompt(emotionData) {
  // Base system prompt
  let systemPrompt = `You are Elwa, an emotionally intelligent AI assistant focused on providing supportive and empathetic responses.
Your primary goal is to help users express their feelings, practice mindfulness, and develop healthy coping strategies.
You are not a replacement for professional therapy, but you can offer comfort and thoughtful guidance.

When responding:
- Be warm, empathetic, and supportive without being overly cheerful when inappropriate
- Keep responses concise (2-3 paragraphs max) and easy to understand
- Use a conversational, friendly tone
- Acknowledge the user's emotions and validate their experiences
- Respond naturally to conversational turns without unnecessary formality
- Always encourage seeking professional help for serious mental health concerns

IMPORTANT: You have access to real-time facial emotion analysis data from the user's camera.`;

  // If we have emotion data, add specific instructions
  if (emotionData && emotionData.length > 0) {
    // Get the latest emotion
    const latestEmotion = emotionData[emotionData.length - 1];
    
    // Get the dominant emotion trends over time
    const emotionTrends = emotionData.map(data => data.dominantEmotion);
    const uniqueEmotions = [...new Set(emotionTrends)];
    
    systemPrompt += `\n\nFacial emotion analysis shows`;
    
    if (uniqueEmotions.length === 1) {
      systemPrompt += ` the user has been consistently displaying ${latestEmotion.dominantEmotion} emotions.`;
    } else if (uniqueEmotions.length > 1) {
      systemPrompt += ` the user's emotions have been shifting between ${uniqueEmotions.join(', ')}, with the current dominant emotion being ${latestEmotion.dominantEmotion}.`;
    }
    
    // Add specific guidance based on the latest emotion
    systemPrompt += `\n\nGuidelines for responding to ${latestEmotion.dominantEmotion} emotions:`;
    
    switch (latestEmotion.dominantEmotion.toLowerCase()) {
      case 'happy':
        systemPrompt += `
- Reflect the user's positive energy
- Validate their positive feelings
- Ask open questions to explore what's going well
- If appropriate, build on their positive momentum with constructive suggestions`;
        break;
      case 'sad':
        systemPrompt += `
- Use a gentle, compassionate tone
- Acknowledge their sadness with empathy
- Validate their feelings without trying to immediately cheer them up
- Offer subtle comfort without dismissing their emotions
- If appropriate, gently explore coping strategies`;
        break;
      case 'angry':
        systemPrompt += `
- Remain calm and use a steady tone
- Acknowledge their frustration without judgment
- Validate their right to feel angry
- Ask questions to help them process the anger
- Avoid phrases that might escalate their emotions`;
        break;
      case 'fearful':
        systemPrompt += `
- Use a calming, reassuring tone
- Acknowledge their fear without minimizing it
- Offer gentle grounding techniques if appropriate
- Ask questions to help them articulate specific concerns
- Validate that fear is a natural emotion`;
        break;
      case 'disgusted':
        systemPrompt += `
- Use a neutral, non-judgmental tone
- Acknowledge their aversion without intensifying it
- Ask clarifying questions to understand the source
- Provide space for them to express what's bothering them`;
        break;
      case 'surprised':
        systemPrompt += `
- Match their energy appropriately
- Express curiosity about what surprised them
- Be receptive to sudden shifts in conversation
- Follow their lead on whether the surprise is positive or negative`;
        break;
      case 'neutral':
      default:
        systemPrompt += `
- Mirror their neutral tone while maintaining warmth
- Use a balanced approach that's neither too upbeat nor too somber
- Ask open questions to explore their current state
- Follow their conversational lead`;
        break;
    }
    
    // Add instruction about using the detailed emotion data
    systemPrompt += `\n\nDetailed emotion analysis is available in the system message. Use this data to inform your responses, but do NOT directly reference the fact that you're analyzing their facial expressions unless they explicitly ask about this feature. Your goal is to naturally adapt to their emotional state without making them self-conscious.`;
  }
  
  return systemPrompt;
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    console.log('✅ Received chat request')
    const { messages } = req.body
    
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages must be an array' })
    }
    
    // Extract any emotion data from system messages
    let emotionData = null;
    const emotionMessage = messages.find(msg => 
      msg.role === 'system' && 
      msg.content.includes('Current user emotions detected')
    );
    
    if (emotionMessage) {
      try {
        // Extract the JSON from the message
        const jsonMatch = emotionMessage.content.match(/(\[.*\])/);
        if (jsonMatch && jsonMatch[1]) {
          emotionData = JSON.parse(jsonMatch[1]);
          console.log('✅ Extracted emotion data:', JSON.stringify(emotionData).substring(0, 100) + '...');
        }
      } catch (error) {
        console.warn('⚠️ Could not parse emotion data:', error);
      }
    }
    
    // Prepare conversation for OpenAI
    let conversation = [];
    
    // Create an enhanced system prompt based on emotion data
    const systemPrompt = createEmotionAwareSystemPrompt(emotionData);
    conversation.push({
      role: 'system',
      content: systemPrompt
    });
    
    // Add detailed emotion data as a separate system message if available
    if (emotionData) {
      conversation.push({
        role: 'system',
        content: `Detailed emotion analysis (last 3 seconds):
${JSON.stringify(emotionData, null, 2)}

Notes:
- dominantEmotion: The primary emotion detected
- confidence: Overall detection confidence (0-100)
- emotionScores: Breakdown of all detected emotions
- Values range from 0.0 (not present) to 1.0 (strongly present)`
      });
    }
    
    // Add user and assistant messages
    messages.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        conversation.push(msg);
      }
    });
    
    console.log('🔄 Sending conversation to OpenAI with', conversation.length, 'messages');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: conversation,
      max_tokens: 500,
      temperature: 0.7,
    })

    const reply = completion.choices[0]?.message?.content || 'No response.'
    console.log('✅ Response from OpenAI received')
    res.status(200).json({ message: reply })
  } catch (err) {
    console.error('❌ Chat error:', err)
    res.status(500).json({ error: 'Error processing request' })
  }
})

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' })
})

// Test endpoint
app.get('/api/test', (req, res) => {
  res.status(200).json({ message: 'Server is working!' })
})

// Start HTTPS server
https.createServer(httpsOptions, app).listen(port, () => {
  console.log(`🚀 HTTPS Server running at https://localhost:${port}`)
  console.log(`Health check: https://localhost:${port}/health`)
  console.log(`Test endpoint: https://localhost:${port}/api/test`)
})

// Error handlers
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', promise, 'reason:', reason)
})