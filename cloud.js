// Firebase 연동: Google 로그인 + Firestore 저장 + 랭킹
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function initCloud(config) {
  const app = initializeApp(config), auth = getAuth(app), db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  let saveTimer = 0;

  const Cloud = window.Cloud = {
    ready: true,
    user: null,
    async signIn() {
      try { await signInWithPopup(auth, provider); }
      catch (e) {
        // 팝업이 막힌 환경(일부 모바일 브라우저)에서는 리다이렉트 방식으로 재시도
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider);
        else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
      }
    },
    signOut: () => signOut(auth),
    // 저장은 0.8초 묶어서 한 번만 전송
    save(state) {
      if (!Cloud.user) return;
      clearTimeout(saveTimer);
      const data = { ...state }, u = Cloud.user;
      saveTimer = setTimeout(async () => {
        try {
          await setDoc(doc(db, 'users', u.uid), { ...data, name: u.name, savedAt: serverTimestamp() }, { merge: true });
          await setDoc(doc(db, 'leaderboard', u.uid), { name: u.name, best: data.best || 0, updatedAt: serverTimestamp() });
        } catch (e) { console.warn('클라우드 저장 실패', e); }
      }, 800);
    },
    async board() {
      const snap = await getDocs(query(collection(db, 'leaderboard'), orderBy('best', 'desc'), limit(20)));
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    }
  };

  getRedirectResult(auth).catch(() => {});
  onAuthStateChanged(auth, async fu => {
    if (!fu) { Cloud.user = null; window.onCloudUser && window.onCloudUser(null, null); return; }
    Cloud.user = { uid: fu.uid, name: (fu.displayName || '탐험가').slice(0, 20), email: fu.email };
    let cloud = null;
    try { const s = await getDoc(doc(db, 'users', fu.uid)); if (s.exists()) cloud = s.data(); } catch (e) { console.warn('클라우드 불러오기 실패', e); }
    window.onCloudUser && window.onCloudUser(Cloud.user, cloud);
  });
}
