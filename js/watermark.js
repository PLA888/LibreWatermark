// watermark.js - Core blind watermark logic

const ZERO_WIDTH_SPACE = '\u200b'; // Represents bit '0'
const ZERO_WIDTH_NON_JOINER = '\u200c'; // Represents bit '1'

// --- Pseudo-Random Number Generator (PRNG) ---
// Simple hash function to create a seed from the key string
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // Ensure positive integer
}

// Simple LCG PRNG class
class SimpleLCG {
    constructor(seed) {
        this.seed = seed;
        if (this.seed === 0) { // Avoid seed 0 which can cause issues with some LCGs
            this.seed = 1;
        }
    }
    // Returns a pseudo-random integer
    nextInt() {
        // Parameters from Numerical Recipes, ensures non-zero seed effect
        this.seed = (1664525 * this.seed + 1013904223) >>> 0;
        return this.seed;
    }
    // Returns a pseudo-random float between 0 (inclusive) and 1 (exclusive)
    nextFloat() {
        return this.nextInt() / 0xFFFFFFFF;
    }
    // Generate a pseudo-random integer between min (inclusive) and max (exclusive)
    nextIntRange(min, max) {
        const range = max - min;
        if (range <= 0) return min;
        // Ensure we don't get bias towards lower numbers with simple modulo
        const bitsNeeded = Math.ceil(Math.log2(range));
        const mask = (1 << bitsNeeded) - 1;
        let randomValue;
        do {
             randomValue = this.nextInt() & mask;
        } while (randomValue >= range); // Prevent modulo bias
        return min + randomValue;

        // Simpler, potentially biased version: return min + (this.nextInt() % range);
    }
     // Shuffles an array in place using Fisher-Yates algorithm seeded by the PRNG
     shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextIntRange(0, i + 1);
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }
    // Generate a pseudo-random bit (0 or 1) for keystream
    nextBit() {
      return this.nextIntRange(0, 2);
    }
}

// --- String <-> Binary Conversion ---
// Converts a string to a binary string ('0' and '1') using UTF-8
function stringToBinary(input) {
    const encoder = new TextEncoder(); // Defaults to UTF-8
    const uint8Array = encoder.encode(input);
    let binaryString = '';
    uint8Array.forEach(byte => {
        binaryString += byte.toString(2).padStart(8, '0');
    });
    return binaryString;
}

// Converts a binary string back to a string using UTF-8
function binaryToString(binaryInput) {
    // Ensure the binary string length is a multiple of 8
    if (binaryInput.length % 8 !== 0) {
        console.warn("Binary string length is not a multiple of 8. Potential data loss.");
        // Optionally pad or truncate, but it's better to signal error or handle upstream
        // binaryInput = binaryInput.substring(0, Math.floor(binaryInput.length / 8) * 8);
        // Or throw an error
         throw new Error("Invalid binary string length for UTF-8 decoding.");
    }

    const bytes = [];
    for (let i = 0; i < binaryInput.length; i += 8) {
        const byteString = binaryInput.substring(i, i + 8);
        bytes.push(parseInt(byteString, 2));
    }

    const decoder = new TextDecoder(); // Defaults to UTF-8
    try {
        return decoder.decode(new Uint8Array(bytes));
    } catch (e) {
        console.error("Error decoding binary string:", e);
        throw new Error("Failed to decode binary data. It might be corrupted or not valid UTF-8.");
    }
}

// --- Core Watermark Logic ---

/**
 * Embeds a watermark into the text using zero-width characters.
 * @param {string} originalText The text to embed the watermark into (B).
 * @param {string} secretKey The secret key for seeding PRNG (A).
 * @param {string} watermarkText The watermark content to embed (C).
 * @returns {string} The text with the embedded watermark.
 * @throws {Error} If embedding is impossible (e.g., watermark too long).
 */
function embedWatermark(originalText, secretKey, watermarkText) {
    if (!originalText || !secretKey || !watermarkText) {
        throw new Error("Missing required input: original text, secret key, or watermark text.");
    }

    // 1. Prepare watermark bits (Length prefix + data + scrambling)
    const watermarkBinary = stringToBinary(watermarkText);
    const watermarkLength = watermarkBinary.length;

    // Use 16 bits for length prefix (max length 65535 bits)
    const lengthBinary = watermarkLength.toString(2).padStart(16, '0');
    const fullBinaryPayload = lengthBinary + watermarkBinary;
    const totalBits = fullBinaryPayload.length;

    // 2. Generate Keystream for scrambling using the key
    const keySeed = simpleHash(secretKey);
    const prngForKey = new SimpleLCG(keySeed);
    let scrambledBinary = '';
    for (let i = 0; i < totalBits; i++) {
        const keyBit = prngForKey.nextBit();
        const payloadBit = parseInt(fullBinaryPayload[i], 10);
        scrambledBinary += (payloadBit ^ keyBit).toString(); // XOR scrambling
    }

    // 3. Map scrambled bits to Zero-Width characters
    const zwChars = scrambledBinary.split('').map(bit =>
        bit === '0' ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NON_JOINER
    );

    // 4. Determine insertion positions using a *different* PRNG sequence
    //    (or derived from the same seed but used differently, e.g., after keystream generation)
    //    Let's re-seed for position generation for simplicity here.
    //    A more robust approach might derive the position seed differently.
    const positionSeed = simpleHash(secretKey + "_pos"); // Derive a different seed
    const prngForPosition = new SimpleLCG(positionSeed);

    // We need `totalBits` positions in the text.
    // Generate all possible insertion indices (between characters).
    const possibleIndices = Array.from({ length: originalText.length + 1 }, (_, i) => i);

    // Check if enough space is available
    if (totalBits > possibleIndices.length) {
        throw new Error(`Watermark is too long (${totalBits} bits) for the given text (${originalText.length} chars, ${possibleIndices.length} possible positions).`);
    }

    // Shuffle the possible indices using the PRNG and take the first `totalBits`
    prngForPosition.shuffleArray(possibleIndices);
    const insertionIndices = possibleIndices.slice(0, totalBits);
    insertionIndices.sort((a, b) => a - b); // Sort indices for sequential insertion

    // 5. Insert ZW characters at chosen positions
    let resultText = '';
    let textIndex = 0;
    let zwIndex = 0;
    while (textIndex < originalText.length || zwIndex < insertionIndices.length) {
        // If the current position is an insertion point, add the ZW char
        if (zwIndex < insertionIndices.length && insertionIndices[zwIndex] === textIndex) {
            resultText += zwChars[zwIndex];
            zwIndex++; // Move to the next ZW char
        }
        // If there are still original characters left, add the next one
        if (textIndex < originalText.length) {
            resultText += originalText[textIndex];
            textIndex++; // Move to the next original character
        }
        // Special case: handle insertion after the last character
        else if (zwIndex < insertionIndices.length && insertionIndices[zwIndex] === originalText.length) {
             resultText += zwChars[zwIndex];
             zwIndex++;
        }
    }

    // Handle any remaining ZW chars if insertion points were at the very end
    // (Should be covered by the loop logic now, but good to double-check)
     while (zwIndex < insertionIndices.length && insertionIndices[zwIndex] === originalText.length) {
         resultText += zwChars[zwIndex];
         zwIndex++;
     }

    return resultText;
}

/**
 * Extracts a watermark from text using the secret key.
 * @param {string} textWithWatermark The text potentially containing the watermark.
 * @param {string} secretKey The secret key used during embedding.
 * @returns {string | null} The extracted watermark text, or null if not found or key is wrong.
 */
function extractWatermark(textWithWatermark, secretKey) {
    if (!textWithWatermark || !secretKey) {
        console.error("Missing text or secret key for extraction.");
        return null;
    }

    // 1. Scan the text and extract all ZW characters in order
    let extractedScrambledBinary = '';
    for (const char of textWithWatermark) {
        if (char === ZERO_WIDTH_SPACE) {
            extractedScrambledBinary += '0';
        } else if (char === ZERO_WIDTH_NON_JOINER) {
            extractedScrambledBinary += '1';
        }
    }

    if (extractedScrambledBinary.length === 0) {
        console.log("No zero-width characters found in the text.");
        return null; // No watermark found
    }

    // 2. Generate the *same* keystream used for embedding
    const keySeed = simpleHash(secretKey);
    const prngForKey = new SimpleLCG(keySeed);

    // We need to generate a keystream potentially as long as the extracted binary.
    // However, we only know the *true* length after unscrambling the prefix.
    // Let's unscramble step-by-step or generate a reasonably long keystream first.
    // Let's try step-by-step.

    // 3. Unscramble the initial part (length prefix)
    if (extractedScrambledBinary.length < 16) {
        console.log("Extracted data too short to contain length prefix.");
        return null; // Not enough data for length prefix
    }

    let potentialLengthBinary = '';
    for (let i = 0; i < 16; i++) {
        const keyBit = prngForKey.nextBit();
        const scrambledBit = parseInt(extractedScrambledBinary[i], 10);
        potentialLengthBinary += (scrambledBit ^ keyBit).toString();
    }

    const potentialWatermarkLength = parseInt(potentialLengthBinary, 2);

    // Basic sanity check for length
    if (isNaN(potentialWatermarkLength) || potentialWatermarkLength < 0 ) {
         console.log("Invalid length prefix obtained after unscrambling.");
         return null; // Wrong key likely
    }

    const expectedTotalBits = 16 + potentialWatermarkLength;

     if (extractedScrambledBinary.length < expectedTotalBits) {
        console.log(`Extracted data length (${extractedScrambledBinary.length}) is less than expected (${expectedTotalBits} based on decoded length). Watermark might be incomplete or corrupted.`);
        // We could try to decode the partial data, but likely indicates an issue.
        // Let's return null for now, assuming complete watermark is needed.
         return null;
    }

    // 4. Unscramble the remaining data part
    let potentialWatermarkBinary = '';
      // Continue PRNG sequence for the data part
    for (let i = 16; i < expectedTotalBits; i++) {
         const keyBit = prngForKey.nextBit();
         // Check if we have enough extracted bits (safety)
         if (i >= extractedScrambledBinary.length) {
            console.warn("Ran out of extracted bits while unscrambling payload. Data corruption likely.");
            return null; // Incomplete data
         }
         const scrambledBit = parseInt(extractedScrambledBinary[i], 10);
         potentialWatermarkBinary += (scrambledBit ^ keyBit).toString();
    }

    // 5. Convert the unscrambled binary data back to string
    try {
        // Ensure unscrambled binary length matches expected length
        if (potentialWatermarkBinary.length !== potentialWatermarkLength) {
             console.warn(`Unscrambled binary length (${potentialWatermarkBinary.length}) doesn't match decoded length (${potentialWatermarkLength}). Possible error.`);
             // Decide how to handle: trust decoded length or actual unscrambled length?
             // Let's trust the decoded length for now and attempt decoding.
             // If it fails, binaryToString will throw.
        }

        const extractedText = binaryToString(potentialWatermarkBinary);
        return extractedText;
    } catch (error) {
        console.error("Failed to decode the final binary data:", error.message);
        // This likely means the key was wrong or the data was corrupted.
        return null;
    }
}