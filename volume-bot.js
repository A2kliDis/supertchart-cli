const ccxt = require('ccxt');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

// --- Configuration ---
const EXCHANGE = 'binance';
const QUOTE_CURRENCY = 'USDT';
const HISTORICAL_DAYS = 7; // Number of days to calculate the average volume
const ALERT_THRESHOLD_STD_DEV = 2; // Alert if current volume is 2 standard deviations above the average
const PRICE_CHANGE_TIMEFRAME = '1d'; // 1 day
const PRICE_CHANGE_THRESHOLD_PERCENT = 5; // 5%
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_INTERVAL_MS = 15000; // 15 seconds
const VOLUME_DATA_FILE = 'volume-data.json';
const ALERT_TIMESTAMPS_FILE = 'alert-timestamps.json';
const MAX_SYMBOLS = 10; // Limit the number of symbols to scan

// --- Telegram Configuration ---
// IMPORTANT: Do not share your Bot Token with anyone.
const TELEGRAM_BOT_TOKEN = '7662397071:AAEtePL-xjLdkfFG14l1FQ2qdIR-vW4cTmA';
const TELEGRAM_CHAT_ID = '1999696708';
// ---------------------------

// --- Initialize Telegram Bot ---
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// --- Helper Functions ---

function readJsonFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath);
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
    }
    return {};
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error.message);
    }
}

function calculateStandardDeviation(values) {
    const avg = values.reduce((acc, cur) => acc + cur, 0) / values.length;
    const squareDiffs = values.map(value => {
        const diff = value - avg;
        return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((acc, cur) => acc + cur, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
}

// --- Main Bot Logic ---

async function runBot() {
    console.log('Starting volume bot...');
    const exchange = new ccxt[EXCHANGE]();
    const volumeData = readJsonFile(VOLUME_DATA_FILE);
    const alertTimestamps = readJsonFile(ALERT_TIMESTAMPS_FILE);

    try {
        console.log('Fetching markets...');
        const markets = await exchange.loadMarkets();
        const symbols = Object.keys(markets).filter(s => s.endsWith(`/${QUOTE_CURRENCY}`)).slice(0, MAX_SYMBOLS);
        console.log(`Found ${symbols.length} ${QUOTE_CURRENCY} markets.`);

        for (const symbol of symbols) {
            try {
                const ticker = await exchange.fetchTicker(symbol);
                const volume = ticker.quoteVolume;
                const currentPrice = ticker.last;

                // --- Volume Alert ---
                if (!alertTimestamps[symbol] || Date.now() - alertTimestamps[symbol] > ALERT_COOLDOWN_MS) {
                    if (!volumeData[symbol]) {
                        volumeData[symbol] = [];
                    }
                    volumeData[symbol].push({ timestamp: Date.now(), volume });
                    volumeData[symbol] = volumeData[symbol].slice(-HISTORICAL_DAYS);
                    const historicalVolumes = volumeData[symbol].map(d => d.volume);
                    if (historicalVolumes.length > 1) {
                        const averageVolume = historicalVolumes.reduce((acc, cur) => acc + cur, 0) / historicalVolumes.length;
                        const stdDev = calculateStandardDeviation(historicalVolumes);
                        if (volume > averageVolume + ALERT_THRESHOLD_STD_DEV * stdDev) {
                            const message = `
*** ALERT: ${symbol} has high volume! ***
` +
                                          `Current Volume: ${volume.toFixed(2)} ${QUOTE_CURRENCY}
` +
                                          `Average Volume: ${averageVolume.toFixed(2)} ${QUOTE_CURRENCY}
` +
                                          `Standard Deviation: ${stdDev.toFixed(2)}`;
                            console.log(message);
                            bot.sendMessage(TELEGRAM_CHAT_ID, message);
                            process.stdout.write('\x07');
                            alertTimestamps[symbol] = Date.now();
                        }
                    }
                }

                // --- Price Change Alert ---
                if (!alertTimestamps[symbol] || Date.now() - alertTimestamps[symbol] > ALERT_COOLDOWN_MS) {
                    const ohlcv = await exchange.fetchOHLCV(symbol, PRICE_CHANGE_TIMEFRAME, undefined, 2);
                    if (ohlcv.length > 1) {
                        const previousClose = ohlcv[0][4];
                        const priceChange = ((currentPrice - previousClose) / previousClose) * 100;
                        if (Math.abs(priceChange) > PRICE_CHANGE_THRESHOLD_PERCENT) {
                            const message = `
*** ALERT: ${symbol} has a significant price change! ***
` +
                                          `Price Change (24h): ${priceChange.toFixed(2)}%
` +
                                          `Current Price: ${currentPrice}`;
                            console.log(message);
                            bot.sendMessage(TELEGRAM_CHAT_ID, message);
                            process.stdout.write('\x07');
                            alertTimestamps[symbol] = Date.now();
                        }
                    }
                }

            } catch (error) {
                // Ignore errors for individual symbols
            }
        }

        console.log('Writing volume and alert timestamp data to files...');
        writeJsonFile(VOLUME_DATA_FILE, volumeData);
        writeJsonFile(ALERT_TIMESTAMPS_FILE, alertTimestamps);
        console.log('Bot run complete. Waiting for next run...');

    } catch (error) {
        console.error('An error occurred during the bot run:', error.message);
    }
}

// --- Initial Call and Refresh Interval ---
bot.sendMessage(TELEGRAM_CHAT_ID, 'Volume bot started successfully!');
runBot();
setInterval(runBot, REFRESH_INTERVAL_MS);
