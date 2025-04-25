// watermark.js - Core blind watermark logic with block embedding and authentication

const ZERO_WIDTH_SPACE = '\u200b'; // Represents bit '0'
const ZERO_WIDTH_NON_JOINER = '\u200c'; // Represents bit '1'
const AUTH_CODE_BITS = 32;

// --- Pseudo-Random Number Generator (PRNG) ---
// Simple hash function to create a seed from the key string
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    hash = (hash ^ (hash >>> 16)) * 2246822507;
    hash = (hash ^ (hash >>> 13)) * 3266489917;
    hash = (hash ^ (hash >>> 16));
    return hash >>> 0; // Ensure positive integer
}

// Simple LCG PRNG class
class SimpleLCG {
    constructor(seed) {
        this.seed = typeof seed === 'number' ? seed >>> 0 : simpleHash(String(seed)) >>> 0;
        if (this.seed === 0) {
            this.seed = 1; // Avoid seed 0
        }
        this.m = 0x80000000; // 2^31
        this.a = 1103515245;
        this.c = 12345;
    }
    // Returns a pseudo-random integer between 0 (inclusive) and m (exclusive)
    nextInt() {
        this.seed = (this.a * this.seed + this.c) % this.m;
        return this.seed;
    }
    // Returns a pseudo-random integer between min (inclusive) and max (exclusive)
    nextIntRange(min, max) {
        const range = max - min;
        if (range <= 0) return min;
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
        return (this.nextInt() & 0xFFFF) | ((this.nextInt() & 0xFFFF) << 16); // Combine two 16-bit values
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
     if (binaryInput.length % 8 !== 0) {
        throw new Error("Invalid binary string length for UTF-8 decoding.");
    }
    const bytes = [];
    for (let i = 0; i < binaryInput.length; i += 8) {
        const byteString = binaryInput.substring(i, i + 8);
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

// --- Authentication Code Generation ---
// Generates an authentication code based on watermark binary and key
// Modified: Uses key-derived seeds for PRNGs to make it key-dependent
function generateAuthCode(watermarkBinary, secretKey) {
    const seed1 = simpleHash(secretKey + "_auth_seed_1_data_mix");
    const seed2 = simpleHash(secretKey + "_auth_seed_2_final_hash");
    const seed3 = simpleHash(secretKey + "_auth_seed_3_final_mix");

    const prng1 = new SimpleLCG(seed1);
    const prng2 = new SimpleLCG(seed2);
    const prng3 = new SimpleLCG(seed3);

    const watermarkLen = watermarkBinary.length;
    const authCodeBytes = AUTH_CODE_BITS / 8;

    let mixedDataBytes = Array(Math.ceil(watermarkLen / 8)).fill(0);
    for (let i = 0; i < watermarkLen; i++) {
         const byteIndex = Math.floor(i / 8);
         const bitIndex = i % 8;
         const watermarkBit = parseInt(watermarkBinary[i], 10);
         const keyBit1 = (prng1.nextIntRange(0, 256) >>> (bitIndex % 8)) & 1;

         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (watermarkBit << bitIndex);
         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (keyBit1 << bitIndex);
    }

    let authChecksumBytes = Array(authCodeBytes).fill(0);
    for (let i = 0; i < mixedDataBytes.length; i++) {
        const mixValue = prng2.nextIntRange(0, 256);
        const targetIndex = prng2.nextIntRange(0, authCodeBytes);

        let byteToMix = mixedDataBytes[i];
        byteToMix = (byteToMix + mixValue) & 0xFF;
        byteToMix = (byteToMix << (prng2.nextIntRange(0, 8))) | (byteToMix >>> (8 - prng2.nextIntRange(0, 8)));

        authChecksumBytes[targetIndex] = (authChecksumBytes[targetIndex] ^ byteToMix) & 0xFF;
    }

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

/**
 * Checks if a string contains any zero-width characters.
 * @param {string} text The input string.
 * @returns {boolean} True if zero-width characters are found, false otherwise.
 */
function containsZeroWidthChars(text) {
    // Scan for common zero-width characters
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
    return zeroWidthRegex.test(text);
}

/**
 * Removes all zero-width characters from a string.
 * @param {string} text The input string.
 * @returns {string} The string with zero-width characters removed.
 */
function cleanZeroWidthChars(text) {
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
    return text.replace(zeroWidthRegex, '');
}

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
     if (blockSize < 50) {
         console.warn("Block size is very small, may cause issues.");
     }

    // 1. Prepare watermark payload (Length prefix + data + auth code)
    const watermarkBinary = stringToBinary(watermarkText);
    const watermarkLength = watermarkBinary.length;
    const lengthBinary = watermarkLength.toString(2).padStart(16, '0');
    const authBinary = generateAuthCode(watermarkBinary, secretKey);

    const fullBinaryPayload = lengthBinary + watermarkBinary + authBinary;
    const payloadBits = fullBinaryPayload.length;

    // --- 新增检查：确保原始文本长度足以容纳水印负载 ---
    // embedding needs payloadBits insertion points to fully embed one copy in a piece of text
    // Available insertion points in a string of length L is L + 1
    // So, we need originalText.length + 1 >= payloadBits
    const minRequiredTextLength = payloadBits - 1;
    if (originalText.length < minRequiredTextLength) {
         throw new Error(`水印负载太大 (${payloadBits} 比特)，原始文本长度不足 (${originalText.length} 字符)，至少需要 ${minRequiredTextLength} 字符才能完整嵌入并提取。请加长原始文本或缩短水印内容。`);
    }
    // --- 结束新增检查 ---

    if (payloadBits > blockSize + 1) {
         // This check is still relevant for block-based embedding robustnes
         console.warn(`水印信息 (${payloadBits} 比特) 大于单个分块的可用插入点 (${blockSize} + 1 = ${blockSize + 1})。虽然可以通过总长度检查，但在小于分块大小的文本片段中可能无法可靠提取。考虑增加分块大小。`);
          // Optionally throw here too, but the minimum length check above is more critical.
          // For now, keep it as a warning as the current code adapts by inserting fewer bits per chunk.
          // Extraction *still* requires finding a full payload sequence, which is the main issue addressed by the new check.
    }

    // 2. Generate Keystream for scrambling using the key
    const streamSeed = simpleHash(secretKey + "_stream_seed");
    const prngForStream = new SimpleLCG(streamSeed);

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
    const zwString = zwChars.join('');

    // 3. Embed the ZW string into the original text in blocks
    let resultText = '';
    const originalTextLength = originalText.length;
    const numBlocks = Math.ceil(originalTextLength / blockSize);

    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize;
        const end = Math.min((i + 1) * blockSize, originalTextLength);
        let textChunk = originalText.substring(start, end);

        const possibleIndicesCount = textChunk.length + 1;
        // Only insert as many bits as *can* fit in this chunk
        const indicesToPick = Math.min(payloadBits, possibleIndicesCount);

        // Generate insertion positions for this block using a distinct PRNG sequence
        const positionSeed = simpleHash(secretKey + "_pos_seed_" + i);
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
        let zwIndex = 0;

        // Use a separate array to track which zwChars correspond to which index
        const currentZWInsertions = insertionIndices.map((index, idx) => ({ index, char: zwChars[idx] }));
        let currentInsertIndex = 0;

        for (let j = 0; j <= textChunk.length; j++) {
             while(currentInsertIndex < currentZWInsertions.length && currentZWInsertions[currentInsertIndex].index === j) {
                  chunkWithZW += currentZWInsertions[currentInsertIndex].char;
                  currentInsertIndex++;
             }
             if (j < textChunk.length) {
                  chunkWithZW += textChunk[j];
             }
        }

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
    const streamSeed = simpleHash(secretKey + "_stream_seed");
    const authSeed1 = simpleHash(secretKey + "_auth_seed_1_data_mix");
    const authSeed2 = simpleHash(secretKey + "_auth_seed_2_final_hash");
    const authSeed3 = simpleHash(secretKey + "_auth_seed_3_final_mix");

    for (let i = 0; i <= extractedBits.length - minPayloadBits; i++) {
        let currentBitsSlice = extractedBits.substring(i);

        // Need at least payloadBits length to contain a full payload starting at index i
        if (currentBitsSlice.length < minPayloadBits) continue; // This check is somewhat redundant with loop limit, but defensive

        // Generate NEW PRNG instances for THIS decoding attempt, seeded with the secret key.
        const prngForStreamAttempt = new SimpleLCG(streamSeed);

        // --- Attempt to decode Length Prefix (16 bits) ---
        let potentialLengthBinary = '';
        // Keystream for length prefix uses the first 16 bits of the stream
        for (let k = 0; k < 16; k++) {
             const scrambledBit = parseInt(currentBitsSlice[k], 10);
             const keyBit = prngForStreamAttempt.nextBit(); // Get next bit from keystream
             potentialLengthBinary += (scrambledBit ^ keyBit).toString();
        }
        const potentialWatermarkLength = parseInt(potentialLengthBinary, 2);

         if (isNaN(potentialWatermarkLength) || potentialWatermarkLength < 0 || potentialWatermarkLength > 65535) {
              continue; // Not a valid length
         }

        const expectedPayloadBitsExcludingLength = potentialWatermarkLength + AUTH_CODE_BITS;
        const expectedTotalPayloadBits = 16 + expectedPayloadBitsExcludingLength;

        // Check if we have enough *remaining* extracted bits for the rest of the payload (data + auth) from current start 'i'
        if (currentBitsSlice.length < expectedTotalPayloadBits) {
            continue; // Not enough bits from this starting point 'i' for the full expected payload
        }

        // --- Attempt to decode Watermark Data ---
        let potentialWatermarkBinary = '';
        // Start reading data bits *after* the 16 length bits
        const dataStartIndex = 16;
        // Need to generate the keystream *past* the 16 bits already used for length
         // The PRNG prngForStreamAttempt is already advanced because we read 16 bits from it above
        for (let k = 0; k < potentialWatermarkLength; k++) {
            const dataBitIndex = dataStartIndex + k;
            const scrambledBit = parseInt(currentBitsSlice[dataBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // Keystream continues
            potentialWatermarkBinary += (scrambledBit ^ keyBit).toString();
        }

        // --- Attempt to decode Authentication Code ---
        let extractedAuthBinary = '';
        // Start reading auth bits *after* the data bits
         const authStartIndex = dataStartIndex + potentialWatermarkLength;
         // The PRNG prngForStreamAttempt is already advanced past the data bits
        for (let k = 0; k < AUTH_CODE_BITS; k++) {
            const authBitIndex = authStartIndex + k;
            const scrambledBit = parseInt(currentBitsSlice[authBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // Keystream continues
            extractedAuthBinary += (scrambledBit ^ keyBit).toString();
        }

        // 3. Verify Authentication Code
        // Re-run the generateAuthCode logic with extracted data and provided key
        const expectedAuthBinary = generateAuthCode(potentialWatermarkBinary, secretKey);

        if (extractedAuthBinary === expectedAuthBinary) {
            // Authentication successful! Decode the watermark binary.
            try {
                const extractedText = binaryToString(potentialWatermarkBinary);
                console.log(`水印在提取序列的偏移量 ${i} 处提取成功。`);
                return extractedText; // Found and verified watermark
            } catch (e) {
                console.warn(`在偏移量 ${i} 处提取到匹配的认证码，但解码水印文本失败: ${e.message}`);
            }
        }
    }

    // If loop finishes without returning, no valid watermark was found with this key.
    console.log("未找到匹配密钥和认证码的有效水印。");
    return null;
}

// Export functions if needed for module usage
// export { embedWatermark, extractWatermark, containsZeroWidthChars, cleanZeroWidthChars };