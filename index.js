const TelegramBot = require('node-telegram-bot-api');
const { Groq } = require('groq-sdk');
const http = require('http');

// Dummy HTTP server to keep Render Free Tier happy and "Live"
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('KLASH AI Telegram Bot is running live!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 HTTP Server active on port ${PORT}`);
});

// Initialize Groq and Telegram Bot with your hardcoded token
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TOKEN = '9070673617:AAGgXTr_Vzs5keeJUK8g6KFatCFna1d3aJk';

const bot = new TelegramBot(TOKEN, { polling: true });

// Conversation history for context memory
let chatHistory = [
    { 
        role: "system", 
        content: "You are KLASH AI, a sharp, intelligent personal AI assistant created and owned by Rufai Ikhlas Ajibola (KLASH WORLD). Be helpful, clear, and concise." 
    }
];

console.log('🚀 KLASH AI Telegram Bot is online and listening...');

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    if (!messageText) return;

    if (messageText.trim().toLowerCase() === '/clear') {
        chatHistory = [chatHistory[0]];
        await bot.sendMessage(chatId, '🤖 *KLASH AI:* Memory cleared. Ready for a fresh topic!', { parse_mode: 'Markdown' });
        return;
    }

    try {
        console.log(`📥 Received from Telegram: "${messageText}"`);
        await bot.sendChatAction(chatId, 'typing');

        chatHistory.push({ role: "user", content: messageText });
        if (chatHistory.length > 13) {
            chatHistory = [chatHistory[0], ...chatHistory.slice(-12)];
        }

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: chatHistory,
        });

        const aiReply = completion.choices[0]?.message?.content || "I couldn't process that.";
        chatHistory.push({ role: "assistant", content: aiReply });

        await bot.sendMessage(chatId, aiReply);
        console.log(`📤 Replied successfully on Telegram.`);

    } catch (error) {
        console.error('AI Error:', error);
        await bot.sendMessage(chatId, '🤖 *KLASH AI:* ⚠️ Error reaching Groq backend.', { parse_mode: 'Markdown' });
    }
});
