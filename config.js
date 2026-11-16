// Configuração do Gestor de Tarefas — Mineragro P&D Agronômico
// Preencha com os dados do seu projeto Supabase (Project Settings → API).
// A "anon key" (ou "publishable key") é pública por natureza: a proteção dos dados é feita
// pelas regras do banco (supabase/schema.sql). NUNCA coloque aqui a service_role key.
//
// Com os dois campos vazios, o sistema abre em MODO DEMONSTRAÇÃO (dados fictícios, nada é salvo).
window.APP_CONFIG = {
  SUPABASE_URL: "https://elojzuaafdxaqaldmnun.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsb2p6dWFhZmR4YXFhbGRtbnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3OTI3ODcsImV4cCI6MjEwOTM2ODc4N30.F24jqAq301B6BLaqS4yHoM-4FyWgtY_10z2ZcilC_u0",
  EMAIL_DOMAIN: "mineragro.com",
  // Endereço público do sistema: para onde voltam os links de confirmação e de "esqueci a senha".
  APP_URL: "https://mathausmandro.github.io/mineragro-equipe/",
  // true: colaboradores criam a própria conta com o e-mail @mineragro.com (confirmando pelo e-mail).
  // false: só a gestão cria contas pelo painel do Supabase.
  ALLOW_SIGNUP: true,
};
