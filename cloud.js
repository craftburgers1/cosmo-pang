// Firebase 연동: Google 로그인 + 게임 저장 + 통합 크레딧 지갑
// 읽고 쓰는 곳은 본인 문서 하위뿐:
//   users/{uid}/cosmo/save        게임 저장 (merge)
//   users/{uid}/wallet/main       통합 지갑 잔액 (가계부·근태 앱과 공용)
//   users/{uid}/wallet_log/{id}   지갑 원장 (적립/차감 1건당 1문서, id는 결정적)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, runTransaction, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function initCloud(config) {
  const app = initializeApp(config), auth = getAuth(app), db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  const saveRef = uid => doc(db, 'users', uid, 'cosmo', 'save');
  const walletRef = uid => doc(db, 'users', uid, 'wallet', 'main');
  const logRef = (uid, id) => doc(db, 'users', uid, 'wallet_log', id);
  const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let saveTimer = 0, unsubWallet = null;

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
    walletOk: false,
    // 지갑 적립(+)/차감(−). 반드시 트랜잭션: 원장 문서가 이미 있으면 건너뛰고(중복 방지), 잔액이 모자라면 아무것도 쓰지 않고 실패.
    // 반환 { applied, balance }. 실패 시 e.code = 'wallet/insufficient' | 'wallet/not-signed-in' | Firestore 오류 코드
    async walletApply({ logId, amount, reason, refId = '' }) {
      const u = Cloud.user; if (!u) { const e = new Error('not signed in'); e.code = 'wallet/not-signed-in'; throw e; }
      amount = Math.trunc(amount);
      return runTransaction(db, async tx => {
        const ls = await tx.get(logRef(u.uid, logId)), ws = await tx.get(walletRef(u.uid));
        const w = ws.exists() ? ws.data() : {}, bal = Math.trunc(Number(w.balance) || 0);
        if (ls.exists()) return { applied: false, balance: bal };
        if (amount < 0 && bal + amount < 0) { const e = new Error('insufficient'); e.code = 'wallet/insufficient'; e.balance = bal; throw e; }
        const balance = bal + amount;
        tx.set(walletRef(u.uid), {
          balance,
          lifetimeEarned: (Number(w.lifetimeEarned) || 0) + (amount > 0 ? amount : 0),
          lifetimeSpent: (Number(w.lifetimeSpent) || 0) + (amount < 0 ? -amount : 0),
          schemaVersion: 1, updatedAt: serverTimestamp()
        }, { merge: true });
        tx.set(logRef(u.uid, logId), { amount, reason, source: 'cosmo', refId: String(refId), date: kstDate(), createdAt: serverTimestamp() });
        return { applied: true, balance };
      });
    },
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
    if (unsubWallet) { unsubWallet(); unsubWallet = null; }
    if (!fu) { Cloud.user = null; Cloud.loaded = false; Cloud.walletOk = false; window.onWallet && window.onWallet(null, 'signed-out'); window.onCloudUser && window.onCloudUser(null, null); return; }
    Cloud.user = { uid: fu.uid, name: (fu.displayName || '탐험가').slice(0, 20), email: fu.email, photo: fu.photoURL || '' };
    let cloud = null;
    try { const s = await getDoc(saveRef(fu.uid)); if (s.exists()) cloud = s.data(); Cloud.loaded = true; }
    catch (e) { Cloud.loaded = false; console.warn('[cosmo] 클라우드 불러오기 실패 — 이번 접속은 이 기기에만 저장', e.code || e); }
    window.onCloudUser && window.onCloudUser(Cloud.user, cloud);
    // 지갑: 없으면 잔액 0으로 만들고 1회성 웰컴 +50 (원장 id welcome:v1 로 중복 방지), 이후 실시간 구독
    try {
      const r = await Cloud.walletApply({ logId: 'welcome:v1', amount: 50, reason: 'welcome', refId: 'v1' });
      Cloud.walletOk = true; window.onWallet && window.onWallet(r.balance, null, r.applied ? 'welcome' : '');
    } catch (e) { Cloud.walletOk = false; console.warn('[cosmo] 지갑 열기 실패', e.code || e); window.onWallet && window.onWallet(null, e.code || 'error'); return; }
    const uid = fu.uid;
    unsubWallet = onSnapshot(walletRef(uid), s => {
      if (!Cloud.user || Cloud.user.uid !== uid) return;
      Cloud.walletOk = true; window.onWallet && window.onWallet(s.exists() ? Math.trunc(Number(s.data().balance) || 0) : 0, null);
    }, e => { console.warn('[cosmo] 지갑 구독 실패', e.code || e); });
  });
}
