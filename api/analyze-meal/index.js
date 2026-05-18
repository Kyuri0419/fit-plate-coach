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
인사 + 오늘 식단에 대한 자연스러운 공감 한 마디\\n\\n📊 오늘의 분석\\n- 칼로리: [totalCalories]kcal\\n- 단백질: [totalProtein]g[부족하면 " (좀 부족해요)"]\\n- 탄수화물: [totalCarbs]g\\n- 지방: [totalFat]g\\n- 종합점수: [score÷2 반올림 수만큼 ⭐][그 수]/5\\n\\n[부족한 영양소 1줄 언급]\\n\\n💡 다음 끼니 추천 메뉴\\n- [메뉴1 이름] ([한국인이 쉽게 구할 수 있는 식재료 + 구체적 분량])\\n- [메뉴2 이름] ([구체적 구성])\\n- [메뉴3 이름] ([구체적 구성])\\n\\n이 중 하나만 골라드셔도 [부족한 영양소] 충분히 채워져요!\\n\\n[격려 한 줄 + 이모지 1~2개]

[추천 메뉴 작성 기준]
- 한국인이 마트·편의점·배달로 쉽게 구할 수 있는 식재료
- 분량 반드시 구체적으로 (닭가슴살 150g, 두부 1/2모, 현미밥 100g 등)
- 오늘 먹은 식단에서 부족한 영양소(주로 단백질, 때로 식이섬유)를 채우는 조합으로 구성
- 만들기 쉽거나 사 먹을 수 있는 현실적인 메뉴

[점수 환산] score÷2 반올림 → 8점=⭐⭐⭐⭐ 4/5, 10점=⭐⭐⭐⭐⭐ 5/5

예시:
"오늘 간식 위주로 드셨네요! 단 게 땡기는 날이었나봐요 ㅎㅎ\\n\\n📊 오늘의 분석\\n- 칼로리: 320kcal\\n- 단백질: 8g (좀 부족해요)\\n- 탄수화물: 52g\\n- 지방: 12g\\n- 종합점수: ⭐⭐⭐ 3/5\\n\\n감량 중이시니까 단백질 좀 채워주시면 좋아요.\\n\\n💡 다음 끼니 추천 메뉴\\n- 닭가슴살 샐러드 (닭가슴살 150g + 양상추 + 방울토마토 + 발사믹)\\n- 두부 한 끼 (두부 1/2모 구이 + 현미밥 100g + 김치)\\n- 그릭요거트 볼 (그릭요거트 200g + 견과류 한 줌 + 블루베리)\\n\\n이 중 하나만 골라드셔도 단백질 25g 이상 채워져요!\\n\\n오늘도 화이팅이에요 💪🔥"`;

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
