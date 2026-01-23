/**
 * telegram-bot.js
 * Handles sending notifications to a Telegram Channel/Group/User.
 * 
 * INSTRUCTIONS:
 * 1. Create a Telegram Bot using @BotFather.
 * 2. Get the BOT TOKEN.
 * 3. Add the bot to your group/channel.
 * 4. Get the CHAT ID (you can use @userinfobot or look it up).
 * 5. Replace 'YOUR_BOT_TOKEN_HERE' and 'YOUR_CHAT_ID_HERE' below.
 */

// ==========================================
// CONFIGURATION
// ==========================================
// TODO: Replace with your actual Bot Token and Chat ID
const TELEGRAM_BOT_TOKEN = '8274831838:AAFzJDWVYRsoIv5ZM-2C4TNhI5oJNAt_8nw';
const TELEGRAM_CHAT_ID = '-1002237916568';

/**
 * Sends a message to the configured Telegram Chat.
 * @param {string} message - The message content to send.
 * @returns {Promise<void>}
 */
async function sendTelegramNotification(message) {
    // Basic validation to prevent errors if not configured
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('Telegram Bot not fully configured. Notification skipped.');
        console.log('Message that would have been sent:', message);
        return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML' // Allows <b>bold</b>, <i>italic</i>, etc.
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API Error:', data.description);
        } else {
            console.log('Telegram Notification Sent Successfully');
        }
    } catch (error) {
        console.error('Network Error Sending Telegram Notification:', error);
    }
}
