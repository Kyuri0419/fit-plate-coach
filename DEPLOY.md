# Fit Plate Coach 배포 메모

## 1. Supabase 연결

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase-schema.sql` 내용을 실행합니다.
3. Project Settings > API에서 `Project URL`과 `anon public key`를 복사합니다.
4. `supabase-config.js`에 붙여넣습니다.

```js
window.FIT_PLATE_SUPABASE = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_ANON_KEY",
};
```

설정이 비어 있으면 앱은 로컬 저장 모드로 동작합니다. 설정을 채우면 로그인/회원/식단/사진이 Supabase에 저장됩니다.

회원 목록에는 회원별 업로드 링크가 표시됩니다. 그 링크를 회원에게 보내면 회원은 로그인 없이 식단과 사진을 제출할 수 있고, 트레이너 계정의 대시보드에 기록됩니다.

## 2. 정적 사이트 배포

Netlify, Vercel, GitHub Pages 중 하나에 이 폴더를 그대로 올리면 됩니다.

필수 파일:

- `index.html`
- `styles.css`
- `app.js`
- `supabase-config.js`

로컬 확인:

```bash
node server.js
```

그 다음 `http://localhost:5173`을 엽니다.

## 3. 현재 보안 범위

현재 버전은 트레이너 계정별로 데이터가 분리됩니다. 회원 업로드 링크는 토큰 기반입니다. 실제 유료 서비스로 운영하려면 회원 로그인, 링크 만료, 삭제 기능, 개인정보 동의 화면을 추가하는 것이 좋습니다.
