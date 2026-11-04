/* انتخاب پوشه بکاپ، مدیریت مجوزها و نگهداری مرجع پوشه در IndexedDB. */
(function(window){'use strict';function create(d){
const {indexedDB,getState,setState,backupGateChooseFolder,backupGateStatus,backupGateFeedback,backupFeedback,backupFolderButton,changeBackupFolderButton,writeAutomaticBackup,setApplicationReady,recordActivity}=d;
const DB='anbar-backup-handle-db',STORE='handles';
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function saveHandle(handle){const db=await openDb();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(handle,'directory');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('ذخیره محل بکاپ لغو شد.'));});}finally{db.close();}}
async function loadHandle(){const db=await openDb();try{return await new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get('directory');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
function startWithoutAutomaticBackup(){clearTimeout(getState().backupWriteTimer);setState({automaticBackupDisabledForSession:true,backupSetupCompleted:true,backupWriteTimer:null});setApplicationReady(true);backupGateStatus.textContent='بدون بکاپ خودکار ادامه می‌دهید؛ عملیات قبلی ثبت نشد و باید دوباره انجام شود.';backupFeedback.textContent='بکاپ خودکار غیرفعال است. اطلاعات در حافظه محلی مرورگر ذخیره می‌شوند؛ از بخش بکاپ، نسخه JSON دستی تهیه کنید.';recordActivity('شروع بدون بکاپ خودکار','کاربر سامانه را بدون فعال‌سازی ذخیره خودکار فایل بکاپ اجرا کرد.');}
async function chooseBackupFolder(forceChooseNew=false){
if(typeof window.showDirectoryPicker!=='function'){const m='این مرورگر انتخاب پوشه و ذخیره مستقیم فایل را پشتیبانی نمی‌کند. برای استفاده از سایت، آن را در نسخه به‌روز Chrome یا Edge روی رایانه و از طریق HTTPS باز کنید.';backupGateFeedback.textContent=m;backupFeedback.textContent=m;return;}
let attempts=0;while(getState().backupWriteInProgress&&attempts<120){backupGateStatus.textContent='در حال پایان یافتن ذخیره بکاپ جاری...';await new Promise(r=>setTimeout(r,100));attempts++;}
if(getState().backupWriteInProgress){backupFeedback.textContent='ذخیره قبلی هنوز در حال انجام است؛ چند لحظه دیگر دوباره تلاش کنید.';return;}
const wasReady=getState().applicationReady,old=getState().backupDirectoryHandle,previous=old||await loadHandle().catch(()=>null),previousName=previous?.name||'تعریف‌نشده';
backupGateFeedback.textContent='';backupFeedback.textContent='';backupGateChooseFolder.disabled=true;if(backupFolderButton)backupFolderButton.disabled=true;if(changeBackupFolderButton)changeBackupFolderButton.disabled=true;
try{
let selected=forceChooseNew?null:(old||await loadHandle());
if(selected){let permission=await selected.queryPermission({mode:'readwrite'});if(permission!=='granted'){backupGateStatus.textContent='در حال تمدید مجوز پوشه بکاپ ذخیره‌شده...';permission=await selected.requestPermission({mode:'readwrite'});}
if(permission!=='granted'){backupGateFeedback.textContent='مجوز پوشه قبلی تأیید نشد. برای انتخاب پوشه دیگری، تأیید کنید.';if(!window.confirm('مجوز پوشه بکاپ قبلی تأیید نشد. آیا می‌خواهید پوشه دیگری انتخاب کنید؟'))return;selected=null;}}
if(!selected){backupGateStatus.textContent='در انتظار انتخاب پوشه و ذخیره اولین بکاپ...';selected=await window.showDirectoryPicker({mode:'readwrite'});let p=await selected.queryPermission({mode:'readwrite'});if(p!=='granted')p=await selected.requestPermission({mode:'readwrite'});if(p!=='granted')throw Error('مجوز نوشتن در پوشه داده نشد.');}
backupGateStatus.textContent='پوشه آماده است؛ در حال ذخیره بکاپ...';if(!await writeAutomaticBackup(selected,false))throw Error('ذخیره بکاپ در پوشه انتخاب‌شده ناموفق بود.');
await saveHandle(selected);setState({backupDirectoryHandle:selected,automaticBackupDisabledForSession:false});
const name=selected.name||'پوشه انتخاب‌شده',changed=forceChooseNew||previousName!==name;recordActivity(changed?'تغییر پوشه بکاپ':'فعال‌سازی پوشه بکاپ','پوشه قبلی: «'+previousName+'»؛ پوشه فعلی: «'+name+'»؛ بکاپ اولیه ذخیره شد.');
if(!await writeAutomaticBackup(selected,false))throw Error('ذخیره نهایی بکاپ ناموفق بود.');setApplicationReady(true);
}catch(error){if(error?.name==='AbortError')backupGateStatus.textContent=wasReady?'عملیات لغو شد؛ محل ذخیره قبلی بدون تغییر باقی ماند.':'برای ثبت تغییر، پوشه بکاپ را انتخاب کنید یا بدون بکاپ ادامه دهید.';else{backupGateFeedback.textContent='فعال‌سازی انجام نشد: '+(error?.message||'خطای ناشناخته')+'؛ مجوز پوشه را بررسی کنید.';backupGateStatus.textContent='بکاپ موفق ثبت نشده است.';backupFeedback.textContent=backupGateFeedback.textContent;}
if(wasReady){const h=getState().backupDirectoryHandle;setApplicationReady(h?await writeAutomaticBackup(h,false):false);}}
finally{backupGateChooseFolder.disabled=false;if(backupFolderButton)backupFolderButton.disabled=false;if(changeBackupFolderButton)changeBackupFolderButton.disabled=false;}
}
async function initializeSavedDirectory(){try{const h=await loadHandle();if(!h)return;setState({backupDirectoryHandle:h});const p=await h.queryPermission({mode:'readwrite'});if(p==='granted'){const ok=await writeAutomaticBackup(h,false);if(ok){if(!getState().applicationReady)setApplicationReady(true);backupGateStatus.textContent='پوشه ذخیره‌شده فعال است؛ بکاپ به‌روز شد.';}else backupGateStatus.textContent='پوشه قبلی پیدا شد، اما بکاپ به‌روز نشد؛ پیش از تغییر بعدی مجوز پوشه را بررسی کنید.';}}catch(e){backupGateStatus.textContent='محل ذخیره قبلی قابل استفاده نیست؛ پیش از نخستین تغییر، پوشه را دوباره انتخاب کنید.';}}
return Object.freeze({chooseBackupFolder,startWithoutAutomaticBackup,initializeSavedDirectory});
}window.AnbarBackupFolder=Object.freeze({create});})(window);
