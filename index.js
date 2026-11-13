const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const readline = require('readline');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// For cloud environments where prompt input isn't available, we can set a dummy or use an environment variable for your phone number, 
// OR use pairing code by passing it directly if supported. Let's use the standard pairing request workflow.
async function startKlashAI() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    if (!sock.authState.creds.registered) {
        // Put your WhatsApp phone number with country code here (e.g., 23480xxxxxxxx)
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
            console.log('⚠️ Please add your PHONE_NUMBER environment variable in Render (e.g., 23480xxxxxxxx) to generate a pairing code.');
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
