import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const game = window.fishBridge;
const gate = document.getElementById('accountGate');
const body = document.getElementById('accountBody');
const status = document.getElementById('accountStatus');
const accountButton = document.getElementById('accountButton');
let auth, db, user = null, loadedUID = null, epoch = 0, timer = 0;
let pending = false, saving = false, task = Promise.resolve(), cloudSnapshot = null;
let currentMode = 'login';
// Chỉ tin dữ liệu phân quyền đọc từ Firestore, không dùng flag trong save game.
async function refreshDevAccess(u, currentEpoch){
  game.setDevMode(false);
  if(!u)return;
  try{
    const result=await getDoc(doc(db,'dev_accounts',u.uid));
    if(epoch===currentEpoch && auth.currentUser?.uid===u.uid && loadedUID===u.uid){
      game.setDevMode(result.exists() && result.data().enabled===true);
    }
  }catch(err){
    console.warn('Không kiểm tra được quyền DEV:',err.code||err.message);
    game.setDevMode(false);
  }
}
const keyFor = uid => 'myfishworld_cloud_local_' + uid;
const pendingKey = uid => 'myfishworld_unsynced_' + uid;
const legacyKey = 'myfishworld_v2';
const safeGet = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const valid = s => s && s.v === 2 && s.tank && Array.isArray(s.bag) && Array.isArray(s.tank.fish);
const showStatus = value => { status.textContent = value; accountButton.title = value; };
const showGate = (markup) => { gate.hidden = false; body.innerHTML = markup; };
const hideGate = () => { gate.hidden = true; };
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function msg(err) {
  let code = err?.code || '';
  return ({'auth/email-already-in-use':'Email đã được đăng ký.','auth/invalid-email':'Email không hợp lệ.', 'auth/weak-password':'Mật khẩu quá yếu (tối thiểu 6 ký tự).', 'auth/invalid-credential':'Sai email hoặc mật khẩu.', 'auth/too-many-requests':'Thử quá nhiều lần, vui lòng thử lại sau.', 'permission-denied':'Firestore Rules từ chối truy cập.', 'unavailable':'Không thể kết nối Firebase.'})[code] || err?.message || 'Đã có lỗi xảy ra';
}
function renderAuth(error='') {
  showGate(`<h2>🐠 My Fish World</h2><p>Đăng nhập để đồng bộ tiến trình trên nhiều thiết bị.</p>
  <div class="accountTabs"><button id="tabLogin" class="${currentMode==='login'?'sel':''}">Đăng nhập</button><button id="tabRegister" class="${currentMode==='register'?'sel':''}">Đăng ký</button></div>
  <form id="authForm"><label>Email<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
  <label>Mật khẩu<input name="password" type="password" minlength="6" autocomplete="${currentMode==='login'?'current-password':'new-password'}" required placeholder="Ít nhất 6 ký tự"></label>
  <button class="authPrimary" type="submit">${currentMode==='login'?'Đăng nhập':'Đăng ký tài khoản'}</button></form>
  <button class="accountLink" id="forgotBtn">Quên mật khẩu?</button><p id="authError" class="accountError">${esc(error)}</p>
  <small>Dữ liệu chỉ được tải sau khi xác thực tài khoản.</small>`);
  document.getElementById('tabLogin').onclick = () => {currentMode='login';renderAuth();};
  document.getElementById('tabRegister').onclick = () => {currentMode='register';renderAuth();};
  document.getElementById('authForm').onsubmit = async e => {
    e.preventDefault(); const f=e.currentTarget, email=f.elements.namedItem('email').value.trim(), pass=f.elements.namedItem('password').value;
    f.querySelector('button[type="submit"]').disabled = true;
    try { if (currentMode==='login') await signInWithEmailAndPassword(auth,email,pass); else await createUserWithEmailAndPassword(auth,email,pass); }
    catch(err) {renderAuth(msg(err));}
  };
  document.getElementById('forgotBtn').onclick = async () => {
    const email = document.querySelector('#authForm [name="email"]').value.trim();
    if(!email){document.getElementById('authError').textContent='Nhập email trước khi đặt lại mật khẩu';return;}
    try {await sendPasswordResetEmail(auth,email); document.getElementById('authError').textContent='Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi.';}
    catch(err){document.getElementById('authError').textContent=msg(err);}
  };
}
function setSaveAccess(uid) {
  loadedUID=uid;
  game.setSaveEnabled(!!uid);
  accountButton.hidden=!uid;
}
async function loadUser(u, myEpoch) {
  setSaveAccess(null);showStatus('Đang tải dữ liệu...');showGate('<h2>☁️ Đang tải tiến trình...</h2><p>Đang đọc bản lưu trên Firebase. Không đóng tab.</p>');
  let snap;
  try { snap = await getDoc(doc(db,'users',u.uid,'saves','main')); }
  catch(err){ if(epoch!==myEpoch)return; showGate(`<h2>Không tải được tiến trình</h2><p class="accountError">${esc(msg(err))}</p><button class="authPrimary" id="retryLoad">Thử lại</button><button class="accountLink" id="signOutError">Đăng xuất</button>`);
    document.getElementById('retryLoad').onclick=()=>loadUser(u,++epoch);
    document.getElementById('signOutError').onclick=()=>signOut(auth); return;
  }
  if(epoch!==myEpoch || auth.currentUser?.uid!==u.uid)return;
  cloudSnapshot = snap.exists() && valid(snap.data().gameState) ? snap.data().gameState : null;
  const local=safeGet(keyFor(u.uid)); const old=safeGet(legacyKey);
  const offline=pendingKey(u.uid) && localStorage.getItem(pendingKey(u.uid))==='1';
  const hasLegacy=valid(old) && !localStorage.getItem('myfishworld_imported_'+u.uid);
  // Cloud snapshot luôn thắng cache local khi không có thay đổi offline chưa đồng bộ.
  if(offline && valid(local) && cloudSnapshot) return chooseSave(u,myEpoch,local,cloudSnapshot,'offline');
  if(hasLegacy && cloudSnapshot) return chooseSave(u,myEpoch,old,cloudSnapshot,'legacy');
  if(hasLegacy && !cloudSnapshot) return chooseSave(u,myEpoch,old,null,'legacy');
  if(offline && valid(local) && !cloudSnapshot) return activate(u,myEpoch,local,true);
  if(cloudSnapshot) return activate(u,myEpoch,cloudSnapshot,false);
  return activate(u,myEpoch,game.newGame(),true);
}
function chooseSave(u,myEpoch,local,cloud,reason) {
  const oldLabel=reason==='legacy'?'tiến trình HTML cũ':'tiến trình lưu khi offline';
  showGate(`<h2>💾 Chọn bản lưu</h2><p>Phát hiện ${oldLabel}. Chỉ một phiên bản sẽ được sử dụng.</p>
  ${cloud?'<button class="authPrimary" id="useCloud">Sử dụng bản Firebase</button>':'<p>Chưa có bản lưu Firebase.</p>'}
  <button class="authPrimary" id="useLocal">Sử dụng ${oldLabel} và tải lên Firebase</button>
  <p class="accountError" id="pickError"></p><small>Chọn bản Firebase sẽ giữ nguyên bản local cũ để bạn có thể sao lưu thủ công.</small>`);
  if(cloud)document.getElementById('useCloud').onclick=()=>activate(u,myEpoch,cloud,false,reason==='legacy');
  document.getElementById('useLocal').onclick=()=>activate(u,myEpoch,local,true,reason==='legacy');
}
async function activate(u,myEpoch,state,upload,markLegacy=false) {
  if(epoch!==myEpoch)return;
  try { game.applyState(structuredClone(state)); }
  catch(err){showGate(`<h2>Bản lưu lỗi</h2><p class="accountError">${esc(msg(err))}</p>`);return;}
  if(markLegacy)localStorage.setItem('myfishworld_imported_'+u.uid,'1');
  localStorage.setItem(keyFor(u.uid),JSON.stringify(game.getState()));
  setSaveAccess(u.uid);hideGate();showStatus(upload?'Chưa đồng bộ':'Đã tải từ Firebase');
  void refreshDevAccess(u,myEpoch);
  if(upload){pending=true;queueSave(true);} else {pending=false;localStorage.removeItem(pendingKey(u.uid));}
}
function queueSave(immediate=false) {
  if(!loadedUID || auth.currentUser?.uid!==loadedUID)return;
  const uid=loadedUID;
  const serialized=JSON.stringify(game.getState());
  localStorage.setItem(keyFor(uid),serialized);
  localStorage.setItem(pendingKey(uid),'1');pending=true;
  showStatus('Chưa đồng bộ');
  clearTimeout(timer);
  timer=setTimeout(()=>void flush(uid),immediate?0:4000);
}
function flush(uid) {
  if(!uid || uid!==loadedUID || auth.currentUser?.uid!==uid || saving)return task;
  clearTimeout(timer);
  const serialized=localStorage.getItem(keyFor(uid));
  if(!serialized)return task;
  saving=true;
  const state=JSON.parse(serialized);
  showStatus('Đang lưu...');
  const request = setDoc(doc(db,'users',uid,'saves','main'),{gameState:state,schemaVersion:2,updatedAt:serverTimestamp()});
  task=request.then(()=>{
    if(uid!==loadedUID)return;
    if(localStorage.getItem(keyFor(uid))===serialized){localStorage.removeItem(pendingKey(uid));pending=false;showStatus('Đã đồng bộ ✓');}
    else{showStatus('Có thay đổi mới');queueSave(true);}
  }).catch(err=>{if(uid===loadedUID)showStatus('Lưu lỗi: '+msg(err));}).finally(()=>{saving=false;
    if(uid===loadedUID && pending && localStorage.getItem(keyFor(uid))!==serialized) queueSave(true);
  });
  return task;
}
window.fishCloudChanged = () => { if(loadedUID)queueSave(); };
function accountPanel() {
  if(!loadedUID)return;
  showGate(`<h2>👤 Tài khoản</h2><p>${esc(auth.currentUser?.email||'')}</p><p>Trạng thái: ${esc(status.textContent)}</p>
  <button class="authPrimary" id="saveNow">☁️ Lưu lên Firebase ngay</button>
  <button class="authPrimary" id="continueGame">Tiếp tục chơi</button>
  <button class="accountLink" id="logoutButton">Đăng xuất</button><p id="accountErr" class="accountError"></p>`);
  document.getElementById('continueGame').onclick=hideGate;
  document.getElementById('saveNow').onclick=async()=>{queueSave(true);await flush(loadedUID);document.getElementById('accountErr').textContent=status.textContent;};
  document.getElementById('logoutButton').onclick=async()=>{
    const btn=document.getElementById('logoutButton');btn.disabled=true;
    if(pending){await flush(loadedUID);if(pending){document.getElementById('accountErr').textContent='Chưa lưu được lên cloud. Dữ liệu vẫn giữ trên máy. Bạn có thể thử lại hoặc đăng xuất khi đã có mạng.';btn.disabled=false;return;}}
    await signOut(auth);
  };
}
accountButton.onclick=accountPanel;
window.addEventListener('online',()=>{if(loadedUID&&pending)queueSave(true);});
window.addEventListener('pagehide',()=>{if(loadedUID&&pending)void flush(loadedUID);});
if (Object.values(firebaseConfig).some(value => !value || value.includes('YOUR_'))) {
  showGate('<h2>⚙️ Chưa cấu hình Firebase</h2><p>Mở file <b>firebase-config.js</b> và thay 6 trường cấu hình lấy từ Firebase Console. Sau đó tải lại trang.</p>');
  showStatus('Chưa cấu hình');
} else {
  try {
    const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    onAuthStateChanged(auth, async u=>{
      const myEpoch=++epoch;clearTimeout(timer);loadedUID=null;game.setSaveEnabled(false);game.setDevMode(false);user=u;
      if(!u){game.applyState(game.newGame());accountButton.hidden=true;pending=false;renderAuth();showStatus('Chưa đăng nhập');return;}
      await loadUser(u,myEpoch);
    },err=>{showGate(`<h2>Lỗi xác thực</h2><p class="accountError">${esc(msg(err))}</p>`);});
  } catch(err){showGate(`<h2>Firebase lỗi</h2><p class="accountError">${esc(msg(err))}</p>`);}
}
