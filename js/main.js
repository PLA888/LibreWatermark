// main.js - 处理UI交互并连接UI到水印逻辑

document.addEventListener('DOMContentLoaded', () => {
    // --- 获取UI元素 ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // 嵌入元素
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

    // 提取元素
    const extractKeyInput = document.getElementById('extract-key');
    const extractTextInput = document.getElementById('extract-text');
    const extractTextCountSpan = document.getElementById('extract-text-count');
    const extractButton = document.getElementById('extract-button');
    const extractOutputDisplay = document.getElementById('extract-output');

    // 清除元素
    const cleanTextInput = document.getElementById('clean-text');
    const cleanTextCountSpan = document.getElementById('clean-text-count');
    const cleanButton = document.getElementById('clean-button');
    const cleanOutputDisplay = document.getElementById('clean-output');
    const cleanOutputCountSpan = document.getElementById('clean-output-count');
    const copyCleanButton = document.getElementById('copy-clean-button');

    // 通知容器元素
    const notificationContainer = document.getElementById('notification-container');

    // --- 通知系统 (优化版) ---

    /**
     * 显示非阻塞式通知消息
     * @param {string} type 'info', 'success', 'warning', 'error'
     * @param {string} messageText 要显示的消息
     * @param {number} [autoHideDelay=3500] 自动隐藏的延迟时间(ms)，所有类型均自动隐藏
     * @returns {HTMLElement} 通知元素，可用于后续操作
     */
    function showNotification(type, messageText, autoHideDelay = 3500) {
        if (!notificationContainer) {
            console.error('通知容器未找到!');
            const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
            console[consoleMethod](`通知 (${type.toUpperCase()}): ${messageText}`);
            alert(`${type.toUpperCase()}: ${messageText}`);
            return null;
        }
        const notificationBox = document.createElement('div');
        notificationBox.classList.add('notification-box', type);
        const messageSpan = document.createElement('span');
        messageSpan.classList.add('message');
        messageSpan.textContent = messageText;
        notificationBox.appendChild(messageSpan);

        // 关闭按钮
        const closeButton = document.createElement('button');
        closeButton.classList.add('close-btn');
        closeButton.innerHTML = '&times;';
        closeButton.setAttribute('aria-label', '关闭通知');
        closeButton.addEventListener('click', () => {
            hideNotification(notificationBox);
        });
        notificationBox.appendChild(closeButton);

        notificationContainer.appendChild(notificationBox);

        // 所有类型都自动隐藏
        notificationBox._hideTimer = setTimeout(() => {
            hideNotification(notificationBox);
        }, autoHideDelay);

        notificationBox.addEventListener('animationend', (event) => {
            if (event.animationName === 'slideOutNotification') {
                notificationBox.remove();
            }
        });

        return notificationBox;
    }

    /**
     * 隐藏指定的通知框或所有通知
     * @param {HTMLElement|null} notificationBox 要隐藏的通知元素，null则隐藏全部
     */
    function hideNotification(notificationBox = null) {
        if (notificationBox) {
            // 取消可能存在的自动隐藏计时器
            if (notificationBox._hideTimer) {
                clearTimeout(notificationBox._hideTimer);
                notificationBox._hideTimer = null;
            }
            notificationBox.classList.add('hiding');
        } else {
            // 隐藏所有未隐藏的通知
            const activeNotifications = document.querySelectorAll('#notification-container .notification-box:not(.hiding)');
            activeNotifications.forEach(box => {
                if (box._hideTimer) {
                    clearTimeout(box._hideTimer);
                    box._hideTimer = null;
                }
                box.classList.add('hiding');
            });
        }
    }

    // --- 辅助函数 (现有的) ---

    // 更新元素的字符计数的函数
    function updateCharCount(element, countSpanElement) {
        if (element && countSpanElement) {
            const count = element.value !== undefined ? element.value.length : element.textContent.length;
            countSpanElement.textContent = `(${count} 字)`;
        }
    }

    // --- 标签切换逻辑 ---
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

        // 标签切换时隐藏所有通知的快速方法
        // 更优雅的方式是为每个通知触发 hideNotification()，允许动画结束
        // hideNotification(); // 调用函数隐藏所有通知
         document.querySelectorAll('#notification-container .notification-box').forEach(box => hideNotification(box));

        // --- 重置并更新每个标签的计数 ---

        // 重置嵌入标签
        if (embedTextInput) {
             embedTextInput.value = '';
             if (embedTextCountSpan) updateCharCount(embedTextInput, embedTextCountSpan);
        }
        if (embedOutputTextarea) {
             embedOutputTextarea.value = '';
             if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
        }
        if (copyEmbedButton) copyEmbedButton.disabled = true;

        // 重置提取标签
        if (extractTextInput) {
             extractTextInput.value = '';
             if (extractTextCountSpan) updateCharCount(extractTextInput, extractTextCountSpan);
        }
        if (extractOutputDisplay) extractOutputDisplay.textContent = '[提取结果将显示在此处]';

        // 重置清除标签
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

    // 为标签按钮添加事件监听器
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) {
                showTab(tabId);
            }
        });
    });

    // --- 输入框的事件监听器 (字符计数) ---
    if (embedTextInput && embedTextCountSpan) {
        embedTextInput.addEventListener('input', () => updateCharCount(embedTextInput, embedTextCountSpan));
    }
     if (extractTextInput && extractTextCountSpan) {
        extractTextInput.addEventListener('input', () => updateCharCount(extractTextInput, extractTextCountSpan));
    }
     if (cleanTextInput && cleanTextCountSpan) {
        cleanTextInput.addEventListener('input', () => updateCharCount(cleanTextInput, cleanTextCountSpan));
    }

    // --- 按钮的事件监听器 ---

    // 密度滑块更新 (嵌入标签)
    if (densitySlider && densityValueSpan) {
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value;
        });
    }

    // 嵌入按钮点击处理程序
    if (embedButton && embedKeyInput && embedWatermarkInput && embedTextInput && embedOutputTextarea && densitySlider && copyEmbedButton && notificationContainer) {
        embedButton.addEventListener('click', () => {
            const key = embedKeyInput.value;
            const watermark = embedWatermarkInput.value;
            let text = embedTextInput.value;
            const blockSize = parseInt(densitySlider.value, 10);

            // 清空输出和计数
            embedOutputTextarea.value = '';
            if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
            copyEmbedButton.disabled = true;

            if (!key || !watermark || !text) {
                showNotification('error', '错误：密钥、水印内容和原始文本不能为空！', 3500);
                return;
            }

            // 检查零宽字符
            if (typeof containsZeroWidthChars === 'function') {
                if (containsZeroWidthChars(text)) {
                    showNotification('warning', '检测到原始文本包含零宽字符，可能干扰水印。请先在"清除零宽字符"标签页处理后再嵌入。', 3500);
                    embedButton.disabled = false;
                    copyEmbedButton.disabled = true;
                    return;
                }
                // 无零宽字符，继续
                startEmbedding(key, watermark, text, blockSize);
            } else {
                console.error("找不到 containsZeroWidthChars 函数。无法执行预检查。");
                startEmbedding(key, watermark, text, blockSize);
            }
        });
    } else {
        console.error("未找到一个或多个嵌入元素！");
        if(notificationContainer) {
            showNotification('error', '应用加载错误，部分功能 (嵌入) 无法使用。请尝试刷新页面。', 3500);
        }
    }

    // 实际嵌入处理函数
    function startEmbedding(key, watermark, text, blockSize) {
        embedButton.disabled = true;
        copyEmbedButton.disabled = true;
        // 不再显示"正在嵌入水印..."的通知

        setTimeout(() => {
            try {
                if (typeof embedWatermark !== 'function') {
                    throw new Error("水印嵌入函数不可用。");
                }
                const resultText = embedWatermark(text, key, watermark, blockSize);

                embedOutputTextarea.value = resultText;
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);

                if (resultText.length > text.length) {
                    showNotification('success', '水印嵌入成功！', 3500);
                    copyEmbedButton.disabled = false;
                } else if (watermark.length > 0 && resultText.length === text.length) {
                    showNotification('warning', '水印嵌入完成，但输出文本长度未增加。可能水印被清空或长度不足。请检查。', 3500);
                    copyEmbedButton.disabled = false;
                } else {
                    showNotification('info', '没有水印内容可嵌入或操作未改变文本。', 3500);
                    copyEmbedButton.disabled = true;
                }
            } catch (error) {
                console.error("嵌入失败:", error);
                showNotification('error', `嵌入失败：${error.message}`, 3500);
                embedOutputTextarea.value = '';
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
                copyEmbedButton.disabled = true;
            } finally {
                embedButton.disabled = false;
            }
        }, 10);
    }

    // 复制嵌入结果按钮点击事件处理
    if (copyEmbedButton && embedOutputTextarea && notificationContainer) {
        copyEmbedButton.addEventListener('click', () => {
            if (embedOutputTextarea.value) {
                navigator.clipboard.writeText(embedOutputTextarea.value)
                    .then(() => {
                        showNotification('info', '带水印的文本已复制到剪贴板！', 3500);
                     })
                    .catch(err => {
                        console.error('复制失败:', err);
                        showNotification('error', '复制失败，请手动复制。', 3500);
                    });
            } else {
                 showNotification('warning', '没有可复制的内容。', 3500);
            }
        });
    } else {
         console.error("复制按钮或输出文本区域未找到!");
    }

    // 提取按钮点击处理程序
    if (extractButton && extractKeyInput && extractTextInput && extractOutputDisplay && notificationContainer && extractTextCountSpan) {
        extractButton.addEventListener('click', () => {
            const key = extractKeyInput.value;
            const text = extractTextInput.value;

            extractOutputDisplay.textContent = '[提取结果将显示在此处]';

            if (!key || !text) {
                showNotification('error', '错误：密钥和待提取文本不能为空！', 3500);
                return;
            }

            extractButton.disabled = true;
            // 不再显示"正在尝试提取水印..."的通知

            setTimeout(() => {
                try {
                    if (typeof extractWatermark !== 'function') {
                        throw new Error("水印提取函数不可用。");
                    }
                    const extractedWatermark = extractWatermark(text, key);

                    if (extractedWatermark !== null) {
                        extractOutputDisplay.textContent = extractedWatermark;
                        showNotification('success', '水印提取成功！', 3500);
                    } else {
                        extractOutputDisplay.textContent = '[未找到有效水印或密钥错误]';
                        showNotification('warning', '未能提取到有效水印。请检查输入的文本、密钥是否正确，文本是否被修改或零宽字符是否被移除。', 3500);
                    }
                } catch (error) {
                    console.error("提取失败:", error);
                    showNotification('error', `提取过程中发生错误：${error.message}`, 3500);
                    extractOutputDisplay.textContent = '[提取失败]';
                } finally {
                    extractButton.disabled = false;
                }
            }, 10);
        });
    } else {
        console.error("未找到一个或多个提取元素！");
        if(notificationContainer) {
            showNotification('error', '应用加载错误，部分功能 (提取) 无法使用。请尝试刷新页面。', 3500);
        }
    }

     // 清除按钮点击处理程序
    if (cleanButton && cleanTextInput && cleanOutputDisplay && notificationContainer && cleanTextCountSpan && cleanOutputCountSpan && copyCleanButton) {
         cleanButton.addEventListener('click', () => {
            const text = cleanTextInput.value;
            cleanOutputDisplay.textContent = '[清除结果将显示在此处]';
            if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
            copyCleanButton.disabled = true;

            if (!text) {
                showNotification('error', '错误：请粘贴需要清除零宽字符的文本！', 3500);
                return;
            }

            cleanButton.disabled = true;
            copyCleanButton.disabled = true;
            // 不再显示"正在清除零宽字符..."的通知

            setTimeout(() => {
                try {
                    if (typeof cleanZeroWidthChars !== 'function') {
                        throw new Error("零宽字符清除函数不可用。");
                    }
                    const cleanedText = cleanZeroWidthChars(text);

                    cleanOutputDisplay.textContent = cleanedText;
                    if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);

                    if (cleanedText.length < text.length) {
                        showNotification('success', '零宽字符清除成功！在文本中移除了 ' + (text.length - cleanedText.length) + ' 个零宽字符。', 3500);
                        copyCleanButton.disabled = false;
                    } else {
                        showNotification('info', '已完成清除操作，未检测到零宽字符或文本长度未改变。', 3500);
                        copyCleanButton.disabled = false;
                    }
                } catch (error) {
                    console.error("清除失败:", error);
                    showNotification('error', `清除过程中发生错误：${error.message}`, 3500);
                    cleanOutputDisplay.textContent = '[清除失败]';
                    if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
                    copyCleanButton.disabled = true;
                } finally {
                    cleanButton.disabled = false;
                }
            }, 10);
         });
    } else {
        console.error("未找到一个或多个清除元素！");
        if(notificationContainer) {
            showNotification('error', '应用加载错误，部分功能 (清除) 无法使用。请尝试刷新页面。', 3500);
        }
    }

    // 复制清除结果按钮点击事件处理
    if (copyCleanButton && cleanOutputDisplay && notificationContainer) {
        copyCleanButton.addEventListener('click', () => {
            // 检查输出是否为默认占位符或错误状态
            if (cleanOutputDisplay.textContent && cleanOutputDisplay.textContent !== '[清除结果将显示在此处]' && cleanOutputDisplay.textContent !== '[清除失败]') {
                 navigator.clipboard.writeText(cleanOutputDisplay.textContent)
                     .then(() => {
                         showNotification('info', '已清除零宽字符的文本已复制到剪贴板！', 3500);
                      })
                     .catch(err => {
                         console.error('复制失败:', err);
                         showNotification('error', '复制失败，请手动复制。', 3500);
                     });
             } else {
                  showNotification('warning', '没有可复制的内容。', 3500);
             }
        });
    } else {
        console.error("复制清除按钮或清除输出显示未找到!");
    }

    // 初始设置：默认显示"嵌入"标签并设置初始滑块值显示
     showTab('embed'); // 调用 showTab 同时初始清除并更新嵌入标签的计数
     if (densityValueSpan && densitySlider) {
         densityValueSpan.textContent = densitySlider.value;
     }

});