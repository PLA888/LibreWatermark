// main.js - Handles UI interactions and connects UI to watermark logic

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const statusMessage = document.getElementById('status-message'); // Get status message element

    // Function to show a specific tab
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

        // Find the button corresponding to the tabId and activate it
        const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        if (activeButton) {
             activeButton.classList.add('active');
        }

         // Clear status message and output when switching tabs
        if (statusMessage) {
            statusMessage.textContent = '';
            statusMessage.className = 'status'; // Reset classes
        }

        const embedOutputTextarea = document.getElementById('embed-output');
        const extractOutputDisplay = document.getElementById('extract-output');
        const copyButton = document.getElementById('copy-button');
         const embedTextInput = document.getElementById('embed-text'); // Need these for counts
         const embedTextCountSpan = document.getElementById('embed-text-count');
         const embedOutputCountSpan = document.getElementById('embed-output-count');

        if (embedOutputTextarea) embedOutputTextarea.value = '';
        if (extractOutputDisplay) extractOutputDisplay.textContent = '[提取结果将显示在此处]';

        // Disable copy button initially or when switching away from embed
        if (copyButton) copyButton.disabled = true;

         // Ensure counts are updated after tab switch
         if (embedTextInput && embedTextCountSpan) updateCharCount(embedTextInput, embedTextCountSpan);
         if (embedOutputTextarea && embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan); // Output is empty initially, count will be 0

    }

    // Add event listeners to tab buttons (using data-tab attribute)
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) {
                showTab(tabId);
            }
        });
    });

    // --- Get DOM elements ---
    // Embed elements
    const embedKeyInput = document.getElementById('embed-key');
    const embedWatermarkInput = document.getElementById('embed-watermark');
    const embedTextInput = document.getElementById('embed-text');
    const embedTextCountSpan = document.getElementById('embed-text-count'); // 获取原始文本计数span
    const densitySlider = document.getElementById('density-slider');
    const densityValueSpan = document.getElementById('density-value');
    const embedButton = document.getElementById('embed-button');
    const embedOutputTextarea = document.getElementById('embed-output');
    const embedOutputCountSpan = document.getElementById('embed-output-count'); // 获取带水印文本计数span
    const copyButton = document.getElementById('copy-button');

    // Extract elements
    const extractKeyInput = document.getElementById('extract-key');
    const extractTextInput = document.getElementById('extract-text');
    const extractButton = document.getElementById('extract-button');
    const extractOutputDisplay = document.getElementById('extract-output');

    // --- Event Listeners ---

    // Density slider update
    if (densitySlider && densityValueSpan) {
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value;
        });
    }

    // Function to update character count for a textarea
    function updateCharCount(textareaElement, countSpanElement) {
        if (textareaElement && countSpanElement) {
            const count = textareaElement.value.length;
            countSpanElement.textContent = `(${count} 字)`;
        }
    }

    // Embed text input count update
    if (embedTextInput && embedTextCountSpan) {
        embedTextInput.addEventListener('input', () => {
            updateCharCount(embedTextInput, embedTextCountSpan);
        });
    }

    // 片段1：修改嵌入按钮的点击事件处理逻辑，添加零宽字符检查
    // Check all required elements exist before adding listener
    if (embedButton && embedKeyInput && embedWatermarkInput && embedTextInput && embedOutputTextarea && densitySlider && copyButton && statusMessage && embedTextCountSpan && embedOutputCountSpan) {
        embedButton.addEventListener('click', () => {
            const key = embedKeyInput.value;
            const watermark = embedWatermarkInput.value;
            let text = embedTextInput.value; // Use 'let' because we might modify it
            const blockSize = parseInt(densitySlider.value, 10); // Get block size from slider
            statusMessage.textContent = ''; // Clear previous status
            statusMessage.className = 'status';

            if (!key || !watermark || !text) {
                statusMessage.textContent = '错误：密钥、水印内容和原始文本不能为空！';
                statusMessage.classList.add('error');
                return;
            }

            // --- Step 1: Check for pre-existing zero-width characters ---
            // Ensure the functions exist before calling
            if (typeof containsZeroWidthChars === 'function' && typeof cleanZeroWidthChars === 'function' && containsZeroWidthChars(text)) {
                const confirmClean = confirm(
                    "检测到原始文本中包含零宽字符，它们可能会干扰水印的嵌入和提取。\n\n" +
                    "是否清除原始文本中已有的零宽字符后再进行水印嵌入？\n\n" +
                    "点击“确定”清除并继续，点击“取消”中止操作。"
                );

                if (confirmClean) {
                    text = cleanZeroWidthChars(text);
                    embedTextInput.value = text; // Update the textarea with cleaned text
                    updateCharCount(embedTextInput, embedTextCountSpan); // Update count for cleaned text
                    statusMessage.textContent = '已清除原始文本中的零宽字符。';
                    statusMessage.className = 'status info'; // Use info class
                     // Small delay before proceeding to embedding process
                     setTimeout(() => startEmbedding(key, watermark, text, blockSize), 50);
                } else {
                    statusMessage.textContent = '操作已取消。';
                    statusMessage.className = 'status warning'; // Use warning class
                    // Re-enable button if it was disabled (though usually not disabled yet here)
                     embedButton.disabled = false;
                }
            } else {
                 // No zero-width characters found, or functions are missing, proceed directly to embedding
                 startEmbedding(key, watermark, text, blockSize);
            }
        });
    } else {
        console.error("One or more embed elements not found!");
        // Optionally display a user-friendly error on the page if critical elements are missing
         if(statusMessage) {
             statusMessage.textContent = '页面加载错误，部分功能无法使用。请刷新重试。';
             statusMessage.classList.add('error');
         }
    }

    // Function to handle the actual embedding process (moved from click handler)
    function startEmbedding(key, watermark, text, blockSize) {
         // Disable button during processing
        embedButton.disabled = true;
        statusMessage.textContent = '正在嵌入水印...';
        statusMessage.className = 'status info'; // Ensure correct classes

        // Use setTimeout to allow UI to update before heavy processing
        setTimeout(() => {
            try {
                // Ensure embedWatermark function exists
                 if (typeof embedWatermark !== 'function') {
                     throw new Error("Watermark embedding function is not available.");
                 }
                // Pass block size to embedWatermark
                const resultText = embedWatermark(text, key, watermark, blockSize);
                embedOutputTextarea.value = resultText;
                updateCharCount(embedOutputTextarea, embedOutputCountSpan); // 更新输出文本框计数
                statusMessage.textContent = '水印嵌入成功！';
                statusMessage.classList.add('success');

                // Enable copy button
                copyButton.disabled = false;

            } catch (error) {
                console.error("Embedding failed:", error);
                statusMessage.textContent = `嵌入失败：${error.message}`;
                statusMessage.classList.add('error');
                embedOutputTextarea.value = ''; // Clear output on error
                copyButton.disabled = true; // Disable copy on error
                updateCharCount(embedOutputTextarea, embedOutputCountSpan); // Update count to 0
            } finally {
                 // Re-enable button
                 embedButton.disabled = false;
            }
        }, 10); // Small delay
    }
// 片段1'

// 片段2：复制按钮和提取按钮逻辑不变
    // Copy Button Click
    if (copyButton && embedOutputTextarea && statusMessage) {
        copyButton.addEventListener('click', () => {
            if (embedOutputTextarea.value) {
                navigator.clipboard.writeText(embedOutputTextarea.value)
                    .then(() => {
                        statusMessage.textContent = '结果已复制到剪贴板！';
                        statusMessage.classList.add('info');
                        // Optional: clear status after a few seconds
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
                 statusMessage.classList.add('warning');
            }
        });
    } else {
         console.error("Copy button or output textarea not found!");
    }

    // Extract Button Click
     if (extractButton && extractKeyInput && extractTextInput && extractOutputDisplay && statusMessage) {
        extractButton.addEventListener('click', () => {
            const key = extractKeyInput.value;
            const text = extractTextInput.value;
            statusMessage.textContent = ''; // Clear previous status
            statusMessage.className = 'status';
            extractOutputDisplay.textContent = '[提取结果将显示在此处]'; // Reset output display

            if (!key || !text) {
                statusMessage.textContent = '错误：密钥和待提取文本不能为空！';
                statusMessage.classList.add('error');
                return;
            }

             // Disable button during processing
            extractButton.disabled = true;
             statusMessage.textContent = '正在尝试提取水印...';
             statusMessage.classList.add('info');

            // Use setTimeout to allow UI to update before heavy processing
            setTimeout(() => {
                 try {
                     // Ensure extractWatermark function exists
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
                     // This might catch errors from binaryToString if data is severely corrupted
                      console.error("Extraction failed:", error);
                      statusMessage.textContent = `提取过程中发生错误：${error.message}`;
                      statusMessage.classList.add('error');
                      extractOutputDisplay.textContent = '[提取失败]';
                 } finally {
                     // Re-enable button
                     extractButton.disabled = false;
                 }
            }, 10); // Small delay

        });
     } else {
         console.error("One or more extract elements not found!");
          // Optionally display a user-friendly error on the page if critical elements are missing
          if(statusMessage) {
              statusMessage.textContent = '页面加载错误，部分功能无法使用。请刷新重试。';
              statusMessage.classList.add('error');
          }
     }

    // Initial setup: show the 'embed' tab by default and set initial slider value display
     showTab('embed'); // This now uses the function above
     if (densityValueSpan && densitySlider) {
         densityValueSpan.textContent = densitySlider.value; // Initialize density value display
     }
     // Copy button initial state is handled within showTab now

    // Initial counts (moved into showTab function for better reset on tab change)
    // updateCharCount(embedTextInput, embedTextCountSpan);
    // updateCharCount(embedOutputTextarea, embedOutputCountSpan);

}); // End DOMContentLoaded
// 片段2'