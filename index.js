const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');

// Initialize Groq using your secure cloud environment variable
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function startKlashAI() {
    // Stores WhatsApp session auth locally in the cloud container
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Displays the QR code in your Render deployment logs
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📌 Scan this QR code in your Render dashboard logs using WhatsApp Linked Devices:');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) startKlashAI();
        } else if (connection === 'open') {
            console.log('🚀 KLASH AI Cloud Bot is live and connected to WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Listen for incoming WhatsApp messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderID = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageText) return;

        try {
            // Show typing status on WhatsApp
            await sock.sendPresenceUpdate('composing', senderID);

            // Generate AI response via Groq
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
