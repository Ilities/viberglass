const axios = require('axios');

// Test script for Qwen CLI functionality
async function testQwenAPI() {
  console.log('Testing Qwen CLI functionality...');
  
  try {
    // Test the health endpoint first
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log('Health check response:', healthResponse.data);
    
    // Check if Qwen agent is available
    console.log('\n2. Checking available agents...');
    const agentsResponse = await axios.get('http://localhost:3000/agents');
    console.log('Available agents:', agentsResponse.data.agents.map(a => a.name));
    
    const hasQwen = agentsResponse.data.agents.some(agent => agent.name === 'qwen-cli');
    
    if (!hasQwen) {
      console.log('Qwen agent not found. Make sure to set DASHSCOPE_API_KEY or QWEN_CLI_API_KEY in your environment.');
      return;
    }
    
    console.log('\n3. Testing Qwen status endpoint...');
    try {
      const qwenStatusResponse = await axios.get('http://localhost:3000/qwen/status');
      console.log('Qwen status:', qwenStatusResponse.data);
    } catch (error) {
      console.log('Qwen status endpoint not available or Qwen agent not configured:', error.message);
    }
    
    console.log('\n4. Testing Qwen execution endpoint...');
    try {
      const qwenResponse = await axios.post('http://localhost:3000/qwen/execute', {
        prompt: "Fix this simple JavaScript function that should return the sum of two numbers: function add(a, b) { return a - b; }",
        context: {
          repoUrl: '', // Will be ignored for this test
          testRequired: false,
          codingStandards: 'Follow standard JavaScript practices'
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Qwen execution response:', qwenResponse.data);
    } catch (error) {
      console.log('Qwen execution test failed (expected if API key not configured):', error.response?.data || error.message);
    }
    
    console.log('\n5. Testing general execution endpoint with Qwen CLI preference...');
    try {
      const executionResponse = await axios.post('http://localhost:3000/execute', {
        bugReport: {
          id: 'test-bug-1',
          title: 'Test Bug',
          description: 'Function returns wrong result',
          stepsToReproduce: 'Call the function with two numbers',
          expectedBehavior: 'Should return sum of numbers',
          actualBehavior: 'Returns difference of numbers',
          severity: 'medium',
          language: 'javascript'
        },
        projectSettings: {
          repoUrl: '', // Will be ignored for this test
          branch: 'main',
          testingRequired: false,
          agentName: 'qwen-cli'
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('General execution response:', executionResponse.data);
    } catch (error) {
      console.log('General execution test failed (expected if repo URL not provided or API key not configured):', error.response?.data || error.message);
    }
    
    console.log('\nTest completed!');
  } catch (error) {
    console.error('Test failed with error:', error.message);
  }
}

// Run the test
testQwenAPI();
