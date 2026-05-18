const https = require('https');

module.exports = async function (context, req) {
  context.log('analyze-meal 함수 시작');
  
  try {
    const body = req.body || {};
    const mealText = body.mealText;
    
    if (!mealText) {
      context.res = { status: 400, body: { error: 'mealText 필요' } };
      return;
    }
    
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
    
    if (!apiKey) {
      context.res = { status: 500, body: { error: 'API 키 누락' } };
      return;
    }
    
    const requestBody = JSON.stringify({
      messages: [
        { role: 'system', content: '당신은 영양사입니다. 식단을 JSON으로 분석: {"foods":[],"totalCalories":0,"totalProtein":0,"totalCarbs":0,"totalFat":0,"summary":"","feedback":"","score":0}' },
        { role: 'user', content: mealText }
      ],
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });
    
    const url = new URL(endpoint + '/openai/deployments/' + deployment + '/chat/completions?api-version=' + apiVersion);
    
    const result = await new Promise(function(resolve, reject) {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };
      
      const req2 = https.request(options, function(res) {
        let data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: { raw: data } });
          }
        });
      });
      
      req2.on('error', reject);
      req2.write(requestBody);
      req2.end();
    });
    
    if (result.status !== 200) {
      context.res = { status: 500, body: { error: 'OpenAI 호출 실패', detail: result.body } };
      return;
    }
    
    const content = result.body.choices[0].message.content;
    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      analysis = { raw: content };
    }
    
    context.res = { status: 200, body: analysis };
  } catch (error) {
    context.log.error('에러 발생:', error);
    context.res = { status: 500, body: { error: '실행 오류', message: error.message } };
  }
};
