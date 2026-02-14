// /app/src/bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const winston = require('winston');

// Configuração de logging
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

class TelegramBotHandler {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.bot = null;
        this.logger = logger;
    }

    async initialize() {
        try {
            // Criar instância do bot (sem middleware .use)
            this.bot = new TelegramBot(this.token, { 
                polling: true,
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });

            logger.info('Bot do Telegram inicializado com sucesso');
            
            // Configurar listeners (em vez de middleware)
            this.setupListeners();
            
            // Verificar conexão
            const botInfo = await this.bot.getMe();
            logger.info(`Bot conectado: @${botInfo.username}`);
            
        } catch (error) {
            logger.error('Erro ao inicializar bot Telegram:', error);
            throw error;
        }
    }

    setupListeners() {
        // LISTENER PARA TODAS AS MENSAGENS (substitui o bot.use)
        this.bot.on('message', (msg) => {
            this.handleMessage(msg);
        });

        // Comandos específicos
        this.bot.onText(/\/start/, (msg) => {
            this.handleStart(msg);
        });

        this.bot.onText(/\/novo/, async (msg) => {
            await this.handleNovoUsuario(msg);
        });

        this.bot.onText(/\/status/, async (msg) => {
            await this.handleStatus(msg);
        });

        this.bot.onText(/\/help/, (msg) => {
            this.handleHelp(msg);
        });

        // Callback queries para botões inline
        this.bot.on('callback_query', async (callbackQuery) => {
            await this.handleCallback(callbackQuery);
        });

        // Tratamento de erros
        this.bot.on('polling_error', (error) => {
            logger.error('Erro no polling:', error);
        });
    }

    handleMessage(msg) {
        // Este é o SUBSTITUTO para o bot.use
        // Aqui você pode processar todas as mensagens
        const chatId = msg.chat.id;
        const text = msg.text;
        
        logger.info(`Mensagem recebida de ${chatId}: ${text}`);
        
        // Se não for um comando conhecido, responde com ajuda
        if (text && !text.startsWith('/')) {
            this.bot.sendMessage(chatId, 
                '👋 Olá! Use /help para ver os comandos disponíveis.'
            );
        }
    }

    handleStart(msg) {
        const chatId = msg.chat.id;
        const userName = msg.from.first_name || msg.from.username || 'Usuário';
        
        const welcomeMessage = `
👋 Olá *${userName}*! Bem-vindo ao Bot de Automação.

*Comandos disponíveis:*
/novo - Criar um novo registro
/status - Verificar status do sistema
/help - Mostrar ajuda

⚠️ *Apenas administradores autorizados.*
        `;

        this.bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown'
        });
    }

    async handleNovoUsuario(msg) {
        const chatId = msg.chat.id;
        
        // Verificar autorização
        if (!this.isAuthorized(chatId)) {
            return this.bot.sendMessage(chatId, '⛔ Você não tem permissão.');
        }

        // Enviar mensagem de processamento
        const processingMsg = await this.bot.sendMessage(
            chatId,
            '🔄 *Processando sua solicitação...*\n\nAguarde, isso pode levar alguns segundos.',
            { parse_mode: 'Markdown' }
        );

        try {
            // SIMULAÇÃO - Aqui você chamaria sua automação
            await this.simularCriacao();
            
            // Gerar credenciais aleatórias para exemplo
            const username = this.gerarUsuario();
            const password = this.gerarSenha();

            // Atualizar mensagem com resultado
            await this.bot.editMessageText(
                `✅ *Operação concluída com sucesso!*\n\n` +
                `📝 *Credenciais geradas:*\n` +
                `└ *Usuário:* \`${username}\`\n` +
                `└ *Senha:* \`${password}\``,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );

        } catch (error) {
            logger.error('Erro na automação:', error);
            
            await this.bot.editMessageText(
                `❌ *Erro ao processar*\n\nMotivo: ${error.message}`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );
        }
    }

    async handleStatus(msg) {
        const chatId = msg.chat.id;
        
        const status = {
            bot: '✅ Ativo',
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };

        const uptime = this.formatUptime(status.uptime);
        const memory = (status.memory.heapUsed / 1024 / 1024).toFixed(2);

        await this.bot.sendMessage(
            chatId,
            `📊 *Status do Sistema*\n\n` +
            `🤖 Bot: ${status.bot}\n` +
            `⏳ Tempo ativo: ${uptime}\n` +
            `💾 Memória: ${memory} MB`,
            { parse_mode: 'Markdown' }
        );
    }

    handleHelp(msg) {
        const chatId = msg.chat.id;
        
        const helpMessage = `
📚 *Comandos Disponíveis*

*/novo* - Inicia o processo de criação
*/status* - Verifica o status do sistema
*/help* - Exibe esta mensagem

*Como usar:*
1. Envie /novo para iniciar
2. Aguarde o processamento
3. Receba as credenciais
        `;

        this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    }

    async handleCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
        
        if (data === 'confirm') {
            await this.bot.sendMessage(msg.chat.id, '✅ Ação confirmada!');
        }
    }

    isAuthorized(chatId) {
        const adminId = process.env.TELEGRAM_ADMIN_ID;
        return String(chatId) === String(adminId);
    }

    gerarUsuario() {
        const prefixos = ['user', 'cliente', 'test'];
        const numeros = Math.floor(Math.random() * 9000 + 1000);
        return `${prefixos[Math.floor(Math.random() * prefixos.length)]}${numeros}`;
    }

    gerarSenha() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$';
        let senha = '';
        for (let i = 0; i < 12; i++) {
            senha += chars[Math.floor(Math.random() * chars.length)];
        }
        return senha;
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${secs}s`;
    }

    async simularCriacao() {
        // Simula um processo que leva 3 segundos
        return new Promise(resolve => setTimeout(resolve, 3000));
    }
}

// Iniciar o bot
const bot = new TelegramBotHandler();
bot.initialize().catch(error => {
    logger.error('Erro fatal:', error);
    process.exit(1);
});
