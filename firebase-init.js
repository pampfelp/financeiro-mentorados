// Inicialização do Firebase — SDK modular via CDN, sem bundler, sem build.
//
// Firestore é o banco e a fonte de verdade deste sistema. Não existe Apps
// Script aqui: a logo do mentorado é gravada em base64 no próprio documento
// da empresa, então não há upload de arquivo pra fazer.
//
// Este sistema é SEPARADO do financeiro interno da Jornada do Milhão, em
// projeto Firebase próprio. O motivo está no PLANO.md: cliente externo nunca
// escreve no banco do negócio.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// TROQUE pela config do SEU projeto (Firebase Console > Configurações do
// projeto > seus apps > app Web > "Config"). O passo a passo está no README.
//
// Essas chaves são públicas por design no Firebase Web. A segurança vem das
// firestore.rules, não de esconder esta config.
export const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI.firebasestorage.app",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Cache local persistente (IndexedDB): o que já veio continua disponível se a
// internet cair, e reabrir a mesma tela traz só o que mudou de verdade. É uma
// das sete regras de economia de leitura do PLANO.md — sem isso, cada volta
// pra um mês já visitado custaria a coleção inteira de novo.
let db;
try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  // Navegador sem suporte a IndexedDB (aba anônima em alguns casos): o
  // sistema continua funcionando, só perde o cache entre sessões.
  console.warn("Cache persistente indisponível, seguindo sem ele.", e);
  db = initializeFirestore(firebaseApp, {});
}
export { db };
