// キンジロー君 Service Worker
// 目的:
//  (1) iOSのホーム画面アプリを「正しくインストールされたPWA」にして保存(localStorage)を安定させる
//      → 端末記憶が定着し、2回目以降はメール/コード無しで自動ログインできる
//  (2) アプリ枠(HTML/ロゴ等)をキャッシュしてオフライン耐性・起動高速化
// 重要: GAS等クロスオリジンの通信(ログイン・打刻・申請のPOST)は絶対に横取りしない
const CACHE  = 'kinjiro-v4';
const ASSETS = ['./', './index.html', './manifest.json', './logo.png', './imnz6098.png', './guide.html'];

// ===== Firebase Cloud Messaging（Web Push・バックグラウンド受信） =====
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyCAqTSOoSpaLFLD6Rymn4C83iPM0reiUyk',
    authDomain: 'kinjiro-2501b.firebaseapp.com',
    projectId: 'kinjiro-2501b',
    storageBucket: 'kinjiro-2501b.firebasestorage.app',
    messagingSenderId: '873236888749',
    appId: '1:873236888749:web:3244e66189cd187ef45a24'
  });
  const fcm = firebase.messaging();
  // サーバーからは data-only メッセージで送る（title/body/badge/tag を data に入れる）
  fcm.onBackgroundMessage(function (payload) {
    const d = payload.data || {};
    const title = d.title || 'キンジロー君';
    const opts = {
      body: d.body || '',
      icon: './imnz6098.png',
      badge: './imnz6098.png',
      data: d
    };
    if (d.tag) opts.tag = d.tag;
    self.registration.showNotification(title, opts);
    // ホーム画面アイコンのバッジを更新（件数が同梱されている時だけ。未指定なら現状維持）
    try {
      if (typeof d.badge !== 'undefined' && d.badge !== '') {
        const c = parseInt(d.badge, 10);
        if (!isNaN(c) && self.navigator && 'setAppBadge' in self.navigator) {
          if (c > 0) self.navigator.setAppBadge(c); else self.navigator.clearAppBadge();
        }
      }
    } catch (e) {}
  });
} catch (e) { /* FCM未対応環境でもSW自体は動かす */ }

// 通知タップ時：既存の窓があればフォーカス、無ければ開く
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

self.addEventListener('install', (e) => {
  // 1つでも失敗した資産があっても install 自体は成功させる
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST(GASのAPI)は素通し
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;        // クロスオリジン(script.google.com等)は素通し

  const isHtml = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHtml) {
    // HTMLはネット優先（デプロイ更新を確実に反映）。失敗時のみキャッシュ
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }
  // 静的資産はキャッシュ優先（無ければ取得してキャッシュ）
  e.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    }).catch(() => r))
  );
});
