// Debug script to test similarity service connection
// Run with: node debug_similarity_connection.js

const baseUrl = 'http://localhost:8020/api/v1/similarity';

async function testConnection() {
  console.log('🔍 Testing Similarity Service Connection');
  console.log('=====================================');
  
  // Test 1: Health endpoint
  try {
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${baseUrl}/health`);
    console.log(`   Status: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('   ✅ Health check successful');
      console.log('   📊 Health data:', JSON.stringify(healthData, null, 2));
    } else {
      console.log('   ❌ Health check failed');
      console.log('   📝 Response:', await healthResponse.text());
    }
  } catch (error) {
    console.log('   ❌ Health check error:', error.message);
  }

  console.log('');

  // Test 2: Search endpoint
  try {
    console.log('2. Testing search endpoint...');
    const searchResponse = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Project',
        description: 'Machine learning research',
        top_k: 5,
        similarity_threshold: 0.1
      })
    });

    console.log(`   Status: ${searchResponse.status}`);
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log('   ✅ Search successful');
      console.log(`   📊 Found ${searchData.length} researchers`);
      if (searchData.length > 0) {
        console.log('   👤 First researcher:', {
          name: `${searchData[0].prenom} ${searchData[0].nom}`,
          score: searchData[0].similarity_score
        });
      }
    } else {
      console.log('   ❌ Search failed');
      console.log('   📝 Response:', await searchResponse.text());
    }
  } catch (error) {
    console.log('   ❌ Search error:', error.message);
  }

  console.log('');

  // Test 3: Fallback - standard researchers endpoint
  try {
    console.log('3. Testing fallback researchers endpoint...');
    const researchersResponse = await fetch('http://localhost:8020/api/v1/chercheurs/');
    console.log(`   Status: ${researchersResponse.status}`);
    
    if (researchersResponse.ok) {
      const researchersData = await researchersResponse.json();
      console.log('   ✅ Researchers endpoint successful');
      console.log(`   📊 Found ${researchersData.length} total researchers`);
      if (researchersData.length > 0) {
        console.log('   👤 First researcher:', {
          name: `${researchersData[0].prenom || ''} ${researchersData[0].nom || ''}`.trim(),
          domains: researchersData[0].domaines_recherche
        });
      }
    } else {
      console.log('   ❌ Researchers endpoint failed');
      console.log('   📝 Response:', await researchersResponse.text());
    }
  } catch (error) {
    console.log('   ❌ Researchers endpoint error:', error.message);
  }

  console.log('');
  console.log('💡 Instructions:');
  console.log('   - Ensure backend_v2 is running: python run_with_similarity.py');
  console.log('   - Check http://localhost:8020/docs for API documentation');
  console.log('   - If similarity service fails but researchers work, that\'s expected for fallback');
}

// Simple browser-based test
// Copy and paste this into browser console on http://localhost:3000
testConnection().catch(console.error);
