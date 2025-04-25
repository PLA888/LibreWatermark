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

    // 通知容器元素
    const notificationContainer = document.getElementById('notification-container');

    // --- 通知系统 ---

    /**
     * 显示一个通知消息。
     * @param {string} type - 通知类型 ('info', 'success', 'warning', 'error')
     * @param {string} messageText - 显示的消息文本。
     */
    function showNotification(type, messageText) {
        // 检查通知容器是否存在，如果不存在， fallback 到控制台输出
        if (!notificationContainer) {
            const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
            console[consoleMethod](`通知 (${type.toUpperCase()}): ${messageText}`);
            // 尝试使用 alert 作为最后的 fallback，但这不是最优体验
            // alert(`${type.toUpperCase()}: ${messageText}`);
            return; // 容器不存在则退出
        }

        // 创建通知元素
        const notificationBox = document.createElement('div');
        // 添加基础类和类型类，用于样式控制
        notificationBox.classList.add('notification-box', type); // 例如：'notification-box', 'success'

        // 创建消息文本元素
        const messageSpan = document.createElement('span');
        messageSpan.classList.add('message');
        messageSpan.textContent = messageText;
        notificationBox.appendChild(messageSpan);

        // 不需要关闭按钮，因为所有通知都会自动消失

        // 将通知框添加到容器顶部，实现垂直堆叠 (新的在上面)
         notificationContainer.insertBefore(notificationBox, notificationContainer.firstChild);

        // 设置自动消失定时器 (所有类型统一 3500ms)
        // 延迟应用 'hiding' 类触发退出动画
        setTimeout(() => {
            hideNotification(notificationBox);
        }, 3500);

         // 添加过渡结束监听，动画结束后移除元素
         notificationBox.addEventListener('transitionend', () => {
             if (notificationBox.classList.contains('hiding')) {
                notificationBox.remove();
             }
         });
    }

    /**
     * 触发通知框的隐藏动画。
     * @param {HTMLElement} notificationBox - 要隐藏的通知元素。
     */
    function hideNotification(notificationBox) {
        // 添加 'hiding' 类触发 CSS 动画
        notificationBox.classList.add('hiding');
        // 元素移除会在 transitionend 监听器中处理
    }

    // --- 辅助函数 ---

    /**
     * 更新元素的字符计数。
     * @param {HTMLElement} element - 输入框 (textarea/input) 或文本显示元素 (p)。
     * @param {HTMLElement} countSpanElement - 显示计数的 span 元素。
     */
    function updateCharCount(element, countSpanElement) {
        if (element && countSpanElement) {
            // 根据元素类型获取文本内容长度
            const count = element.value !== undefined ? element.value.length : element.textContent.length;
            countSpanElement.textContent = `(${count} 字)`;
        }
    }

    // --- Tab 切换逻辑 ---
    function showTab(tabId) {
        // 移除所有 Tab 内容的 active 类
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        // 移除所有 Tab 按钮的 active 类
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        // 激活目标 Tab 内容
        const targetTab = document.getElementById(tabId);
        if (targetTab) {
             targetTab.classList.add('active');
        }

        // 激活对应的 Tab 按钮
        const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        if (activeButton) {
             activeButton.classList.add('active');
        }

        // Tab 切换时清空所有当前显示的通知框（触发隐藏动画并移除）
         document.querySelectorAll('.notification-box').forEach(box => hideNotification(box));

        // --- 重置和更新各个 Tab 的内容和计数 ---

        // 重置 嵌入 Tab
        if (embedTextInput) {
             embedTextInput.value = '';
             if (embedTextCountSpan) updateCharCount(embedTextInput, embedTextCountSpan);
        }
        if (embedOutputTextarea) {
             embedOutputTextarea.value = '';
             if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
        }
        if (copyEmbedButton) copyEmbedButton.disabled = true; // 初始禁用复制按钮

        // 重置 提取 Tab
        if (extractTextInput) {
             extractTextInput.value = '';
             if (extractTextCountSpan) updateCharCount(extractTextInput, extractTextCountSpan);
        }
        if (extractOutputDisplay) extractOutputDisplay.textContent = '[提取结果将显示在此处]';

        // 重置 清除 Tab
        if (cleanTextInput) {
             cleanTextInput.value = '';
            if (cleanTextCountSpan) updateCharCount(cleanTextInput, cleanTextCountSpan);
        }
        if (cleanOutputDisplay) {
             cleanOutputDisplay.textContent = '[清除结果将显示在此处]';
             if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
        }
         if (copyCleanButton) copyCleanButton.disabled = true; // 初始禁用复制按钮
    }

    // 为 Tab 按钮添加事件监听器
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab'); // 从 data-tab 属性获取目标 Tab ID
            if (tabId) {
                showTab(tabId); // 显示对应 Tab
            }
        });
    });

    // --- 输入框事件监听器 (实时字符计数) ---
    if (embedTextInput && embedTextCountSpan) {
        embedTextInput.addEventListener('input', () => updateCharCount(embedTextInput, embedTextCountSpan));
    }
     if (extractTextInput && extractTextCountSpan) {
        extractTextInput.addEventListener('input', () => updateCharCount(extractTextInput, extractTextCountSpan));
    }
     if (cleanTextInput && cleanTextCountSpan) {
        cleanTextInput.addEventListener('input', () => updateCharCount(cleanTextInput, cleanTextCountSpan));
    }

    // --- 按钮事件监听器 ---

    // 水印密度滑块更新显示值 (嵌入 Tab)
    if (densitySlider && densityValueSpan) {
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value;
        });
    }

    // 嵌入按钮点击处理
    // 检查所有必需的 DOM 元素是否存在
    if (embedButton && embedKeyInput && embedWatermarkInput && embedTextInput && embedOutputTextarea && densitySlider && copyEmbedButton) {
        embedButton.addEventListener('click', () => {
            const key = embedKeyInput.value;
            const watermark = embedWatermarkInput.value;
            let text = embedTextInput.value; // 使用 let 允许修改文本
            const blockSize = parseInt(densitySlider.value, 10);

            // 清空之前的输出结果和相关的状态
            embedOutputTextarea.value = '';
            if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
            copyEmbedButton.disabled = true;

            // 检查输入是否完整
            if (!key || !watermark || !text) {
                showNotification('error', '错误：密钥、水印内容和原始文本不能为空！'); // 必填项错误，显示错误通知
                return; // 中止操作
            }

            // 检查原始文本中是否包含零宽字符 (使用 watermark.js 的函数)
            if (typeof containsZeroWidthChars === 'function') {
                if (containsZeroWidthChars(text)) {
                    // 如果发现零宽字符，显示警告通知，并引导用户处理
                    showNotification('warning', '检测到原始文本包含零宽字符，可能干扰水印。请先在“清除零宽字符”标签页处理后再嵌入。'); // 警告通知
                    // 注意：此处不修改 text，也不继续嵌入。用户需要手动切换标签页清除。
                    embedButton.disabled = false; // 保持按钮可用，方便用户清除后重试
                    copyEmbedButton.disabled = true;
                    return; // 中止当前嵌入流程
                }
                 // 如果原始文本干净，继续嵌入流程
                 startEmbedding(key, watermark, text, blockSize);

            } else {
                 // containsZeroWidthChars 函数不存在的 fallback (不太可能发生)
                  console.error("containsZeroWidthChars 函数未找到！");
                 showNotification('error', '应用内部错误，零宽字符检查功能缺失！');
                 embedButton.disabled = false;
                 copyEmbedButton.disabled = true;
            }
        });
    } else {
         // 缺少关键 DOM 元素的页面加载错误处理
        console.error("Embedding 功能所需的一个或多个 DOM 元素未找到！");
         showNotification('error', '应用加载错误，部分功能 (嵌入) 无法使用。请尝试刷新页面。');
    }

    /**
     * 处理实际的水印嵌入过程 (分离出来方便异步调用)
     * @param {string} key 密钥
     * @param {string} watermark 水印内容
     * @param {string} text 原始文本
     * @param {number} blockSize 分块大小
     */
    function startEmbedding(key, watermark, text, blockSize) {
        embedButton.disabled = true; // 禁用按钮防止重复点击
        copyEmbedButton.disabled = true; // 禁用复制按钮

        // 不再显示“正在嵌入...”的中间状态提示

        // 使用 setTimeout 延迟执行，允许 UI 更新后处理耗时操作
        setTimeout(() => {
            try {
                // 确保 embedWatermark 函数存在
                 if (typeof embedWatermark !== 'function') {
                     throw new Error("Watermark embedding function is not available.");
                 }
                // 调用核心嵌入逻辑
                const resultText = embedWatermark(text, key, watermark, blockSize);

                embedOutputTextarea.value = resultText;
                // 手动更新输出文本框的字符计数，因为它不是用户输入驱动的
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);

                // 根据结果显示成功或警告提示
                if (resultText.length > text.length) {
                    showNotification('success', '水印嵌入成功！'); // 成功提示
                    copyEmbedButton.disabled = false; // 成功后启用复制按钮
                } else if (watermark.length > 0 && resultText.length === text.length) {
                     // 嵌入了非空水印但文本长度未改变 (可能水印太短，或者内部逻辑异常)
                     showNotification('warning', '水印嵌入完成，但输出文本长度未增加。请检查密钥、水印内容或原始文本长度是否足够。'); // 警告提示
                     copyEmbedButton.disabled = true; // 嵌入未成功添加字符，不启用复制
                } else { // 水印内容为空 或 其他情况导致无变化
                     showNotification('info', '没有水印内容可嵌入，或操作未改变文本。'); // 一般信息提示
                     copyEmbedButton.disabled = true;
                }

            } catch (error) {
                console.error("Embedding failed:", error);
                // 显示错误提示
                showNotification('error', `嵌入失败：${error.message}`); // 错误提示
                // 清空输出并禁用复制
                embedOutputTextarea.value = '';
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
                copyEmbedButton.disabled = true;
            } finally {
                 // 无论成功或失败，重新启用按钮
                 embedButton.disabled = false;
            }
        }, 10); // 短暂延迟
    }

    // 复制嵌入结果按钮点击处理
    if (copyEmbedButton && embedOutputTextarea) {
        copyEmbedButton.addEventListener('click', () => {
            if (embedOutputTextarea.value) {
                // 使用 Clipboard API 复制文本
                navigator.clipboard.writeText(embedOutputTextarea.value)
                    .then(() => {
                        showNotification('info', '带水印的文本已复制到剪贴板！'); // 复制成功提示
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
         console.error("Copy embed button or embed output textarea not found!");
    }

    // 提取按钮点击处理
     if (extractButton && extractKeyInput && extractTextInput && extractOutputDisplay) {
        extractButton.addEventListener('click', () => {
            const key = extractKeyInput.value;
            const text = extractTextInput.value;

            // 清空之前的输出结果和相关的状态
            extractOutputDisplay.textContent = '[提取结果将显示在此处]';

            // 检查输入是否完整
            if (!key || !text) {
                showNotification('error', '错误：密钥和待提取文本不能为空！'); // 必填项错误提示
                return; // 中止操作
            }

            extractButton.disabled = true; // 禁用按钮
            // 不再显示“正在尝试提取...”的中间状态提示

            // 使用 setTimeout 延迟执行
            setTimeout(() => {
                 try {
                      // 确保 extractWatermark 函数存在
                      if (typeof extractWatermark !== 'function') {
                         throw new Error("Watermark extraction function is not available.");
                      }
                     // 调用核心提取逻辑
                     const extractedWatermark = extractWatermark(text, key);

                     // 根据提取结果显示提示
                     if (extractedWatermark !== null) {
                         extractOutputDisplay.textContent = extractedWatermark;
                         showNotification('success', '水印提取成功！'); // 提取成功提示
                     } else {
                         extractOutputDisplay.textContent = '[未找到有效水印或密钥错误]';
                         // 提供更详细的未找到原因提示
                         showNotification('warning', '未能提取到有效水印：没有找到匹配密钥和认证码的模式。请检查输入的文本、密钥是否正确，或者文本是否被修改导致零宽字符被移除。'); // 警告提示
                     }
                 } catch (error) {
                      console.error("Extraction failed:", error);
                      // 显示错误提示
                      showNotification('error', `提取过程中发生错误：${error.message}`); // 错误提示
                      extractOutputDisplay.textContent = '[提取失败]';
                 } finally {
                     // 重新启用按钮
                     extractButton.disabled = false;
                 }
            }, 10); // 短暂延迟
        });
     } else {
         console.error("Extract 功能所需的一个或多个 DOM 元素未找到！");
          showNotification('error', '应用加载错误，部分功能 (提取) 无法使用。请尝试刷新页面。');
     }

     // 清除按钮点击处理
    if (cleanButton && cleanTextInput && cleanOutputDisplay && cleanOutputCountSpan && copyCleanButton) {
         cleanButton.addEventListener('click', () => {
            const text = cleanTextInput.value;

            // 清空之前输出并重置计数
             cleanOutputDisplay.textContent = '[清除结果将显示在此处]';
             if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
             copyCleanButton.disabled = true; // 禁用复制按钮

            // 检查输入是否完整
            if (!text) {
                showNotification('error', '错误：请粘贴需要清除零宽字符的文本！'); // 必填项错误提示
                return; // 中止操作
            }

             cleanButton.disabled = true; // 禁用按钮
             copyCleanButton.disabled = true;

            // 不再显示“正在清除...”的中间状态提示

            setTimeout(() => {
                 try {
                      // 确保 cleanZeroWidthChars 函数存在
                      if (typeof cleanZeroWidthChars !== 'function') {
                         throw new Error("Zero-width cleaning function is not available.");
                      }
                     // 调用核心清除逻辑
                     const cleanedText = cleanZeroWidthChars(text);

                    cleanOutputDisplay.textContent = cleanedText;
                    // 手动更新输出显示的字符计数
                    if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);

                    // 根据结果显示提示
                    if (cleanedText.length < text.length) {
                         // 长度减少，说明清除了零宽字符
                         showNotification('success', '零宽字符清除成功！'); // 成功提示
                         copyCleanButton.disabled = false; // 启用复制按钮
                    } else {
                         // 长度未变，可能没有零宽字符
                         showNotification('info', '已完成清除操作，未检测到零宽字符或文本长度未改变。'); // 信息提示
                          copyCleanButton.disabled = false; // 即使没有清除，仍然允许复制清理后的文本 (与原始文本相同)
                    }

                 } catch (error) {
                      console.error("Cleaning failed:", error);
                      // 显示错误提示
                       showNotification('error', `清除过程中发生错误：${error.message}`); // 错误提示
                       cleanOutputDisplay.textContent = '[清除失败]';
                       if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
                       copyCleanButton.disabled = true; // 失败时不启用复制
                 } finally {
                     // 重新启用按钮
                     cleanButton.disabled = false;
                 }
            }, 10); // 短暂延迟
         });
    } else {
         console.error("Clean 功能所需的一个或多个 DOM 元素未找到！");
          showNotification('error', '应用加载错误，部分功能 (清除) 无法使用。请尝试刷新页面。');
    }

    // 复制清除结果按钮点击处理
     if (copyCleanButton && cleanOutputDisplay) {
        copyCleanButton.addEventListener('click', () => {
            // 检查输出内容是否可复制 (非默认占位符或错误状态)
            if (cleanOutputDisplay.textContent && cleanOutputDisplay.textContent !== '[清除结果将显示在此处]' && cleanOutputDisplay.textContent !== '[清除失败]') {
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
          console.error("Copy clean button or clean output display not found!");
     }

    // 页面初始化设置：默认显示 'embed' Tab 并初始化滑块显示值
     showTab('embed'); // 调用 showTab 同时会完成初始的清空和计数更新
     if (densityValueSpan && densitySlider) {
         densityValueSpan.textContent = densitySlider.value; // 初始化密度值显示
     }

     // 初始时检查通知容器是否存在，如果不存在则报告错误
     if (!notificationContainer) {
         console.error("通知容器 #notification-container 未找到！通知功能将无法工作。");
         // 可以在此处添加一个备用的、页面内的错误显示方式
     }

}); // DOMContentLoaded 结束