/**
 * Fit Plate Coach - AI 식단 분석 클라이언트
 * 
 * 사용법:
 *   const result = await analyzeMealText("닭가슴살 200g, 현미밥 한 공기, 브로콜리");
 *   const result = await analyzeMealImage(imageFile);
 */

const API_BASE = '/api'; // Azure Static Web Apps에서 자동으로 Functions로 라우팅됨

/**
 * 텍스트로 입력한 식단 분석
 * @param {string} mealText - 식단 텍스트
 * @param {object} memberInfo - 선택, 회원 정보 { goal, currentWeight, targetWeight }
 */
async function analyzeMealText(mealText, memberInfo = null) {
  const response = await fetch(`${API_BASE}/analyze-meal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mealText, memberInfo })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'AI 분석 실패');
  }

  return response.json();
}

/**
 * 사진으로 식단 분석
 * @param {File} imageFile - input[type=file]에서 받은 이미지 파일
 * @param {object} memberInfo - 선택, 회원 정보
 */
async function analyzeMealImage(imageFile, memberInfo = null) {
  // 파일 → base64 변환
  const base64 = await fileToBase64(imageFile);

  const response = await fetch(`${API_BASE}/analyze-meal-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, memberInfo })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'AI 이미지 분석 실패');
  }

  return response.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); // data:image/jpeg;base64,... 형식 포함
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 전역으로 export (window 사용)
window.FitPlateAI = {
  analyzeMealText,
  analyzeMealImage
};
