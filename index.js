const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const http = require('http');

// Create a dummy HTTP server so Render's free tier is happy and doesn't time out with a port error
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('KLASH AI WhatsApp Bot is running live!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Dummy web server listening on port ${PORT}`);
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
        } else {
            console.log('⚠️ Please add your PHONE_NUMBER environment variable in Render.');
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) startKlashAI();
        } else if (connection === 'open') {
            console.log('🚀 KLASH AI Cloud Bot is live and connected to WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderID = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageText) return;

        try {
            await sock.sendPresenceUpdate('composing', senderID);

            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "You are KLASH AI, a personal AI assistant built by Rufai Ikhlas Ajibola (KLASH WORLD). Be sharp, helpful, and concise." },
                    { role: "user", content: messageText }
                ],
            });

            const aiReply = completion.choices[0]?.message?.content || "I couldn't process that response.";
            await sock.sendMessage(senderID, { text: aiReply });
            
        } catch (error) {
            console.error('AI Error:', error);
            await sock.sendMessage(senderID, { text: "⚠️ Error: Could not reach KLASH AI backend." });
        }
    });
}

startKlashAI();
