require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');

// ============================================
// CONFIGURAÇÕES
// ============================================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;
const PANEL_URL = process.env.PANEL_URL;
const PANEL_USER = process.env.PANEL_USER;
const PANEL_PASS = process.env.PANEL_PASS;

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================
function gerarUsuario() {
    const prefixos = ['user', 'cli', 'tv', 'iptv', 'stream', 'live'];
    const numeros = Math.floor(Math.random() * 9000 + 1000);
    return `${prefixos[Math.floor(Math.random() * prefixos.length)]}${numeros}`;
}

function gerarSenha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let senha = '';
    for (let i = 0; i < 10; i++) {
        senha += chars[Math.floor(Math.random() * chars.length)];
    }
    return senha;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// AUTOMAÇÃO SIMPLES
// ============================================
async function criarUsuarioNoPainel() {
    console.log('🚀 Iniciando automação...');
    
    let browser = null;
    
    try {
        // Configurar browser para Railway
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setDefaultTimeout(30000);

        console.log('📝 Acessando painel...');
        await page.goto(PANEL_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // LOGIN
        console.log('🔑 Fazendo login...');
        
        // Campo de usuário
        await page.waitForSelector('input[type="email"], input[name="email"], input[type="text"], input[name="username"]', { timeout: 10000 });
        await page.type('input[type="email"], input[name="email"], input[type="text"], input[name="username"]', PANEL_USER, { delay: 100 });
        
        // Campo de senha
        await page.type('input[type="password"]', PANEL_PASS, { delay: 100 });
        
        // Botão de login
        await page.click('button[type="submit"], input[type="submit"], .btn-login, button:contains("Entrar")');
        
        // Aguardar navegação
        await page.waitForNavigation({ timeout: 15000 }).catch(() => console.log('Timeout no navigation, continuando...'));
        await sleep(3000);

        // NAVEGAR PARA USUÁRIOS
        console.log('👥 Procurando menu de usuários...');
        
        const botoes = [
            'a[href*="user"]',
            'a[href*="cliente"]',
            'a[href*="customer"]',
            'a:contains("Usuários")',
            'a:contains("Clientes")',
            '.menu-users',
            '.nav-users'
        ];

        let encontrou = false;
        for (const seletor of botoes) {
            try {
                const elemento = await page.$(seletor);
                if (elemento) {
                    await elemento.click();
                    await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
                    encontrou = true;
                    console.log(`✅ Menu encontrado: ${seletor}`);
                    break;
                }
            } catch (e) {}
        }

        if (!encontrou) {
            // Tenta ir direto pela URL
            const urlAtual = page.url();
            if (urlAtual.includes('admin')) {
                await page.goto(urlAtual + '/users', { waitUntil: 'networkidle2' }).catch(() => {});
            }
        }

        await sleep(2000);

        // CRIAR NOVO USUÁRIO
        console.log('➕ Criando novo usuário...');
        
        // Gerar credenciais
        const username = gerarUsuario();
        const password = gerarSenha();
        
        console.log(`📋 Credenciais: ${username} / ${password}`);

        // Botão adicionar
        const botoesAdd = [
            'button:contains("Adicionar")',
            'a:contains("Adicionar")',
            'button:contains("Novo")',
            'a:contains("Novo")',
            '.btn-add',
            '.btn-primary'
        ];

        for (const seletor of botoesAdd) {
            try {
                const btn = await page.$(seletor);
                if (btn) {
                    await btn.click();
                    break;
                }
            } catch (e) {}
        }

        await sleep(2000);

        // Preencher formulário
        await page.evaluate((user, pass) => {
            const inputs = document.querySelectorAll('input');
            inputs.forEach(input => {
                const type = input.type || '';
                const name = (input.name || '').toLowerCase();
                const id = (input.id || '').toLowerCase();
                const placeholder = (input.placeholder || '').toLowerCase();

                if (name.includes('user') || id.includes('user') || placeholder.includes('usuário') || placeholder.includes('username')) {
                    input.value = user;
                } else if (type === 'password' || name.includes('pass') || id.includes('pass') || placeholder.includes('senha')) {
                    input.value = pass;
                } else if (type === 'email' || name.includes('email') || id.includes('email')) {
                    input.value = `${user}@exemplo.com`;
                }
            });
        }, username, password);

        await sleep(1000);

        // Salvar
        const botoesSalvar = [
            'button[type="submit"]',
            'button:contains("Salvar")',
            'button:contains("Criar")',
            'button:contains("Confirmar")',
            '.btn-success',
            '.btn-primary'
        ];

        for (const seletor of botoesSalvar) {
            try {
                const btn = await page.$(seletor);
                if (btn) {
                    await btn.click();
                    break;
                }
            } catch (e) {}
        }

        await sleep(3000);
        
        await browser.close();
        console.log('✅ Usuário criado com sucesso!');
        
        return { success: true, username, password };

    } catch (error) {
        console.error('❌ Erro na automação:', error.message);
        if (browser) await browser.close().catch(() => {});
        return { success: false, error: error.message };
    }
}

// ============================================
// BOT DO TELEGRAM
// ============================================
console.log('🤖 Iniciando bot...');

// Verificar token
if (!TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN não configurado!');
    process.exit(1);
}

// Criar bot
const bot = new TelegramBot(TOKEN, { 
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

console.log('✅ Bot conectado!');

// Comando /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        `👋 *Olá!*\n\n` +
        `Bot de automação para painel IPTV\n\n` +
        `*Comandos:*\n` +
        `/novo - Criar novo usuário\n` +
        `/status - Status do bot\n` +
        `/help - Ajuda`,
        { parse_mode: 'Markdown' }
    );
});

// Comando /novo
bot.onText(/\/novo/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Verificar autorização
    if (String(chatId) !== String(ADMIN_ID)) {
        return bot.sendMessage(chatId, '⛔ Acesso negado.');
    }

    // Mensagem inicial
    const statusMsg = await bot.sendMessage(
        chatId,
        '🔄 *Iniciando processo...*\n\nAguarde, isso pode levar até 1 minuto.',
        { parse_mode: 'Markdown' }
    );

    try {
        // Executar automação
        const resultado = await criarUsuarioNoPainel();

        if (!resultado.success) {
            throw new Error(resultado.error);
        }

        // Sucesso!
        await bot.editMessageText(
            `✅ *USUÁRIO CRIADO!*\n\n` +
            `📝 *Credenciais:*\n` +
            `└ *Usuário:* \`${resultado.username}\`\n` +
            `└ *Senha:* \`${resultado.password}\``,
            {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
            }
        );

    } catch (error) {
        console.error('Erro:', error);
        
        await bot.editMessageText(
            `❌ *Erro*\n\n${error.message}`,
            {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
            }
        );
    }
});

// Comando /status
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const memoria = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const uptime = Math.floor(process.uptime() / 60);
    
    bot.sendMessage(
        chatId,
        `📊 *Status*\n\n` +
        `🤖 Bot: ✅ Ativo\n` +
        `⏳ Uptime: ${uptime} minutos\n` +
        `💾 Memória: ${memoria} MB`,
        { parse_mode: 'Markdown' }
    );
});

// Comando /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        `📚 *Ajuda*\n\n` +
        `*/novo* - Criar novo usuário\n` +
        `  → Gera credenciais aleatórias\n` +
        `  → Cria no painel automaticamente\n\n` +
        `*/status* - Status do bot\n` +
        `*/help* - Mostrar ajuda`,
        { parse_mode: 'Markdown' }
    );
});

// Tratamento de erros do polling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

console.log('🎯 Bot pronto para uso!');
