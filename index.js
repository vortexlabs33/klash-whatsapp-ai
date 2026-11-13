const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const http = require('http');

// Dummy HTTP server to keep Render Free Tier happy and "Live"
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('KLASH AI Assistant is running live!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 HTTP Server active on port ${PORT}`);
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// SECOND NUMBER FOR KLASH AI BOT
const BOT_PHONE_NUMBER = '2347059152620';

// REPLACE WITH YOUR MAIN PERSONAL WHATSAPP NUMBER (so only you can chat with it)
const OWNER_NUMBER = '2348062112118@s.whatsapp.net';

// Conversation history for context memory
let chatHistory = [
    { 
        role: "system", 
        content: "You are KLASH AI, a sharp, intelligent personal AI assistant created and owned by Rufai Ikhlas Ajibola (KLASH WORLD). Be helpful, clear, and concise." 
    }
];

async function startKlashAI() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(BOT_PHONE_NUMBER.trim());
                console.log(`\n🔗 YOUR KLASH AI PAIRING CODE: ${code}\n`);
            } catch (err) {
                console.error('Error requesting pairing code:', err);
            }
        }, 5000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startKlashAI();
        } else if (connection === 'open') {
            console.log('🚀 KLASH AI Bot is live and connected!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message listener: Only responds when your main number messages the bot number
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderID = msg.key.remoteJid;

        // STRICT SECURITY: Only reply to your main personal number
        if (senderID !== OWNER_NUMBER) return;

        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageText) return;

        if (messageText.trim().toLowerCase() === '/clear') {
            chatHistory = [chatHistory[0]];
            await sock.sendMessage(senderID, { text: '🤖 *KLASH AI:* Memory cleared. Ready for a fresh topic!' });
            return;
        }

        try {
            console.log(`📥 Received prompt from owner: "${messageText}"`);
            await sock.sendPresenceUpdate('composing', senderID);

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

            await sock.sendMessage(senderID, { text: aiReply });
            console.log(`📤 Replied successfully to owner.`);
            
        } catch (error) {
            console.error('AI Error:', error);
            await sock.sendMessage(senderID, { text: "🤖 *KLASH AI:* ⚠️ Error reaching Groq backend." });
        }
    });
}

startKlashAI();
