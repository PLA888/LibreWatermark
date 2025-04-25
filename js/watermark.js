// watermark.js - 文本盲水印核心逻辑 (分块嵌入与认证)

// 零宽字符定义
const ZERO_WIDTH_SPACE = '\u200b'; // 代表比特 '0'
const ZERO_WIDTH_NON_JOINER = '\u200c'; // 代表比特 '1'
const AUTH_CODE_BITS = 32; // 认证码长度 (比特)

// --- 伪随机数生成器 (PRNG) ---
// 简单的哈希函数，从字符串密钥生成种子
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    // 混合操作以增加随机性
    hash = (hash ^ (hash >>> 16)) * 2246822507;
    hash = (hash ^ (hash >>> 13)) * 3266489917;
    hash = (hash ^ (hash >>> 16));
    return hash >>> 0; // 确保返回正整数
}

// 简单的线性同余生成器 (LCG) PRNG 类
class SimpleLCG {
    constructor(seed) {
        // 使用提供的种子或密钥的哈希值作为起始种子，确保为正整数
        this.seed = typeof seed === 'number' ? seed >>> 0 : simpleHash(String(seed)) >>> 0;
        if (this.seed === 0) {
            this.seed = 1; // 避免种子为 0
        }
         // LCG 参数 (m = 2^31)
        this.m = 0x80000000;
        this.a = 1103515245;
        this.c = 12345;
    }
    // 生成一个伪随机整数 [0, m)
    nextInt() {
         // 标准 LCG 公式: seed = (a * seed + c) mod m
        this.seed = (this.a * this.seed + this.c) % this.m;
        return this.seed;
    }
    // 生成一个伪随机整数 [min, max)
    nextIntRange(min, max) {
        const range = max - min;
        if (range <= 0) return min;
        return min + (this.nextInt() % range);
    }
     // 使用 Fisher-Yates 算法对数组进行洗牌 (就地操作)，使用 PRNG 生成随机索引
     shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextIntRange(0, i + 1); // 0 到 i (包含)
            [array[i], array[j]] = [array[j], array[i]]; // 交换元素
        }
    }
    // 生成一个伪随机比特 (0 或 1) 用于密钥流
    nextBit() {
      return this.nextIntRange(0, 2); // 0 或 1
    }
}

// --- 字符串 <-> 二进制转换 ---
// 将字符串转换为二进制字符串 ('0' 和 '1')，使用 UTF-8 编码
function stringToBinary(input) {
    const encoder = new TextEncoder(); // Defaults to UTF-8
    const uint8Array = encoder.encode(input);
    let binaryString = '';
    uint8Array.forEach(byte => {
        binaryString += byte.toString(2).padStart(8, '0'); // 每个字节转为 8 位二进制
    });
    return binaryString;
}

// 将二进制字符串转换回字符串，使用 UTF-8 解码
function binaryToString(binaryInput) {
     if (binaryInput.length % 8 !== 0) {
        throw new Error("无效的二进制字符串长度，无法进行 UTF-8 解码。");
    }
    const bytes = [];
    for (let i = 0; i < binaryInput.length; i += 8) {
        const byteString = binaryInput.substring(i, i + 8);
        const byte = parseInt(byteString, 2); // base 2 解析
         if (isNaN(byte)) {
              throw new Error("二进制字符串中包含无效字符。");
         }
         bytes.push(byte);
    }
    const decoder = new TextDecoder(); // Defaults to UTF-8
    try {
        return decoder.decode(new Uint8Array(bytes));
    } catch (e) {
        console.error("解码二进制字符串时出错:", e);
        throw new Error("解码二进制数据失败，数据可能已损坏或不是有效的 UTF-8 编码。");
    }
}

// --- 认证码生成 ---
// 根据水印二进制数据和密钥生成认证码
function generateAuthCode(watermarkBinary, secretKey) {
    // 使用密钥派生不同的种子，增强安全性
    const seed1 = simpleHash(secretKey + "_auth_seed_1_data_mix");
    const seed2 = simpleHash(secretKey + "_auth_seed_2_final_hash");
    const seed3 = simpleHash(secretKey + "_auth_seed_3_final_mix");

    const prng1 = new SimpleLCG(seed1);
    const prng2 = new SimpleLCG(seed2);
    const prng3 = new SimpleLCG(seed3);

    const watermarkLen = watermarkBinary.length;
    const authCodeBytes = AUTH_CODE_BITS / 8; // 认证码的字节数

    // 步骤 1: 将水印二进制数据与密钥派生流混合 (XOR)
    let mixedDataBytes = Array(Math.ceil(watermarkLen / 8)).fill(0);
    for (let i = 0; i < watermarkLen; i++) {
         const byteIndex = Math.floor(i / 8);
         const bitIndex = i % 8;
         const watermarkBit = parseInt(watermarkBinary[i], 10);
         // 从 PRNG1 生成密钥比特 (从随机字节中取一位)
         const keyBit1 = (prng1.nextIntRange(0, 256) >>> (bitIndex % 8)) & 1;

         // 将水印比特和密钥比特 XOR 到混合数据的对应字节中
         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (watermarkBit << bitIndex);
         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (keyBit1 << bitIndex);
    }

    // 步骤 2: 将混合数据字节降维到固定大小的校验和结构中
    let authChecksumBytes = Array(authCodeBytes).fill(0);
    for (let i = 0; i < mixedDataBytes.length; i++) {
        // 使用 PRNG2 决定如何混合每个字节
        const mixValue = prng2.nextIntRange(0, 256);
        const targetIndex = prng2.nextIntRange(0, authCodeBytes); // 随机选择校验和字节索引

        // 更复杂的混合操作: 加法溢出和位旋转
        let byteToMix = mixedDataBytes[i];
        byteToMix = (byteToMix + mixValue) & 0xFF; // 加法 + 溢出 (模 256)
        byteToMix = (byteToMix << (prng2.nextIntRange(0, 8))) | (byteToMix >>> (8 - prng2.nextIntRange(0, 8))); // 随机位旋转

        authChecksumBytes[targetIndex] = (authChecksumBytes[targetIndex] ^ byteToMix) & 0xFF; // XOR 到校验和字节
    }

     // 步骤 3: 最后与第三个密钥派生流进行 XOR
    let authCodeBinary = '';
    for (let i = 0; i < authCodeBytes; i++) {
         const checksumByte = authChecksumBytes[i];
         // 从 PRNG3 生成密钥字节
         const keyByte3 = prng3.nextIntRange(0, 256);

         const finalByte = (checksumByte ^ keyByte3) & 0xFF; // XOR
         authCodeBinary += finalByte.toString(2).padStart(8, '0'); // 转为二进制字符串
    }

    return authCodeBinary; // 返回长度为 AUTH_CODE_BITS 的二进制字符串
}

/**
 * 检查字符串是否包含任何零宽字符。
 * @param {string} text 输入字符串。
 * @returns {boolean} 如果找到零宽字符，返回 true，否则返回 false。
 */
function containsZeroWidthChars(text) {
    // 扫描常见零宽字符: ZWSP (200B), ZWNJ (200C), ZWJ (200D), BOM (FEFF)
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
    return zeroWidthRegex.test(text);
}

/**
 * 移除字符串中所有的零宽字符。
 * @param {string} text 输入字符串。
 * @returns {string} 移除零宽字符后的字符串。
 */
function cleanZeroWidthChars(text) {
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
    return text.replace(zeroWidthRegex, '');
}

/**
 * 将水印分块嵌入到文本中，使用零宽字符。
 * @param {string} originalText 要嵌入水印的原始文本 (B)。
 * @param {string} secretKey 用于 PRNG 的密钥 (A)。
 * @param {string} watermarkText 要嵌入的水印内容 (C)。
 * @param {number} blockSize 分块大小，影响水印分布密度。
 * @returns {string} 包含嵌入水印的文本。
 * @throws {Error} 如果输入无效或文本过短无法容纳水印。
 */
function embedWatermark(originalText, secretKey, watermarkText, blockSize) {
    // 输入校验
    if (!originalText || !secretKey || !watermarkText) {
        throw new Error("缺失必需的输入：原始文本、密钥或水印内容。");
    }
    // 分块大小警告
     if (blockSize < 50) {
         // 这个警告可以通过通知系统显示或仅在控制台输出
         console.warn("警告：分块大小（" + blockSize + "）非常小，可能导致文本膨胀严重或出现其他问题。");
     }

    // 准备水印负载 (长度前缀 + 数据 + 认证码)
    const watermarkBinary = stringToBinary(watermarkText);
    const watermarkLength = watermarkBinary.length;
    const lengthBinary = watermarkLength.toString(2).padStart(16, '0'); // 16 位长度前缀
    const authBinary = generateAuthCode(watermarkBinary, secretKey); // 生成认证码

    const fullBinaryPayload = lengthBinary + watermarkBinary + authBinary;
    const payloadBits = fullBinaryPayload.length; // 完整负载的总比特数

    // --- 修复 Bug: 检查原始文本的最小长度 ---
    // 文本总长度 L，有 L+1 个插入位置 (在每个字符前后以及文本末尾)
    // 要完整嵌入一个 payload (payloadBits 比特)，需要 payloadBits 个插入位置
    // 因此，需要 totalPossibleInsertionPoints >= payloadBits
    const totalPossibleInsertionPoints = originalText.length + 1;
    if (totalPossibleInsertionPoints < payloadBits) {
         throw new Error(`原始文本过短 (${originalText.length} 字符)。水印负载需要 ${payloadBits} 个插入位置（比特），您需要至少 ${payloadBits - 1} 个字符长度的原始文本才能完整嵌入一个负载拷贝。请加长原始文本或缩短水印内容。`);
    }
    // --- 结束修复 Bug ---

    // 警告：如果负载大小大于单个分块的插入点，总长度够也可能在小片段中提取困难
     if (payloadBits > blockSize + 1) {
          console.warn(`警告：水印负载 (${payloadBits} 比特) 大于单个分块 (${blockSize} 字符) 的最大可能插入点 (${blockSize + 1})。这意味着在一个分块文本中无法包含一个完整的负载拷贝。从小于一个分块的文本片段中可能无法提取到完整的水印信息。`);
     }

    // 生成密钥流用于混淆，使用密钥作为种子
    const streamSeed = simpleHash(secretKey + "_stream_seed");
    const prngForStream = new SimpleLCG(streamSeed);

    let keystream = '';
     for(let i = 0; i < payloadBits; i++) {
         keystream += prngForStream.nextBit();
     }

    // 混淆完整的负载数据 (与密钥流进行 XOR)
    let scrambledPayload = '';
    for (let i = 0; i < payloadBits; i++) {
        const payloadBit = parseInt(fullBinaryPayload[i], 10);
        const keyBit = parseInt(keystream[i], 10);
        scrambledPayload += (payloadBit ^ keyBit).toString(); // XOR 混淆
    }

    // 将混淆后的比特映射到零宽字符
    const zwChars = scrambledPayload.split('').map(bit =>
        bit === '0' ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NON_JOINER
    );

    // 将零宽字符字符串嵌入到原始文本分块中
    let resultText = '';
    const originalTextLength = originalText.length;
    const numBlocks = Math.ceil(originalTextLength / blockSize);

    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize;
        const end = Math.min((i + 1) * blockSize, originalTextLength);
        let textChunk = originalText.substring(start, end);

        const possibleIndicesCount = textChunk.length + 1; // 当前分块的可用插入点数量
        // 在当前分块中选择插入的点数 (不超过负载总比特数和当前分块可用点数)
        const indicesToPick = Math.min(payloadBits, possibleIndicesCount);

        // 用于当前分块的零宽字符 (取负载前 indicesToPick 个)
        const zwCharsForThisChunk = zwChars.slice(0, indicesToPick); // 保持负载比特顺序

        // 生成当前分块的插入位置，使用与密钥和分块索引相关的种子
        const positionSeed = simpleHash(secretKey + "_pos_seed_" + i);
        const prngForPosition = new SimpleLCG(positionSeed);

        const possibleIndices = Array.from({ length: possibleIndicesCount }, (_, k) => k);

        prngForPosition.shuffleArray(possibleIndices); // 打乱所有可能位置
        const insertionIndices = possibleIndices.slice(0, indicesToPick); // 选择 indicesToPick 个位置
        insertionIndices.sort((a, b) => a - b); // 按升序排序，方便插入

        // 将零宽字符插入到文本分块中
        let chunkWithZW = '';
        let textChunkIndex = 0;
        let insertionIndexPointer = 0;

        // 遍历文本分块的每个位置 (包括末尾)，决定在此位置前是否插入零宽字符
        for (let j = 0; j <= textChunk.length; j++) {
             // 检查当前位置 j 是否是要插入的位置之一
             while(insertionIndexPointer < insertionIndices.length && insertionIndices[insertionIndexPointer] === j) {
                  // 插入对应的零宽字符
                  chunkWithZW += zwCharsForThisChunk[insertionIndexPointer];
                  insertionIndexPointer++;
             }
             // 添加原始文本字符
             if (j < textChunk.length) {
                  chunkWithZW += textChunk[textChunkIndex];
                  textChunkIndex++;
             }
        }

        resultText += chunkWithZW; // 拼接结果
    }

    return resultText;
}

/**
 * 从文本中提取水印，使用秘密密钥。
 * 扫描可能的零宽字符序列，尝试解码并验证认证码。
 * @param {string} textWithWatermark 可能包含水印的文本。
 * @param {string} secretKey 嵌入时使用的密钥。
 * @returns {string | null} 提取到的水印文本，如果未找到或密钥错误则返回 null。
 */
function extractWatermark(textWithWatermark, secretKey) {
    // 输入校验
    if (!textWithWatermark || !secretKey) {
        console.error("提取缺失必需输入：文本或密钥。");
        return null;
    }

    // 1. 扫描并按顺序提取所有零宽字符
    let extractedZWString = '';
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
     // 使用 exec 循环查找所有匹配项
    let match;
    while ((match = zeroWidthRegex.exec(textWithWatermark)) !== null) {
        extractedZWString += match[0];
    }

    if (extractedZWString.length === 0) {
        console.log("文本中未发现零宽字符。");
        return null; // 未找到零宽字符
    }

    // 将提取到的零宽字符字符串转换为二进制比特流
    const extractedBits = extractedZWString.split('').map(char =>
        char === ZERO_WIDTH_SPACE ? '0' : '1'
    ).join('');

    // 检查提取到的比特流长度是否至少包含一个完整的负载
    const minPayloadBits = 16 + 1 + AUTH_CODE_BITS; // 最小负载长度: 16 (长度) + 1 (最小数据) + 32 (认证码)
    if (extractedBits.length < minPayloadBits) {
         console.log(`提取到的零宽字符序列 (${extractedBits.length} 比特) 太短，不足以包含完整的水印 payload (至少 ${minPayloadBits} 比特)。`);
         return null;
    }

    // 2. 遍历提取到的比特流，尝试从每个位置开始解码一个负载
    const streamSeed = simpleHash(secretKey + "_stream_seed"); // 用于恢复密钥流的种子

    // 从比特流的每个可能的起始点 i 开始尝试
    for (let i = 0; i <= extractedBits.length - minPayloadBits; i++) {
        let currentBitsSlice = extractedBits.substring(i); // 从当前起始点开始的比特片段

        // 确保剩余比特至少够一个最小负载的长度
        if (currentBitsSlice.length < minPayloadBits) continue;

        // 为每次解码尝试创建一个新的 PRNG 实例，使用秘密密钥种子 (必须与嵌入时匹配)
        const prngForStreamAttempt = new SimpleLCG(streamSeed);

        // --- 尝试解码长度前缀 (16 比特) ---
        let potentialLengthBinary = '';
        // 密钥流的前 16 比特用于解码长度前缀
        for (let k = 0; k < 16; k++) {
             // 确保 currentBitsSlice 中有足够的比特
             if (k >= currentBitsSlice.length) {
                 potentialLengthBinary = ''; // 长度不足，清除结果
                 break; // 终止当前尝试
             }
             const scrambledBit = parseInt(currentBitsSlice[k], 10);
             const keyBit = prngForStreamAttempt.nextBit(); // 从密钥流获取下一比特
             potentialLengthBinary += (scrambledBit ^ keyBit).toString(); // 解码 (XOR)
        }
         if (potentialLengthBinary.length < 16) continue; // 未能获取完整的 16 比特长度前缀

        const potentialWatermarkLength = parseInt(potentialLengthBinary, 2); // 解析出潜在水印长度

        // 进一步验证解析出的长度是否有效且在合理范围内
         if (isNaN(potentialWatermarkLength) || potentialWatermarkLength < 0 || potentialWatermarkLength > 65535) {
              continue; // 不是有效的长度值，跳过当前尝试
         }

        const expectedPayloadBitsExcludingLength = potentialWatermarkLength + AUTH_CODE_BITS; // 数据 + 认证码所需比特数
        const expectedTotalPayloadBits = 16 + expectedPayloadBitsExcludingLength; // 完整负载总比特数

        // 检查从当前起始点开始，是否有足够的剩余比特用于数据和认证码
        if (currentBitsSlice.length < expectedTotalPayloadBits) {
            // 不足，跳过当前尝试
            continue;
        }

        // --- 尝试解码水印数据 ---
        let potentialWatermarkBinary = '';
        const dataStartIndex = 16; // 数据比特从长度前缀之后开始
        // PRNG 实例 prngForStreamAttempt 在解码长度前缀时已经前进了 16 比特
        for (let k = 0; k < potentialWatermarkLength; k++) {
            const dataBitIndex = dataStartIndex + k;
            // if (dataBitIndex >= currentBitsSlice.length) break; // 之前已做总长度检查，理论上不会超出
            const scrambledBit = parseInt(currentBitsSlice[dataBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // 密钥流继续
            potentialWatermarkBinary += (scrambledBit ^ keyBit).toString(); // 解码
        }
         if (potentialWatermarkBinary.length !== potentialWatermarkLength) continue; // 未能获取期望长度的数据比特

        // --- 尝试解码认证码 ---
        let extractedAuthBinary = '';
         const authStartIndex = dataStartIndex + potentialWatermarkLength; // 认证码比特从数据之后开始
         // PRNG 实例 prngForStreamAttempt 已经前进了长度比特数 + 数据比特数
        for (let k = 0; k < AUTH_CODE_BITS; k++) {
            const authBitIndex = authStartIndex + k;
            // if (authBitIndex >= currentBitsSlice.length) break; // 之前已做总长度检查，理论上不会超出
            const scrambledBit = parseInt(currentBitsSlice[authBitIndex], 10);
            const keyBit = prngForStreamAttempt.nextBit(); // 密钥流继续
            extractedAuthBinary += (scrambledBit ^ keyBit).toString(); // 解码
        }
        if (extractedAuthBinary.length !== AUTH_CODE_BITS) continue; // 未能获取期望长度的认证码比特

        // 3. 验证认证码
        // 使用提取到的水印数据和提供的密钥，重新生成一个期望的认证码
        const expectedAuthBinary = generateAuthCode(potentialWatermarkBinary, secretKey);

        // 对比提取到的认证码和期望的认证码
        if (extractedAuthBinary === expectedAuthBinary) {
            // 认证成功！解码水印二进制数据。
            try {
                const extractedText = binaryToString(potentialWatermarkBinary);
                console.log(`水印在提取序列的偏移量 ${i} 处提取成功。`);
                return extractedText; // 找到并验证成功的水印，返回结果
            } catch (e) {
                // 即使认证码匹配，也有可能数据损坏导致解码失败
                console.warn(`在提取序列偏移量 ${i} 处发现匹配的认证码，但解码水印内容失败: ${e.message}`);
                // 继续搜索，可能是偶然匹配或数据部分损坏
            }
        } else {
           // 认证失败。这意味着密钥错误或数据在嵌入后被修改。
           // console.log(`Offset ${i} 认证码不匹配。`); // 太多日志会刷屏，只在未找到时输出最终日志
        }
    }

    // 循环结束，表示使用当前密钥未能找到匹配并认证通过的有效水印。
    console.log("未找到匹配密钥和认证码的有效水印。");
    return null;
}

// 如果需要，可以导出函数供其他模块使用
// export { embedWatermark, extractWatermark, containsZeroWidthChars, cleanZeroWidthChars };