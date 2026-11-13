const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const http = require('http');

// Keep Render Web Service alive so it shows "Live" and never times out
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('KLASH AI Personal Assistant is running!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Server active on port ${PORT}`);
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Keeps conversation context so you can chat naturally back-and-forth
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
        const phoneNumber = process.env.PHONE_NUMBER; 
        if (phoneNumber) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber.trim());
                    console.log(`\n🔗 YOUR WHATSAPP PAIRING CODE: ${code}\n`);
                } catch (err) {
                    console.error('Error requesting pairing code:', err);
                }
            }, 5000);
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startKlashAI();
        } else if (connection === 'open') {
            console.log('🚀 KLASH AI Personal Assistant is live in your Self-Chat!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;

        // Your own WhatsApp JID
        const myNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const senderID = msg.key.remoteJid;

        // 1. STRICT LOCK: Only respond inside your "Message Yourself" chat
        if (senderID !== myNumber) return;

        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageText) return;

        // 2. LOOP PREVENTION: Ignore messages sent by KLASH AI itself
        if (messageText.startsWith('🤖 *KLASH AI:*')) return;

        // Command to reset chat memory anytime
        if (messageText.trim().toLowerCase() === '/clear') {
            chatHistory = [chatHistory[0]];
            await sock.sendMessage(myNumber, { text: '🤖 *KLASH AI:* Memory cleared. Ready for a fresh topic!' });
            return;
        }

        try {
            await sock.sendPresenceUpdate('composing', myNumber);

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

            await sock.sendMessage(myNumber, { text: `🤖 *KLASH AI:*\n\n${aiReply}` });
            
        } catch (error) {
            console.error('AI Error:', error);
            await sock.sendMessage(myNumber, { text: "🤖 *KLASH AI:* ⚠️ Error reaching Groq backend." });
        }
    });
}

startKlashAI();
