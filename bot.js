require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');

// Configurar Puppeteer com Stealth
puppeteer.use(StealthPlugin());

// ============================================
// CONFIGURAÇÕES
// ============================================
const CONFIG = {
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        adminId: process.env.TELEGRAM_ADMIN_ID
    },
    painel: {
        url: process.env.PANEL_URL,
        user: process.env.PANEL_USER,
        pass: process.env.PANEL_PASS
    },
    puppeteer: {
        headless: process.env.PUPPETEER_HEADLESS === 'true',
        timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000,
        slowMo: parseInt(process.env.PUPPETEER_SLOW_MO) || 50
    }
};

// ============================================
// UTILITÁRIOS
// ============================================
const Utils = {
    gerarUsuario() {
        const prefixos = ['user', 'cli', 'tv', 'iptv', 'stream'];
        const numeros = Math.floor(Math.random() * 9000 + 1000);
        return `${prefixos[Math.floor(Math.random() * prefixos.length)]}${numeros}`;
    },

    gerarSenha() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&';
        let senha = '';
        for (let i = 0; i < 12; i++) {
            senha += chars[Math.floor(Math.random() * chars.length)];
        }
        return senha;
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    log(msg, tipo = 'info') {
        const timestamp = new Date().toLocaleString('pt-BR');
        console.log(`[${timestamp}] [${tipo.toUpperCase()}] ${msg}`);
    },

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================
// AUTOMAÇÃO DO PAINEL
// ============================================
class PainelAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async iniciar() {
        Utils.log('Iniciando navegador...');
        
        this.browser = await puppeteer.launch({
            headless: CONFIG.puppeteer.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ],
            slowMo: CONFIG.puppeteer.slowMo
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        await this.page.setDefaultTimeout(CONFIG.puppeteer.timeout);
        
        Utils.log('Navegador iniciado');
        return this;
    }

    async fazerLogin() {
        Utils.log('Fazendo login no painel...');
        
        try {
            // Acessar página
            await this.page.goto(CONFIG.painel.url, { waitUntil: 'networkidle0' });
            
            // Preencher usuário
            await this.page.waitForSelector('input[type="email"], input[name="email"], input[type="text"]');
            await this.page.type('input[type="email"], input[name="email"], input[type="text"]', CONFIG.painel.user, { delay: 100 });
            
            // Preencher senha
            await this.page.type('input[type="password"]', CONFIG.painel.pass, { delay: 100 });
            
            // Clicar no botão de login
            await this.page.click('button[type="submit"], input[type="submit"], .btn-login');
            
            // Aguardar navegação
            await this.page.waitForNavigation({ timeout: 15000 });
            
            Utils.log('Login realizado com sucesso');
            return true;
            
        } catch (error) {
            Utils.log(`Erro no login: ${error.message}`, 'erro');
            throw error;
        }
    }

    async navegarParaUsuarios() {
        Utils.log('Navegando para área de usuários...');
        
        try {
            // Tentar encontrar link de usuários
            const selectors = [
                'a[href*="user"]',
                'a[href*="cliente"]',
                'a:contains("Usuários")',
                'a:contains("Clientes")',
                '.menu-users',
                '.nav-users'
            ];

            for (const selector of selectors) {
                const element = await this.page.$(selector);
                if (element) {
                    await element.click();
                    await this.page.waitForNavigation({ timeout: 10000 });
                    Utils.log('Navegação concluída');
                    return true;
                }
            }
            
            throw new Error('Menu de usuários não encontrado');
            
        } catch (error) {
            Utils.log(`Erro na navegação: ${error.message}`, 'erro');
            throw error;
        }
    }

    async criarUsuario() {
        Utils.log('Criando novo usuário...');
        
        try {
            // Gerar credenciais
            const username = Utils.gerarUsuario();
            const password = Utils.gerarSenha();
            
            // Clicar em adicionar
            await this.page.click('button:contains("Adicionar"), a:contains("Adicionar"), .btn-add');
            await this.page.waitForSelector('form', { timeout: 10000 });
            
            // Preencher formulário
            await this.page.type('input[name="username"], input[name="user"]', username, { delay: 80 });
            await this.page.type('input[type="password"]', password, { delay: 80 });
            
            // Preencher campos opcionais se existirem
            const emailInput = await this.page.$('input[type="email"]');
            if (emailInput) {
                await emailInput.type(`${username}@exemplo.com`, { delay: 50 });
            }
            
            // Salvar
            await this.page.click('button[type="submit"], button:contains("Salvar"), .btn-save');
            
            // Aguardar confirmação
            await Utils.sleep(3000);
            
            Utils.log(`Usuário criado: ${username}`);
            
            return { username, password };
            
        } catch (error) {
            Utils.log(`Erro ao criar usuário: ${error.message}`, 'erro');
            
            // Tirar screenshot do erro
            const screenshot = await this.page.screenshot({ encoding: 'base64' });
            return { error: true, message: error.message, screenshot };
        }
    }

    async fechar() {
        if (this.browser) {
            await this.browser.close();
            Utils.log('Navegador fechado');
        }
    }
}

// ============================================
// BOT DO TELEGRAM
// ============================================
class Bot {
    constructor() {
        this.bot = new TelegramBot(CONFIG.telegram.token, { polling: true });
        this.automacao = null;
        this.operacoes = new Map();
    }

    iniciar() {
        Utils.log('Iniciando bot do Telegram...');
        
        // Comando /start
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            this.bot.sendMessage(
                chatId,
                `👋 *Olá!*\n\n` +
                `Bot de automação para painel IPTV\n\n` +
                `*Comandos:*\n` +
                `/novo - Criar novo usuário\n` +
                `/status - Verificar status\n` +
                `/help - Ajuda`,
                { parse_mode: 'Markdown' }
            );
        });

        // Comando /novo
        this.bot.onText(/\/novo/, async (msg) => {
            const chatId = msg.chat.id;
            
            // Verificar autorização
            if (String(chatId) !== String(CONFIG.telegram.adminId)) {
                return this.bot.sendMessage(chatId, '⛔ Acesso negado.');
            }

            // Verificar se já tem operação em andamento
            if (this.operacoes.has(chatId)) {
                return this.bot.sendMessage(chatId, '⏳ Você já tem uma operação em andamento.');
            }

            this.operacoes.set(chatId, { status: 'iniciando' });

            try {
                // Mensagem inicial
                const statusMsg = await this.bot.sendMessage(
                    chatId,
                    '🔄 *Iniciando processo...*\n\n' +
                    '⏳ Acessando painel...',
                    { parse_mode: 'Markdown' }
                );

                // Iniciar automação
                this.automacao = new PainelAutomation();
                await this.automacao.iniciar();
                
                await this.bot.editMessageText(
                    '🔄 *Acessando painel...*\n\n✅ Login em andamento...',
                    {
                        chat_id: chatId,
                        message_id: statusMsg.message_id,
                        parse_mode: 'Markdown'
                    }
                );

                // Login
                await this.automacao.fazerLogin();
                
                await this.bot.editMessageText(
                    '🔄 *Login realizado...*\n\n✅ Navegando para usuários...',
                    {
                        chat_id: chatId,
                        message_id: statusMsg.message_id,
                        parse_mode: 'Markdown'
                    }
                );

                // Navegar
                await this.automacao.navegarParaUsuarios();
                
                await this.bot.editMessageText(
                    '🔄 *Área de usuários acessada...*\n\n✅ Criando novo usuário...',
                    {
                        chat_id: chatId,
                        message_id: statusMsg.message_id,
                        parse_mode: 'Markdown'
                    }
                );

                // Criar usuário
                const resultado = await this.automacao.criarUsuario();

                if (resultado.error) {
                    throw new Error(resultado.message);
                }

                // Sucesso!
                await this.bot.editMessageText(
                    `✅ *USUÁRIO CRIADO COM SUCESSO!*\n\n` +
                    `📝 *Credenciais:*\n` +
                    `└ *Usuário:* \`${resultado.username}\`\n` +
                    `└ *Senha:* \`${resultado.password}\`\n\n` +
                    `🔗 *Acesso:* ${CONFIG.painel.url}`,
                    {
                        chat_id: chatId,
                        message_id: statusMsg.message_id,
                        parse_mode: 'Markdown'
                    }
                );

                // Mensagem adicional
                await this.bot.sendMessage(
                    chatId,
                    '📋 *Instruções:*\n' +
                    '1. Guarde as credenciais\n' +
                    '2. Use o link para acessar\n' +
                    '3. O usuário já está ativo',
                    { parse_mode: 'Markdown' }
                );

            } catch (error) {
                Utils.log(`Erro na operação: ${error.message}`, 'erro');
                
                await this.bot.sendMessage(
                    chatId,
                    `❌ *Erro na operação*\n\n` +
                    `*Motivo:* ${error.message}\n\n` +
                    `Tente novamente mais tarde.`,
                    { parse_mode: 'Markdown' }
                );
                
            } finally {
                // Limpar operação
                this.operacoes.delete(chatId);
                
                // Fechar navegador
                if (this.automacao) {
                    await this.automacao.fechar();
                    this.automacao = null;
                }
            }
        });

        // Comando /status
        this.bot.onText(/\/status/, (msg) => {
            const chatId = msg.chat.id;
            
            const status = {
                operacoes: this.operacoes.size,
                memoria: process.memoryUsage(),
                uptime: process.uptime()
            };

            const horas = Math.floor(status.uptime / 3600);
            const minutos = Math.floor((status.uptime % 3600) / 60);
            const memoriaMB = (status.memoria.heapUsed / 1024 / 1024).toFixed(2);

            this.bot.sendMessage(
                chatId,
                `📊 *Status do Sistema*\n\n` +
                `🤖 Operações ativas: ${status.operacoes}\n` +
                `⏳ Uptime: ${horas}h ${minutos}m\n` +
                `💾 Memória: ${memoriaMB} MB\n` +
                `✅ Bot: Ativo`,
                { parse_mode: 'Markdown' }
            );
        });

        // Comando /help
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            
            this.bot.sendMessage(
                chatId,
                `📚 *Ajuda*\n\n` +
                `*/novo* - Criar novo usuário\n` +
                `  → O bot acessa o painel\n` +
                `  → Cria credenciais aleatórias\n` +
                `  → Retorna login e senha\n\n` +
                `*/status* - Status do bot\n` +
                `*/help* - Mostrar esta ajuda\n\n` +
                `*Tempo estimado:* 30-60 segundos`,
                { parse_mode: 'Markdown' }
            );
        });

        // Tratamento de erros
        this.bot.on('polling_error', (error) => {
            Utils.log(`Erro no polling: ${error.message}`, 'erro');
        });

        Utils.log('Bot iniciado com sucesso!');
    }
}

// ============================================
// INICIAR APLICAÇÃO
// ============================================
const bot = new Bot();
bot.iniciar();

// Tratamento de desligamento
process.on('SIGINT', async () => {
    Utils.log('Encerrando aplicação...', 'aviso');
    if (bot.automacao) {
        await bot.automacao.fechar();
    }
    process.exit(0);
});
