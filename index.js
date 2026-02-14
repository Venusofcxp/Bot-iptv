require("dotenv").config();
const { chromium } = require("playwright");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = Number(process.env.ADMIN_ID);

function gerarUsuario() {
  return "user" + Math.floor(Math.random() * 999999);
}

/* ================= LOGIN ================= */
async function loginPainel(page) {
  await page.goto(process.env.PANEL_URL, { waitUntil: "domcontentloaded" });

  // espera campos aparecerem
  await page.waitForSelector("#username", { timeout: 60000 });

  await page.fill("#username", process.env.PANEL_USER);
  await page.fill("#password", process.env.PANEL_PASS);

  await page.click('button[type="submit"]');

  // espera painel carregar
  await page.waitForLoadState("networkidle");

  // pequeno respiro para renderizar
  await page.waitForTimeout(2000);
}

/* ================= CREDITOS ================= */
async function obterCreditos(page) {
  await page.waitForSelector("#reseller_xc_credits");
  const txt = await page.textContent("#reseller_xc_credits");
  return parseInt(txt || "0");
}

/* ================= CRIAR ACESSO ================= */
async function criarAcesso(tipo, pacote) {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS === "true",
  });

  const page = await browser.newPage();

  try {
    await loginPainel(page);

    const creditos = await obterCreditos(page);
    if (creditos <= 0) throw new Error("Sem créditos.");

    // ir para página correta
    if (tipo === "teste") {
      await page.goto(process.env.PANEL_URL + "/application/users/trials");
    } else {
      await page.goto(process.env.PANEL_URL + "/application/users");
    }

    await page.waitForTimeout(2000);

    const username = gerarUsuario();

    // abrir modal
    await page.getByText("Adicionar Novo").click();

    await page.waitForSelector("#line_username", { timeout: 20000 });

    // preencher
    await page.fill("#line_username", username);

    // pacote
    await page.selectOption("#package_line", pacote);

    // criar
    await page.click("#create_user_account");

    // esperar tabela atualizar
    await page.waitForTimeout(4000);

    // procurar linha
    const linha = page.locator("tr", { hasText: username });
    await linha.first().waitFor({ timeout: 20000 });

    const senha = await linha.locator("td").nth(1).innerText();

    await browser.close();

    return { username, senha, creditosRestantes: creditos - 1 };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

/* ================= MENUS ================= */
function menuInicial() {
  return {
    reply_markup: {
      keyboard: [["🧪 Teste"], ["👤 Permanente"]],
      resize_keyboard: true,
    },
  };
}

function menuPacote() {
  return {
    reply_markup: {
      keyboard: [["🔞 Com adulto"], ["🚫 Sem adulto"]],
      resize_keyboard: true,
    },
  };
}

/* ================= ESTADO ================= */
const estado = {};

/* ================= START ================= */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Escolha uma opção:", menuInicial());
});

/* ================= MENSAGENS ================= */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // evita repetir start
  if (text === "/start") return;

  if (text === "🧪 Teste") {
    estado[chatId] = { tipo: "teste" };
    return bot.sendMessage(chatId, "Escolha o pacote:", menuPacote());
  }

  if (text === "👤 Permanente") {
    estado[chatId] = { tipo: "permanente" };
    return bot.sendMessage(chatId, "Escolha o pacote:", menuPacote());
  }

  if (text === "🔞 Com adulto" || text === "🚫 Sem adulto") {
    if (!estado[chatId]) return;

    const pacote = text.includes("Com") ? "1" : "2";
    const tipo = estado[chatId].tipo;

    bot.sendMessage(chatId, "⏳ Criando acesso...");

    try {
      const res = await criarAcesso(tipo, pacote);

      bot.sendMessage(
        chatId,
        `✅ Acesso criado!\n\n👤 Usuário: ${res.username}\n🔑 Senha: ${res.senha}\n💳 Créditos restantes: ${res.creditosRestantes}`
      );
    } catch (e) {
      bot.sendMessage(chatId, "❌ Erro: " + e.message);
    }

    delete estado[chatId];
  }
});

/* ================= ADMIN ================= */
bot.onText(/\/admin/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  bot.sendMessage(msg.chat.id, "🔐 Área de administrador.");
});

console.log("🤖 Bot rodando...");
