// ==UserScript==
// @name         RSVP Speed Reader Overlay
// @namespace    https://example.com/
// @version      0.1.0
// @description  Launch an RSVP reader overlay on any page (Ctrl+Shift+E).
// @author       rsvp
// @match        *://*/*
// @grant        none
// @require      https://unpkg.com/@mozilla/readability@0.5.0/Readability.js
// ==/UserScript==

(() => {
  const SETTINGS_KEY = "rsvp-userscript-settings";
  const defaults = {
    wpm: 300,
    chunk: 1,
  };

  let overlay = null;
  let pivotWord = null;
  let speedDisplay = null;
  let words = [];
  let frameIndex = 0;
  let timerId = null;

  const pauseMultipliers = [
    { pattern: /[.!?]$/, multiplier: 2.2 },
    { pattern: /[,:;]$/, multiplier: 1.4 },
  ];

  function getComplexWordMultiplier(frameWords) {
    if (!frameWords.length) return 1;
    const maxLength = Math.max(
      ...frameWords.map((word) => word.replace(/[^A-Za-z0-9%]/g, "").length)
    );
    if (maxLength >= 13) return 1.6;
    if (maxLength >= 10) return 1.3;
    return 1;
  }

  function loadSettings() {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return defaults;
    try {
      return { ...defaults, ...JSON.parse(stored) };
    } catch (error) {
      return defaults;
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function normalizePunctuation(text) {
    return text.replace(/([.!?,;:])(?=\S)/g, (match, punct, offset, source) => {
      const prev = source[offset - 1] || "";
      const next = source[offset + 1] || "";
      const next2 = source[offset + 2] || "";

      if (punct === ".") {
        const isDecimal = /\d/.test(prev) && /\d/.test(next);
        const isInitials = /[A-Za-z]/.test(prev) && /[A-Za-z]/.test(next) && next2 === ".";
        if (isDecimal || isInitials) return punct;
      }

      if (punct === ",") {
        const isNumber = /\d/.test(prev) && /\d/.test(next);
        if (isNumber) return punct;
      }

      return `${punct} `;
    });
  }

  function tokenize(text) {
    return normalizePunctuation(text)
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function computeOrpIndex(text) {
    if (!text) return 0;
    const length = text.length;
    const rawIndex = Math.floor((length - 1) * 0.4);
    let index = Math.max(0, Math.min(length - 1, rawIndex));
    if (text[index] === " ") {
      let forward = index;
      while (forward < length && text[forward] === " ") forward += 1;
      if (forward < length) return forward;
      let backward = index;
      while (backward > 0 && text[backward] === " ") backward -= 1;
      index = backward;
    }
    return index;
  }

  function measureTextWidth(text, referenceElement) {
    const style = getComputedStyle(referenceElement);
    const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.letterSpacing = style.letterSpacing;
    const metrics = context.measureText(text);
    return metrics.width;
  }

  function renderPivot(frameWords) {
    const combined = frameWords.join(" ");
    const orpIndex = computeOrpIndex(combined);
    const pre = combined.slice(0, orpIndex);
    const orpChar = combined.charAt(orpIndex) || "";
    const post = combined.slice(orpIndex + 1);
    pivotWord.innerHTML = `${pre}<span class="rsvp-orpc">${orpChar}</span>${post}`;
    const orpX = measureTextWidth(pre, pivotWord);
    pivotWord.style.transform = `translateX(calc(50% - ${orpX}px))`;
  }

  function updateSpeedDisplay(settings) {
    speedDisplay.textContent = `${settings.wpm} wpm`;
  }

  function getFrameWords(settings) {
    return words.slice(frameIndex * settings.chunk, frameIndex * settings.chunk + settings.chunk);
  }

  function getFrameDelay(frameWords, settings) {
    const base = 60000 / settings.wpm;
    const lastWord = frameWords[frameWords.length - 1] || "";
    const multiplier = pauseMultipliers.find((entry) => entry.pattern.test(lastWord))?.multiplier || 1;
    const complexityMultiplier = getComplexWordMultiplier(frameWords);
    return base * multiplier * complexityMultiplier;
  }

  function stopPlayback() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function resetPlayback() {
    stopPlayback();
    frameIndex = 0;
    renderPivot([""]);
  }

  function step(settings) {
    if (frameIndex * settings.chunk >= words.length) {
      stopPlayback();
      return;
    }
    const frameWords = getFrameWords(settings);
    renderPivot(frameWords);
    frameIndex += 1;
    const delay = getFrameDelay(frameWords, settings);
    timerId = window.setTimeout(() => step(settings), delay);
  }

  function startPlayback(settings) {
    if (timerId) return;
    if (words.length === 0) return;
    step(settings);
  }

  function togglePlayback(settings) {
    if (timerId) {
      stopPlayback();
    } else {
      startPlayback(settings);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      overlay?.requestFullscreen?.();
    }
  }

  function extractArticleText() {
    try {
      const cloned = document.cloneNode(true);
      const reader = new Readability(cloned);
      const article = reader.parse();
      if (article?.textContent) {
        return article.textContent;
      }
    } catch (error) {
      console.warn("Readability failed, falling back to body text", error);
    }
    return document.body?.innerText || "";
  }

  function buildOverlay(settings) {
    overlay = document.createElement("div");
    overlay.className = "rsvp-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="rsvp-pivot">
        <span class="rsvp-pivot-word"></span>
        <span class="rsvp-speed"></span>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .rsvp-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 17, 23, 0.94);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Inter", "Segoe UI", sans-serif;
        color: #b7c0cc;
      }

      .rsvp-pivot {
        position: relative;
        width: min(900px, 90vw);
        height: min(320px, 60vh);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: clamp(28px, 4vw, 56px);
        font-weight: 600;
        letter-spacing: 0.5px;
      }

      .rsvp-pivot::after {
        content: "";
        position: absolute;
        top: 10%;
        bottom: 10%;
        width: 2px;
        background: rgba(255, 255, 255, 0.25);
        left: 50%;
      }

      .rsvp-pivot-word {
        display: inline-block;
        white-space: pre;
        transition: transform 0.08s ease;
      }

      .rsvp-orpc {
        color: #ff3b3b;
        text-shadow: 0 0 12px rgba(255, 59, 59, 0.5);
      }

      .rsvp-speed {
        position: absolute;
        bottom: 6px;
        right: 12px;
        font-size: 12px;
        color: rgba(183, 192, 204, 0.6);
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    pivotWord = overlay.querySelector(".rsvp-pivot-word");
    speedDisplay = overlay.querySelector(".rsvp-speed");
    updateSpeedDisplay(settings);
  }

  function removeOverlay() {
    stopPlayback();
    overlay?.remove();
    overlay = null;
    pivotWord = null;
    speedDisplay = null;
  }

  function openReader() {
    if (overlay) return;
    const settings = loadSettings();
    buildOverlay(settings);
    const text = extractArticleText();
    words = tokenize(text);
    frameIndex = 0;
    renderPivot(getFrameWords(settings));
    startPlayback(settings);
  }

  function handleKeydown(event) {
    const isLaunch = event.ctrlKey && event.shiftKey && event.code === "KeyE";
    if (isLaunch) {
      event.preventDefault();
      if (overlay) {
        removeOverlay();
      } else {
        openReader();
      }
      return;
    }

    if (!overlay) return;

    const settings = loadSettings();

    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback(settings);
    }
    if (event.key === "]") {
      settings.wpm = Math.min(900, settings.wpm + 10);
      updateSpeedDisplay(settings);
      saveSettings(settings);
    }
    if (event.key === "[") {
      settings.wpm = Math.max(100, settings.wpm - 10);
      updateSpeedDisplay(settings);
      saveSettings(settings);
    }
    if (event.code === "ArrowRight") {
      const totalFrames = Math.ceil(words.length / settings.chunk);
      if (totalFrames > 0) {
        frameIndex = Math.min(totalFrames - 1, frameIndex + 1);
        renderPivot(getFrameWords(settings));
      }
    }
    if (event.code === "ArrowLeft") {
      frameIndex = Math.max(0, frameIndex - 1);
      renderPivot(getFrameWords(settings));
    }
    if (event.key.toLowerCase() === "r") {
      resetPlayback();
    }
    if (event.key.toLowerCase() === "f") {
      toggleFullscreen();
    }
    if (event.code === "Escape") {
      removeOverlay();
    }
  }

  document.addEventListener("keydown", handleKeydown, true);
})();
