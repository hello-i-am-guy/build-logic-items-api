const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Queue to hold 8-bit binary string representations to stream out
let bitQueue = [];
let isFetching = false;

/**
 * Converts a character into an 8-bit binary string:
 * Bit 0: Shift state (1 = uppercase/shifted symbol, 0 = lowercase/default)
 * Bit 1: Unused / Padding (0)
 * Bits 2-7: 6-bit character code on Text Panel
 */
function charToBits(char) {
  const isUpper = char >= 'A' && char <= 'Z';
  const lowerChar = char.toLowerCase();

  const shiftBit = isUpper ? '1' : '0';
  const code = CHARACTER_MAP[lowerChar] || '111111'; // Default to empty if not mapped

  return shiftBit + '0' + code;
}

/**
 * Fetches item list from external PHP API, filters named blocks,
 * and fills the queue with character bit sequences.
 */
async function loadItemsIntoQueue() {
  isFetching = true;
  bitQueue = []; // Clear previous queue

  try {
    const response = await fetch('https://tomtom.worldlite.ca/BuildLogic/GetItemsList.php');
    const data = await response.json();

    // Collect all items with valid non-empty names
    let namedItems = [];
    if (Array.isArray(data)) {
      namedItems = data.map(item => item.name || item.itemName || item.title).filter(Boolean);
    } else if (typeof data === 'object') {
      namedItems = Object.values(data)
        .map(item => typeof item === 'string' ? item : (item.name || item.itemName))
        .filter(Boolean);
    }

    // Join item names with separator spaces
    const displayText = namedItems.join(" - ");

    // Convert string to 8-bit frames into the queue
    for (let char of displayText) {
      bitQueue.push(charToBits(char));
      // Insert a blank/off frame between characters to allow crisp display updates at 0.1s interval
      bitQueue.push("00000000");
    }
  } catch (error) {
    console.error("Error fetching items list:", error);
    // Push error message to queue in case of failure
    const errorText = "ERROR FETCHING ITEMS";
    for (let char of errorText) {
      bitQueue.push(charToBits(char));
      bitQueue.push("00000000");
    }
  } finally {
    isFetching = false;
  }
}

// GET Endpoint for the HTTP Transmitter
app.get('/api/display', async (req, res) => {
  // If queue is empty and not currently fetching, fetch fresh item list
  if (bitQueue.length === 0 && !isFetching) {
    await loadItemsIntoQueue();
  }

  // Retrieve next 8-bit character binary frame, or default blank frame
  const nextVal = bitQueue.length > 0 ? bitQueue.shift() : "00000000";

  // Strict 8-character binary format JSON output
  res.json({ value: nextVal });
});

app.listen(PORT, () => {
  console.log(`Build Logic API Server running on port ${PORT}`);
});
