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
  "score": 1-10점,
  "confidence": "high/medium/low (사진으로 식별한 정확도)",
  "kakaoMessage": "카카오톡 전송용 피드백 메시지"
}

kakaoMessage 작성 규칙:

[톤]
- 친한 트레이너가 카톡 보내는 것처럼 편안하고 따뜻하게
- 부드러운 어미: "~인 것 같아요", "~해보시면 좋을 것 같아요", "~이시니까"
- 자연스러운 공감 표현 OK: "ㅎㅎ", "맛있어 보이는데요", "오늘 이거 드셨군요"
- 문어체 금지: "감량 목표를 위해서는" X → "감량 중이시니까" O, "~하는 것이 중요해요" X → "~해보시면 좋아요" O

[포맷] 줄바꿈은 \\n 사용:
인사 + 사진 속 식단에 대한 자연스러운 공감 한 마디\\n\\n📊 오늘의 분석\\n- 칼로리: [totalCalories]kcal\\n- 단백질: [totalProtein]g[단백질이 목표 대비 부족하면 " (좀 부족해요)"]\\n- 탄수화물: [totalCarbs]g\\n- 지방: [totalFat]g\\n- 종합점수: [score÷2 반올림한 수만큼 ⭐][그 수]/5\\n\\n[개선 제안 1~2줄, 구체적인 음식명 포함]\\n\\n[격려 한 줄 + 이모지 1~2개]

[점수 환산] score를 2로 나눠 반올림 → score=8이면 ⭐⭐⭐⭐ 4/5, score=10이면 ⭐⭐⭐⭐⭐ 5/5
칼로리/영양소는 사진 기반 1인분 추정치입니다.`;

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
