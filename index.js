const ccxt = require('ccxt');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const SuperTrend = require('supertrend-indicator');

// --- Configuration ---
const SYMBOL = 'BTC/USDT';
const TIMEFRAME = '1h'; // 1-hour candles
const EXCHANGE = 'binance';
const SUPERTREND_PERIOD = 10;
const SUPERTREND_MULTIPLIER = 3;
const REFRESH_INTERVAL_MS = 30000; // 30 seconds
// -------------------

// Create a blessed screen
const screen = blessed.screen({
    smartCSR: true,
    title: 'Terminal SuperTrend Chart'
});

// Create a grid layout
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Create the line chart
const line = grid.set(0, 0, 9, 9, contrib.line, {
    style: {
        text: "green",
        baseline: "black"
    },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: ` ${SYMBOL} SuperTrend Chart (${TIMEFRAME}) `
});

// Create the volume chart
const volumeChart = grid.set(9, 0, 3, 9, contrib.bar, {
    label: 'Volume',
    barWidth: 5,
    barSpacing: 6,
    xOffset: 0,
    maxHeight: 10
});

// Create the data table
const table = grid.set(0, 9, 6, 3, contrib.table, {
    keys: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: false,
    label: 'Latest Data',
    width: '30%',
    height: '30%',
    border: { type: "line", fg: "cyan" },
    columnSpacing: 2,
    columnWidth: [10, 15]
});

// Create the log box
const log = grid.set(6, 9, 6, 3, contrib.log, {
    fg: "green",
    selectedFg: "green",
    label: 'Log'
});

// --- Main Function to Fetch Data and Draw Chart ---
async function fetchDataAndDrawChart() {
    try {
        log.log('Fetching data...');
        const exchange = new ccxt[EXCHANGE]();
        const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME);
        log.log('Data fetched successfully.');

        // Prepare data for SuperTrend calculation
        const data = ohlcv.map(k => ({ open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5] }));

        const supertrendData = SuperTrend(data, SUPERTREND_MULTIPLIER, SUPERTREND_PERIOD);

        // Prepare data for the line chart
        const priceSeries = {
            title: 'Price (USDT)',
            x: ohlcv.map((_, i) => i.toString()), // Use index for x-axis
            y: ohlcv.map(k => k[4]),
            style: {
                line: supertrendData[supertrendData.length - 1].trendDirection === 1 ? 'green' : 'red'
            }
        };

        line.setData([priceSeries]);

        // Prepare data for the volume chart
        const volumeData = data.slice(-50).map(d => d.volume);
        const volumeLabels = data.slice(-50).map((_, i) => i.toString());
        volumeChart.setData({ titles: volumeLabels, data: volumeData });

        // Update the table with the latest data
        const latestData = data[data.length - 1];
        const latestSupertrend = supertrendData[supertrendData.length - 1];
        const tableData = [
            ['Open', latestData.open],
            ['High', latestData.high],
            ['Low', latestData.low],
            ['Close', latestData.close],
            ['Volume', latestData.volume],
            ['SuperTrend', latestSupertrend.supertrend],
            ['Trend', latestSupertrend.trendDirection === 1 ? 'Up' : 'Down']
        ];
        table.setData({ headers: ['Metric', 'Value'], data: tableData });

        screen.render();
        log.log('Chart updated.');

    } catch (error) {
        log.log(`Error: ${error.message}`);
        screen.render();
    }
}

// --- Event Handlers ---
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

// --- Initial Call and Refresh Interval ---
fetchDataAndDrawChart(); // Initial call
setInterval(fetchDataAndDrawChart, REFRESH_INTERVAL_MS);

