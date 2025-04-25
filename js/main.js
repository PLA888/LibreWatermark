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

    // 通知容器元素 (用于显示非阻塞式提示，位于右上角)
    const notificationContainer = document.getElementById('notification-container');

    // 初次访问重要提示弹窗元素 (新增)
    const firstVisitModalOverlay = document.getElementById('first-visit-modal-overlay');
    const firstVisitModalCloseButton = document.getElementById('first-visit-modal-close');

    // --- 初次访问弹窗逻辑 (新增) ---
    const hasSeenWelcomeModalKey = 'librewatermark_seen_welcome_modal';

    // 检查 localStorage，如果是第一次访问则显示弹窗
    if (!localStorage.getItem(hasSeenWelcomeModalKey)) {
        if (firstVisitModalOverlay) {
             firstVisitModalOverlay.classList.add('visible'); // 显示弹窗覆盖层

             // 设置 localStorage 标志，表示弹窗已显示过
             // 注意：这里立即设置，防止用户刷新又看到。如果用户不关闭就离开，下次不会再看到。
             // 如果需要在用户手动关闭后才标记为已见，下面的 EventListener 中设置即可。
             // 按当前需求“初次打开时显示”，立即设置是合适的。
             localStorage.setItem(hasSeenWelcomeModalKey, 'true');
        } else {
             console.error("初次访问提示弹窗元素未找到！");
        }
    }

    // 为初次访问弹窗的关闭按钮添加事件监听
    if (firstVisitModalCloseButton && firstVisitModalOverlay) {
        firstVisitModalCloseButton.addEventListener('click', () => {
            firstVisitModalOverlay.classList.remove('visible'); // 隐藏弹窗
             // 如果需要延迟到关闭才设置localstorage，可以在这里设置
             // localStorage.setItem(hasSeenWelcomeModalKey, 'true');
        });
    }
     // 可选：点击蒙版区域也关闭弹窗 (如果modal-content不阻止事件冒泡)
     if (firstVisitModalOverlay) {
         firstVisitModalOverlay.addEventListener('click', (event) => {
             // 仅当点击事件发生在 overlay 本身 (而非其内部的 modal-content) 时关闭
             if (event.target === firstVisitModalOverlay) {
                 firstVisitModalOverlay.classList.remove('visible');
             }
         });
     }

    // --- 通知系统 (用于操作结果提示) ---

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
            return; // 容器不存在，不创建元素
        }

        // 创建通知框元素
        const notificationBox = document.createElement('div');
        notificationBox.classList.add('notification-box', type);

        // 创建消息文本元素
        const messageSpan = document.createElement('span');
        messageSpan.classList.add('message');
        messageSpan.textContent = messageText;
        notificationBox.appendChild(messageSpan);

        // 添加到容器顶部，实现垂直堆叠 (新的在上面)
         notificationContainer.insertBefore(notificationBox, notificationContainer.firstChild);

        // 设置自动消失定时器 (统一 3500ms)
        const autoHideDuration = 3500;
        setTimeout(() => {
            hideNotification(notificationBox); // 触发隐藏动画
        }, autoHideDuration);

         // 添加过渡结束监听，动画完成后移除元素
         notificationBox.addEventListener('transitionend', () => {
             if (notificationBox.classList.contains('hiding')) {
                notificationBox.remove(); // 从 DOM 中移除
             }
         });
    }

    /**
     * 触发单个通知框的隐藏动画。
     * @param {HTMLElement} notificationBox - 要隐藏的通知元素。
     */
    function hideNotification(notificationBox) {
        notificationBox.classList.add('hiding');
    }

    // --- 辅助函数 ---

    /**
     * 更新元素的字符计数显示。
     */
    function updateCharCount(element, countSpanElement) {
        if (element && countSpanElement) {
            const count = element.value !== undefined ? element.value.length : element.textContent.length;
            countSpanElement.textContent = `(${count} 字)`;
        }
    }

    // --- Tab 切换逻辑 ---
    function showTab(tabId) {
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        const targetTab = document.getElementById(tabId);
        if (targetTab) {
             targetTab.classList.add('active');
        }

        const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        if (activeButton) {
             activeButton.classList.add('active');
        }

        // Tab 切换时，清空所有当前显示的通知框 (触发隐藏动画并移除)
         document.querySelectorAll('.notification-box').forEach(box => hideNotification(box));

        // --- 重置和更新各个 Tab 的内容和初始字符计数 ---

        // 嵌入 Tab
        if (embedTextInput) {
             embedTextInput.value = '';
             if (embedTextCountSpan) updateCharCount(embedTextInput, embedTextCountSpan);
        }
        if (embedOutputTextarea) {
             embedOutputTextarea.value = '';
             if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
        }
        if (copyEmbedButton) copyEmbedButton.disabled = true;

        // 提取 Tab
        if (extractTextInput) {
             extractTextInput.value = '';
             if (extractTextCountSpan) updateCharCount(extractTextInput, extractTextCountSpan);
        }
        if (extractOutputDisplay) extractOutputDisplay.textContent = '[提取结果将显示在此处]';

        // 清除 Tab
        if (cleanTextInput) {
             cleanTextInput.value = '';
            if (cleanTextCountSpan) updateCharCount(cleanTextInput, cleanTextCountSpan);
        }
        if (cleanOutputDisplay) {
             cleanOutputDisplay.textContent = '[清除结果将显示在此处]';
             if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
        }
         if (copyCleanButton) copyCleanButton.disabled = true;
    }

    // 为所有 Tab 按钮添加点击事件监听器
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) {
                showTab(tabId);
            }
        });
    });

    // --- 输入框事件监听器 (实时更新字符计数) ---
    if (embedTextInput && embedTextCountSpan) {
        embedTextInput.addEventListener('input', () => updateCharCount(embedTextInput, embedTextCountSpan));
    }
    if (extractTextInput && extractTextCountSpan) {
        extractTextInput.addEventListener('input', () => updateCharCount(extractTextInput, extractTextCountSpan));
    }
    if (cleanTextInput && cleanTextCountSpan) {
        cleanTextInput.addEventListener('input', () => updateCharCount(cleanTextInput, cleanTextCountSpan));
    }
    
    // 新增：水印内容长度实时验证
    if (embedWatermarkInput && densitySlider) {
        const watermarkLengthInfo = document.createElement('span');
        watermarkLengthInfo.id = 'watermark-length-info';
        watermarkLengthInfo.style.marginLeft = '10px';
        watermarkLengthInfo.style.fontSize = '0.9em';
        if (embedWatermarkInput.parentNode) {
            embedWatermarkInput.parentNode.appendChild(watermarkLengthInfo);
        }
        
        // 更新水印长度提示信息的函数
        function updateWatermarkLengthInfo() {
            const watermarkText = embedWatermarkInput.value;
            const blockSize = parseInt(densitySlider.value, 10);
            
            try {
                if (typeof estimateUtf8Bits !== 'function' || typeof calculateMaxWatermarkBits !== 'function') {
                    throw new Error("缺少必要的水印长度计算函数");
                }
                
                const estimatedBits = watermarkText ? estimateUtf8Bits(watermarkText) : 0;
                const maxBits = calculateMaxWatermarkBits(blockSize);
                const usedPercent = Math.round((estimatedBits / maxBits) * 100);
                
                watermarkLengthInfo.textContent = `${estimatedBits}/${maxBits} 比特 (${usedPercent}%)`;
                
                if (!watermarkText || watermarkText.length === 0) {
                    // 当没有文本时，显示黄色警告
                    watermarkLengthInfo.className = 'warning';
                    watermarkLengthInfo.title = '请输入水印内容';
                } else if (estimatedBits > maxBits) {
                    watermarkLengthInfo.className = 'error';
                    watermarkLengthInfo.title = '水印内容过长，超出了当前分块大小下的最大允许长度。请缩短水印内容或增加分块大小。';
                } else if (usedPercent > 80) {
                    watermarkLengthInfo.className = 'warning';
                    watermarkLengthInfo.title = '水印内容接近最大长度限制，建议增加分块大小以提高提取成功率。';
                } else {
                    watermarkLengthInfo.className = 'success';
                    watermarkLengthInfo.title = '水印长度在安全范围内。';
                }
            } catch (e) {
                console.error("计算水印长度时出错:", e);
                watermarkLengthInfo.textContent = '无法计算水印长度';
                watermarkLengthInfo.className = 'error';
            }
        }
        
        // 水印内容变化时更新长度信息
        embedWatermarkInput.addEventListener('input', updateWatermarkLengthInfo);
        
        // 密度滑块变化时更新长度信息
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value;
            updateWatermarkLengthInfo();
        });
        
        // 初始化长度信息
        updateWatermarkLengthInfo();
    }

    // --- 按钮事件监听器 ---

    // 水印密度滑块更新显示值 (嵌入 Tab)
    if (densitySlider && densityValueSpan) {
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value;
        });
    }

    // 嵌入按钮点击处理
    if (embedButton && embedKeyInput && embedWatermarkInput && embedTextInput && embedOutputTextarea && densitySlider && copyEmbedButton) {
        embedButton.addEventListener('click', () => {
            const key = embedKeyInput.value;
            const watermark = embedWatermarkInput.value;
            let text = embedTextInput.value;
            const blockSize = parseInt(densitySlider.value, 10);

            // 清空之前的输出结果和相关的状态显示
            embedOutputTextarea.value = '';
            if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
            copyEmbedButton.disabled = true;

            // 检查输入是否完整
            if (!key || !watermark || !text) {
                showNotification('error', '错误：密钥、水印内容和原始文本不能为空！');
                return;
            }

            // 检查原始文本中是否包含零宽字符
            if (typeof containsZeroWidthChars === 'function') {
                if (containsZeroWidthChars(text)) {
                    showNotification('warning', '检测到原始文本包含零宽字符，可能干扰水印嵌入和提取。请先使用顶部的“清除零宽字符”标签页处理后再进行嵌入。');
                    embedButton.disabled = false;
                    copyEmbedButton.disabled = true;
                    return; // 中止当前嵌入流程
                }
                 // 原始文本干净，继续嵌入流程
                 startEmbedding(key, watermark, text, blockSize);

            } else {
                  console.error("containsZeroWidthChars 函数未找到！");
                 showNotification('error', '应用内部错误，无法执行零宽字符预检查功能。');
                 embedButton.disabled = false;
                 copyEmbedButton.disabled = true;
            }
        });
    } else {
        console.error("Embedding 功能所需的一个或多个 DOM 元素未找到！");
         showNotification('error', '应用加载错误，部分功能 (嵌入) 无法使用。请尝试刷新页面。');
    }

    /**
     * 处理实际的水印嵌入过程 (分离出来方便异步调用和错误隔离)
     */
    function startEmbedding(key, watermark, text, blockSize) {
        embedButton.disabled = true;
        copyEmbedButton.disabled = true;

        setTimeout(() => {
            try {
                 if (typeof embedWatermark !== 'function') {
                     throw new Error("Watermark embedding function is not available.");
                 }
                const resultText = embedWatermark(text, key, watermark, blockSize);

                embedOutputTextarea.value = resultText;
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);

                if (resultText.length > text.length) {
                    showNotification('success', '水印嵌入成功！');
                    copyEmbedButton.disabled = false;
                } else if (watermark.length > 0 && resultText.length === text.length) {
                     showNotification('warning', '水印嵌入完成，但输出文本长度未增加。请检查密钥、水印内容或原始文本长度是否足够。');
                     copyEmbedButton.disabled = true;
                } else {
                     showNotification('info', '没有水印内容可嵌入，或操作未改变文本。');
                     copyEmbedButton.disabled = true;
                }

            } catch (error) {
                console.error("Embedding failed:", error);
                showNotification('error', `嵌入失败：${error.message}`);
                embedOutputTextarea.value = '';
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
                copyEmbedButton.disabled = true;
            } finally {
                 embedButton.disabled = false;
            }
        }, 10);
    }

    // 复制嵌入结果文本按钮点击处理
    if (copyEmbedButton && embedOutputTextarea) {
        copyEmbedButton.addEventListener('click', () => {
            if (embedOutputTextarea.value) {
                navigator.clipboard.writeText(embedOutputTextarea.value)
                    .then(() => {
                        showNotification('info', '带水印的文本已复制到剪贴板！');
                     })
                    .catch(err => {
                        console.error('复制失败:', err);
                        showNotification('error', '复制失败，请手动复制。');
                    });
            } else {
                 showNotification('warning', '没有可复制的内容。');
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

            extractOutputDisplay.textContent = '[提取结果将显示在此处]';

            if (!key || !text) {
                showNotification('error', '错误：密钥和待提取文本不能为空！');
                return;
            }

            extractButton.disabled = true;

            setTimeout(() => {
                 try {
                      if (typeof extractWatermark !== 'function') {
                         throw new Error("Watermark extraction function is not available.");
                      }
                     const extractedWatermark = extractWatermark(text, key);

                     if (extractedWatermark !== null) {
                         extractOutputDisplay.textContent = extractedWatermark;
                         showNotification('success', '水印提取成功！');
                     } else {
                         extractOutputDisplay.textContent = '[未找到有效水印或密钥错误]';
                         showNotification('warning', '未能提取到有效水印：没有找到匹配密钥和认证码的模式。请检查输入的文本是否包含水印、密钥是否正确，或者文本是否被修改导致零宽字符被移除。');
                     }
                 } catch (error) {
                      console.error("Extraction failed:", error);
                      showNotification('error', `提取过程中发生错误：${error.message}`);
                      extractOutputDisplay.textContent = '[提取失败]';
                 } finally {
                     extractButton.disabled = false;
                 }
            }, 10);

        });
     } else {
         console.error("Extract 功能所需的一个或多个 DOM 元素未找到！");
          showNotification('error', '应用加载错误，部分功能 (提取) 无法使用。请尝试刷新页面。');
     }

     // 清除按钮点击处理
    if (cleanButton && cleanTextInput && cleanOutputDisplay && cleanOutputCountSpan && copyCleanButton) {
         cleanButton.addEventListener('click', () => {
            const text = cleanTextInput.value;

             cleanOutputDisplay.textContent = '[清除结果将显示在此处]';
             if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
             copyCleanButton.disabled = true;

            if (!text) {
                showNotification('error', '错误：请粘贴需要清除零宽字符的文本！');
                return;
            }

             cleanButton.disabled = true;
             copyCleanButton.disabled = true;

            setTimeout(() => {
                 try {
                      if (typeof cleanZeroWidthChars !== 'function') {
                         throw new Error("Zero-width cleaning function is not available.");
                      }
                     const cleanedText = cleanZeroWidthChars(text);

                    cleanOutputDisplay.textContent = cleanedText;
                    if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);

                    if (cleanedText.length < text.length) {
                         showNotification('success', '零宽字符清除成功！');
                         copyCleanButton.disabled = false;
                    } else {
                         showNotification('info', '已完成清除操作，未检测到零宽字符或文本长度未改变。');
                          copyCleanButton.disabled = false;
                    }

                 } catch (error) {
                      console.error("Cleaning failed:", error);
                       showNotification('error', `清除过程中发生错误：${error.message}`);
                       cleanOutputDisplay.textContent = '[清除失败]';
                       if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
                       copyCleanButton.disabled = true;
                 } finally {
                     cleanButton.disabled = false;
                 }
            }, 10);
         });
    } else {
         console.error("Clean 功能所需的一个或多个 DOM 元素未找到！");
          showNotification('error', '应用加载错误，部分功能 (清除) 无法使用。请尝试刷新页面。');
    }

    // 复制清除结果文本按钮点击处理
     if (copyCleanButton && cleanOutputDisplay) {
        copyCleanButton.addEventListener('click', () => {
            if (cleanOutputDisplay.textContent && cleanOutputDisplay.textContent !== '[清除结果将显示在此处]' && cleanOutputDisplay.textContent !== '[清除失败]') {
                 navigator.clipboard.writeText(cleanOutputDisplay.textContent)
                     .then(() => {
                         showNotification('info', '已清除零宽字符的文本已复制到剪贴板！');
                      })
                     .catch(err => {
                         console.error('复制失败:', err);
                         showNotification('error', '复制失败，请手动复制。');
                     });
             } else {
                  showNotification('warning', '没有可复制的内容。');
             }
        });
     } else {
          console.error("Copy clean button or clean output display not found!");
     }

    // 页面加载完成后的初始化设置
     showTab('embed');
     if (densityValueSpan && densitySlider) {
         densityValueSpan.textContent = densitySlider.value;
     }

     // 初始时检查通知容器是否存在，如果不存在则报告错误
     if (!notificationContainer) {
         console.error("通知容器 #notification-container 未找到！通知功能将无法工作。请检查 index.html 文件。");
     }

}); // DOMContentLoaded 结束