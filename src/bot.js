require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Painel = require('./painel');
const utils = require('./utils');

// Configurações
const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;

// Inicializa bot
const bot = new TelegramBot(token, { polling: true });

// Estados dos usuários
const userState = new Map();

// Middleware de autenticação
bot.use(async (msg, next) => {
    const chatId = msg.chat.id;
    
    if (msg.text === '/start') {
        return next();
    }
    
    if (chatId.toString() !== adminId) {
        await bot.sendMessage(chatId, '⛔ Acesso negado. Você não é administrador.');
        return;
    }
    
    next();
});

// Comando /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== adminId) {
        await bot.sendMessage(chatId, '⛔ Acesso negado. Este bot é privado.');
        return;
    }
    
    const menu = `
🤖 *Bot IPTV - Menu Principal*

Escolha uma opção:

1️⃣ - Gerar Teste
2️⃣ - Gerar Usuário Permanente (em breve)

3️⃣ - Verificar Créditos
    `;
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ['🔹 Gerar Teste'],
                ['🔸 Gerar Permanente'],
                ['💰 Ver Créditos']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId, menu, { 
        parse_mode: 'Markdown',
        ...keyboard 
    });
});

// Lidar com mensagens de texto
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Verificar admin
    if (chatId.toString() !== adminId) return;
    
    // Menu principal
    if (text === '🔹 Gerar Teste') {
        userState.set(chatId, { type: 'teste' });
        await showPackageMenu(chatId);
    }
    else if (text === '🔸 Gerar Permanente') {
        userState.set(chatId, { type: 'permanente' });
        await showPackageMenu(chatId);
    }
    else if (text === '💰 Ver Créditos') {
        await checkCredits(chatId);
    }
    // Escolha de pacote
    else if (text === '1️⃣ Completo com adultos' || text === '2️⃣ Completo sem adultos') {
        const packageType = text.includes('com adultos') ? 1 : 2;
        await handleUserCreation(chatId, packageType);
    }
    // Voltar
    else if (text === '◀️ Voltar') {
        userState.delete(chatId);
        await bot.sendMessage(chatId, '/start - Menu principal');
    }
});

async function showPackageMenu(chatId) {
    const menu = `
📦 *Escolha o pacote:*

1️⃣ - Completo com adultos
2️⃣ - Completo sem adultos

◀️ - Voltar
    `;
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ['1️⃣ Completo com adultos'],
                ['2️⃣ Completo sem adultos'],
                ['◀️ Voltar']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId, menu, { 
        parse_mode: 'Markdown',
        ...keyboard 
    });
}

async function checkCredits(chatId) {
    const statusMsg = await bot.sendMessage(chatId, '🔍 Verificando créditos disponíveis...');
    
    try {
        const painel = new Painel();
        await painel.iniciar();
        
        const creditos = await painel.verificarCreditos();
        await painel.fechar();
        
        await bot.editMessageText(`💰 *Créditos disponíveis:* ${creditos}`, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
        });
        
    } catch (error) {
        await bot.editMessageText(`❌ Erro ao verificar créditos: ${error.message}`, {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });
        
        utils.logError('checkCredits', error);
    }
}

async function handleUserCreation(chatId, packageType) {
    const state = userState.get(chatId);
    if (!state) return;
    
    const tipo = state.type === 'teste' ? 'teste' : 'permanente';
    const packageName = packageType === 1 ? 'com adultos' : 'sem adultos';
    
    const statusMsg = await bot.sendMessage(
        chatId, 
        `🔄 Criando usuário de *${tipo}* pacote *${packageName}*...\nAguarde, isso pode levar alguns segundos.`,
        { parse_mode: 'Markdown' }
    );
    
    try {
        // Inicializar painel
        const painel = new Painel();
        await painel.iniciar();
        
        // Verificar créditos
        const creditos = await painel.verificarCreditos();
        if (creditos <= 0) {
            await painel.fechar();
            await bot.editMessageText('❌ Sem créditos disponíveis para criar novo usuário!', {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
            return;
        }
        
        // Criar usuário
        const resultado = state.type === 'teste' 
            ? await painel.criarTeste(packageType)
            : await painel.criarUsuarioPermanente(packageType);
        
        await painel.fechar();
        
        // Sucesso
        const successMsg = `
✅ *Acesso criado com sucesso!*

👤 *Usuário:* \`${resultado.username}\`
🔑 *Senha:* \`${resultado.password}\`
📦 *Pacote:* ${packageName}
⏰ *Tipo:* ${tipo}

💾 *URL:* ${process.env.PANEL_URL}
        `;
        
        await bot.editMessageText(successMsg, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
        });
        
        utils.logger(`Usuário ${tipo} criado: ${resultado.username}`);
        
    } catch (error) {
        await bot.editMessageText(`❌ Erro ao criar usuário:\n\`${error.message}\``, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
        });
        
        utils.logError('handleUserCreation', error);
    } finally {
        userState.delete(chatId);
    }
}

// Tratamento de erros do bot
bot.on('polling_error', (error) => {
    utils.logError('Bot polling error', error);
});

console.log('🤖 Bot IPTV iniciado com sucesso!');
