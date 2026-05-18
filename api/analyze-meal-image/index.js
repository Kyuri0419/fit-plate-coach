/**
 * Fit Plate Coach - 사진 식단 분석 API (GPT-4o Vision)
 * POST /api/analyze-meal-image
 * 
 * 요청 body: { 
 *   imageBase64: string (data:image/jpeg;base64,... 형식 또는 순수 base64),
 *   memberInfo?: { goal, currentWeight, targetWeight }
 * }
 * 응답: { foods, totalCalories, totalProtein, totalCarbs, totalFat, summary, feedback, score }
 */

module.exports = async function (context, req) {
  const { imageBase64, memberInfo } = req.body || {};

  if (!imageBase64) {
    context.res = {
      status: 400,
      body: { error: '이미지가 필요해요' }
    };
    return;
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

  if (!apiKey || !endpoint) {
    context.res = {
      status: 500,
      body: { error: 'Azure OpenAI 설정이 누락되었어요' }
    };
    return;
  }

  // base64 데이터 포맷 정리 (data URL prefix 처리)
  let imageData = imageBase64;
  let mediaType = 'image/jpeg';
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      mediaType = match[1];
      imageData = match[2];
    }
  }

  const memberContext = memberInfo ? `
회원 정보:
- 목표: ${memberInfo.goal || '미설정'}
- 현재 체중: ${memberInfo.currentWeight || '미설정'}kg
- 목표 체중: ${memberInfo.targetWeight || '미설정'}kg
` : '';

  const systemPrompt = `당신은 전문 헬스 트레이너의 영양 어시스턴트입니다.
사진 속 음식을 식별하고 영양 정보를 추정하여 JSON으로만 응답해주세요.

반드시 아래 JSON 형식만 출력 (다른 설명이나 마크다운 없이):
{
  "foods": [
    {"name": "음식이름", "amount": "추정 양", "calories": 칼로리, "protein": 단백질g, "carbs": 탄수화물g, "fat": 지방g}
  ],
  "totalCalories": 총칼로리,
  "totalProtein": 총단백질g,
  "totalCarbs": 총탄수화물g,
  "totalFat": 총지방g,
  "summary": "한 줄 요약",
  "feedback": "트레이너 피드백 (3-4문장)",
  "score": 1-10점,
  "confidence": "high/medium/low (사진으로 식별한 정확도)"
}

칼로리/영양소는 일반적인 1인분 기준 추정치입니다.`;

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: `${memberContext}\n이 사진 속 음식들을 분석해주세요.` 
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mediaType};base64,${imageData}`,
                  detail: 'low'
                }
              }
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0.5,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      context.log.error('Vision API 호출 실패:', errorText);
      context.res = {
        status: 500,
        body: { error: 'AI 이미지 분석 실패', detail: errorText }
      };
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      context.res = {
        status: 500,
        body: { error: 'AI 응답이 비어있어요' }
      };
      return;
    }

    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (e) {
      analysisResult = { rawResponse: content };
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: analysisResult
    };
  } catch (error) {
    context.log.error('이미지 분석 중 오류:', error);
    context.res = {
      status: 500,
      body: { error: '이미지 분석 중 오류가 발생했어요', detail: error.message }
    };
  }
};
