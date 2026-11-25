// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → "SDK 설정 및 구성"의 값을 그대로 붙여넣으세요.
// apiKey가 비어 있으면 게임은 게스트 모드(이 기기에만 저장)로 동작합니다.
// 이 값들은 웹 앱 식별자라서 공개 저장소에 올려도 됩니다. 보안은 firestore.rules가 담당합니다.
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
