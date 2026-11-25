// Firebase 연동: Google 로그인 + Firestore 저장
// 저장 위치는 본인 문서 하위 한 곳뿐: users/{uid}/cosmo/save (merge). 다른 컬렉션은 읽지도 쓰지도 않음.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function initCloud(config) {
  const app = initializeApp(config), auth = getAuth(app), db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  const saveRef = uid => doc(db, 'users', uid, 'cosmo', 'save');
  let saveTimer = 0;

  // 새로고침·재방문에도 로그인 유지
  try { await setPersistence(auth, browserLocalPersistence); } catch (e) { console.warn('[cosmo] 로그인 유지 설정 실패', e.code || e); }

  const Cloud = window.Cloud = {
    ready: true,
    user: null,
    loaded: false,       // 클라우드 저장본을 정상적으로 읽었을 때만 true → 그때만 덮어쓰기 허용
    // 실패하면 오류를 그대로 던져서 화면 토스트에 코드가 보이게 함
    async signIn() {
      try { await signInWithPopup(auth, provider); }
      catch (e) {
        // 팝업이 막힌 환경에서는 리다이렉트 방식으로 재시도
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider);
        else throw e;
      }
    },
    signOut: () => signOut(auth),
    // 저장은 0.8초 묶어서 한 번만 전송. 실패해도 게임은 계속 진행
    save(state) {
      const u = Cloud.user; if (!u || !Cloud.loaded) return;
      clearTimeout(saveTimer);
      const data = { ...state };
      saveTimer = setTimeout(async () => {
        try { await setDoc(saveRef(u.uid), { ...data, name: u.name, savedAt: serverTimestamp() }, { merge: true }); }
        catch (e) { console.warn('[cosmo] 클라우드 저장 실패', e.code || e); }
      }, 800);
    }
  };

  getRedirectResult(auth).catch(e => { console.warn('[cosmo] 리다이렉트 로그인 실패', e.code || e); window.onCloudError && window.onCloudError(e); });
  onAuthStateChanged(auth, async fu => {
    if (!fu) { Cloud.user = null; Cloud.loaded = false; window.onCloudUser && window.onCloudUser(null, null); return; }
    Cloud.user = { uid: fu.uid, name: (fu.displayName || '탐험가').slice(0, 20), email: fu.email, photo: fu.photoURL || '' };
    let cloud = null;
    try { const s = await getDoc(saveRef(fu.uid)); if (s.exists()) cloud = s.data(); Cloud.loaded = true; }
    catch (e) { Cloud.loaded = false; console.warn('[cosmo] 클라우드 불러오기 실패 — 이번 접속은 이 기기에만 저장', e.code || e); }
    window.onCloudUser && window.onCloudUser(Cloud.user, cloud);
  });
}
