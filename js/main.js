// main.js - Handles UI interactions and connects UI to watermark logic

document.addEventListener('DOMContentLoaded', () => {
    // --- Get UI Elements ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Embed elements
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

    // Extract elements
    const extractKeyInput = document.getElementById('extract-key');
    const extractTextInput = document.getElementById('extract-text');
    const extractTextCountSpan = document.getElementById('extract-text-count');
    const extractButton = document.getElementById('extract-button');
    const extractOutputDisplay = document.getElementById('extract-output');

    // Clean elements
    const cleanTextInput = document.getElementById('clean-text');
    const cleanTextCountSpan = document.getElementById('clean-text-count');
    const cleanButton = document.getElementById('clean-button');
    const cleanOutputDisplay = document.getElementById('clean-output');
    const cleanOutputCountSpan = document.getElementById('clean-output-count');
    const copyCleanButton = document.getElementById('copy-clean-button');

    // Notification container element
    const notificationContainer = document.getElementById('notification-container');

    // --- Notification System (Revised) ---

    /**
     * Shows a non-blocking notification message.
     * @param {string} type 'info', 'success', 'warning', 'error'
     * @param {string} messageText The message to display.
     * @param {number} [autoHideDelay=3000] Duration in ms for auto-hide. Use 0 or negative for manual close.
     */
    function showNotification(type, messageText, autoHideDelay = 3000) {
        if (!notificationContainer) {
            console.error('Notification container not found!');
            // Fallback to console for critical errors if container is missing
            const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
            console[consoleMethod](`Notification (${type.toUpperCase()}): ${messageText}`);
            alert(`Notification (${type.toUpperCase()}): ${messageText}`); // Maybe a basic alert
            return;
        }

        // Create notification element
        const notificationBox = document.createElement('div');
        notificationBox.classList.add('notification-box', type); // Add type class directly

        // Create message text element
        const messageSpan = document.createElement('span');
        messageSpan.classList.add('message');
        messageSpan.textContent = messageText;
        notificationBox.appendChild(messageSpan);

        let autoHideTimer = null;

        // Add a close button for manual close (duration <= 0)
        if (autoHideDelay <= 0) {
            const closeButton = document.createElement('button');
            closeButton.classList.add('close-btn');
            closeButton.innerHTML = '&times;'; // HTML entity for 'x'

            closeButton.addEventListener('click', () => {
                hideNotification(notificationBox);
                 if(autoHideTimer) clearTimeout(autoHideTimer); // Clear timer if manually closed
            });
            notificationBox.appendChild(closeButton);
        }

        // Add to container. Added using appendChild for column-reverse stacking in CSS.
        notificationContainer.appendChild(notificationBox);

        // Trigger auto-hide animation and removal if duration is positive
        if (autoHideDelay > 0) {
            autoHideTimer = setTimeout(() => {
                hideNotification(notificationBox);
            }, autoHideDelay);
        }

         // Remove notification from DOM after hiding animation completes
         notificationBox.addEventListener('animationend', (event) => {
             // Check if the animation is the 'hiding' animation
             if (event.animationName === 'slideInNotification' && notificationBox.classList.contains('hiding')) {
                notificationBox.remove();
             }
              // Handle case where box is removed *before* hide animation plays fully (e.g. tab switch)
              // Or simpler: handle removal at end of HIDE animation explicitly
         });
         // Alternative: Use transitionend if hiding is purely transition-based
         notificationBox.addEventListener('transitionend', () => {
              if (notificationBox.classList.contains('hiding')) {
                 notificationBox.remove();
              }
         });
         // Use both animationend (for entry) and transitionend (for exit) or pick one consistent method

         // Let's refine the hiding. Add 'hiding' class, let CSS transition it out, then remove on transitionend.
         // Initial animation is just for entry, so the 'hiding' class and transitionend is for controlling exit.

    }

    /**
     * Triggers the hide animation for a notification box (or all if box is null).
     * @param {HTMLElement|null} notificationBox The notification element to hide, or null to hide all.
     */
    function hideNotification(notificationBox = null) {
        if (notificationBox) {
            notificationBox.classList.add('hiding');
        } else {
            // Hide all notifications
            document.querySelectorAll('#notification-container .notification-box:not(.hiding)').forEach(box => {
                box.classList.add('hiding');
                 // Clear any auto-hide timers for these boxes
                 // This would require keeping a map of box elements to timers, more complex.
                 // For simplicity, just trigger the visual hide. The timer will still fire but remove an already hidden box.
            });
        }
         // Removal from DOM is handled by the transitionend listener on the box
    }

    // --- Helper Functions (Existing) ---

    // Function to update character count for an element
    function updateCharCount(element, countSpanElement) {
        if (element && countSpanElement) {
            const count = element.value !== undefined ? element.value.length : element.textContent.length;
            countSpanElement.textContent = `(${count} 字)`;
        }
    }

    // --- Tab Switching Logic ---
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

        // Hide ALL notifications on tab switch the quick way
        // A more graceful way would be to trigger hideNotification() for each, allowing transitionend
        // hideNotification(); // Call the function to hide all
         document.querySelectorAll('#notification-container .notification-box').forEach(box => hideNotification(box));

        // --- Reset and Update counts for each tab ---

        // Reset Embed tab
        if (embedTextInput) {
             embedTextInput.value = '';
             if (embedTextCountSpan) updateCharCount(embedTextInput, embedTextCountSpan);
        }
        if (embedOutputTextarea) {
             embedOutputTextarea.value = '';
             if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
        }
        if (copyEmbedButton) copyEmbedButton.disabled = true;

        // Reset Extract tab
        if (extractTextInput) {
             extractTextInput.value = '';
             if (extractTextCountSpan) updateCharCount(extractTextInput, extractTextCountSpan);
        }
        if (extractOutputDisplay) extractOutputDisplay.textContent = '[提取结果将显示在此处]';

        // Reset Clean tab
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

    // Add event listeners to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) {
                showTab(tabId);
            }
        });
    });

    // --- Event Listeners for Inputs (Character Count) ---
    if (embedTextInput && embedTextCountSpan) {
        embedTextInput.addEventListener('input', () => updateCharCount(embedTextInput, embedTextCountSpan));
    }
     if (extractTextInput && extractTextCountSpan) {
        extractTextInput.addEventListener('input', () => updateCharCount(extractTextInput, extractTextCountSpan));
    }
     if (cleanTextInput && cleanTextCountSpan) {
        cleanTextInput.addEventListener('input', () => updateCharCount(cleanTextInput, cleanTextCountSpan));
    }

    // --- Event Listeners for Buttons ---

    // Density slider update (Embed tab)
    if (densitySlider && densityValueSpan) {
        densitySlider.addEventListener('input', () => {
            densityValueSpan.textContent = densitySlider.value;
        });
    }

    // Embed Button Click Handler
    if (embedButton && embedKeyInput && embedWatermarkInput && embedTextInput && embedOutputTextarea && densitySlider && copyEmbedButton && notificationContainer) {
        embedButton.addEventListener('click', () => {
            const key = embedKeyInput.value;
            const watermark = embedWatermarkInput.value;
            let text = embedTextInput.value;
            const blockSize = parseInt(densitySlider.value, 10);

            // Clear previous output and status related to THIS tab operation
            embedOutputTextarea.value = '';
            if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
            copyEmbedButton.disabled = true;
            // Notifications are non-blocking, no need to clear them implicitly here

            if (!key || !watermark || !text) {
                showNotification('error', '错误：密钥、水印内容和原始文本不能为空！', 0);
                return;
            }

            // Check for pre-existing zero-width characters
            if (typeof containsZeroWidthChars === 'function') { // Only need contains for the check
                if (containsZeroWidthChars(text)) {
                    showNotification('warning', '检测到原始文本包含零宽字符，可能干扰水印。请先在“清除零宽字符”标签页处理后再嵌入。', 0);
                    embedButton.disabled = false;
                    copyEmbedButton.disabled = true;
                    // Stop processing here if ZW chars found
                    return;
                }
                 // If no ZW chars, proceed
                 startEmbedding(key, watermark, text, blockSize);

            } else {
                 console.error("containsZeroWidthChars function not found. Cannot perform pre-check.");
                 // Decide how to handle if JS is corrupted - maybe proceed with warning or throw error?
                 // Leaning towards proceeding with a console error, assuming it's a rare loading issue.
                 startEmbedding(key, watermark, text, blockSize);
            }
        });
    } else {
         console.error("One or more embed elements not found!");
         if(notificationContainer) {
              showNotification('error', '应用加载错误，部分功能 (嵌入) 无法使用。请尝试刷新页面。', 0);
         }
    }

    // Function to handle the actual embedding process (separated for async handling)
    function startEmbedding(key, watermark, text, blockSize) {
        embedButton.disabled = true;
        copyEmbedButton.disabled = true;
        const processingNotification = showNotification('info', '正在嵌入水印...', 0); // Show persistent info message

        // Use setTimeout to allow UI to update before heavy processing starts
        setTimeout(() => {
            try {
                 if (typeof embedWatermark !== 'function') {
                     throw new Error("Watermark embedding function is not available.");
                 }
                // Call the core embed logic
                const resultText = embedWatermark(text, key, watermark, blockSize);

                embedOutputTextarea.value = resultText;
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);

                // Hide processing message after operation completes
                hideNotification(processingNotification);

                if (resultText.length > text.length) {
                    showNotification('success', '水印嵌入成功！', 3000);
                    copyEmbedButton.disabled = false;
                } else if (watermark.length > 0 && resultText.length === text.length) {
                     // This case should ideally not happen if watermark > 0 and text is long enough due to the minimal length check
                     // If it still occurs, it might indicate a logic error or edge case near min length.
                     showNotification('warning', '水印嵌入完成，但输出文本长度未增加。可能水印被清空或长度不足。请检查。', 0); // Keep warning persistent
                     copyEmbedButton.disabled = false; // Allow copy of the base text
                } else { // watermark is empty or resulted in no change for valid reason (e.g. only symbols that don't encode)
                     showNotification('info', '没有水印内容可嵌入或操作未改变文本。', 3000);
                     copyEmbedButton.disabled = true;
                }

            } catch (error) {
                console.error("Embedding failed:", error);
                 // Hide processing message
                hideNotification(processingNotification);
                showNotification('error', `嵌入失败：${error.message}`, 0);
                embedOutputTextarea.value = '';
                if (embedOutputCountSpan) updateCharCount(embedOutputTextarea, embedOutputCountSpan);
                copyEmbedButton.disabled = true;
            } finally {
                 embedButton.disabled = false;
            }
        }, 10); // Small delay to allow UI to update before processing starts
    }

    // Copy Embed Result Button Click Handler
    if (copyEmbedButton && embedOutputTextarea && notificationContainer) {
        copyEmbedButton.addEventListener('click', () => {
            if (embedOutputTextarea.value) {
                navigator.clipboard.writeText(embedOutputTextarea.value)
                    .then(() => {
                        showNotification('info', '带水印的文本已复制到剪贴板！', 3000);
                     })
                    .catch(err => {
                        console.error('复制失败:', err);
                        showNotification('error', '复制失败，请手动复制。', 0);
                    });
            } else {
                 showNotification('warning', '没有可复制的内容。', 3000);
            }
        });
    } else {
         console.error("Copy embed button or embed output textarea not found!");
    }

    // Extract Button Click Handler
     if (extractButton && extractKeyInput && extractTextInput && extractOutputDisplay && notificationContainer && extractTextCountSpan) {
        extractButton.addEventListener('click', () => {
            const key = extractKeyInput.value;
            const text = extractTextInput.value;

            // Clear previous output and status
            extractOutputDisplay.textContent = '[提取结果将显示在此处]';

            if (!key || !text) {
                showNotification('error', '错误：密钥和待提取文本不能为空！', 0);
                return;
            }

            extractButton.disabled = true;
             const processingNotification = showNotification('info', '正在尝试提取水印...', 0);

            setTimeout(() => {
                 try {
                      if (typeof extractWatermark !== 'function') {
                         throw new Error("Watermark extraction function is not available.");
                      }
                     const extractedWatermark = extractWatermark(text, key);

                     // Hide processing message
                     hideNotification(processingNotification);

                     if (extractedWatermark !== null) {
                         extractOutputDisplay.textContent = extractedWatermark;
                         showNotification('success', '水印提取成功！', 3000);
                     } else {
                         extractOutputDisplay.textContent = '[未找到有效水印或密钥错误]';
                         showNotification('warning', '未能提取到有效水印。请检查输入的文本、密钥是否正确，文本是否被修改或零宽字符是否被移除。', 0);
                     }
                 } catch (error) {
                      console.error("Extraction failed:", error);
                       // Hide processing message
                      hideNotification(processingNotification);
                      showNotification('error', `提取过程中发生错误：${error.message}`, 0);
                      extractOutputDisplay.textContent = '[提取失败]';
                 } finally {
                     extractButton.disabled = false;
                 }
            }, 10);

        });
     } else {
         console.error("One or more extract elements not found!");
          if(notificationContainer) {
               showNotification('error', '应用加载错误，部分功能 (提取) 无法使用。请尝试刷新页面。', 0);
          }
     }

     // Clean Button Click Handler
    if (cleanButton && cleanTextInput && cleanOutputDisplay && notificationContainer && cleanTextCountSpan && cleanOutputCountSpan && copyCleanButton) {
         cleanButton.addEventListener('click', () => {
            const text = cleanTextInput.value;

            // Clear previous output and status
             cleanOutputDisplay.textContent = '[清除结果将显示在此处]';
             if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
             copyCleanButton.disabled = true;

            if (!text) {
                showNotification('error', '错误：请粘贴需要清除零宽字符的文本！', 0);
                return;
            }

             cleanButton.disabled = true;
             copyCleanButton.disabled = true;
             const processingNotification = showNotification('info', '正在清除零宽字符...', 0);

            setTimeout(() => {
                 try {
                      if (typeof cleanZeroWidthChars !== 'function') {
                         throw new Error("Zero-width cleaning function is not available.");
                      }
                     const cleanedText = cleanZeroWidthChars(text);

                    cleanOutputDisplay.textContent = cleanedText;
                    if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);

                    // Hide processing message
                    hideNotification(processingNotification);

                    if (cleanedText.length < text.length) {
                         showNotification('success', '零宽字符清除成功！在文本中移除了 ' + (text.length - cleanedText.length) + ' 个零宽字符。', 3000); // Add count of removed chars
                         copyCleanButton.disabled = false;
                    } else {
                         showNotification('info', '已完成清除操作，未检测到零宽字符或文本长度未改变。', 3000);
                          copyCleanButton.disabled = false;
                    }

                 } catch (error) {
                      console.error("Cleaning failed:", error);
                       // Hide processing message
                       hideNotification(processingNotification);
                      showNotification('error', `清除过程中发生错误：${error.message}`, 0);
                      cleanOutputDisplay.textContent = '[清除失败]';
                       if (cleanOutputCountSpan) updateCharCount(cleanOutputDisplay, cleanOutputCountSpan);
                       copyCleanButton.disabled = true;
                 } finally {
                     cleanButton.disabled = false;
                 }
            }, 10);
         });
    } else {
         console.error("One or more clean elements not found!");
          if(notificationContainer) {
               showNotification('error', '应用加载错误，部分功能 (清除) 无法使用。请尝试刷新页面。', 0);
          }
    }

    // Copy Clean Result Button Click Handler
     if (copyCleanButton && cleanOutputDisplay && notificationContainer) {
        copyCleanButton.addEventListener('click', () => {
            // Also check if output is default placeholder or error state
            if (cleanOutputDisplay.textContent && cleanOutputDisplay.textContent !== '[清除结果将显示在此处]' && cleanOutputDisplay.textContent !== '[清除失败]') {
                 navigator.clipboard.writeText(cleanOutputDisplay.textContent)
                     .then(() => {
                         showNotification('info', '已清除零宽字符的文本已复制到剪贴板！', 3000);
                      })
                     .catch(err => {
                         console.error('复制失败:', err);
                         showNotification('error', '复制失败，请手动复制。', 0);
                     });
             } else {
                  showNotification('warning', '没有可复制的内容。', 3000);
             }
        });
     } else {
          console.error("Copy clean button or clean output display not found!");
     }

    // Initial setup: show the 'embed' tab by default and set initial slider value display
     showTab('embed'); // Calling showTab clears and updates counts for embed tab initially as well
     if (densityValueSpan && densitySlider) {
         densityValueSpan.textContent = densitySlider.value;
     }

});