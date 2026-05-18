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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.detail || 'AI 이미지 분석 실패');
  }

  return response.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 768;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          // 캔버스 변환 실패 시 원본 data URL 그대로 사용
          resolve(reader.result);
        }
      };
      img.onerror = () => reject(new Error('이미지를 읽을 수 없어요. 다른 사진을 선택해주세요.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했어요.'));
    reader.readAsDataURL(file);
  });
}

// 전역으로 export (window 사용)
window.FitPlateAI = {
  analyzeMealText,
  analyzeMealImage
};
