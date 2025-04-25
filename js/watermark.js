// watermark.js - 文本盲水印核心逻辑 (分块嵌入与认证)

// 零宽字符定义
const ZERO_WIDTH_SPACE = '\u200b'; // 代表比特 '0'
const ZERO_WIDTH_NON_JOINER = '\u200c'; // 代表比特 '1'
const AUTH_CODE_BITS = 32; // 认证码长度 (比特)

// --- 伪随机数生成器 (PRNG) ---
// 简单的哈希函数，从字符串密钥生成种子 (32位整数)
function simpleHash(str) {
    let hash = 5381; // 魔法数
    for (let i = 0; i < str.length; i++) {
        // djb2 哈希算法变种
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    // 混合操作以增加随机性 (MurmurHash 相关的位操作)
    hash = (hash ^ (hash >>> 16)) * 2246822507;
    hash = (hash ^ (hash >>> 13)) * 3266489917;
    hash = (hash ^ (hash >>> 16));
    return hash >>> 0; // 确保返回无符号的 32 位正整数
}

// 简单的线性同余生成器 (LCG) PRNG 类
class SimpleLCG {
    constructor(seed) {
        // 使用提供的种子或密钥的哈希值作为起始种子，并确保为无符号 32 位正整数
        this.seed = typeof seed === 'number' ? seed >>> 0 : simpleHash(String(seed)) >>> 0;
        if (this.seed === 0) {
            this.seed = 1; // 避免种子为 0，LCG 会退化
        }
         // LCG 参数 (来自 Numerical Recipes)
         // m = 2^32 (理论上，但 JS 位操作是 32 位有符号的，使用 2^31 避免溢出到负数)
        this.m = 0x80000000; // 2^31
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
     // 使用 Fisher-Yates (aka Knuth) 算法对数组进行洗牌 (就地操作)，使用 PRNG 生成随机索引
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
    const encoder = new TextEncoder(); // 默认 UTF-8
    const uint8Array = encoder.encode(input);
    let binaryString = '';
    uint8Array.forEach(byte => {
        binaryString += byte.toString(2).padStart(8, '0'); // 每个字节转为 8 位二进制字符串
    });
    return binaryString;
}

// 将二进制字符串转换回字符串，使用 UTF-8 解码
function binaryToString(binaryInput) {
     // 检查二进制字符串长度必须是 8 的倍数才能进行字节解码
     if (binaryInput.length % 8 !== 0) {
        throw new Error("无效的二进制字符串长度，无法进行 UTF-8 解码。");
    }
    const bytes = [];
    for (let i = 0; i < binaryInput.length; i += 8) {
        const byteString = binaryInput.substring(i, i + 8);
        const byte = parseInt(byteString, 2); // base 2 解析
         // 检查解析结果是否为有效数字 (NaN 表示无效输入)
         if (isNaN(byte)) {
              throw new Error("二进制字符串中包含无效字符。");
         }
         bytes.push(byte);
    }
    const decoder = new TextDecoder(); // 默认 UTF-8
    try {
        // 尝试解码字节数组为字符串
        return decoder.decode(new Uint8Array(bytes));
    } catch (e) {
        console.error("解码二进制字符串时出错:", e);
        throw new Error("解码二进制数据失败，数据可能已损坏或不是有效的 UTF-8 编码。");
    }
}

// --- 认证码生成 ---
// 根据水印二进制数据和密钥生成一个固定长度的认证码 (哈希+混淆思想)
function generateAuthCode(watermarkBinary, secretKey) {
    // 使用密钥派生不同的种子，增强认证码的密钥依赖性
    const seed1 = simpleHash(secretKey + "_auth_seed_1_data_mix");
    const seed2 = simpleHash(secretKey + "_auth_seed_2_final_hash");
    const seed3 = simpleHash(secretKey + "_auth_seed_3_final_mix");

    const prng1 = new SimpleLCG(seed1);
    const prng2 = new SimpleLCG(seed2);
    const prng3 = new SimpleLCG(seed3);

    const watermarkLen = watermarkBinary.length;
    const authCodeBytes = AUTH_CODE_BITS / 8; // 认证码的字节数 (例如 32 Bits = 4 Bytes)

    // 步骤 1: 将水印二进制数据与密钥派生流进行简单的混合 (XOR 到字节)
    let mixedDataBytes = Array(Math.ceil(watermarkLen / 8)).fill(0); // 初始化与水印数据长度相关的字节数组
    for (let i = 0; i < watermarkLen; i++) {
         const byteIndex = Math.floor(i / 8); // 比特所在的字节索引
         const bitIndex = i % 8;         // 比特在字节内的位置 (0-7)
         const watermarkBit = parseInt(watermarkBinary[i], 10); // 当前水印比特 (0 或 1)
         // 从 PRNG1 生成一个随机比特 (从随机字节中取一位) 作为密钥流的一部分
         const keyBit1 = (prng1.nextIntRange(0, 256) >>> (bitIndex % 8)) & 1;

         // 将水印比特和密钥比特 XOR 到混合数据的对应字节的对应位置
         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (watermarkBit << bitIndex);
         mixedDataBytes[byteIndex] = mixedDataBytes[byteIndex] ^ (keyBit1 << bitIndex); // 也混入密钥比特
    }

    // 步骤 2: 将混合数据字节“压缩”到固定大小的校验和结构中，使用 PRNG2 增加随机性
    let authChecksumBytes = Array(authCodeBytes).fill(0); // 初始化认证码字节数组
    for (let i = 0; i < mixedDataBytes.length; i++) {
        // 使用 PRNG2 决定如何处理当前的混合数据字节 byteToMix
        const mixValue = prng2.nextIntRange(0, 256); // 随机混合值
        const targetIndex = prng2.nextIntRange(0, authCodeBytes); // 随机选择一个目标校验和字节索引

        let byteToMix = mixedDataBytes[i];
        byteToMix = (byteToMix + mixValue) & 0xFF; // 加法 + 模 256 (处理溢出)
        // 随机位旋转操作
        const rotateBits = prng2.nextIntRange(0, 8);
        byteToMix = (byteToMix << rotateBits) | (byteToMix >>> (8 - rotateBits));
        byteToMix = byteToMix & 0xFF; // 确保结果仍在 0-255 范围内

        authChecksumBytes[targetIndex] = (authChecksumBytes[targetIndex] ^ byteToMix) & 0xFF; // 将处理后的字节 XOR 到随机选择的校验和字节
    }

     // 步骤 3: 最后与第三个密钥派生流进行 XOR，生成最终认证码的二进制字符串
    let authCodeBinary = '';
    for (let i = 0; i < authCodeBytes; i++) {
         const checksumByte = authChecksumBytes[i];
         // 从 PRNG3 生成一个随机字节作为密钥流的一部分
         const keyByte3 = prng3.nextIntRange(0, 256);

         const finalByte = (checksumByte ^ keyByte3) & 0xFF; // 最终字节 = 校验和字节 XOR 密钥字节
         authCodeBinary += finalByte.toString(2).padStart(8, '0'); // 将最终字节转换为 8 位二进制字符串并拼接
    }

    return authCodeBinary; // 返回长度为 AUTH_CODE_BITS 的二进制字符串
}

/**
 * 检查字符串是否包含任何零宽字符 [\u200B-\u200D\uFEFF]。
 * @param {string} text 输入字符串。
 * @returns {boolean} 如果找到零宽字符，返回 true，否则返回 false。
 */
function containsZeroWidthChars(text) {
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g; // 匹配常见的零宽字符范围
    return zeroWidthRegex.test(text); // test() 方法用于检查是否有匹配项
}

/** 
 * 移除字符串中所有的零宽字符 [\u200B-\u200D\uFEFF]。
 * @param {string} text 输入字符串。
 * @returns {string} 移除零宽字符后的字符串。
 */
function cleanZeroWidthChars(text) {
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g; // 全局匹配所有零宽字符
    return text.replace(zeroWidthRegex, ''); // 使用空字符串替换所有匹配项
}

/**
 * 将水印分块嵌入到文本中，使用零宽字符。
 * 流程：准备负载 -> 密钥混淆负载 -> 分块&生成插入位置 -> 插入零宽字符。
 * @param {string} originalText 要嵌入水印的原始文本。
 * @param {string} secretKey 用于 PRNG 的密钥。
 * @param {string} watermarkText 要嵌入的水印内容。
 * @param {number} blockSize 分块大小 (字符数)，影响水印分布密度和鲁棒性。
 * @returns {string} 包含嵌入水印的文本。
 * @throws {Error} 如果输入无效或原始文本过短无法完全嵌入至少一个水印负载拷贝。
 */
function embedWatermark(originalText, secretKey, watermarkText, blockSize) {
    // 输入参数基本验证
    if (!originalText || !secretKey || !watermarkText) {
        throw new Error("缺失必需的输入：原始文本、密钥或水印内容。");
    }
     // 分块大小合理性警告 (仅控制台输出，不中断流程)
     if (blockSize < 50) {
         console.warn("警告：分块大小（" + blockSize + "）非常小，可能导致文本膨胀严重或出现其他问题。建议使用更高的值。");
     }

    // 1. 准备水印负载 (总负载 = 16位长度前缀 + 水印数据 + 32位认证码)
    const watermarkBinary = stringToBinary(watermarkText); // 水印内容转二进制
    const watermarkLength = watermarkBinary.length;      // 水印二进制长度
    const lengthBinary = watermarkLength.toString(2).padStart(16, '0'); // 16位长度前缀，不足补零
    const authBinary = generateAuthCode(watermarkBinary, secretKey); // 生成认证码二进制

    const fullBinaryPayload = lengthBinary + watermarkBinary + authBinary; // 拼接完整负载
    const payloadBits = fullBinaryPayload.length; // 完整负载的总比特数

    // --- 修复 Bug: 检查原始文本的最小长度 ---
    // 要完整嵌入一个 payload 拷贝 (payloadBits 比特)，需要在文本中找到 payloadBits 个插入位置。
    // 一个长度为 L 的字符串，总共有 L+1 个可能的插入位置 (在每个字符前后以及字符串末尾)。
    // 因此，至少需要 originalText.length + 1 >= payloadBits。
    const totalPossibleInsertionPoints = originalText.length + 1;
    if (totalPossibleInsertionPoints < payloadBits) {
         throw new Error(`原始文本过短 (${originalText.length} 字符)。水印负载需要 ${payloadBits} 个插入位置（比特），您需要至少 ${payloadBits - 1} 个字符长度的原始文本才能完整嵌入一个负载拷贝。请加长原始文本或缩短水印内容。`);
    }
    // --- 结束修复 Bug ---

    // 警告：如果负载大小大于单个分块的插入点，即使总长度够，在小于分块大小的文本片段中可能提取困难
     if (payloadBits > blockSize + 1) {
          console.warn(`警告：水印负载 (${payloadBits} 比特) 大于单个分块 (${blockSize} 字符) 的最大可能插入点 (${blockSize + 1})。这意味着在一个分块文本长度的片段中无法包含一个完整的负载拷贝。从小于分块大小的文本片段中可能无法提取到完整的水印信息。`);
     }

    // 2. 生成密钥流用于混淆负载，使用密钥作为种子
    const streamSeed = simpleHash(secretKey + "_stream_seed"); // 密钥流种子
    const prngForStream = new SimpleLCG(streamSeed); // 实例化 PRNG

    let keystream = '';
     for(let i = 0; i < payloadBits; i++) {
         keystream += prngForStream.nextBit(); // 为负载的每一个比特生成一个密钥比特
     }

    // 混淆完整的负载数据 (与生成的密钥流进行 XOR 运算)
    let scrambledPayload = '';
    for (let i = 0; i < payloadBits; i++) {
        const payloadBit = parseInt(fullBinaryPayload[i], 10); // 负载当前比特
        const keyBit = parseInt(keystream[i], 10);         // 密钥流当前比特
        scrambledPayload += (payloadBit ^ keyBit).toString(); // XOR 运算结果转为字符串 '0' 或 '1'
    }

    // 将混淆后的比特映射到零宽字符表 ('0' -> ZWSP, '1' -> ZWNJ)
    const zwChars = scrambledPayload.split('').map(bit =>
        bit === '0' ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NON_JOINER
    );

    // 3. 将零宽字符序列嵌入到原始文本的分块中
    let resultText = '';
    const originalTextLength = originalText.length;
    const numBlocks = Math.ceil(originalTextLength / blockSize); // 计算分块数量

    // 遍历每个文本分块
    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize; // 当前分块起始索引
        const end = Math.min((i + 1) * blockSize, originalTextLength); // 当前分块结束索引 (不超过总长度)
        let textChunk = originalText.substring(start, end); // 提取当前文本分块

        const possibleIndicesCount = textChunk.length + 1; // 当前分块的可用插入点数量
        // 决定在当前分块中要插入的零宽字符数量 (不超过负载总比特数和当前分块可用点数)
        const indicesToPick = Math.min(payloadBits, possibleIndicesCount);

        // 用于当前分块的实际零宽字符序列 (取混淆后负载的前 indicesToPick 个字符)
        const zwCharsForThisChunk = zwChars.slice(0, indicesToPick); // 保持混淆负载的比特顺序

        // 生成当前分块的插入位置索引列表，使用与密钥和分块索引相关的种子
        const positionSeed = simpleHash(secretKey + "_pos_seed_" + i); // 位置种子，保证每次运行和每个块位置随机性一致
        const prngForPosition = new SimpleLCG(positionSeed); // 实例化 PRNG

        // 生成当前分块所有可能的插入位置索引 (0 到 textChunk.length)
        const possibleIndices = Array.from({ length: possibleIndicesCount }, (_, k) => k);

        prngForPosition.shuffleArray(possibleIndices); // 打乱所有可能位置
        const insertionIndices = possibleIndices.slice(0, indicesToPick); // 从打乱后的列表中选取 indicesToPick 个位置
        insertionIndices.sort((a, b) => a - b); // **重要**：按升序排序，方便顺序插入，避免影响后续字符的索引

        // 将选中的零宽字符插入到文本分块中
        let chunkWithZW = '';
        let textChunkIndex = 0; // 原始文本分块的索引指针
        let insertionIndexPointer = 0; // 要插入的零宽字符索引指针

        // 遍历文本分块的每个位置 (包括末尾 textChunk.length)，决定在此位置前是否插入零宽字符
        for (let j = 0; j <= textChunk.length; j++) {
             // 检查当前位置 j 是否是选中的插入位置之一 (可能在同一位置插入多个 ZW 字符)
             while(insertionIndexPointer < insertionIndices.length && insertionIndices[insertionIndexPointer] === j) {
                  // 插入对应的零宽字符
                  chunkWithZW += zwCharsForThisChunk[insertionIndexPointer];
                  insertionIndexPointer++;
             }
             // 如果当前位置 j 小于文本分块长度，则添加原始文本字符
             if (j < textChunk.length) {
                  chunkWithZW += textChunk[textChunkIndex];
                  textChunkIndex++; // 前移原始文本索引
             }
        }
        // 将处理后的分块拼接到结果文本中
        resultText += chunkWithZW;
    }

    return resultText; // 返回包含嵌入水印的最终文本
}

/** 
 * 从文本中提取水印，使用秘密密钥。
 * 流程：扫描提取所有零宽字符 -> 将 ZW 序列转比特流 -> 遍历尝试解码负载 -> 验证认证码 -> 解码水印内容。
 * @param {string} textWithWatermark 可能包含水印的文本。
 * @param {string} secretKey 嵌入时使用的密钥。
 * @returns {string | null} 成功提取到的水印文本，如果未找到有效水印或密钥错误则返回 null。
 */
function extractWatermark(textWithWatermark, secretKey) {
    // 输入参数基本验证
    if (!textWithWatermark || !secretKey) {
        console.error("提取缺失必需输入：文本或密钥。");
        return null;
    }

    // 1. 扫描并按顺序提取文本中的所有零宽字符
    let extractedZWString = '';
    const zeroWidthRegex = new RegExp(/[\u200B-\u200D\uFEFF]/g); // 全局匹配正则表达式
     // 使用 exec 循环查找所有匹配项并拼接
    let match;
    while ((match = zeroWidthRegex.exec(textWithWatermark)) !== null) {
        extractedZWString += match[0];
    }

    // 如果没有提取到零宽字符，则文本不包含水印
    if (extractedZWString.length === 0) {
        console.log("文本中未发现零宽字符。");
        return null; // 未找到零宽字符
    }

    // 将提取到的零宽字符字符串转换为二进制比特流
    const extractedBits = extractedZWString.split('').map(char =>
        char === ZERO_WIDTH_SPACE ? '0' : '1' // ZWSP -> '0', ZWNJ -> '1'
    ).join('');

    // 检查提取到的比特流长度是否至少包含一个完整的最小负载
    const minPayloadBits = 16 + 1 + AUTH_CODE_BITS; // 最小负载长度 = 16 (长度) + 1 (最小数据) + 32 (认证码)
    if (extractedBits.length < minPayloadBits) {
         console.log(`提取到的零宽字符序列 (${extractedBits.length} 比特) 太短，不足以包含完整的水印 payload (至少 ${minPayloadBits} 比特)。`);
         return null;
    }

    // 2. 遍历提取到的比特流，尝试从每个位置开始解码一个潜在的完整负载
    const streamSeed = simpleHash(secretKey + "_stream_seed"); // 用于恢复密钥流的种子

    // 从比特流的每个可能的起始点 i 开始尝试解码 (需要保证从 i 开始剩余的比特数 >= 最小负载长度)
    for (let i = 0; i <= extractedBits.length - minPayloadBits; i++) {
        let currentBitsSlice = extractedBits.substring(i); // 从当前起始点开始的比特片段

        // 为每次解码尝试创建一个新的 PRNG 实例，使用用户提供的秘密密钥种子 (必须与嵌入时匹配)
        const prngForStreamAttempt = new SimpleLCG(streamSeed);

        // --- 尝试解码长度前缀 (16 比特) ---
        let potentialLengthBinary = '';
        // 密钥流的前 16 比特用于对长度前缀进行 XOR 解密
        for (let k = 0; k < 16; k++) {
             // 在访问 currentBitsSlice 前检查边界
             if (k >= currentBitsSlice.length) {
                 potentialLengthBinary = ''; // 长度不足，清除结果
                 break; // 终止当前解码尝试
             }
             const scrambledBit = parseInt(currentBitsSlice[k], 10); // 提取到的混淆比特
             const keyBit = prngForStreamAttempt.nextBit(); // 从密钥流获取对应的密钥比特 (PRNG 状态前进)
             potentialLengthBinary += (scrambledBit ^ keyBit).toString(); // 解码 (XOR)
        }
         if (potentialLengthBinary.length < 16) continue; // 如果没有提取到完整的 16 比特长度前缀，跳过当前尝试

        const potentialWatermarkLength = parseInt(potentialLengthBinary, 2); // 解析出潜在的水印数据长度

        // 进一步验证解析出的长度是否有效且在合理范围内 (防止解析出巨大或负数)
         if (isNaN(potentialWatermarkLength) || potentialWatermarkLength < 0 || potentialWatermarkLength > 65535) { // 16位能表示的最大值是 65535
              continue; // 不是有效的长度值，跳过当前尝试
         }

        // 计算基于潜在水印长度的完整负载总比特数 (长度前缀16 + 水印数据 + 认证码32)
        const expectedPayloadBitsExcludingLength = potentialWatermarkLength + AUTH_CODE_BITS; // 数据 + 认证码所需比特数
        const expectedTotalPayloadBits = 16 + expectedPayloadBitsExcludingLength; // 完整负载总比特数

        // 检查从当前起始点 i 开始，提取到的比特流是否有足够的长度容纳整个期望的负载
        if (currentBitsSlice.length < expectedTotalPayloadBits) {
            // 不足，跳过当前解码尝试
            continue;
        }

        // --- 尝试解码水印数据 ---
        let potentialWatermarkBinary = '';
        const dataStartIndex = 16; // 数据比特从长度前缀 (16位) 之后开始
        // PRNG 实例 prngForStreamAttempt 在解码长度前缀时已经前进了 16 比特，继续从中获取密钥流
        for (let k = 0; k < potentialWatermarkLength; k++) {
            const dataBitIndex = dataStartIndex + k; // 数据比特在 currentBitsSlice 中的索引
            const scrambledBit = parseInt(currentBitsSlice[dataBitIndex], 10); // 提取到的混淆比特
            const keyBit = prngForStreamAttempt.nextBit(); // 从密钥流获取对应的密钥比特 (PRNG 状态前进)
            potentialWatermarkBinary += (scrambledBit ^ keyBit).toString(); // 解码
        }
         // 检查解码出的数据比特数量是否与长度前缀指示的数量一致
         if (potentialWatermarkBinary.length !== potentialWatermarkLength) continue; // 不一致，跳过当前尝试

        // --- 尝试解码认证码 ---
        let extractedAuthBinary = '';
         const authStartIndex = dataStartIndex + potentialWatermarkLength; // 认证码比特从数据之后开始
         // PRNG 实例 prngForStreamAttempt 已经前进了长度比特数 + 数据比特数，继续从中获取密钥流
        for (let k = 0; k < AUTH_CODE_BITS; k++) {
            const authBitIndex = authStartIndex + k; // 认证码比特在 currentBitsSlice 中的索引
             const scrambledBit = parseInt(currentBitsSlice[authBitIndex], 10); // 提取到的混淆比特
             const keyBit = prngForStreamAttempt.nextBit(); // 从密钥流获取对应的密钥比特 (PRNG 状态前进)
             extractedAuthBinary += (scrambledBit ^ keyBit).toString(); // 解码
        }
        // 检查解码出的认证码比特数量是否是期望的长度 (32 比特)
        if (extractedAuthBinary.length !== AUTH_CODE_BITS) continue; // 不一致，跳过当前尝试

        // 3. 验证认证码
        // 使用 *提取到并解码后* 的水印数据 (potentialWatermarkBinary) 和用户提供的密钥 (secretKey)，重新生成一个期望的认证码
        const expectedAuthBinary = generateAuthCode(potentialWatermarkBinary, secretKey);

        // 对比提取到的认证码 (extractedAuthBinary) 和期望的认证码 (expectedAuthBinary)
        if (extractedAuthBinary === expectedAuthBinary) {
            // 认证成功！说明提取到的数据 (potentialWatermarkBinary) 和提供的密钥是匹配的，并且数据通过了内部校验。
            try {
                // 尝试将验证通过的水印二进制数据解码回字符串
                const extractedText = binaryToString(potentialWatermarkBinary);
                console.log(`成功：水印在提取序列的偏移量 ${i} 处提取成功。`);
                return extractedText; // 提取并验证成功的水印内容
            } catch (e) {
                // 即使认证码匹配，也有可能是数据部分损坏或极端的位翻转导致解码为无效 UTF-8
                console.warn(`警告：在提取序列偏移量 ${i} 处发现匹配的认证码，但解码水印内容失败: ${e.message}`);
                // 继续搜索，可能存在其他验证通过的负载拷贝
            }
        } else {
           // 认证失败。这通常意味着密钥错误，或者原始文本中的零宽字符序列在嵌入后被修改或损坏，导致无法重建正确的负载或通过认证。
           // console.log(`偏移量 ${i} 认证码不匹配。`); // 为了避免控制台输出过多信息，只在最终未找到时输出总结
        }
    }

    // 循环结束，遍历了所有可能的起始点，但没有找到任何一个能通过认证的完整水印负载。
    console.log("失败：未找到匹配密钥和认证码的有效水印。");
    return null;
}

// 如果需要，可以导出函数供其他模块使用
// export { embedWatermark, extractWatermark, containsZeroWidthChars, cleanZeroWidthChars };