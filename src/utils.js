const fs = require('fs');
const path = require('path');

// Garantir que pastas existam
const pastas = ['logs', 'screenshots'];
pastas.forEach(pasta => {
    if (!fs.existsSync(pasta)) {
        fs.mkdirSync(pasta, { recursive: true });
    }
});

// Logger simples
function logger(mensagem) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${mensagem}`;
    
    console.log(logMsg);
    
    // Salvar em arquivo
    const logFile = path.join('logs', `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logMsg + '\n');
}

// Logger de erro
function logError(context, error) {
    const timestamp = new Date().toISOString();
    const errorMsg = `[${timestamp}] ERRO em ${context}: ${error.message}\nStack: ${error.stack}\n`;
    
    console.error(errorMsg);
    
    // Salvar em arquivo separado
    const errorFile = path.join('logs', `erros_${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(errorFile, errorMsg);
}

// Gerar username aleatório
function gerarUsername(prefix = 'test') {
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${random}`;
}

// Sleep utility
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    logger,
    logError,
    gerarUsername,
    sleep
};