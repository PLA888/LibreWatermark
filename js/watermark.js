// Core blind watermark logic

const ZERO_WIDTH_SPACE = '\u200b'; // Represents bit '0'
const ZERO_WIDTH_NON_JOINER = '\u200c'; // Represents bit '1'
const AUTH_CODE_BITS = 32;

// --- Pseudo-Random Number Generator (PRNG) ---
// Simple hash function for seed
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    hash = (hash ^ (hash >>> 16)) * 2246822507;
    hash = (hash ^ (hash >>> 13)) * 3266489917;
    hash = (hash ^ (hash >>> 16));
    return hash >>> 0; // Positive integer
}

// Simple LCG PRNG class
class SimpleLCG {
    constructor(seed) {
        this.seed = typeof seed === 'number' ? seed >>> 0 : simpleHash(String(seed)) >>> 0;
        if (this.seed === 0) this.seed = 1;
        this.m = 0x80000000; // 2^31
        this.a = 1103515245;
        this.c = 12345;
    }
    nextInt() { // [0, m)
        this.seed = (this.a * this.seed + this.c) % this.m;
        return this.seed;
    }
    nextIntRange(min, max) { // [min, max)
        const range = max - min;
        if (range <= 0) return min;
        return min + (this.nextInt() % range);
    }
    shuffleArray(array) { // Fisher-Yates seeded
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextIntRange(0, i + 1); // 0 to i inclusive
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    nextBit() { return this.nextIntRange(0, 2); } // 0 or 1
}

// --- String <-> Binary Conversion ---
// String to binary string (UTF-8)
function stringToBinary(input) {
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(input);
    let binaryString = '';
    uint8Array.forEach(byte => {
        binaryString += byte.toString(2).padStart(8, '0');
    });
    return binaryString;
}

// Binary string to string (UTF-8)
function binaryToString(binaryInput) {
     if (binaryInput.length % 8 !== 0) {
        throw new Error("无效的二进制字符串长度，无法进行UTF-8解码。");
    }
    const bytes = [];
    for (let i = 0; i < binaryInput.length; i += 8) {
        const byteString = binaryInput.substring(i, i + 8);
        const byte = parseInt(byteString, 2);
         if (isNaN(byte)) {
              throw new Error("二进制字符串中包含无效字符。");
         }
         bytes.push(byte);
    }
    const decoder = new TextDecoder();
    try {
        return decoder.decode(new Uint8Array(bytes));
    } catch (e) {
        console.error("解码二进制字符串时出错:", e);
        throw new Error("解码二进制数据失败，数据可能已损坏或不是有效的 UTF-8 编码。");
    }
}

// --- Authentication Code Generation ---
// Generates auth code based on watermark binary and key
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

    return authCodeBinary; // Binary string of length AUTH_CODE_BITS
}

/**
 * Checks if a string contains any zero-width characters.
 * @param {string} text
 * @returns {boolean} True if zero-width characters are found.
 */
function containsZeroWidthChars(text) {
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
    return zeroWidthRegex.test(text);
}

/**
 * Removes all zero-width characters from a string.
 * @param {string} text
 * @returns {string} Cleaned string.
 */
function cleanZeroWidthChars(text) {
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
    return text.replace(zeroWidthRegex, '');
}

/**
 * Embeds a watermark into text using zero-width characters in blocks.
 * @param {string} originalText Text to embed into.
 * @param {string} secretKey Key for PRNG.
 * @param {string} watermarkText Watermark content.
 * @param {number} blockSize Block size for embedding distribution.
 * @returns {string} Text with watermark.
 * @throws {Error} If input is invalid or text is too short.
 */
function embedWatermark(originalText, secretKey, watermarkText, blockSize) {
    if (!originalText || !secretKey || !watermarkText) {
        throw new Error("缺失必需的输入：原始文本、密钥或水印内容。");
    }
     if (blockSize < 50) {
         console.warn("警告：分块大小（" + blockSize + "）非常小，可能导致文本膨胀严重或出现其他问题。建议使用更高的值。");
     }

    const watermarkBinary = stringToBinary(watermarkText);
    const watermarkLength = watermarkBinary.length;
    const lengthBinary = watermarkLength.toString(2).padStart(16, '0');
    const authBinary = generateAuthCode(watermarkBinary, secretKey);

    const fullBinaryPayload = lengthBinary + watermarkBinary + authBinary;
    const payloadBits = fullBinaryPayload.length;

    // --- 修复 Bug: 检查原始文本的最小长度 ---
    const totalPossibleInsertionPoints = originalText.length + 1;
    if (totalPossibleInsertionPoints < payloadBits) {
         throw new Error(`原始文本过短 (${originalText.length} 字符)。水印负载需要 ${payloadBits} 个插入位置，您需要至少 ${payloadBits - 1} 个字符长度的文本。请加长原始文本或缩短水印内容。`);
    }
    // --- 结束修复 Bug ---

    // Warning about large payload vs block size
     if (payloadBits > blockSize + 1) {
         console.warn(`警告：水印负载 (${payloadBits} 比特) 大于单个分块 (${blockSize} 字符) 的最大可能插入点 (${blockSize + 1})。在很短的文本片段中可能无法可靠提取。`);
     }

    // Keystream for scrambling
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

    // Embed the ZW string into the original text in blocks
    let resultText = '';
    const originalTextLength = originalText.length;
    const numBlocks = Math.ceil(originalTextLength / blockSize);

    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize;
        const end = Math.min((i + 1) * blockSize, originalTextLength);
        let textChunk = originalText.substring(start, end);

        const possibleIndicesCount = textChunk.length + 1;
        const indicesToPick = Math.min(payloadBits, possibleIndicesCount);

        const zwCharsForThisChunk = zwChars.slice(0, indicesToPick);

        // Generate insertion positions for this block using a distinct PRNG sequence
        const positionSeed = simpleHash(secretKey + "_pos_seed_" + i);
        const prngForPosition = new SimpleLCG(positionSeed);

        const possibleIndices = Array.from({ length: possibleIndicesCount }, (_, k) => k);

        prngForPosition.shuffleArray(possibleIndices);
        const insertionIndices = possibleIndices.slice(0, indicesToPick);
        insertionIndices.sort((a, b) => a - b); // Sort indices for sequential insertion

        // Insert ZW characters into the text chunk
        let chunkWithZW = '';
        let textChunkIndex = 0;
        let insertionIndexPointer = 0;

        for (let j = 0; j <= textChunk.length; j++) {
             while(insertionIndexPointer < insertionIndices.length && insertionIndices[insertionIndexPointer] === j) {
                  chunkWithZW += zwCharsForThisChunk[insertionIndexPointer];
                  insertionIndexPointer++;
             }
             if (j < textChunk.length) {
                  chunkWithZW += textChunk[textChunkIndex];
                  textChunkIndex++;
             }
        }

        resultText += chunkWithZW;
    }

    return resultText;
}

/**
 * Extracts a watermark from text using the secret key.
 * @param {string} textWithWatermark Text potentially containing watermark.
 * @param {string} secretKey Key used during embedding.
 * @returns {string | null} Extracted watermark or null.
 */
function extractWatermark(textWithWatermark, secretKey) {
    if (!textWithWatermark || !secretKey) {
        console.error("提取缺失必需输入：文本或密钥。");
        return null;
    }

    // 1. Scan ALL ZW characters in order
    let extractedZWString = '';
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
    let match;
    while ((match = zeroWidthRegex.exec(textWithWatermark)) !== null) {
        extractedZWString += match[0];
    }

    if (extractedZWString.length === 0) {
        console.log("文本中未发现零宽字符。");
        return null;
    }

    // Convert extracted ZW string to binary bitstring
    const extractedBits = extractedZWString.split('').map(char =>
        char === ZERO_WIDTH_SPACE ? '0' : '1'
    ).join('');

    // Minimum payload length
    const minPayloadBits = 16 + 1 + AUTH_CODE_BITS;
    if (extractedBits.length < minPayloadBits) {
         console.log(`提取到的零宽字符序列 (${extractedBits.length} 比特) 太短，不足以包含完整的水印 payload (至少 ${minPayloadBits} 比特)。`);
         return null;
    }

    // 2. Iterate through extracted bits, trying to decode payloads
    const streamSeed = simpleHash(secretKey + "_stream_seed");

    for (let i = 0; i <= extractedBits.length - minPayloadBits; i++) {
        let currentBitsSlice = extractedBits.substring(i);

        if (currentBitsSlice.length < minPayloadBits) continue;

        // Use a NEW PRNG instance for EACH decoding attempt, seeded with the secret key.
        const prngForStreamAttempt = new SimpleLCG(streamSeed);

        // --- Decode Length Prefix (16 bits) ---
        let potentialLengthBinary = '';
        for (let k = 0; k < 16; k++) {
             if (k >= currentBitsSlice.length) {
                 potentialLengthBinary = '';
                 break;
             }
             const scrambledBit = parseInt(currentBitsSlice[k], 10);
             const keyBit = prngForStreamAttempt.nextBit();
             potentialLengthBinary += (scrambledBit ^ keyBit).toString();
        }
         if (potentialLengthBinary.length < 16) continue;

        const potentialWatermarkLength = parseInt(potentialLengthBinary, 2);

         if (isNaN(potentialWatermarkLength) || potentialWatermarkLength < 0 || potentialWatermarkLength > 65535) {
              continue;
         }

        const expectedPayloadBitsExcludingLength = potentialWatermarkLength + AUTH_CODE_BITS;
        const expectedTotalPayloadBits = 16 + expectedPayloadBitsExcludingLength;

        if (currentBitsSlice.length < expectedTotalPayloadBits) {
            continue;
        }

        // --- Decode Watermark Data ---
        let potentialWatermarkBinary = '';
        const dataStartIndex = 16;
        for (let k = 0; k < potentialWatermarkLength; k++) {
            const dataBitIndex = dataStartIndex + k;
            const scrambledBit = parseInt(currentBitsSlice[dataBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit();
            potentialWatermarkBinary += (scrambledBit ^ keyBit).toString();
        }
         if (potentialWatermarkBinary.length !== potentialWatermarkLength) continue;

        // --- Decode Authentication Code ---
        let extractedAuthBinary = '';
         const authStartIndex = dataStartIndex + potentialWatermarkLength;
        for (let k = 0; k < AUTH_CODE_BITS; k++) {
            const authBitIndex = authStartIndex + k;
            const scrambledBit = parseInt(currentBitsSlice[authBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit();
            extractedAuthBinary += (scrambledBit ^ keyBit).toString();
        }
        if (extractedAuthBinary.length !== AUTH_CODE_BITS) continue;

        // 3. Verify Authentication Code
        const expectedAuthBinary = generateAuthCode(potentialWatermarkBinary, secretKey);

        if (extractedAuthBinary === expectedAuthBinary) {
            try {
                const extractedText = binaryToString(potentialWatermarkBinary);
                console.log(`水印在提取序列的偏移量 ${i} 处提取成功。`);
                return extractedText;
            } catch (e) {
                console.warn(`在提取序列偏移量 ${i} 处发现匹配的认证码，但解码水印内容失败: ${e.message}`);
            }
        }
    }

    console.log("未找到匹配密钥和认证码的有效水印。");
    return null;
}

// Export functions if needed for module usage
// export { embedWatermark, extractWatermark, containsZeroWidthChars, cleanZeroWidthChars };