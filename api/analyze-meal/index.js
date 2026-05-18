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
  "summary": "한 줄 요약",
  "score": 1-10점,
  "kakaoMessage": "카카오톡 전송용 피드백 메시지"
}

kakaoMessage 작성 규칙:

[톤]
- 친한 트레이너가 카톡 보내는 것처럼 편안하고 따뜻하게
- 부드러운 어미: "~인 것 같아요", "~해보시면 좋을 것 같아요", "~이시니까"
- 자연스러운 공감 표현 OK: "ㅎㅎ", "단 게 당기셨나봐요", "바쁘셨나봐요"
- 문어체 금지: "감량 목표를 위해서는" X → "감량 중이시니까" O, "~하는 것이 중요해요" X → "~해보시면 좋아요" O

[포맷] 줄바꿈은 \\n 사용:
인사 + 오늘 식단에 대한 자연스러운 공감 한 마디\\n\\n📊 오늘의 분석\\n- 칼로리: [totalCalories]kcal\\n- 단백질: [totalProtein]g[단백질이 목표 대비 부족하면 " (좀 부족해요)"]\\n- 탄수화물: [totalCarbs]g\\n- 지방: [totalFat]g\\n- 종합점수: [score÷2 반올림한 수만큼 ⭐][그 수]/5\\n\\n[개선 제안 1~2줄, 구체적인 음식명 포함]\\n\\n[격려 한 줄 + 이모지 1~2개]

[점수 환산] score를 2로 나눠 반올림 → score=8이면 ⭐⭐⭐⭐ 4/5, score=10이면 ⭐⭐⭐⭐⭐ 5/5

예시:
"오늘 든든하게 챙겨드셨네요! 바쁜 와중에 이 정도면 잘하신 거예요 ㅎㅎ\\n\\n📊 오늘의 분석\\n- 칼로리: 520kcal\\n- 단백질: 18g (좀 부족해요)\\n- 탄수화물: 65g\\n- 지방: 14g\\n- 종합점수: ⭐⭐⭐ 3/5\\n\\n닭가슴살이나 두부를 하나 추가하시면 단백질이 훨씬 좋아질 것 같아요.\\n\\n오늘도 수고하셨어요, 화이팅! 💪"`;

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
        max_tokens: 800,
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
