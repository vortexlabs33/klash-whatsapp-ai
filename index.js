const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const http = require('http');

// Dummy HTTP server to keep Render Free Tier happy and "Live"
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('KLASH AI Personal Assistant is running live!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 HTTP Server active on port ${PORT}`);
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
            console.log('🚀 KLASH AI Personal Assistant is live and connected!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Bulletproof message listener for Self-Chat
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageText) return;

        const remoteJid = msg.key.remoteJid;

        // Verify this is your "Message Yourself" chat (remoteJid contains your own user ID or is your own number JID)
        const myNumberBase = sock.user ? sock.user.id.split(':')[0] : '';
        const isSelfChat = remoteJid.includes(myNumberBase) || remoteJid === 'status@broadcast'; // broadcast ignored later

        if (!isSelfChat || remoteJid === 'status@broadcast') return;

        // LOOP PREVENTION: Ignore messages that KLASH AI itself just sent
        if (messageText.startsWith('🤖 *KLASH AI:*')) return;

        // Command to clear memory
        if (messageText.trim().toLowerCase() === '/clear') {
            chatHistory = [chatHistory[0]];
            await sock.sendMessage(remoteJid, { text: '🤖 *KLASH AI:* Memory cleared. Ready for a fresh topic!' });
            return;
        }

        try {
            console.log(`📥 Received prompt from self-chat: "${messageText}"`);
            await sock.sendPresenceUpdate('composing', remoteJid);

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

            // Send reply directly back into your self-chat
            await sock.sendMessage(remoteJid, { text: `🤖 *KLASH AI:*\n\n${aiReply}` });
            console.log(`📤 Replied successfully to self-chat.`);
            
        } catch (error) {
            console.error('AI Error:', error);
            await sock.sendMessage(remoteJid, { text: "🤖 *KLASH AI:* ⚠️ Error reaching Groq backend." });
        }
    });
}

startKlashAI();
