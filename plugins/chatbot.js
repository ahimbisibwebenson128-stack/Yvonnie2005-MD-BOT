const { Module } = require("../main");
const config = require("../config");
const axios = require("axios");
const fromMe = config.MODE !== "public";
const { setVar } = require("./manage");
const fs = require("fs");
const Jimp = require("jimp");

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL = "gemini-3.8-flash";
const models = [MODEL];
const chatbotStates = new Map();
const chatContexts = new Map();

let globalSystemPrompt =
  "You are a helpful AI assistant named YVONNIE2005. Be concise, friendly, and informative.";

function getSystemPrompt() {
  return config.CHATBOT_SYSTEM_PROMPT || globalSystemPrompt;
}

async function initChatbotData() {
  try {
    const chatbotData = config.CHATBOT || "";
    if (chatbotData) {
      const enabledChats = chatbotData.split(",").filter((jid) => jid.trim());
      enabledChats.forEach((jid) => {
        chatbotStates.set(jid.trim(), true);
      });
    }

    const systemPrompt = config.CHATBOT_SYSTEM_PROMPT;
    if (systemPrompt) {
      globalSystemPrompt = systemPrompt;
    }
  } catch (error) {
    console.error("Error initializing chatbot data:", error);
  }
}

async function saveChatbotData() {
  try {
    const enabledChats = [];
    for (const [jid, enabled] of chatbotStates.entries()) {
      if (enabled) {
        enabledChats.push(jid);
      }
    }
    await setVar("CHATBOT", enabledChats.join(","));
  } catch (error) {
    console.error("Error saving chatbot data:", error);
  }
}

async function saveSystemPrompt(prompt) {
  try {
    globalSystemPrompt = prompt;
    await setVar("CHATBOT_SYSTEM_PROMPT", prompt);
  } catch (error) {
    console.error("Error saving system prompt:", error);
  }
}

async function imageToGenerativePart(imageBuffer) {
  try {
    // Normalize supported WhatsApp image formats to JPEG. The original code
    // labelled every buffer as JPEG, even when the bytes were PNG or WebP.
    const image = await Jimp.read(imageBuffer);
    const jpegBuffer = await image.quality(85).getBufferAsync(Jimp.MIME_JPEG);
    return { inlineData: { mimeType: "image/jpeg", data: jpegBuffer.toString("base64") } };
  } catch (error) {
    console.error("Error processing image:", error.message);
    return null;
  }
}

function extractResponseText(data) {
  if (!data || !data.candidates || data.candidates.length === 0) {
    return null;
  }
  const candidate = data.candidates[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }

  // Filter out thinking parts (where thought is true)
  const contentParts = parts.filter(
    (part) => !part.thought && typeof part.text === "string",
  );
  if (contentParts.length > 0) {
    return contentParts
      .map((p) => p.text)
      .join("")
      .trim();
  }

  // Fallback to any part containing text
  const anyTextParts = parts.filter((part) => typeof part.text === "string");
  if (anyTextParts.length > 0) {
    return anyTextParts
      .map((p) => p.text)
      .join("")
      .trim();
  }

  return null;
}

async function postWithRetry(url, payload, options, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.post(url, payload, options);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const retryable = !status || [408, 429, 500, 502, 503, 504].includes(status);
      if (!retryable || attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function callGeminiAPI(apiKey, contents, systemText = globalSystemPrompt, model = MODEL, includeSearch = true) {
  const apiUrl = `${API_BASE_URL}${model}:generateContent?key=${apiKey}`;
  const payload = {
    systemInstruction: {
      parts: [{ text: systemText }],
    },
    contents: contents,
    ...(includeSearch ? { tools: [{ googleSearch: {} }] } : {}),
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.7,
      thinkingConfig: {
        thinkingLevel: "HIGH",
      },
    },
  };

  const requestHeaders = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };

  try {
    return await postWithRetry(apiUrl, payload, {
      headers: requestHeaders,
      timeout: 45000,
    });
  } catch (err) {
    if (
      err.response &&
      err.response.status === 400 &&
      (payload.tools || payload.generationConfig?.thinkingConfig)
    ) {
      console.warn(
        "Gemini request failed with 400, retrying without optional tools/thinkingConfig:",
        err.response.data?.error?.message || err.message,
      );
      const fallbackPayload = {
        systemInstruction: payload.systemInstruction,
        contents: payload.contents,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
      };
      return await postWithRetry(apiUrl, fallbackPayload, {
        headers: requestHeaders,
        timeout: 45000,
      });
    }
    throw err;
  }
}

async function callAIAPI(apiKey, contents, systemText = globalSystemPrompt, hasImage = false) {
  // Gemini 3.8 Flash is the primary multimodal model. Gemini 3.5 Flash-Lite
  // is used as a recovery model for transient provider failures.
  const primary = MODEL;
  try {
    return await callGeminiAPI(apiKey, contents, systemText, primary, !hasImage);
  } catch (error) {
    const status = error.response?.status;
    const transient = !status || status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
    if (!transient || primary === "gemini-3.5-flash-lite") throw error;
    console.warn("Primary AI model unavailable; retrying with Gemini Flash-Lite:", error.message);
    return await callGeminiAPI(apiKey, contents, systemText, "gemini-3.5-flash-lite", false);
  }
}

async function getAIResponse(message, chatJid, imageBuffer = null) {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    return "_❌ GEMINI_API_KEY not configured. Please set it using `.setvar GEMINI_API_KEY your_api_key`_";
  }

  try {
    const context = chatContexts.get(chatJid) || [];
    const contents = [];

    const recentContext = context.slice(-10);
    let startIndex = 0;
    if (recentContext.length > 0 && recentContext[0].role === "model") {
      startIndex = 1;
    }
    for (let i = startIndex; i < recentContext.length; i++) {
      const msg = recentContext[i];
      if (msg.role && msg.text) {
        contents.push({
          role: msg.role === "assistant" ? "model" : msg.role,
          parts: [{ text: msg.text }],
        });
      }
    }

    const currentParts = [{ text: message }];
    if (imageBuffer) {
      const imagePart = await imageToGenerativePart(imageBuffer);
      if (!imagePart) return "_❌ I could not process that image format. Please send a JPG or PNG image._";
      currentParts.push(imagePart);
    }

    contents.push({
      role: "user",
      parts: currentParts,
    });

    const response = await callAIAPI(apiKey, contents, getSystemPrompt(), Boolean(imageBuffer));
    const aiResponse = extractResponseText(response.data);
    if (aiResponse) {
      if (!chatContexts.has(chatJid)) {
        // Prevent unbounded memory growth if interacting across thousands of chats
        if (chatContexts.size >= 500) {
          const oldestChatKey = chatContexts.keys().next().value;
          if (oldestChatKey) chatContexts.delete(oldestChatKey);
        }
        chatContexts.set(chatJid, []);
      }
      const contextArray = chatContexts.get(chatJid);
      const contextMessage = imageBuffer
        ? `${message} [Image included]`
        : message;
      contextArray.push({ role: "user", text: contextMessage });
      contextArray.push({ role: "model", text: aiResponse });

      if (contextArray.length > 20) {
        contextArray.splice(0, contextArray.length - 20);
      }

      return aiResponse;
    } else {
      return "_❌ Received unexpected response from AI. Please try again._";
    }
  } catch (error) {
    console.error("Error getting AI response:", error.message);

    if (error.response && error.response.status === 429) {
      return "_⚠️ Rate limit reached. Please try again later._";
    }

    if (error.response) {
      return `_❌ API Error: ${
        error.response.data?.error?.message || "Unknown error"
      }_`;
    }

    return "_❌ Network error. Please check your connection and try again._";
  }
}

function isEnabledValue(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function isChatbotEnabled(jid) {
  if (chatbotStates.get(jid) === true) return true;
  const isGroup = jid.includes("@g.us");
  if (isGroup && isEnabledValue(config.CHATBOT_ALL_GROUPS)) return true;
  if (!isGroup && isEnabledValue(config.CHATBOT_ALL_DMS)) return true;
  return false;
}

async function enableChatbot(jid) {
  chatbotStates.set(jid, true);
  await saveChatbotData();
}

async function disableChatbot(jid) {
  chatbotStates.set(jid, false);

  chatContexts.delete(jid);
  await saveChatbotData();
}

function clearContext(jid) {
  chatContexts.delete(jid);
}

async function clearAllContexts(target) {
  if (target === "groups") {
    for (const [jid] of chatbotStates.entries()) {
      if (jid.includes("@g.us")) {
        clearContext(jid);
      }
    }
  } else if (target === "dms") {
    for (const [jid] of chatbotStates.entries()) {
      if (!jid.includes("@g.us")) {
        clearContext(jid);
      }
    }
  }
}

initChatbotData();

Module(
  {
    pattern: "chatbot ?(.*)",
    fromMe: true,
    desc: "AI Chatbot management with Gemini API - supports text and image analysis",
    usage:
      '.chatbot - _Show help menu_\n.chatbot on/off - _Enable/disable in current chat_\n.chatbot on/off groups - _Enable/disable in all groups_\n.chatbot on/off dms - _Enable/disable in all DMs_\n.chatbot set "prompt" - _Set system prompt_\n.chatbot clear - _Clear conversation context_\n_Reply to images for AI image analysis_',
  },
  async (message, match) => {
    const input = match[1]?.trim();
    const chatJid = message.jid;

    if (!input) {
      const isEnabled = isChatbotEnabled(chatJid);
      const globalGroups = isEnabledValue(config.CHATBOT_ALL_GROUPS);
      const globalDMs = isEnabledValue(config.CHATBOT_ALL_DMS);
      const currentModel = MODEL;
      const contextSize = chatContexts.get(chatJid)?.length || 0;
      const hasApiKey = !!config.GEMINI_API_KEY;

      const helpText =
        `*_🤖 AI Chatbot Management_*\n\n` +
        `📊 _Current Status:_ \`${isEnabled ? "Enabled" : "Disabled"}\`\n` +
        `🔑 _API Key:_ \`${hasApiKey ? "Configured ✅" : "Missing ❌"}\`\n` +
        `🌐 _Global Groups:_ \`${
          globalGroups ? "Enabled ✅" : "Disabled ❌"
        }\`\n` +
        `💬 _Global DMs:_ \`${globalDMs ? "Enabled ✅" : "Disabled ❌"}\`\n` +
        `🤖 _Model:_ \`${currentModel}\`\n` +
        `💭 _Context Messages:_ \`${contextSize}\`\n` +
        `🎯 _System Prompt:_ \`${getSystemPrompt().substring(0, 100)}${
          getSystemPrompt().length > 100 ? "..." : ""
        }\`\n\n` +
        (hasApiKey
          ? `*_Commands:_*\n` +
            `- \`.chatbot on\` - _Enable chatbot in this chat_\n` +
            `- \`.chatbot off\` - _Disable chatbot in this chat_\n` +
            `- \`.chatbot on groups\` - _Enable in all groups_\n` +
            `- \`.chatbot on dms\` - _Enable in all DMs_\n` +
            `- \`.chatbot off groups\` - _Disable in all groups_\n` +
            `- \`.chatbot off dms\` - _Disable in all DMs_\n` +
            `- \`.chatbot set "prompt"\` - _Set system prompt_\n` +
            `- \`.chatbot clear\` - _Clear conversation context_\n` +
            `- \`.chatbot status\` - _Show detailed status_\n\n` +
            `*_How it works:_*\n` +
            `- _Direct messages to bot trigger AI response_\n` +
            `- _Mentions (@bot) trigger AI response_\n` +
            `- _Replies to bot messages trigger AI response_\n` +
            `- _Reply to images for AI image analysis_\n` +
            `- _Maintains conversation context automatically_`
          : `*_⚠️ Setup Required:_*\n` +
            `_API key is required to use chatbot._\n\n` +
            `*_Get your API key:_*\n` +
            `- _Visit: https://aistudio.google.com/app/apikey_\n` +
            `- _Sign in with Google account_\n` +
            `- _Create API Key_\n\n` +
            `*_Set your API key:_*\n` +
            `\`.setvar GEMINI_API_KEY=your_api_key_here\`\n\n` +
            `_After setting the key, use \`.chatbot on\` to enable._`);

      return await message.sendReply(helpText);
    }

    const args = input.split(" ");
    const command = args[0].toLowerCase();
    const target = args[1]?.toLowerCase();

    switch (command) {
      case "on":
        if (!config.GEMINI_API_KEY) {
          return await message.sendReply(
            `*_❌ GEMINI_API_KEY Not Configured_*\n\n` +
              `_Cannot enable chatbot without Gemini API key._\n\n` +
              `*_How to get your API key:_*\n` +
              `- _Visit: https://aistudio.google.com/app/apikey_\n` +
              `- _Sign in with your Google account_\n` +
              `- _Click "Create API Key"_\n` +
              `- _Copy the generated API key_\n\n` +
              `*_How to set it:_*\n` +
              `\`.setvar GEMINI_API_KEY=your_api_key_here\`\n\n` +
              `_Replace \`your_api_key_here\` with your actual API key._`,
          );
        }

        if (target === "groups") {
          await setVar("CHATBOT_ALL_GROUPS", "true");
          return await message.sendReply(
            `*_🤖 Chatbot Enabled for All Groups_*\n\n` +
              `✅ _Chatbot will now respond in all groups_\n` +
              `🤖 _Model:_ \`${MODEL}\`\n` +
              `📍 _Trigger:_ _Mentions and replies only_\n\n` +
              `_Use \`.chatbot off groups\` to disable._`,
          );
        } else if (target === "dms") {
          await setVar("CHATBOT_ALL_DMS", "true");
          return await message.sendReply(
            `*_🤖 Chatbot Enabled for All DMs_*\n\n` +
              `✅ _Chatbot will now respond in all direct messages_\n` +
              `🤖 _Model:_ \`${MODEL}\`\n` +
              `📍 _Trigger:_ _All messages_\n\n` +
              `_Use \`.chatbot off dms\` to disable._`,
          );
        } else {
          await enableChatbot(chatJid);
          return await message.sendReply(
            `*_🤖 Chatbot Enabled_*\n\n` +
              `📍 _Chat:_ \`${chatJid.includes("@g.us") ? "Group" : "DM"}\`\n` +
              `🤖 _Model:_ \`${MODEL}\`\n` +
              `💭 _Context:_ _Fresh start_\n\n` +
              `_Now I'll respond to direct messages, mentions, and replies!_`,
          );
        }

      case "off":
        if (target === "groups") {
          await setVar("CHATBOT_ALL_GROUPS", "false");
          return await message.sendReply(
            `*_🤖 Chatbot Disabled for All Groups_*\n\n` +
              `❌ _Chatbot will no longer respond in groups globally_\n` +
              `📝 _Individual group settings are preserved_\n\n` +
              `_Use \`.chatbot on groups\` to re-enable._`,
          );
        } else if (target === "dms") {
          await setVar("CHATBOT_ALL_DMS", "false");
          return await message.sendReply(
            `*_🤖 Chatbot Disabled for All DMs_*\n\n` +
              `❌ _Chatbot will no longer respond in DMs globally_\n` +
              `📝 _Individual DM settings are preserved_\n\n` +
              `_Use \`.chatbot on dms\` to re-enable._`,
          );
        } else {
          await disableChatbot(chatJid);
          return await message.sendReply(
            `*_🤖 Chatbot Disabled_*\n\n` +
              `_Chatbot is now disabled in this chat._\n` +
              `_Conversation context has been cleared._`,
          );
        }

      case "set":
        const promptMatch = input.match(/set\s+"([^"]+)"/);
        if (!promptMatch) {
          return await message.sendReply(
            `_Please provide the system prompt in quotes._\n\n` +
              `*_Example:_*\n` +
              `\`.chatbot set "You are a helpful assistant specialized in programming."\``,
          );
        }
        const newPrompt = promptMatch[1];
        await saveSystemPrompt(newPrompt);
        return await message.sendReply(
          `*_🎯 System Prompt Updated_*\n\n` +
            `📝 _New Prompt:_ \`${newPrompt}\`\n\n` +
            `_This will apply to all new conversations._`,
        );

      case "clear":
        if (target === "groups" || target === "dms") {
          await clearAllContexts(target);
          return await message.sendReply(
            `*_💭 Contexts Cleared for All ${
              target === "groups" ? "Groups" : "DMs"
            }_*\n\n` +
              `_Conversation histories have been reset for all ${
                target === "groups" ? "groups" : "DMs"
              }._\n` +
              `_Next messages will start fresh conversations._`,
          );
        } else {
          clearContext(chatJid);
          return await message.sendReply(
            `*_💭 Context Cleared_*\n\n` +
              `_Conversation history has been reset._\n` +
              `_Next message will start a fresh conversation._`,
          );
        }

      case "status":
        const isEnabled = isChatbotEnabled(chatJid);
        const isEnabledIndividually = chatbotStates.get(chatJid) === true;
        const globalGroups = isEnabledValue(config.CHATBOT_ALL_GROUPS);
        const globalDMs = isEnabledValue(config.CHATBOT_ALL_DMS);
        const currentModel = MODEL;
        const contextSize = chatContexts.get(chatJid)?.length || 0;
        const isGroup = chatJid.includes("@g.us");

        let enabledReason = "";
        if (isEnabledIndividually) {
          enabledReason = "Individual setting";
        } else if (isGroup && globalGroups) {
          enabledReason = "Global groups setting";
        } else if (!isGroup && globalDMs) {
          enabledReason = "Global DMs setting";
        }

        const statusText =
          `*_🤖 Chatbot Status_*\n\n` +
          `📊 _Status:_ \`${isEnabled ? "Enabled ✅" : "Disabled ❌"}\`\n` +
          (isEnabled && enabledReason
            ? `📋 _Enabled via:_ \`${enabledReason}\`\n`
            : "") +
          `🌐 _Global Groups:_ \`${
            globalGroups ? "Enabled ✅" : "Disabled ❌"
          }\`\n` +
          `💬 _Global DMs:_ \`${globalDMs ? "Enabled ✅" : "Disabled ❌"}\`\n` +
          `🤖 _Model:_ \`${currentModel}\`\n` +
          `💭 _Context Messages:_ \`${contextSize}\`\n` +
          `🎯 _System Prompt:_ \`${getSystemPrompt()}\`\n` +
          `🔑 _API Key:_ \`${
            config.GEMINI_API_KEY ? "Configured ✅" : "Missing ❌"
          }\``;

        return await message.sendReply(statusText);

      default:
        return await message.sendReply(
          `_Unknown command: \`${command}\`_\n\n_Use \`.chatbot\` to see available commands._`,
        );
    }
  },
);

Module(
  {
    on: "text",
    fromMe: false,
  },
  async (message) => {
    try {
      const chatJid = message.jid;
      const senderJid = message.sender;
      const isGroup = message.isGroup;
      const isDM = !isGroup;

      if (!isChatbotEnabled(chatJid)) {
        return;
      }

      if (message.fromMe) {
        return;
      }

      if (!config.GEMINI_API_KEY) {
        return;
      }

      let shouldRespond = false;
      const messageText = message.text;
      if (isDM) {
        shouldRespond = true;
      } else if (isGroup) {
        const botJid = message.client.user?.lid;

        if (message.mention && message.mention.length > 0) {
          const botMentioned = message.mention.some((jid) => {
            const mentionedNum = jid.split("@")[0];
            const botNum = botJid?.split(":")[0];
            return mentionedNum === botNum;
          });
          if (botMentioned) shouldRespond = true;
        }

        if (message.reply_message && message.reply_message.jid) {
          const repliedToNum = message.reply_message.jid.split("@")[0];
          const botNum = botJid?.split(":")[0];
          if (repliedToNum === botNum) shouldRespond = true;
        }
      }

      if (!shouldRespond) {
        return;
      }

      let imageBuffer = null;
      let responseText = messageText;

      if (message.reply_message && message.reply_message.image) {
        try {
          imageBuffer = await message.reply_message.download("buffer");

          if (!messageText || messageText.length < 2) {
            responseText = "What do you see in this image?";
          }
        } catch (error) {
          console.error("Error downloading image:", error);
          return await message.sendReply(
            "_❌ Failed to download image. Please try again._",
          );
        }
      } else if (messageText.length < 2) {
        return;
      }

      let commandPrefixes = [];
      if (config.HANDLERS === "false") {
        commandPrefixes = [];
      } else {
        const handlers = config.HANDLERS || ".,";
        if (typeof handlers === "string") {
          commandPrefixes = handlers.split("").filter((char) => char.trim());
        }
      }

      if (
        commandPrefixes.length > 0 &&
        commandPrefixes.some((prefix) => responseText.startsWith(prefix))
      ) {
        return;
      }

      const aiResponse = await getAIResponse(
        responseText,
        chatJid,
        imageBuffer,
      );

      if (aiResponse) {
        await message.sendReply(aiResponse);
      }
    } catch (error) {
      console.error("Error in message handler:", error);
    }
  },
);

Module(
  {
    pattern: "ai ?(.*)",
    fromMe,
    desc: "Ask Gemini AI with text and/or image input",
    type: "ai",
  },
  async (message, match) => {
    let imageParts = [];
    let prompt = match[1]?.trim() || "";

    if (message.reply_message) {
      if (message.reply_message.image) {
        try {
          const buffer = await message.reply_message.download("buffer");
          const imagePart = await imageToGenerativePart(buffer);
          if (imagePart) imageParts.push(imagePart);
        } catch (error) {
          console.error("Error downloading image:", error);
          return await message.sendReply("❌ Failed to download the image.");
        }
        if (!imageParts.length) return await message.sendReply("❌ I could not process that image. Please send a JPG or PNG image.");
        if (!prompt) prompt = "What do you see in this image?";
      } else if (message.reply_message.album) {
        try {
          const albumData = await message.reply_message.download();

          for (const imagePath of albumData.images) {
            try {
              const buffer = fs.readFileSync(imagePath);
              const imagePart = await imageToGenerativePart(buffer);
              if (imagePart) imageParts.push(imagePart);
            } catch (err) {
              console.error("Error processing album image:", err);
            }
          }

          if (!imageParts.length) {
            return await message.sendReply("❌ No images found in album.");
          }
          if (!prompt) prompt = "Analyze these images for me.";
        } catch (error) {
          console.error("Error downloading album:", error);
          return await message.sendReply("❌ Failed to download album.");
        }
      } else if (message.reply_message.text && !prompt) {
        prompt = message.reply_message.text;
      }
    }

    if (!prompt && !imageParts.length) {
      return await message.sendReply(
        "Please provide a prompt or reply to a message/image.",
      );
    }

    const apiKey = config.GEMINI_API_KEY;
    if (!apiKey) {
      return await message.sendReply(
        `*_❌ GEMINI_API_KEY Not Configured_*\n\n` +
          `_Cannot use AI without Gemini API key._\n\n` +
          `*_How to set it:_*\n` +
          `\`.setvar GEMINI_API_KEY=your_api_key_here\``,
      );
    }

    let sent_msg;
    try {
      sent_msg = await message.sendReply("_Thinking..._");

      const contents = [
        {
          role: "user",
          parts: [{ text: prompt }, ...imageParts],
        },
      ];

      const response = await callAIAPI(
        apiKey,
        contents,
        getSystemPrompt(),
        imageParts.length > 0,
      );

      const fullText = extractResponseText(response.data);

      if (!fullText) {
        await message.edit(
          "❌ Received empty response from AI.",
          message.jid,
          sent_msg.key,
        );
        return;
      }

      await message.edit(fullText, message.jid, sent_msg.key);
    } catch (error) {
      console.error("AI command error:", error.message);
      const errMsg = error.response?.data?.error?.message;
      if (sent_msg) {
        await message.edit(
          `❌ An error occurred with the AI API${errMsg ? `: ${errMsg}` : "."}`,
          message.jid,
          sent_msg.key,
        );
      } else {
        await message.sendReply(
          `❌ An error occurred with the AI API${errMsg ? `: ${errMsg}` : "."}`,
        );
      }
    }
  },
);
