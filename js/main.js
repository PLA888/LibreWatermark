// main.js - 处理 UI 交互并连接水印逻辑

document.addEventListener('DOMContentLoaded', () => {
    // --- 获取 UI 元素 ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // 嵌入水印元素
    const embedKeyInput = document.getElementById('embed-key');
    const embedWatermarkInput = document.getElementById('embed-watermark');
    const embedTextInput = document.getElementById('embed-text');
    const embedTextCountSpan = document.getElementById('embed-text-count');
    const densitySlider = document.getElementById('density-slider');
    const densityValueSpan = document.getElementById('density-value');
    const embedButton = document.getElementById('embed-button');
    const embedOutputTextarea = document.getElementById('embed-output');
    const embedOutputCountSpan = document.getElementById('embed-output-count');
    const copyEmbedButton = document.getElementById('copy-button');

    // 提取水印元素
    const extractKeyInput = document.getElementById('extract-key');
    const extractTextInput = document.getElementById('extract-text');
    const extractTextCountSpan = document.getElementById('extract-text-count');
    const extractButton = document.getElementById('extract-button');
    const extractOutputDisplay = document.getElementById('extract-output');

    // 清除零宽字符元素
    const cleanTextInput = document.getElementById('clean-text');
    const cleanTextCountSpan = document.getElementById('clean-text-count');
    const cleanButton = document.getElementById('clean-button');
    const cleanOutputDisplay = document.getElementById('clean-output');
    const cleanOutputCountSpan = document.getElementById('clean-output-count');
    const copyCleanButton = document.getElementById('copy-clean-button');

    // 通知容器元素 (用于显示非阻塞式提示)
    const notificationContainer = document.getElementById('notification-container');

    // --- 通知系统 ---

    // 统一的通知显示函数
    /**
     * 显示一个通知消息。
     * 通知框固定显示在右上角，3500ms 后自动消失。
     * @param {string} type - 通知类型 ('info', 'success', 'warning', 'error')，影响背景颜色。
     * @param {string} messageText - 要显示的消息文本。
     */
    function showNotification(type, messageText) {
        // 检查通知容器是否存在，如果不存在， fallback 到控制台输出
        if (!notificationContainer) {
            const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
            console[consoleMethod](`通知 (${type.toUpperCase()}): ${messageText}`);
            // 可以选择添加 alert() 作为最后的兼容性 fallback，但会阻塞 UI
            // alert(`${type.toUpperCase()}: ${messageText}`);
            return; // 容器不存在，不创建元素
        }

        // 创建通知框元素
        const notificationBox = document.createElement('div');
        // 添加基础类和类型类，用于 CSS 样式控制 (如背景色、边框色)
        notificationBox.classList.add('notification-box', type); // 例如：'notification-box', 'success'

        // 创建消息文本元素
        const messageSpan = document.createElement('span');
        messageSpan.classList.add('message');
        messageSpan.textContent = messageText;
        notificationBox.appendChild(messageSpan);

        // 不需要手动关闭按钮，因为所有通知都会自动消失

        // 将新通知框添加到容器顶部 (insertBefore 插入到第一个子元素之前)，实现垂直堆叠 (新的在上面)
         notificationContainer.insertBefore(notificationBox, notificationContainer.firstChild);

        // 设置自动消失定时器 (所有通知统一 3500ms)
        // 在延迟后，添加 'hiding' 类触发 CSS 退出动画
        const autoHideDuration = 3500; // 3.5 秒
        setTimeout(() => {
            hideNotification(notificationBox); // 触发隐藏动画
        }, autoHideDuration);

         // 添加过渡结束事件监听器，在 CSS 隐藏动画（opacity 和 transform）完成后从 DOM 中移除元素
         notificationBox.addEventListener('transitionend', () => {
             // 只有当元素确实处于隐藏状态时才移除 (防止其他过渡触发移除)
             if (notificationBox.classList.contains('hiding')) {
                notificationBox.remove(); // 从 DOM 中移除元素
             }
         });
    }

    /** 
     * 触发单个通知框的隐藏动画。
     * @param {HTMLElement} notificationBox - 要隐藏的通知元素。
     */
    function hideNotification(notificationBox) {
        // 为通知框元素添加 'hiding' 类。
        // CSS 中定义了 '.notification-box.hiding' 的样式，会触发退出动画。
        notificationBox.classList.add('hiding');
        // 元素实际从 DOM 移除会在 transitionend 监听器中处理。
    }

    // --- 辅助函数 ---

    /**
     * 更新元素的字符计数显示。
     * 支持 textarea, input (value) 和其他元素 (textContent)。
     * @param {HTMLElement} element - 需要计数文本内容的元素 (如 textarea, input, p)。
     * @param {HTMLElement} countSpanElement - 用于显示计数的 span 元素。
     */
    function updateCharCount(element, countSpanElement) {
        if (element && countSpanElement) {
            // 根据元素类型判断获取文本内容的方式 (.value vs .textContent)
            const count = element.value !== undefined ? element.value.length : element.textContent.length;
            countSpanElement.textContent = `(${count} 字)`; // 更新 span 的文本
        }
    }

    // --- Tab 切换逻辑 ---
    function showTab(tabId) {
        // 遍历所有 Tab 内容区域，移除 active 类
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        // 遍历所有 Tab 按钮，移除 active 类
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        // 根据传入的 tabId 找到对应的 Tab 内容区域并添加 active 类来显示
        const targetTab = document.getElementById(tabId);
        if (targetTab) {
             targetTab.classList.add('active');
        }

        // 找到对应的 Tab 按钮并添加 active 类来高亮显示
        const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        if (activeButton) {
             activeButton.classList.add('active');
        }

        // 在切换 Tab 时，清空所有当前显示的通知框 (触发隐藏动画并从 DOM 移除)
         document.querySelectorAll('.notification-box').forEach(box => hideNotification(box));

        // --- 重置和更新各个 Tab 的内容和初始字符计数 ---

        // 重置 嵌入 Tab
        if (embedTextInput) {
             embedTextInput.value = ''; // 清空输入文本框内容
             if (embedTextCountSpan) updateCharCount(embedTextInput, embedTextCountSpan); // 更新计数
        }
        if (embedOutputTextarea) {
             embedOutputTextarea.value = ''; // 清空输出文本框内容
             if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan); // 更新计数
        }
        if (copyEmbedButton) copyEmbedButton.disabled = true; // 初始禁用复制按钮

        // 重置 提取 Tab
        if (extractTextInput) {
             extractTextInput.value = ''; // 清空输入文本框内容
             if (extractTextCountSpan) updateCharCount(extractTextInput, extractTextCountSpan); // 更新计数
        }
        if (extractOutputDisplay) extractOutputDisplay.textContent = '[提取结果将显示在此处]'; // 重置输出显示文本

        // 重置 清除 Tab
        if (cleanTextInput) {
             cleanTextInput.value = ''; // 清空输入文本框内容
            if (cleanTextCountSpan) updateCharCount(cleanTextInput, cleanTextCountSpan); // 更新计数
        }
        if (cleanOutputDisplay) {
             cleanOutputDisplay.textContent = '[清除结果将显示在此处]'; // 重置输出显示文本
             if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan); // 更新计数
        }
         if (copyCleanButton) copyCleanButton.disabled = true; // 初始禁用复制按钮
    }

    // 为所有 Tab 按钮添加点击事件监听器
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab'); // 获取按钮的 data-tab 属性值，即目标 Tab 的 ID
            if (tabId) {
                showTab(tabId); // 调用显示 Tab 函数
            }
        });
    });

    // --- 输入框事件监听器 (实时更新字符计数) ---
    // 为嵌入 Tab 的原始文本输入框添加 input 事件监听
    if (embedTextInput && embedTextCountSpan) {
        embedTextInput.addEventListener('input', () => updateCharCount(embedTextInput, embedTextCountSpan));
    }
    // 为提取 Tab 的包含水印文本输入框添加 input 事件监听
     if (extractTextInput && extractTextCountSpan) {
        extractTextInput.addEventListener('input', () => updateCharCount(extractTextInput, extractTextCountSpan));
    }
    // 为清除 Tab 的待清除文本输入框添加 input 事件监听
     if (cleanTextInput && cleanTextCountSpan) {
        cleanTextInput.addEventListener('input', () => updateCharCount(cleanTextInput, cleanTextCountSpan));
    }

    // --- 按钮事件监听器 ---

    // 水印密度滑块更新显示值 (嵌入 Tab)
    if (densitySlider && densityValueSpan) {
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value; // 实时更新分块大小显示值
        });
    }

    // 嵌入按钮点击处理
    // 检查所有必需的 DOM 元素是否存在以确保功能可用
    if (embedButton && embedKeyInput && embedWatermarkInput && embedTextInput && embedOutputTextarea && densitySlider && copyEmbedButton) {
        embedButton.addEventListener('click', () => {
            const key = embedKeyInput.value; // 获取密钥
            const watermark = embedWatermarkInput.value; // 获取水印内容
            let text = embedTextInput.value; // 获取原始文本 (使用 let 允许后续修改，例如清除零宽字符)
            const blockSize = parseInt(densitySlider.value, 10); // 获取分块大小，确保是整数

            // 清空之前的输出结果区域和相关的状态显示
            embedOutputTextarea.value = '';
            if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
            copyEmbedButton.disabled = true; // 禁用复制按钮

            // 检查输入是否完整
            if (!key || !watermark || !text) {
                showNotification('error', '错误：密钥、水印内容和原始文本不能为空！'); // 必填项缺失，显示错误通知
                return; // 中止操作
            }

            // 使用 watermark.js 中的函数检查原始文本中是否包含零宽字符
            if (typeof containsZeroWidthChars === 'function') {
                if (containsZeroWidthChars(text)) {
                    // 如果原始文本发现零宽字符，显示警告通知，并引导用户先进行清理
                    showNotification('warning', '检测到原始文本包含零宽字符，可能干扰水印嵌入和提取。请先使用顶部的“清除零宽字符”标签页处理后再进行嵌入。'); // 警告通知
                    embedButton.disabled = false; // 保持嵌入按钮可用，用户清理后可以直接点击
                    copyEmbedButton.disabled = true;
                    // 注意：此处不直接清除或中断，而是警告用户去专门的 Tab 处理。
                    return; // 中止当前嵌入流程
                }
                 // 如果原始文本干净 (不含零宽字符)，则继续执行嵌入流程
                 startEmbedding(key, watermark, text, blockSize);

            } else {
                 // containsZeroWidthChars 函数不存在的异常 handling (不太可能发生)
                  console.error("containsZeroWidthChars 函数未找到！请检查 watermark.js 文件。");
                 showNotification('error', '应用内部错误，无法执行零宽字符预检查功能。');
                 embedButton.disabled = false;
                 copyEmbedButton.disabled = true;
            }
        });
    } else {
         // 页面加载时缺少关键 DOM 元素的错误处理，提示用户刷新
        console.error("Embedding 功能所需的一个或多个 DOM 元素未找到！请检查 index.html 文件。");
         showNotification('error', '应用加载错误，部分功能 (嵌入) 无法使用。请尝试刷新页面。');
    }

    /** 
     * 处理实际的水印嵌入过程 (分离出来方便异步调用和错误隔离)
     * @param {string} key 密钥
     * @param {string} watermark 水印内容
     * @param {string} text 原始文本
     * @param {number} blockSize 分块大小
     */
    function startEmbedding(key, watermark, text, blockSize) {
        embedButton.disabled = true; // 禁用自身，操作进行中视觉反馈由按钮状态提供
        copyEmbedButton.disabled = true; // 禁止在生成前或生成失败时复制

        // 不再显示“正在嵌入...”的中间状态提示，减少视觉干扰

        // 使用 setTimeout 延迟执行核心逻辑，允许浏览器在执行耗时操作前更新 DOM (如按钮禁用)
        setTimeout(() => {
            try {
                // 确保核心嵌入函数存在
                 if (typeof embedWatermark !== 'function') {
                     throw new Error("Watermark embedding function is not available.");
                 }
                // 调用 watermark.js 中的核心嵌入函数
                const resultText = embedWatermark(text, key, watermark, blockSize);

                embedOutputTextarea.value = resultText; // 将结果显示在输出文本框
                // 手动更新输出文本框的字符计数 (这个文本框是只读的，不会触发 input 事件)
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);

                // 根据结果显示不同的通知提示
                if (resultText.length > text.length) {
                    // 输出长度增加，说明成功嵌入了零宽字符
                    showNotification('success', '水印嵌入成功！'); // 显示成功通知
                    copyEmbedButton.disabled = false; // 成功后启用复制按钮
                } else if (watermark.length > 0 && resultText.length === text.length) {
                     // 水印内容非空，但输出文本长度未增加 (可能是水印太太太太短，或者内部逻辑异常/bug)
                     // TODO: 考虑是否检测 watermark 的长度是否小于最小负载比特，如果是则给出更精确的警告
                     // 目前短文本已在 embedWatermark 内部强拦截，这里更多是针对极短水印或其他异常
                     showNotification('warning', '水印嵌入完成，但输出文本长度未增加。请检查密钥、水印内容或原始文本长度是否足够。'); // 显示警告通知
                     copyEmbedButton.disabled = true; // 嵌入结果似乎无效，不启用复制
                } else { // 水印内容为空，或者其他原因导致文本无变化 (如原始文本就是空的)
                     showNotification('info', '没有水印内容可嵌入，或操作未改变文本。'); // 显示一般信息通知
                     copyEmbedButton.disabled = true; // 没有有效水印结果，不启用复制
                }

            } catch (error) {
                // 捕获嵌入过程中抛出的错误 (如文本过短)
                console.error("Embedding failed:", error);
                // 显示错误通知，包含错误信息
                showNotification('error', `嵌入失败：${error.message}`); // 显示错误通知
                // 清空输出区域并禁用复制
                embedOutputTextarea.value = '';
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
                copyEmbedButton.disabled = true;
            } finally {
                 // 无论操作结果如何 (成功/失败)，最终都要重新启用嵌入按钮
                 embedButton.disabled = false;
            }
        }, 10); // 短暂延迟，确保 UI 响应性
    }

    // 复制嵌入结果文本按钮点击处理
    if (copyEmbedButton && embedOutputTextarea) {
        copyEmbedButton.addEventListener('click', () => {
            // 检查输出文本框是否有内容 (避免复制占位符或空内容)
            if (embedOutputTextarea.value) {
                // 使用 Clipboard API 将文本复制到剪贴板
                navigator.clipboard.writeText(embedOutputTextarea.value)
                    .then(() => {
                        showNotification('info', '带水印的文本已复制到剪贴板！'); // 复制成功提示
                     })
                    .catch(err => {
                        console.error('复制失败:', err);
                        showNotification('error', '复制失败，请手动复制。'); // 复制失败提示
                    });
            } else {
                 showNotification('warning', '没有可复制的内容。'); // 输出文本框无内容，显示警告
            }
        });
    } else {
         console.error("Copy embed button or embed output textarea not found!"); // 页面加载错误
    }

    // 提取按钮点击处理
     if (extractButton && extractKeyInput && extractTextInput && extractOutputDisplay) {
        extractButton.addEventListener('click', () => {
            const key = extractKeyInput.value; // 获取密钥
            const text = extractTextInput.value; // 获取待提取文本

            // 清空之前的提取结果显示
            extractOutputDisplay.textContent = '[提取结果将显示在此处]';

            // 检查输入是否完整
            if (!key || !text) {
                showNotification('error', '错误：密钥和待提取文本不能为空！'); // 必填项缺失
                return; // 中止操作
            }

            extractButton.disabled = true; // 禁用按钮
            // 不再显示“正在尝试提取...”的中间状态提示

            // 使用 setTimeout 延迟执行核心提取逻辑
            setTimeout(() => {
                 try {
                      // 确保核心提取函数存在
                      if (typeof extractWatermark !== 'function') {
                         throw new Error("Watermark extraction function is not available.");
                      }
                     // 调用 watermark.js 中的核心提取函数
                     const extractedWatermark = extractWatermark(text, key);

                     // 根据提取结果显示不同的通知提示
                     if (extractedWatermark !== null) {
                         extractOutputDisplay.textContent = extractedWatermark; // 显示提取到的水印内容
                         showNotification('success', '水印提取成功！'); // 提取成功提示
                     } else {
                         extractOutputDisplay.textContent = '[未找到有效水印或密钥错误]'; // 显示默认未找到提示
                         // 提供更详细的未找到原因提示
                         showNotification('warning', '未能提取到有效水印。请检查输入的文本是否包含水印、密钥是否正确，或者文本是否被修改导致零宽字符被移除。'); // 警告提示
                     }
                 } catch (error) {
                      // 捕获提取过程中的错误
                      console.error("Extraction failed:", error);
                      showNotification('error', `提取过程中发生错误：${error.message}`); // 显示错误通知
                      extractOutputDisplay.textContent = '[提取失败]'; // 显示提取失败提示
                 } finally {
                     // 重新启用提取按钮
                     extractButton.disabled = false;
                 }
            }, 10); // 短暂延迟
        });
     } else {
         console.error("Extract 功能所需的一个或多个 DOM 元素未找到！请检查 index.html 文件。"); // 页面加载错误
          showNotification('error', '应用加载错误，部分功能 (提取) 无法使用。请尝试刷新页面。');
     }

     // 清除按钮点击处理
    if (cleanButton && cleanTextInput && cleanOutputDisplay && cleanOutputCountSpan && copyCleanButton) {
         cleanButton.addEventListener('click', () => {
            const text = cleanTextInput.value; // 获取待清除文本

            // 清空之前的清除结果并重置计数和复制按钮
             cleanOutputDisplay.textContent = '[清除结果将显示在此处]'; // 重置输出显示
             if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan); // 更新计数
             copyCleanButton.disabled = true; // 禁用复制按钮

            // 检查输入是否完整
            if (!text) {
                showNotification('error', '错误：请粘贴需要清除零宽字符的文本！'); // 必填项缺失
                return; // 中止操作
            }

             cleanButton.disabled = true; // 禁用按钮
             copyCleanButton.disabled = true; // 禁止在清除前或清除失败时复制

            // 不再显示“正在清除...”的中间状态提示

            setTimeout(() => {
                 try {
                      // 确保核心清除函数存在
                      if (typeof cleanZeroWidthChars !== 'function') {
                         throw new Error("Zero-width cleaning function is not available.");
                      }
                     // 调用 watermark.js 中的核心清除函数
                     const cleanedText = cleanZeroWidthChars(text);

                    cleanOutputDisplay.textContent = cleanedText; // 显示清除结果
                    // 手动更新输出显示的字符计数
                    if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);

                    // 根据结果显示不同的通知提示
                    if (cleanedText.length < text.length) {
                         // 如果清除后的长度小于原始文本长度，说明成功移除了部分零宽字符
                         showNotification('success', '零宽字符清除成功！'); // 成功提示
                         copyCleanButton.disabled = false; // 启用复制按钮
                    } else {
                         // 长度未变，可能原始文本就不包含零宽字符，或者没有清除任何东西
                         showNotification('info', '已完成清除操作，未检测到零宽字符或文本长度未改变。'); // 一般信息提示
                          copyCleanButton.disabled = false; // 仍然允许复制清理后的文本 (即使与原始文本相同)
                    }

                 } catch (error) {
                      // 捕获清除过程中的错误 (不太可能，除非函数本身有问题)
                      console.error("Cleaning failed:", error);
                       showNotification('error', `清除过程中发生错误：${error.message}`); // 显示错误通知
                       cleanOutputDisplay.textContent = '[清除失败]'; // 显示失败提示
                       if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan); // 更新计数
                       copyCleanButton.disabled = true; // 失败时不启用复制
                 } finally {
                     // 重新启用按钮
                     cleanButton.disabled = false;
                 }
            }, 10); // 短暂延迟
         });
    } else {
         console.error("Clean 功能所需的一个或多个 DOM 元素未找到！请检查 index.html 文件。"); // 页面加载错误
          showNotification('error', '应用加载错误，部分功能 (清除) 无法使用。请尝试刷新页面。');
    }

    // 复制清除结果文本按钮点击处理
     if (copyCleanButton && cleanOutputDisplay) {
        copyCleanButton.addEventListener('click', () => {
            // 检查输出内容是否可复制 (非默认占位符 '[清除结果将显示在此处]' 或错误状态 '[清除失败]')
            if (cleanOutputDisplay.textContent && cleanOutputDisplay.textContent !== '[清除结果将显示在此处]' && cleanOutputDisplay.textContent !== '[清除失败]') {
                 // 使用 Clipboard API 复制文本
                 navigator.clipboard.writeText(cleanOutputDisplay.textContent)
                     .then(() => {
                         showNotification('info', '已清除零宽字符的文本已复制到剪贴板！'); // 复制成功提示
                      })
                     .catch(err => {
                         console.error('复制失败:', err);
                         showNotification('error', '复制失败，请手动复制。'); // 复制失败提示
                     });
             } else {
                  showNotification('warning', '没有可复制的内容。'); // 无内容可复制提示
             }
        });
     } else {
          console.error("Copy clean button or clean output display not found!"); // 页面加载错误
     }

    // 页面加载完成后的初始化设置
     // 默认显示 'embed' Tab
     showTab('embed');
     // 初始化水印密度滑块的显示值
     if (densityValueSpan && densitySlider) {
         densityValueSpan.textContent = densitySlider.value;
     }

     // 初始时检查通知容器是否存在，如果不存在则报告错误
     if (!notificationContainer) {
         console.error("通知容器 #notification-container 未找到！通知功能将无法工作。请检查 index.html 文件。");
         // 如果通知容器缺失，用户可能需要通过控制台查看错误，或使用 alert() 作为极简 fallback
     }

}); // DOMContentLoaded 事件监听结束