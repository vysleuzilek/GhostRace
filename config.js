// Nastavení Ghost Race
//
// Bez Firebase appka funguje jen v jednom zařízení (trasy a jízdy se ukládají do telefonu).
// Aby jste mohli závodit s kámošema, vlož sem firebaseConfig z Firebase konzole:
// Firebase → Nastavení projektu → Vaše aplikace → Web app → firebaseConfig
//
// Příklad:
// window.GR_CONFIG = {
//   firebase: {
//     apiKey: "AIza...",
//     authDomain: "ghost-race-xxxx.firebaseapp.com",
//     projectId: "ghost-race-xxxx",
//     storageBucket: "ghost-race-xxxx.appspot.com",
//     messagingSenderId: "123456789",
//     appId: "1:123456789:web:abcdef"
//   }
// };

window.GR_CONFIG = {
  firebase: null
};
