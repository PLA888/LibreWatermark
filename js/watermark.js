// watermark.js - Core blind watermark logic with block embedding and authentication

const ZERO_WIDTH_SPACE = '\u200b'; // Represents bit '0'
const ZERO_WIDTH_NON_JOINER = '\u200c'; // Represents bit '1'
const AUTH_CODE_BITS = 16; // Number of bits for the authentication code

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

         /* // More complex non-biasing method:
         const bitsNeeded = Math.ceil(Math.log2(range));
         const mask = (1 << bitsNeeded) - 1;
         let randomValue;
         do {
              randomValue = this.nextInt() & mask; // Use a sufficient number of bits from nextInt
         } while (randomValue >= range);
         return min + randomValue;
         */
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

// --- Authentication Code Generation ---
// Generates a simple authentication code based on watermark binary and key
function generateAuthCode(watermarkBinary, secretKey) {
    const authSeed = simpleHash(secretKey + "_auth_seed");
    const prng = new SimpleLCG(authSeed);

    // Generate key-dependent "random" bits for XORing with data
    let keyBits = '';
    for (let i = 0; i < AUTH_CODE_BITS; i++) {
        keyBits += prng.nextBit();
    }

    // Simple XOR checksum: XOR chunks of watermark binary with key bits
    let checksum = Array(AUTH_CODE_BITS).fill(0); // Initialize checksum bits
    const watermarkLen = watermarkBinary.length;

    for (let i = 0; i < watermarkLen; i++) {
        const watermarkBit = parseInt(watermarkBinary[i], 10);
        const keyBit = parseInt(keyBits[i % AUTH_CODE_BITS], 10); // Cycle through key bits
        checksum[i % AUTH_CODE_BITS] = checksum[i % AUTH_CODE_BITS] ^ (watermarkBit ^ keyBit);
    }

    return checksum.join(''); // Return as binary string
}

// --- Core Watermark Logic ---

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
     if (blockSize < 50) { // Basic sanity check for minimum block size
         console.warn("Block size is very small, may cause issues.");
     }

    // 1. Prepare watermark payload (Length prefix + data + auth code)
    const watermarkBinary = stringToBinary(watermarkText);
    const watermarkLength = watermarkBinary.length;

    // Use 16 bits for length prefix (max length 65535 bits)
    const lengthBinary = watermarkLength.toString(2).padStart(16, '0');

    // Generate authentication code
    const authBinary = generateAuthCode(watermarkBinary, secretKey);

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

     // We need payloadBits insertion points within a block of blockSize characters.
     // The number of possible insertion points in a block of size N is N+1 (before 1st char to after last char).
     // If payloadBits > blockSize + 1, it's impossible to find enough *distinct* indices within the block.
    if (payloadBits > blockSize + 1) {
         throw new Error(`水印信息 (${payloadBits} 比特) 太长，无法嵌入到指定的分块大小 (${blockSize} 字符) 中。分块大小至少需要 ${payloadBits -1} 个字符。请增加分块大小或减少水印内容。`);
    }

    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize;
        const end = Math.min((i + 1) * blockSize, originalText.length);
        let textChunk = originalText.substring(start, end);

        // Skip embedding in very short last block if it cannot fit the payload
        if (textChunk.length + 1 < payloadBits) {
             resultText += textChunk; // Just append the original chunk
             continue; // Move to the next potential block (though this should be the last one)
        }

        // Generate insertion positions for this block using a distinct PRNG sequence
        const positionSeed = simpleHash(secretKey + "_pos_seed_" + i); // Seed depends on key and block index
        const prngForPosition = new SimpleLCG(positionSeed);

         // Generate all possible insertion indices within the chunk (0 to textChunk.length)
        const possibleIndices = Array.from({ length: textChunk.length + 1 }, (_, k) => k);

        // Shuffle and pick the first `payloadBits` indices
        // Ensure we don't try to pick more indices than available (handled by the skip above)
        const indicesToPick = payloadBits; // We determined we have enough space

        prngForPosition.shuffleArray(possibleIndices);
        const insertionIndices = possibleIndices.slice(0, indicesToPick);
        insertionIndices.sort((a, b) => a - b); // Sort indices for sequential insertion

        // Insert ZW characters into the text chunk at the chosen positions
        let chunkWithZW = '';
        let chunkIndex = 0;
        let zwIndex = 0; // Index into the zwChars array for the *current* payload copy

        while (chunkIndex < textChunk.length || zwIndex < insertionIndices.length) {
             // If the current position is an insertion point, add the next ZW char
            if (zwIndex < insertionIndices.length && insertionIndices[zwIndex] === chunkIndex) {
                chunkWithZW += zwChars[zwIndex];
                zwIndex++;
            }
            // If there are still characters left in the chunk, add the next one
            if (chunkIndex < textChunk.length) {
                chunkWithZW += textChunk[chunkIndex];
                chunkIndex++;
            }
             // Special case: Handle insertion after the last character of the chunk
             else if (zwIndex < insertionIndices.length && insertionIndices[zwIndex] === textChunk.length) {
                  chunkWithZW += zwChars[zwIndex];
                  zwIndex++;
             }
        }
         // Note: zwIndex should equal payloadBits after this loop if successful

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

    const minPayloadBits = 16 + 1 + AUTH_CODE_BITS; // Min: length(16) + 1 data bit + auth(16)
    if (extractedBits.length < minPayloadBits) {
         console.log(`提取到的零宽字符序列 (${extractedBits.length} 比特) 太短，不足以包含完整的水印 payload (至少 ${minPayloadBits} 比特)。`);
         return null;
    }

    // 2. Iterate through the extracted bits, trying to decode a payload starting at each position
    const streamSeed = simpleHash(secretKey + "_stream_seed"); // Seed for keystream (must match embedding)

     // Iterate through all possible start indices in the extracted ZW sequence
    for (let i = 0; i <= extractedBits.length - minPayloadBits; i++) {
        // Attempt to start decoding a payload from index 'i' in the extracted sequence
        let currentBits = extractedBits.substring(i); // Substring from current potential start

        // Need at least 16 bits for the length prefix
        if (currentBits.length < 16) continue;

        // Create a NEW keystream instance for *each* potential starting position.
        // Crucially, the keystream application is RELATIVE to the START of the potential payload
        // (which corresponds to index 'i' in the overall extracted sequence).
        // The keystream PRNG state should be *reset* to its state *at that point* in the original embedding stream.
        // This is tricky. A simpler approach is to regenerate the *entire* keystream based on the key,
        // and then take a segment of it starting at index 'i'.
        // However, the original embedding used a PRNG seeded ONCE per block.
        // The *correct* approach for extraction is to simulate the PRNG for *that block*.
        // But we don't know *which block* this sequence came from!
        // This highlights a limitation of this extraction approach. We are assuming the extracted ZW sequence
        // is a contiguous piece from *some* embedded payload.

        // Let's refine the keystream logic: The keystream for a payload copy in a block
        // depends on the *key*. When extracting a contiguous sequence of ZW,
        // we don't know which block it came from, but we *do* know the sequence of
        // ZW bits corresponds to a contiguous section of the *scrambled payload*.
        // The scrambled payload bits `S_k` were `P_k ^ K_k`, where `P_k` is payload bit `k`
        // and `K_k` is the keystream bit `k`.
        // To unscramble, we need `P_k = S_k ^ K_k`. We need the keystream starting at `K_0`.
        // The keystream for *a* payload is always generated from the same streamSeed.
        // So, if the extracted sequence starts *exactly* at the beginning of *a* payload,
        // we can use a keystream generated from streamSeed.

        // Let's regenerate the keystream for the *entire* payload length based on the key.
        // This assumes the extracted segment starts at the beginning of *some* payload copy.
        // This is a limitation of the current extraction logic for partial blocks.
        // A more robust extraction would need to try different offsets into the keystream,
        // or embed block index information. But let's stick to the simpler model for now,
        // as it matches the embedding logic for a single block.

         const prngForStreamAttempt = new SimpleLCG(streamSeed); // Use the same seed as embedding

        // --- Attempt to decode Length Prefix (16 bits) ---
        let potentialLengthBinary = '';
        for (let k = 0; k < 16; k++) {
             if (k >= currentBits.length) break;
             const scrambledBit = parseInt(currentBits[k], 10);
             const keyBit = prngForStreamAttempt.nextBit(); // Get next bit from keystream (relative to start of currentBits)
             potentialLengthBinary += (scrambledBit ^ keyBit).toString();
        }

         if (potentialLengthBinary.length < 16) continue; // Did not get a full 16 bits

        const potentialWatermarkLength = parseInt(potentialLengthBinary, 2);

        // Sanity check the decoded length
         if (isNaN(potentialWatermarkLength) || potentialWatermarkLength < 0 || potentialWatermarkLength > 65535) {
              continue; // Not a valid length range or garbage
         }

        const expectedPayloadBits = 16 + potentialWatermarkLength + AUTH_CODE_BITS;

        // Check if we have enough extracted bits for the full expected payload
        if (currentBits.length < expectedPayloadBits) {
            continue; // Not enough bits from this starting point 'i' in the overall extracted sequence
        }

        // --- Attempt to decode Watermark Data ---
        let potentialWatermarkBinary = '';
          // Continue PRNG sequence for the data part
        for (let k = 0; k < potentialWatermarkLength; k++) {
            const dataBitIndex = 16 + k;
             if (dataBitIndex >= currentBits.length) break; // Should not happen due to check above
            const scrambledBit = parseInt(currentBits[dataBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // Get next bit from keystream
            potentialWatermarkBinary += (scrambledBit ^ keyBit).toString();
        }
         if (potentialWatermarkBinary.length !== potentialWatermarkLength) continue; // Did not get expected data length

        // --- Attempt to decode Authentication Code ---
        let extractedAuthBinary = '';
        for (let k = 0; k < AUTH_CODE_BITS; k++) {
            const authBitIndex = 16 + potentialWatermarkLength + k;
            if (authBitIndex >= currentBits.length) break; // Should not happen
            const scrambledBit = parseInt(currentBits[authBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // Get next bit from keystream
            extractedAuthBinary += (scrambledBit ^ keyBit).toString();
        }
        if (extractedAuthBinary.length !== AUTH_CODE_BITS) continue; // Did not get expected auth length

        // 3. Verify Authentication Code
        const expectedAuthBinary = generateAuthCode(potentialWatermarkBinary, secretKey);

        if (extractedAuthBinary === expectedAuthBinary) {
            // Authentication successful! Decode the watermark binary.
            try {
                const extractedText = binaryToString(potentialWatermarkBinary);
                console.log(`水印在提取的 ZW 序列的相对位置 ${i} 处成功提取。`);
                return extractedText; // Found and verified watermark
            } catch (e) {
                console.warn(`在位置 ${i} 提取到匹配的认证码，但解码水印文本失败: ${e.message}`);
                 // This case is less likely with auth code, but possible if data is corrupted in a way
                 // that doesn't break auth but makes the binary invalid UTF-8.
                 // Let's continue searching for other potential blocks.
            }
        } else {
            // Authentication failed, wrong key or corrupted data at this position. Continue searching.
        }
    }

    // If loop finishes without returning, no valid watermark payload was found with this key and structure.
    console.log("未找到匹配密钥和认证码的有效水印。");
    return null;
}