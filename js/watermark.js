// watermark.js - Core blind watermark logic with block embedding and authentication

const ZERO_WIDTH_SPACE = '\u200b'; // Represents bit '0'
const ZERO_WIDTH_NON_JOINER = '\u200c'; // Represents bit '1'
const AUTH_CODE_BITS = 32; // <-- Increased authentication code length to 32 bits

// --- Pseudo-Random Number Generator (PRNG) ---
// Simple hash function to create a seed from the key string
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    // A slightly more complex step, maybe mixing with another prime or shifting
    hash = (hash ^ (hash >>> 16)) * 2246822507;
    hash = (hash ^ (hash >>> 13)) * 3266489917;
    hash = (hash ^ (hash >>> 16));
    return hash >>> 0; // Ensure positive integer
}

// Simple LCG PRNG class (remains the same)
class SimpleLCG {
    constructor(seed) {
        // Ensure seed is a positive integer
        this.seed = typeof seed === 'number' ? seed >>> 0 : simpleHash(String(seed)) >>> 0;
        if (this.seed === 0) { // Avoid seed 0 for LCG issues
            this.seed = 1;
        }
         // Use a constant multiplier and increment for consistency
        this.m = 0x80000000; // 2^31
        this.a = 1103515245;
        this.c = 12345;
    }
    // Returns a pseudo-random integer between 0 (inclusive) and m (exclusive)
    nextInt() {
         // Standard LCG formula: seed = (a * seed + c) mod m
        this.seed = (this.a * this.seed + this.c) % this.m;
        return this.seed;
    }
    // Returns a pseudo-random integer between min (inclusive) and max (exclusive)
    nextIntRange(min, max) {
        const range = max - min;
        if (range <= 0) return min;
        // Use the float version scaled, or get more bits from nextInt if range is large
         // Simple modulo can introduce bias, but for typical UI use cases it's often acceptable.
         // For positions, less bias is better. Let's stick to the simpler version for now.
        return min + (this.nextInt() % range);
    }
     // Shuffles an array in place using Fisher-Yates algorithm seeded by the PRNG
     shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextIntRange(0, i + 1); // 0 to i inclusive
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }
    // Generate a pseudo-random bit (0 or 1) for keystream
    nextBit() {
      return this.nextIntRange(0, 2); // Either 0 or 1
    }
     // Generate a pseudo-random integer (32-bit)
    nextInteger() {
        // Combine two nextInt calls if LCG period is an issue for 32 bits,
        // or if m is less than 2^32. SimpleLCG has m = 2^31, so let's combine.
        const high = this.nextInt() >>> 0; // Upper 16 bits (approx)
        const low = this.nextInt() >>> 0; // Lower 16 bits (approx)
        // Combine them. This isn't cryptographically strong, but better than a single LCG call.
        // Using bitwise operations to combine two 31-bit numbers into a 32-bit number
        return (high << 16) | low; // This might exceed 32 bits depending on JS engine behavior, needs care
        // A safer way:
        return (this.nextInt() & 0xFFFF) | ((this.nextInt() & 0xFFFF) << 16); // Combine two 16-bit values
    }

}

// --- String <-> Binary Conversion (remains the same) ---
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
     if (binaryInput.length % 8 !== 0) {
        // Padding or truncation is risky. Better to throw if the length isn't right.
         throw new Error("Invalid binary string length for UTF-8 decoding.");
    }

    const bytes = [];
    for (let i = 0; i < binaryInput.length; i += 8) {
        const byteString = binaryInput.substring(i, i + 8);
        // Use parseInt with base 2
        const byte = parseInt(byteString, 2);
         if (isNaN(byte)) {
              throw new Error("Invalid binary characters found in the string.");
         }
         bytes.push(byte);
    }

    const decoder = new TextDecoder(); // Defaults to UTF-8
    try {
        return decoder.decode(new Uint8Array(bytes));
    } catch (e) {
        console.error("Error decoding binary string:", e);
        throw new Error("Failed to decode binary data. It might be corrupted or not valid UTF-8.");
    }
}

// --- Authentication Code Generation (MODIFIED - Stronger) ---
// Generates a stronger authentication code based on watermark binary and key
function generateAuthCode(watermarkBinary, secretKey) {
    // Use distinct seeds derived from the key for PRNG sequences and a final mixing value
    const seed1 = simpleHash(secretKey + "_auth_seed_1_data_mix");
    const seed2 = simpleHash(secretKey + "_auth_seed_2_final_hash");
    const seed3 = simpleHash(secretKey + "_auth_seed_3_final_mix");

    const prng1 = new SimpleLCG(seed1); // For mixing with data
    const prng2 = new SimpleLCG(seed2); // For final hash/checksum structure
    const prng3 = new SimpleLCG(seed3); // For final XOR

    const watermarkLen = watermarkBinary.length;
    const authCodeBytes = AUTH_CODE_BITS / 8; // Number of bytes for auth code

    // Step 1: Mix watermark binary with a key-derived stream
    let mixedDataBytes = Array(Math.ceil(watermarkLen / 8)).fill(0);
    for (let i = 0; i < watermarkLen; i++) {
         const byteIndex = Math.floor(i / 8);
         const bitIndex = i % 8;
         const watermarkBit = parseInt(watermarkBinary[i], 10);

         // Generate key bit using PRNG1, cycle through bytes of a pseudo-random integer
         const keyBit1 = (prng1.nextIntRange(0, 256) >>> (bitIndex % 8)) & 1; // Get a key bit from a random byte

         // XOR the watermark bit into the corresponding byte of mixedDataBytes
         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (watermarkBit << bitIndex);
         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (keyBit1 << bitIndex); // Also mix with key bit
    }

    // Step 2: Reduce the mixed data bytes into a fixed-size hash/checksum structure
    let authChecksumBytes = Array(authCodeBytes).fill(0);
    for (let i = 0; i < mixedDataBytes.length; i++) {
        // Use PRNG2 to determine how to mix each byte
        const mixValue = prng2.nextIntRange(0, 256);
        const targetIndex = prng2.nextIntRange(0, authCodeBytes); // Randomly pick a target byte in the checksum

        // More complex mixing: XOR, add, rotate based on key-derived values
        let byteToMix = mixedDataBytes[i];
        byteToMix = (byteToMix + mixValue) & 0xFF; // Add with overflow
        byteToMix = (byteToMix << (prng2.nextIntRange(0, 8))) | (byteToMix >>> (8 - prng2.nextIntRange(0, 8))); // Rotate bits randomly

        authChecksumBytes[targetIndex] = (authChecksumBytes[targetIndex] ^ byteToMix) & 0xFF; // XOR into checksum byte
    }

     // Step 3: Final XOR with a third key-derived stream
    let finalAuthBytes = Array(authCodeBytes).fill(0);
    let keyStreamBytes3 = '';
    for(let i = 0; i < authCodeBytes; i++) {
        keyStreamBytes3 += prng3.nextIntRange(0, 256).toString(2).padStart(8, '0');
    }

    let authCodeBinary = '';
    for (let i = 0; i < authCodeBytes; i++) {
         const checksumByte = authChecksumBytes[i];
         const keyByte3 = parseInt(keyStreamBytes3.substring(i*8, (i+1)*8), 2);

         const finalByte = (checksumByte ^ keyByte3) & 0xFF;
         authCodeBinary += finalByte.toString(2).padStart(8, '0');
    }

    return authCodeBinary; // Return as binary string of length AUTH_CODE_BITS
}
// 片段1'

// 片段2：添加零宽字符检测和清除函数 (remains the same)
/**
 * Checks if a string contains any zero-width characters.
 * @param {string} text The input string.
 * @returns {boolean} True if zero-width characters are found, false otherwise.
 */
function containsZeroWidthChars(text) {
    // Common zero-width characters: ZWSP, ZWNJ, ZWJ, Byte Order Mark (sometimes used unintentionally)
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g; // Use global flag
    return zeroWidthRegex.test(text);
}

/**
 * Removes all zero-width characters from a string.
 * @param {string} text The input string.
 * @returns {string} The string with zero-width characters removed.
 */
function cleanZeroWidthChars(text) {
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g; // Use global flag for replaceAll
    return text.replace(zeroWidthRegex, '');
}
// 片段2'

// --- Core Watermark Logic (remains the same except using the new generateAuthCode) ---

/**
 * Embeds a watermark into the text using zero-width characters, in blocks.
 * @param {string} originalText The text to embed the watermark into (B).
 * @param {string} secretKey The secret key for seeding PRNG (A).
 * @param {string} watermarkText The watermark content to embed (C).
 * @param {number} blockSize The size of text blocks for embedding.
 * @returns {string} The text with the embedded watermark.
 * @throws {Error} If embedding is impossible (e.g., watermark too long for block).
 */
function embedWatermark(originalText, secretKey, watermarkText, blockSize) {
    if (!originalText || !secretKey || !watermarkText) {
        throw new Error("缺失必需的输入：原始文本、密钥或水印内容。");
    }
     if (blockSize < 50) { // Basic sanity check
         console.warn("Block size is very small, may cause issues.");
     }

    // 1. Prepare watermark payload (Length prefix + data + auth code)
    const watermarkBinary = stringToBinary(watermarkText);
    const watermarkLength = watermarkBinary.length;

    // Use 16 bits for length prefix (max length 65535 bits)
    const lengthBinary = watermarkLength.toString(2).padStart(16, '0');

    // Generate authentication code (uses the improved function)
    const authBinary = generateAuthCode(watermarkBinary, secretKey); // <-- Uses modified function

    const fullBinaryPayload = lengthBinary + watermarkBinary + authBinary;
    const payloadBits = fullBinaryPayload.length;

    // 2. Generate Keystream for scrambling using the key
    const streamSeed = simpleHash(secretKey + "_stream_seed"); // Distinct seed for keystream
    const prngForStream = new SimpleLCG(streamSeed);

    // Generate keystream equal to the payload length
    let keystream = '';
     for(let i = 0; i < payloadBits; i++) {
         keystream += prngForStream.nextBit();
     }

    // Scramble the full payload
    let scrambledPayload = '';
    for (let i = 0; i < payloadBits; i++) {
        const payloadBit = parseInt(fullBinaryPayload[i], 10);
        const keyBit = parseInt(keystream[i], 10);
        scrambledPayload += (payloadBit ^ keyBit).toString(); // XOR scrambling
    }

    // Map scrambled bits to Zero-Width characters
    const zwChars = scrambledPayload.split('').map(bit =>
        bit === '0' ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NON_JOINER
    );
    const zwString = zwChars.join(''); // The string of ZW chars for one payload copy

    // 3. Embed the ZW string into the original text in blocks
    let resultText = '';
    const numBlocks = Math.ceil(originalText.length / blockSize);

     // The number of insertion points available in a chunk of size S is S + 1.
     // We need payloadBits insertion points. So, payloadBits <= textChunk.length + 1
     // This must hold for the minimum textChunk length we want to embed in.
     // For full blocks, textChunk.length is blockSize. So payloadBits <= blockSize + 1.
    if (payloadBits > blockSize + 1) {
         throw new Error(`水印信息 (${payloadBits} 比特) 太长，无法嵌入到指定的分块大小 (${blockSize} 字符) 中。请增加分块大小或减少水印内容。`);
    }

    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize;
        const end = Math.min((i + 1) * blockSize, originalText.length);
        let textChunk = originalText.substring(start, end);

        // If the last chunk is significantly shorter than payloadBits-1, we might not be able to embed fully.
        // We could skip embedding in such small final chunks, but for "贯穿性" let's try to embed as much as possible.
        // The current shuffle/slice logic handles this - it just won't pick payloadBits if not enough indices exist.
        // However, for reliable extraction of full blocks, we should ideally only embed full payloads where possible.
        // Let's stick to the simple check for now assuming the user chooses a reasonable blockSize.
        const possibleIndicesCount = textChunk.length + 1;
        const indicesToPick = Math.min(payloadBits, possibleIndicesCount);

        // Generate insertion positions for this block using a distinct PRNG sequence
        const positionSeed = simpleHash(secretKey + "_pos_seed_" + i); // Seed depends on key and block index
        const prngForPosition = new SimpleLCG(positionSeed);

         // Generate all possible insertion indices within the chunk
        const possibleIndices = Array.from({ length: possibleIndicesCount }, (_, k) => k);

        // Shuffle and pick the first `indicesToPick` indices
        prngForPosition.shuffleArray(possibleIndices);
        const insertionIndices = possibleIndices.slice(0, indicesToPick);
        insertionIndices.sort((a, b) => a - b); // Sort indices for sequential insertion

        // Insert ZW characters into the text chunk at the chosen positions
        let chunkWithZW = '';
        let chunkIndex = 0;
        let zwIndex = 0; // Index into the zwChars array for the *current* payload copy (only insert indicesToPick number of chars)

        while (chunkIndex < textChunk.length || zwIndex < insertionIndices.length) {
             // If the current position is an insertion point, add the next ZW char
            if (zwIndex < insertionIndices.length && insertionIndices[zwIndex] === chunkIndex) {
                chunkWithZW += zwChars[zwIndex]; // Use zwChars corresponding to scrambledPayload
                zwIndex++;
            }
            // If there are still characters left in the chunk, add the next one
            if (chunkIndex < textChunk.length) {
                chunkWithZW += textChunk[chunkIndex];
                chunkIndex++;
            }
             // Special case: Handle insertion after the last character
             else if (zwIndex < insertionIndices.length && insertionIndices[zwIndex] === textChunk.length) {
                  chunkWithZW += zwChars[zwIndex];
                  zwIndex++;
             }
        }
         // If indicesToPick < payloadBits, it means we couldn't fit the whole payload in this chunk.
         // This is fine, the extraction logic will just fail on this partial block.

        resultText += chunkWithZW;
    }

    return resultText;
}

/**
 * Extracts a watermark from text using the secret key.
 * Scans for potential watermark payloads and verifies with authentication code.
 * @param {string} textWithWatermark The text potentially containing the watermark.
 * @param {string} secretKey The secret key used during embedding.
 * @returns {string | null} The extracted watermark text, or null if not found or key is wrong.
 */
function extractWatermark(textWithWatermark, secretKey) {
    if (!textWithWatermark || !secretKey) {
        console.error("提取缺失必需输入：文本或密钥。");
        return null;
    }

    // 1. Scan the text and extract ALL ZW characters in order
    let extractedZWString = '';
    for (const char of textWithWatermark) {
        if (char === ZERO_WIDTH_SPACE || char === ZERO_WIDTH_NON_JOINER) {
            extractedZWString += char;
        }
    }

    if (extractedZWString.length === 0) {
        console.log("文本中未发现零宽字符。");
        return null; // No watermark found
    }

    // Convert extracted ZW string to binary bitstring
    const extractedBits = extractedZWString.split('').map(char =>
        char === ZERO_WIDTH_SPACE ? '0' : '1'
    ).join('');

    // Minimum payload length: 16 (length) + 1 (min data) + AUTH_CODE_BITS (auth)
    const minPayloadBits = 16 + 1 + AUTH_CODE_BITS;
    if (extractedBits.length < minPayloadBits) {
         console.log(`提取到的零宽字符序列 (${extractedBits.length} 比特) 太短，不足以包含完整的水印 payload (至少 ${minPayloadBits} 比特)。`);
         return null;
    }

    // 2. Iterate through the extracted bits, trying to decode a payload starting at each position
    const streamSeed = simpleHash(secretKey + "_stream_seed"); // Seed for keystream (must match embedding)
    // Pass auth seeds to the extraction logic to correctly regenerate auth codes during verification
    const authSeed1 = simpleHash(secretKey + "_auth_seed_1_data_mix");
    const authSeed2 = simpleHash(secretKey + "_auth_seed_2_final_hash");
    const authSeed3 = simpleHash(secretKey + "_auth_seed_3_final_mix");

    // Try every possible starting position for a payload within the extracted bits
    for (let i = 0; i <= extractedBits.length - minPayloadBits; i++) {
        // Attempt to start decoding a payload from index 'i'
        let currentBitsSlice = extractedBits.substring(i); // Substring from current potential start

        // Need at least 16 bits for the length prefix
        if (currentBitsSlice.length < 16) continue;

        // Generate NEW PRNG instances for THIS decoding attempt, seeded with the secret key.
        const prngForStreamAttempt = new SimpleLCG(streamSeed);

        // --- Attempt to decode Length Prefix (16 bits) ---
        let potentialLengthBinary = '';
        let bitsProcessed = 0; // Bits processed from currentBitsSlice
        for (let k = 0; k < 16; k++) {
             if (k >= currentBitsSlice.length) break; // Ran out of bits in the extracted slice
             const scrambledBit = parseInt(currentBitsSlice[k], 10);
             const keyBit = prngForStreamAttempt.nextBit(); // Get next bit from keystream
             potentialLengthBinary += (scrambledBit ^ keyBit).toString();
             bitsProcessed++;
        }

         if (potentialLengthBinary.length < 16) continue; // Did not get a full 16 bits

        const potentialWatermarkLength = parseInt(potentialLengthBinary, 2);

        // Sanity check the decoded length - reasonable min/max
         if (isNaN(potentialWatermarkLength) || potentialWatermarkLength < 0 || potentialWatermarkLength > 65535) {
              continue; // Not a valid length
         }

        const expectedPayloadBitsExcludingLength = potentialWatermarkLength + AUTH_CODE_BITS;
        const expectedTotalPayloadBits = 16 + expectedPayloadBitsExcludingLength;

        // Check if we have enough *remaining* extracted bits for the rest of the payload (data + auth)
        if (currentBitsSlice.length - bitsProcessed < expectedPayloadBitsExcludingLength) {
            continue; // Not enough bits from this starting point 'i' for the full expected payload
        }

        // --- Attempt to decode Watermark Data ---
        let potentialWatermarkBinary = '';
        for (let k = 0; k < potentialWatermarkLength; k++) {
            const dataBitIndex = bitsProcessed + k;
             if (dataBitIndex >= currentBitsSlice.length) break; // Should not happen due to check above
            const scrambledBit = parseInt(currentBitsSlice[dataBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // Get next bit from keystream
            potentialWatermarkBinary += (scrambledBit ^ keyBit).toString();
        }
         if (potentialWatermarkBinary.length !== potentialWatermarkLength) continue; // Did not get expected data length
         bitsProcessed += potentialWatermarkLength; // Update bits processed count

        // --- Attempt to decode Authentication Code ---
        let extractedAuthBinary = '';
        for (let k = 0; k < AUTH_CODE_BITS; k++) {
            const authBitIndex = bitsProcessed + k;
            if (authBitIndex >= currentBitsSlice.length) break; // Should not happen
            const scrambledBit = parseInt(currentBitsSlice[authBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // Get next bit from keystream (Keystream continues)
            extractedAuthBinary += (scrambledBit ^ keyBit).toString();
        }
        if (extractedAuthBinary.length !== AUTH_CODE_BITS) continue; // Did not get expected auth length

        // 3. Verify Authentication Code (uses the same improved generation logic)
        // Re-run the generateAuthCode logic with extracted data and provided key
        // Make sure generateAuthCode is called with the *same* logic and seeds as embedding.
        // The generateAuthCode function itself is deterministic based on key and data.
        const expectedAuthBinary = generateAuthCode(potentialWatermarkBinary, secretKey); // <-- Calls modified function

        if (extractedAuthBinary === expectedAuthBinary) {
            // Authentication successful! Decode the watermark binary.
            try {
                const extractedText = binaryToString(potentialWatermarkBinary);
                console.log(`水印在提取序列的偏移量 ${i} 处提取成功。`);
                return extractedText; // Found and verified watermark
            } catch (e) {
                console.warn(`在偏移量 ${i} 处提取到匹配的认证码，但解码水印文本失败: ${e.message}`);
                 // Continue searching, might be a false positive decoding error or partial data that happened to have a matching auth.
                 // The auth code significantly reduces false positives, but decoding failure is still possible with corrupted data.
            }
        } else {
            // Authentication failed, wrong key or corrupted data. Continue searching.
            // console.log(`偏移量 ${i} 认证码不匹配。`);
        }
    }

    // If loop finishes without returning, no valid watermark was found with this key.
    console.log("未找到匹配密钥和认证码的有效水印。");
    return null;
}