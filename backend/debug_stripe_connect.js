const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Test the Stripe Connect endpoint to debug the 400 error
async function debugStripeConnect() {
  console.log('🔍 Debugging Stripe Connect Create Account Endpoint\n');
  
  const apiUrl = 'https://api.quickbillpro.net/api/connect/create-account';
  
  // Test 1: No authentication (should return 401)
  console.log('Test 1: No Authentication');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const data = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${data}`);
    console.log('✅ Expected 401 - Authentication working\n');
  } catch (error) {
    console.log(`❌ Network error: ${error.message}\n`);
    return;
  }
  
  // Test 2: Invalid token (should return 403)
  console.log('Test 2: Invalid Token');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token_here'
      }
    });
    
    const data = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${data}`);
    console.log('✅ Expected 403 - Token validation working\n');
  } catch (error) {
    console.log(`❌ Network error: ${error.message}\n`);
  }
  
  // Test 3: Create a mock valid token (won't work with real DB but will test parsing)
  console.log('Test 3: Mock Valid Token (will fail at DB level)');
  try {
    // Create a token with the expected structure
    const mockToken = jwt.sign(
      { userId: 999, email: 'test@example.com' },
      'quickbill_secret_key', // Default secret from code
      { expiresIn: '1h' }
    );
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`
      }
    });
    
    const data = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${data}`);
    
    if (response.status === 400) {
      console.log('🔍 Found 400 error! This might be the issue.');
      
      try {
        const jsonData = JSON.parse(data);
        console.log('Error details:', jsonData);
      } catch (e) {
        console.log('Response is not JSON:', data);
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);
  }
  
  // Test 4: Check API health/status
  console.log('\nTest 4: Check API Health');
  try {
    const healthResponse = await fetch('https://api.quickbillpro.net/health', {
      method: 'GET'
    });
    console.log(`Health Status: ${healthResponse.status}`);
    if (healthResponse.ok) {
      const healthData = await healthResponse.text();
      console.log(`Health Response: ${healthData}`);
    }
  } catch (error) {
    console.log(`Health check failed: ${error.message}`);
  }
  
  // Test 5: Check if it's a CORS issue
  console.log('\nTest 5: Check CORS Headers');
  try {
    const corsResponse = await fetch(apiUrl, {
      method: 'OPTIONS',
    });
    console.log(`CORS Status: ${corsResponse.status}`);
    console.log('CORS Headers:');
    corsResponse.headers.forEach((value, key) => {
      if (key.toLowerCase().includes('cors') || key.toLowerCase().includes('access-control')) {
        console.log(`  ${key}: ${value}`);
      }
    });
  } catch (error) {
    console.log(`CORS check failed: ${error.message}`);
  }
}

// Run the debug
debugStripeConnect().catch(console.error);