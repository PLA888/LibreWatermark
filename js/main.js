// main.js - Handles UI interactions and connects UI to watermark logic

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    window.showTab = function(tabId) {
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        document.getElementById(tabId).classList.add('active');
        // Find the button corresponding to the tabId and activate it
        // Assumes button onclick is like "showTab('embed')"
        document.querySelector(`.tab-button[onclick="showTab('${tabId}')"]`).classList.add('active');
    }

    // --- Get DOM elements ---
    // Embed elements
    const embedKeyInput = document.getElementById('embed-key');
    const embedWatermarkInput = document.getElementById('embed-watermark');
    const embedTextInput = document.getElementById('embed-text');
    const embedButton = document.getElementById('embed-button');
    const embedOutputTextarea = document.getElementById('embed-output');
    const copyButton = document.getElementById('copy-button');

    // Extract elements
    const extractKeyInput = document.getElementById('extract-key');
    const extractTextInput = document.getElementById('extract-text');
    const extractButton = document.getElementById('extract-button');
    const extractOutputDisplay = document.getElementById('extract-output');

    // Status message element
    const statusMessage = document.getElementById('status-message');

    // --- Event Listeners ---

    // Embed Button Click
    embedButton.addEventListener('click', () => {
        const key = embedKeyInput.value;
        const watermark = embedWatermarkInput.value;
        const text = embedTextInput.value;
        statusMessage.textContent = ''; // Clear previous status

        if (!key || !watermark || !text) {
            statusMessage.textContent = '错误：密钥、水印内容和原始文本不能为空！';
            statusMessage.style.color = '#d9534f'; // Error color
            return;
        }

        try {
            const resultText = embedWatermark(text, key, watermark);
            embedOutputTextarea.value = resultText;
             statusMessage.textContent = '水印嵌入成功！';
             statusMessage.style.color = '#5cb85c'; // Success color
        } catch (error) {
            console.error("Embedding failed:", error);
            statusMessage.textContent = `嵌入失败：${error.message}`;
            statusMessage.style.color = '#d9534f';
             embedOutputTextarea.value = ''; // Clear output on error
        }
    });

    // Copy Button Click
    copyButton.addEventListener('click', () => {
        if (embedOutputTextarea.value) {
            navigator.clipboard.writeText(embedOutputTextarea.value)
                .then(() => {
                    statusMessage.textContent = '结果已复制到剪贴板！';
                    statusMessage.style.color = '#5bc0de'; // Info color
                 })
                .catch(err => {
                    console.error('复制失败:', err);
                    statusMessage.textContent = '复制失败，请手动复制。';
                    statusMessage.style.color = '#d9534f';
                });
        } else {
             statusMessage.textContent = '没有可复制的内容。';
             statusMessage.style.color = '#f0ad4e'; // Warning color
        }
    });

    // Extract Button Click
    extractButton.addEventListener('click', () => {
        const key = extractKeyInput.value;
        const text = extractTextInput.value;
        statusMessage.textContent = ''; // Clear previous status
        extractOutputDisplay.textContent = '[提取结果将显示在此处]'; // Reset output display

        if (!key || !text) {
            statusMessage.textContent = '错误：密钥和待提取文本不能为空！';
            statusMessage.style.color = '#d9534f';
            return;
        }

        try {
            const extractedWatermark = extractWatermark(text, key);

            if (extractedWatermark !== null) {
                extractOutputDisplay.textContent = extractedWatermark;
                 statusMessage.textContent = '水印提取成功！';
                 statusMessage.style.color = '#5cb85c';
            } else {
                extractOutputDisplay.textContent = '[未找到有效水印或密钥错误]';
                 statusMessage.textContent = '未能提取到有效水印。请检查文本和密钥是否正确。';
                 statusMessage.style.color = '#f0ad4e'; // Warning color
            }
        } catch (error) {
            // This might catch errors from binaryToString if data is severely corrupted
             console.error("Extraction failed:", error);
             statusMessage.textContent = `提取过程中发生错误：${error.message}`;
             statusMessage.style.color = '#d9534f';
             extractOutputDisplay.textContent = '[提取失败]';
        }
    });

    // Initial setup: show the 'embed' tab by default
     showTab('embed');

}); // End DOMContentLoaded