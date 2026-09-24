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
  apiKey: "AIzaSyAXk_Amh7YnaZXLJdUDMgblMSuJ_dJ48To",
  authDomain: "financeirojornadamilhao-d1470.firebaseapp.com",
  projectId: "financeirojornadamilhao-d1470",
  storageBucket: "financeirojornadamilhao-d1470.firebasestorage.app",
  messagingSenderId: "607271016513",
  appId: "1:607271016513:web:aa30c49e7059e1053f0ec0"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Segunda instância do Firebase, usada só para criar acesso de outra pessoa.
//
// O motivo: `createUserWithEmailAndPassword` deixa a sessão logada como o
// usuário recém-criado. Chamando pelo app principal, quem cria o acesso é
// derrubado da própria conta no meio do cadastro. Numa instância separada, a
// sessão principal não é tocada.
//
// A alternativa seria o Admin SDK numa Cloud Function, que exige o plano
// Blaze. Este projeto roda no gratuito de propósito.
let appCriador = null;
export function authCriador() {
  if (!appCriador) appCriador = initializeApp(firebaseConfig, "criador");
  return getAuth(appCriador);
}

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
