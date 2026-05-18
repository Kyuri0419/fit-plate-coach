/**
 * Fit Plate Coach - 텍스트 식단 분석 API
 * POST /api/analyze-meal
 * 
 * 요청 body: { mealText: string, memberInfo?: { goal, currentWeight, targetWeight } }
 * 응답: { analysis, calories, protein, carbs, fat, feedback }
 */

module.exports = async function (context, req) {
  const { mealText, memberInfo } = req.body || {};

  if (!mealText) {
    context.res = {
      status: 400,
      body: { error: '식단 텍스트가 필요해요' }
    };
    return;
  }

  // 환경변수 확인
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

  // 회원 정보 컨텍스트
  const memberContext = memberInfo ? `
회원 정보:
- 목표: ${memberInfo.goal || '미설정'}
- 현재 체중: ${memberInfo.currentWeight || '미설정'}kg
- 목표 체중: ${memberInfo.targetWeight || '미설정'}kg
` : '';

  const systemPrompt = `당신은 전문 헬스 트레이너의 영양 어시스턴트입니다.
회원이 입력한 식단을 분석해서 JSON 형식으로 응답해주세요.

응답은 반드시 아래 JSON 형식만 출력하세요. 다른 설명이나 마크다운 코드블록 없이 순수 JSON만:
{
  "foods": [
    {"name": "음식이름", "amount": "양 (예: 100g 또는 1개)", "calories": 칼로리숫자, "protein": 단백질g, "carbs": 탄수화물g, "fat": 지방g}
  ],
  "totalCalories": 총칼로리,
  "totalProtein": 총단백질g,
  "totalCarbs": 총탄수화물g,
  "totalFat": 총지방g,
  "summary": "한 줄 요약 (예: '단백질이 풍부한 균형 잡힌 식사')",
  "feedback": "트레이너가 회원에게 보낼 친근한 피드백 (3-4문장, 잘한 점 + 개선점 + 응원)",
  "score": 1-10점
}`;

  const userPrompt = `${memberContext}
식단: ${mealText}

위 식단을 분석해주세요.`;

  // Azure OpenAI 호출
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
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      context.log.error('Azure OpenAI 호출 실패:', errorText);
      context.res = {
        status: 500,
        body: { error: 'AI 분석 호출 실패', detail: errorText }
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

    // JSON 파싱
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (e) {
      // JSON 파싱 실패 시 텍스트 그대로 반환
      analysisResult = { rawResponse: content };
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: analysisResult
    };
  } catch (error) {
    context.log.error('분석 중 오류:', error);
    context.res = {
      status: 500,
      body: { error: '분석 중 오류가 발생했어요', detail: error.message }
    };
  }
};
