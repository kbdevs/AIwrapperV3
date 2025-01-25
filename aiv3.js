const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const imageUpload = document.getElementById('image-upload');
const imagePreview = document.getElementById('image-preview');
const loadingIndicator = document.getElementById('loading');

let messages = JSON.parse(localStorage.getItem('chatMessages')) || [];
let isLocked = false;

// Change ENABLE_PASSWORD to get its value from localStorage
let ENABLE_PASSWORD = localStorage.getItem('enablePassword') === 'true';
const PASSWORD = 'byebye';

// Add password toggle handler
document.addEventListener('DOMContentLoaded', () => {
    const passwordToggle = document.getElementById('password-toggle');
    passwordToggle.checked = ENABLE_PASSWORD;
    
    passwordToggle.addEventListener('change', () => {
        ENABLE_PASSWORD = passwordToggle.checked;
        localStorage.setItem('enablePassword', ENABLE_PASSWORD);
        
        if (ENABLE_PASSWORD) {
            promptPassword();
        } else {
            const overlay = document.querySelector('.blur-overlay');
            overlay.style.display = 'none';
            isLocked = false;
        }
    });
});

sendButton.addEventListener('click', handleSubmit);
clearButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the chat?')) {
        clearChat();
    }
});

// Replace the text input event listener with this
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
    }
    // Auto-resize the input
    setTimeout(() => {
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
    }, 0);
});

// Add new input event for immediate height adjustment
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = (userInput.scrollHeight) + 'px';
});

userInput.addEventListener('paste', handleImagePaste);

function handleImagePaste(e) {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = function(event) {
                imagePreview.src = event.target.result;
                imagePreview.style.display = 'block';
                console.log('Pasted Image:', imagePreview.src);
            }
            reader.readAsDataURL(file);
            break;
        }
    }
}

imageUpload.addEventListener('change', handleImageUpload);

async function handleSubmit() {
    const input = userInput.value.trim();
    const image = imagePreview.style.display !== 'none' ? imagePreview.src : null;

    if (!input && !image) return;

    const userMessageDiv = addMessage('user', input, image);
    userInput.value = '';
    imagePreview.style.display = 'none';
    imagePreview.src = '';

    loadingIndicator.style.display = 'block';
    
    try {
        // Create an initial empty assistant message
        const assistantMessageDiv = addMessage('assistant', '', null, false, true);
        await getOpenAIResponse(input, image, assistantMessageDiv);
    } catch (error) {
        console.error('Error:', error);
        addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Add this helper function at the top with other constants
function smoothScroll() {
    const lastMessage = chatContainer.lastElementChild;
    if (lastMessage) {
        // Add a small delay to account for content rendering
        setTimeout(() => {
            // Calculate extra padding (20px) to scroll a bit further
            const padding = 20;
            const scrollTarget = lastMessage.offsetTop + lastMessage.offsetHeight + padding;
            chatContainer.scrollTo({
                top: scrollTarget,
                behavior: 'smooth'
            });
        }, 0);
    }
}

async function getOpenAIResponse(input, image = null, messageDiv) {
    const API_ENDPOINT = 'https://cors.kbdevs.xyz/https://api.openai.com/v1/chat/completions';
    const API_KEY = localStorage.getItem('openai_api_key');

    if (!API_KEY) {
        throw new Error('Please enter an API key first');
    }

    // Add system message at the start of the conversation
    let apiMessages = [{
        role: 'system',
        content: 'Never use LaTeX or KaTeX notation in your responses. Use plain text or markdown for all mathematical expressions and equations.'
    }];

    // Add the rest of the messages
    apiMessages = apiMessages.concat(messages.map(msg => ({
        role: msg.role,
        content: msg.image ? [
            { type: 'text', text: msg.content },
            { type: 'image_url', image_url: { url: msg.image } }
        ] : msg.content
    })));

    apiMessages.push({ role: 'user', content: input });

    if (image) {
        apiMessages.push({
            role: 'user',
            content: [
                { type: 'text', text: 'This is the image I want to discuss:' },
                { type: 'image_url', image_url: { url: image } }
            ]
        });
    }

    const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: apiMessages,
            stream: true
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    const data = JSON.parse(line.slice(6));
                    const content = data.choices[0].delta.content || '';
                    fullContent += content;
                    
                    // Update message content with proper markdown rendering
                    const contentDiv = messageDiv.querySelector('.message-content');
                    contentDiv.innerHTML = formatMessageContent(fullContent);
                    
                    // Highlight any code blocks
                    contentDiv.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                    
                    smoothScroll(); // Add smooth scroll during streaming
                } catch (e) {
                    console.error('Error parsing stream:', e);
                }
            }
        }
    }

    // Save the complete message to history
    messages.push({ 
        role: 'assistant', 
        content: fullContent,
        timestamp: new Date().toLocaleTimeString()
    });
    localStorage.setItem('chatMessages', JSON.stringify(messages));

    return fullContent;
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            imagePreview.src = event.target.result;
            imagePreview.style.display = 'block';
            console.log('Uploaded Image:', imagePreview.src);
        }
        reader.readAsDataURL(file);
    }
}

function handleDrop(event) {
    event.preventDefault();
    if (event.dataTransfer.files?.length) {
        const file = event.dataTransfer.files[0];
        if (file && file.type.startsWith('image')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    }
}

// Add this function before it's used
function formatMessageContent(content) {
    if (!content) return '';
    const rendered = marked.parse(content);
    
    // Add language tags to code blocks
    const processedContent = rendered.replace(
        /<pre><code class="language-([^"]+)">/g,
        '<pre data-language="$1"><code class="language-$1">'
    );
    
    return processedContent;
}

function addMessage(role, content, image = null, isHistory = false, streaming = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${role}-message`);

    // Create content container to separate it from the copy button
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');

    if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = 'Uploaded Image';
        img.style.maxWidth = '200px';
        img.style.borderRadius = '8px';
        contentDiv.appendChild(img);
    }

    // Only format and add content if it exists and we're not streaming
    if (content && !streaming) {
        let formattedContent = '';
        if (role == "user" && image) {
            formattedContent = formatMessageContent("\n" + content);
        } else {
            formattedContent = formatMessageContent(content);
        }
        contentDiv.innerHTML = formattedContent;
    }

    // Create bottom container for timestamp and copy button
    const bottomContainer = document.createElement('div');
    bottomContainer.classList.add('message-bottom');

    // Add copy button (will be positioned left via CSS)
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.textContent = 'Copy';
    
    let copyTimeout;
    copyButton.addEventListener('click', async () => {
        // Get text content from the message-content div instead of the content parameter
        const textToCopy = contentDiv.textContent || '';
        try {
            await navigator.clipboard.writeText(textToCopy);
            copyButton.textContent = '✓ Copied!';
            copyButton.classList.add('copied');
            
            clearTimeout(copyTimeout);
            copyTimeout = setTimeout(() => {
                copyButton.textContent = 'Copy';
                copyButton.classList.remove('copied');
            }, 1500);
        } catch (err) {
            copyButton.textContent = '✗ Error';
            copyButton.classList.add('copy-error');
            
            clearTimeout(copyTimeout);
            copyTimeout = setTimeout(() => {
                copyButton.textContent = 'Copy';
                copyButton.classList.remove('copy-error');
            }, 1500);
        }
    });

    // Add timestamp (will be positioned right via CSS)
    const timestamp = document.createElement('div');
    timestamp.classList.add('timestamp');
    timestamp.textContent = isHistory ? content?.timestamp || new Date().toLocaleTimeString() : new Date().toLocaleTimeString();

    bottomContainer.appendChild(copyButton);
    bottomContainer.appendChild(timestamp);
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(bottomContainer);

    // Add to chat container and scroll
    chatContainer.appendChild(messageDiv);
    if (!isHistory) {
        smoothScroll();
    } else {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Only save to history if it's not a history message, not streaming, and has content
    if (!isHistory && !streaming && content) {
        const messageExists = messages.some(msg => msg.role === role && msg.content === content && msg.image === image);
        if (!messageExists) {
            messages.push({ role, content, image, timestamp: timestamp.textContent });
            localStorage.setItem('chatMessages', JSON.stringify(messages));
        }
    }

    // Return the message div for streaming updates
    return messageDiv;
}

function clearChat() {
    chatContainer.innerHTML = '';
    messages = [];
    localStorage.removeItem('chatMessages');
}

function loadChatHistory() {
    messages.forEach(msg => {
        const { role, content, image } = msg;
        addMessage(role, content, image, true);
    });
}

// Add this after the constants
if (!ENABLE_PASSWORD) {
    document.querySelector('.blur-overlay').style.display = 'none';
}

function promptPassword() {
    if (!ENABLE_PASSWORD) {
        document.querySelector('.blur-overlay').style.display = 'none';
        isLocked = false;
        return;
    }

    const overlay = document.querySelector('.blur-overlay');
    const passwordInput = document.querySelector('#password-input');
    const unlockButton = document.querySelector('#unlock-button');
    const errorMessage = document.querySelector('.password-error');

    function showError() {
        errorMessage.style.display = 'block';
        passwordInput.style.outline = '2px solid #e74c3c';
        setTimeout(() => {
            errorMessage.style.display = 'none';
            passwordInput.style.outline = '';
        }, 2000);
    }

    function checkPassword() {
        if (passwordInput.value === PASSWORD) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 300);
            isLocked = false;
        } else {
            showError();
            passwordInput.value = '';
        }
    }

    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 0);

    unlockButton.addEventListener('click', checkPassword);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkPassword();
    });
    passwordInput.focus();
}

// Update the visibility change handler
document.addEventListener('visibilitychange', () => {
    if (!ENABLE_PASSWORD) return;
    
    if (document.hidden) {
        isLocked = true;
        const overlay = document.querySelector('.blur-overlay');
        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 0);
    } else if (isLocked) {
        const passwordInput = document.querySelector('#password-input');
        passwordInput.value = '';
        passwordInput.focus();
    }
});

// Add this event listener after all the other event listeners
window.onload = function() {
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyButton = document.getElementById('save-api-key');

    if (apiKeyInput && saveApiKeyButton) {
        // Load saved API key if it exists
        apiKeyInput.value = localStorage.getItem('openai_api_key') || '';

        // Add event listener for saving API key
        saveApiKeyButton.addEventListener('click', () => {
            const apiKey = apiKeyInput.value.trim();
            localStorage.setItem('openai_api_key', apiKey);
            alert('API key saved!');
        });
    }

    // Move loadChatHistory here to ensure it runs after everything is loaded
    loadChatHistory();
};

// Initialize with password prompt only if enabled
isLocked = ENABLE_PASSWORD;
if (ENABLE_PASSWORD) {
    promptPassword();
} else {
    document.querySelector('.blur-overlay').style.display = 'none';
}

// Add these functions near the top with other functions
function lockScreen() {
    if (ENABLE_PASSWORD && !isLocked) {
        isLocked = true;
        const overlay = document.querySelector('.blur-overlay');
        const passwordInput = document.querySelector('#password-input');
        
        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.style.opacity = '1';
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }, 0);
    }
}

// Replace the existing mouseleave event listener with these
document.documentElement.addEventListener('mouseleave', lockScreen);
document.documentElement.addEventListener('mouseout', (e) => {
    if (e.toElement === null && e.relatedTarget === null) {
        lockScreen();
    }
});