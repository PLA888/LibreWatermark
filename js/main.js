// main.js - Handles UI interactions and connects UI to watermark logic

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const statusMessage = document.getElementById('status-message');

    // Function to show a specific tab and reset content
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

         // Clear status message on tab switch
        if (statusMessage) {
            statusMessage.textContent = '';
            statusMessage.className = 'status'; // Reset classes
        }

        // Reset content and update counts for each tab
        const embedTextInput = document.getElementById('embed-text');
        const embedTextCountSpan = document.getElementById('embed-text-count');
        const embedOutputTextarea = document.getElementById('embed-output');
        const embedOutputCountSpan = document.getElementById('embed-output-count');
        const copyButton = document.getElementById('copy-button');

        const extractTextInput = document.getElementById('extract-text');
        const extractOutputDisplay = document.getElementById('extract-output');

        // 新增 清除零宽字符 Tab 元素
        const cleanTextInput = document.getElementById('clean-text');
        const cleanTextCountSpan = document.getElementById('clean-text-count');
        const cleanOutputDisplay = document.getElementById('clean-output');
        const cleanOutputCountSpan = document.getElementById('clean-output-count');

        // Reset Embed tab
        if (embedTextInput) updateCharCount(embedTextInput, embedTextCountSpan);
        if (embedOutputTextarea) embedOutputTextarea.value = '';
        if (embedOutputTextarea) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
        if (copyButton) copyButton.disabled = true;

        // Reset Extract tab
        if (extractTextInput) updateCharCount(extractTextInput, document.getElementById('extract-text-count')); // Ensure extract has a count span too if needed (it doesn't in HTML yet, but good practice) - skip for now to match HTML
        if (extractOutputDisplay) extractOutputDisplay.textContent = '[提取结果将显示在此处]';

        // Reset Clean tab
        if (cleanTextInput) {
             cleanTextInput.value = '';
            updateCharCount(cleanTextInput, cleanTextCountSpan);
        }
        if (cleanOutputDisplay) {
             cleanOutputDisplay.textContent = '[清除结果将显示在此处]';
             // No count span for clean output display in HTML yet, skip update
         }
    }

    // Add event listeners to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) {
                showTab(tabId);
            }
        });
    });

    // --- Get DOM elements (Embed and Extract from previous version) ---
    const embedKeyInput = document.getElementById('embed-key');
    const embedWatermarkInput = document.getElementById('embed-watermark');
    const embedTextInput = document.getElementById('embed-text');
    const embedTextCountSpan = document.getElementById('embed-text-count');
    const densitySlider = document.getElementById('density-slider');
    const densityValueSpan = document.getElementById('density-value');
    const embedButton = document.getElementById('embed-button');
    const embedOutputTextarea = document.getElementById('embed-output');
    const embedOutputCountSpan = document.getElementById('embed-output-count');
    const copyButton = document.getElementById('copy-button');

    const extractKeyInput = document.getElementById('extract-key');
    const extractTextInput = document.getElementById('extract-text');
     // Assuming extract text input might need a count span too for consistency, let's add it's DOM query here IF it exists in HTML
     const extractTextCountSpan = document.getElementById('extract-text-count'); // Check your HTML if this exists or add it
    const extractButton = document.getElementById('extract-button');
    const extractOutputDisplay = document.getElementById('extract-output');

    // --- 新增 DOM elements for Clean tab ---
    const cleanTextInput = document.getElementById('clean-text');
    const cleanTextCountSpan = document.getElementById('clean-text-count'); // Check HTML if this exists or add it
    const cleanButton = document.getElementById('clean-button');
    const cleanOutputDisplay = document.getElementById('clean-output');
    const cleanOutputCountSpan = document.getElementById('clean-output-count'); // Check HTML if this exists or add it (output is <p>, not textarea)

    // --- Event Listeners ---

    // Density slider update (Embed tab)
    if (densitySlider && densityValueSpan) {
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value;
        });
    }

    // Function to update character count for a textarea or element with textContent
    function updateCharCount(element, countSpanElement) {
        if (element && countSpanElement) {
            // Use .value for textarea/input, .textContent for others like <p>
            const count = element.value !== undefined ? element.value.length : element.textContent.length;
            countSpanElement.textContent = `(${count} 字)`;
        }
    }

    // Embed text input count update
    if (embedTextInput && embedTextCountSpan) {
        embedTextInput.addEventListener('input', () => {
            updateCharCount(embedTextInput, embedTextCountSpan);
        });
    }

    // Embed output text count update (should happen after embed)
    // This is called inside startEmbedding function now

    // Extract text input count update (Add listener if span exists)
     if (extractTextInput && extractTextCountSpan) {
        extractTextInput.addEventListener('input', () => {
            updateCharCount(extractTextInput, extractTextCountSpan);
        });
    }

    // Clean text input count update
     if (cleanTextInput && cleanTextCountSpan) {
        cleanTextInput.addEventListener('input', () => {
            updateCharCount(cleanTextInput, cleanTextCountSpan);
        });
    }

     // Clean output display count update (should happen after clean)
     // This will be called inside the clean button handler

    // Embed Button Click Handler
    if (embedButton && embedKeyInput && embedWatermarkInput && embedTextInput && embedOutputTextarea && densitySlider && copyButton && statusMessage && embedTextCountSpan && embedOutputCountSpan) {
        embedButton.addEventListener('click', () => {
            const key = embedKeyInput.value;
            const watermark = embedWatermarkInput.value;
            let text = embedTextInput.value; // Use 'let' because we might modify it
            const blockSize = parseInt(densitySlider.value, 10);
            statusMessage.textContent = '';
            statusMessage.className = 'status';

            if (!key || !watermark || !text) {
                statusMessage.textContent = '错误：密钥、水印内容和原始文本不能为空！';
                statusMessage.classList.add('error');
                return;
            }

            // Check for pre-existing zero-width characters
            if (typeof containsZeroWidthChars === 'function' && typeof cleanZeroWidthChars === 'function' && containsZeroWidthChars(text)) {
                const confirmClean = confirm(
                    "检测到原始文本中包含零宽字符，它们可能会干扰水印的嵌入和提取。\n\n" +
                    "是否清除原始文本中已有的零宽字符后再进行水印嵌入？\n\n" +
                    "点击“确定”清除并继续，点击“取消”中止操作。"
                );

                if (confirmClean) {
                    text = cleanZeroWidthChars(text);
                    embedTextInput.value = text;
                    updateCharCount(embedTextInput, embedTextCountSpan);
                    statusMessage.textContent = '已清除原始文本中的零宽字符。';
                    statusMessage.className = 'status info';
                     setTimeout(() => startEmbedding(key, watermark, text, blockSize), 50);
                } else {
                    statusMessage.textContent = '操作已取消。';
                    statusMessage.className = 'status warning';
                     embedButton.disabled = false;
                }
            } else {
                 startEmbedding(key, watermark, text, blockSize);
            }
        });
    } else {
        console.error("One or more embed elements not found!");
         if(statusMessage) {
             statusMessage.textContent = '页面加载错误，部分功能无法使用。';
             statusMessage.classList.add('error');
         }
    }

    // Function to handle the actual embedding process
    function startEmbedding(key, watermark, text, blockSize) {
        embedButton.disabled = true;
        statusMessage.textContent = '正在嵌入水印...';
        statusMessage.className = 'status info';

        setTimeout(() => {
            try {
                 if (typeof embedWatermark !== 'function') {
                     throw new Error("Watermark embedding function is not available.");
                 }
                const resultText = embedWatermark(text, key, watermark, blockSize);
                embedOutputTextarea.value = resultText;
                updateCharCount(embedOutputTextarea, embedOutputCountSpan);
                statusMessage.textContent = '水印嵌入成功！';
                statusMessage.classList.add('success');

                copyButton.disabled = false;

            } catch (error) {
                console.error("Embedding failed:", error);
                statusMessage.textContent = `嵌入失败：${error.message}`;
                statusMessage.classList.add('error');
                embedOutputTextarea.value = '';
                copyButton.disabled = true;
                updateCharCount(embedOutputTextarea, embedOutputCountSpan);
            } finally {
                 embedButton.disabled = false;
            }
        }, 10);
    }

    // Copy Button Click Handler
    if (copyButton && embedOutputTextarea && statusMessage) {
        copyButton.addEventListener('click', () => {
            if (embedOutputTextarea.value) {
                navigator.clipboard.writeText(embedOutputTextarea.value)
                    .then(() => {
                        statusMessage.textContent = '结果已复制到剪贴板！';
                        statusMessage.className = 'status info'; // Use correct class
                         setTimeout(() => {
                              statusMessage.textContent = '';
                              statusMessage.className = 'status';
                         }, 3000);
                     })
                    .catch(err => {
                        console.error('复制失败:', err);
                        statusMessage.textContent = '复制失败，请手动复制。';
                        statusMessage.classList.add('error');
                    });
            } else {
                 statusMessage.textContent = '没有可复制的内容。';
                 statusMessage.className = 'status warning';
            }
        });
    } else {
         console.error("Copy button or embed output textarea not found!");
    }

    // Extract Button Click Handler
     if (extractButton && extractKeyInput && extractTextInput && extractOutputDisplay && statusMessage) {
        extractButton.addEventListener('click', () => {
            const key = extractKeyInput.value;
            const text = extractTextInput.value;
            statusMessage.textContent = '';
            statusMessage.className = 'status';
            extractOutputDisplay.textContent = '[提取结果将显示在此处]';

            if (!key || !text) {
                statusMessage.textContent = '错误：密钥和待提取文本不能为空！';
                statusMessage.classList.add('error');
                return;
            }

            extractButton.disabled = true;
             statusMessage.textContent = '正在尝试提取水印...';
             statusMessage.classList.add('info');

            setTimeout(() => {
                 try {
                      if (typeof extractWatermark !== 'function') {
                         throw new Error("Watermark extraction function is not available.");
                      }
                     const extractedWatermark = extractWatermark(text, key);

                     if (extractedWatermark !== null) {
                         extractOutputDisplay.textContent = extractedWatermark;
                         statusMessage.textContent = '水印提取成功！';
                         statusMessage.classList.add('success');
                     } else {
                         extractOutputDisplay.textContent = '[未找到有效水印或密钥错误]';
                         statusMessage.textContent = '未能提取到匹配密钥和认证码的有效水印。请检查文本和密钥是否正确，或文本是否被严重修改。';
                         statusMessage.classList.add('warning');
                     }
                 } catch (error) {
                      console.error("Extraction failed:", error);
                      statusMessage.textContent = `提取过程中发生错误：${error.message}`;
                      statusMessage.classList.add('error');
                      extractOutputDisplay.textContent = '[提取失败]';
                 } finally {
                     extractButton.disabled = false;
                 }
            }, 10);

        });
     } else {
         console.error("One or more extract elements not found!");
          if(statusMessage) {
              statusMessage.textContent = '页面加载错误，部分功能无法使用。';
              statusMessage.classList.add('error');
          }
     }

     // --- 新增 Clean Button Click Handler ---
    if (cleanButton && cleanTextInput && cleanOutputDisplay && statusMessage && cleanTextCountSpan && cleanOutputCountSpan) {
         cleanButton.addEventListener('click', () => {
            const text = cleanTextInput.value;
            statusMessage.textContent = '';
            statusMessage.className = 'status';
            cleanOutputDisplay.textContent = '[清除结果将显示在此处]'; // Reset output display

            if (!text) {
                statusMessage.textContent = '错误：请粘贴需要清除零宽字符的文本！';
                statusMessage.classList.add('error');
                return;
            }

             cleanButton.disabled = true;
             statusMessage.textContent = '正在清除零宽字符...';
             statusMessage.classList.add('info');

            setTimeout(() => {
                 try {
                      if (typeof cleanZeroWidthChars !== 'function') {
                         throw new Error("Zero-width cleaning function is not available.");
                      }
                     const cleanedText = cleanZeroWidthChars(text);

                    cleanOutputDisplay.textContent = cleanedText;
                    updateCharCount(cleanOutputDisplay, cleanOutputCountSpan); // Update count for the clean output display
                    statusMessage.textContent = '零宽字符清除成功！';
                    statusMessage.classList.add('success');

                 } catch (error) {
                      console.error("Cleaning failed:", error);
                      statusMessage.textContent = `清除过程中发生错误：${error.message}`;
                      statusMessage.classList.add('error');
                      cleanOutputDisplay.textContent = '[清除失败]';
                       updateCharCount(cleanOutputDisplay, cleanOutputCountSpan); // Update count to reflect failure
                 } finally {
                     cleanButton.disabled = false;
                 }
            }, 10);
         });
    } else {
         console.error("One or more clean elements not found!");
          if(statusMessage) {
              statusMessage.textContent = '页面加载错误，部分功能无法使用。';
              statusMessage.classList.add('error');
          }
    }

    // Initial setup: show the 'embed' tab by default and set initial slider value display
     showTab('embed');
     if (densityValueSpan && densitySlider) {
         densityValueSpan.textContent = densitySlider.value;
     }

     // Initial counts and other resets are now handled by showTab('embed')
});