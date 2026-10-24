const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Mapping characters to Build Logic 6-bit input codes
const CHARACTER_MAP = {
  'a': '000001', 'b': '000010', 'c': '000011', 'd': '000100', 'e': '000101',
  'f': '000110', 'g': '000111', 'h': '001000', 'i': '001001', 'j': '001010',
  'k': '001011', 'l': '001100', 'm': '001101', 'n': '001110', 'o': '001111',
  'p': '010000', 'q': '010001', 'r': '010010', 's': '010011', 't': '010100',
  'u': '010101', 'v': '010110', 'w': '010111', 'x': '011000', 'y': '011001',
  'z': '011010', '1': '011011', '2': '011100', '3': '011101', '4': '011110',
  '5': '011111', '6': '100000', '7': '100001', '8': '100010', '9': '100011',
  '0': '100100', '-': '100101', '=': '100110', '.': '100111', ',': '101000',
  ';': '101001', '/': '101010'
};

let bitQueue = [];
let isFetching = false;

/**
 * Converts a character into an 8-bit binary string:
 * Bit 0: Shift state (1 = uppercase, 0 = lowercase)
 * Bit 1: Padding (0)
 * Bits 2-7: 6-bit character code
 */
function charToBits(char) {
  if (!char) return "00000000";
  const isUpper = char >= 'A' && char <= 'Z';
  const lowerChar = char.toLowerCase();
  
  const shiftBit = isUpper ? '1' : '0';
  const code = CHARACTER_MAP[lowerChar] || '111111';
  
  return `${shiftBit}0${code}`.slice(0, 8);
}

/**
 * Fetches the item list, filters named blocks, and populates the bit queue
 */
async function loadItemsIntoQueue() {
  isFetching = true;
  bitQueue = [];

  try {
    const response = await fetch('https://tomtom.worldlite.ca/BuildLogic/GetItemsList.php');
    const data = await response.json();

    // Extract names from various JSON structures
    let namedItems = [];
    if (Array.isArray(data)) {
      namedItems = data.map(item => item.name || item.itemName || item.title).filter(Boolean);
    } else if (data && typeof data === 'object') {
      namedItems = Object.values(data)
        .map(item => typeof item === 'string' ? item : (item.name || item.itemName))
        .filter(Boolean);
    }

    // Join all item names separated by dashes
    const displayText = namedItems.length > 0 ? namedItems.join(" - ") : "NO ITEMS FOUND";

    // Convert string to character frames with pacing buffers
    for (let char of displayText) {
      bitQueue.push(charToBits(char));
      bitQueue.push("00000000"); // Blank frame spacing for 0.1s interval pacing
    }
  } catch (error) {
    console.error("Error fetching items list:", error);
    const errorText = "FETCH ERROR";
    for (let char of errorText) {
      bitQueue.push(charToBits(char));
      bitQueue.push("00000000");
    }
  } finally {
    isFetching = false;
  }
}

// Root Route (Prevents "Cannot GET /" errors)
app.get('/', (req, res) => {
  res.send("Build Logic Non-AI Items API is running! Poll /api/display from your HTTP Transmitter.");
});

// Transmitter Polling Endpoint
app.get('/api/display', async (req, res) => {
  if (bitQueue.length === 0 && !isFetching) {
    await loadItemsIntoQueue();
  }

  // Shift next 8-bit frame out, or return blank frame if empty
  const nextVal = bitQueue.length > 0 ? bitQueue.shift() : "00000000";

  res.json({ value: nextVal });
});

app.listen(PORT, () => {
  console.log(`Non-AI Server running on port ${PORT}`);
});
