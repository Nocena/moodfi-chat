import axios from 'axios';

/**
 * Simple script to test the backend's functionality.
 * Run with: node test.js
 */

const baseUrl = process.env.API_URL || 'http://localhost:3001';

async function testBackend() {
  console.log(`Testing backend at ${baseUrl}`);
  
  try {
    // Test health endpoint
    console.log('\nTesting health endpoint...');
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log('Health response:', healthResponse.data);
    
    // Test API test endpoint
    console.log('\nTesting API test endpoint...');
    const testResponse = await axios.get(`${baseUrl}/api/test`);
    console.log('Test response:', testResponse.data);
    
    // Test chat endpoint with a simple message
    console.log('\nTesting chat endpoint with a simple message...');
    const chatResponse = await axios.post(`${baseUrl}/api/chat`, {
      messages: [
        {
          role: 'user',
          content: 'Hello, how are you?'
        }
      ]
    });
    console.log('Chat response:', chatResponse.data);
    
    console.log('\nAll tests passed! ✅');
  } catch (error) {
    console.error('Error testing backend:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testBackend();