/**
 * VettdRE Leasing Chat Widget — Embeddable Script
 *
 * Usage:
 *   <script src="https://app.vettdre.com/leasing-widget.js"
 *           data-config="my-building-slug"
 *           data-color="#1D4ED8"></script>
 *
 * No dependencies. No cookies. No localStorage. < 15KB unminified.
 */
(function () {
  "use strict";

  // ── Read config from script tag ──────────────────────────────

  var scripts = document.getElementsByTagName("script");
  var currentScript = scripts[scripts.length - 1];
  var configSlug = currentScript.getAttribute("data-config");
  var brandColor = currentScript.getAttribute("data-color") || "#1D4ED8";
  var baseUrl = currentScript.src
    ? currentScript.src.replace(/\/leasing-widget\.js.*$/, "")
    : window.location.origin;

  if (!configSlug) {
    console.error("[VettdRE Widget] Missing data-config attribute.");
    return;
  }

  // ── State ────────────────────────────────────────────────────

  var isOpen = false;
  var container = null;
  var iframe = null;
  var button = null;

  // ── Styles ───────────────────────────────────────────────────

  var BUTTON_SIZE = 56;
  var IFRAME_WIDTH = 380;
  var IFRAME_HEIGHT = 600;
  var MOBILE_BREAKPOINT = 480;
  var Z_INDEX = 9999;

  // ── Helpers ──────────────────────────────────────────────────

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function setStyles(el, styles) {
    for (var key in styles) {
      if (styles.hasOwnProperty(key)) {
        el.style[key] = styles[key];
      }
    }
  }

  // ── Create DOM ───────────────────────────────────────────────

  function createWidget() {
    // Container
    container = document.createElement("div");
    container.id = "vettdre-leasing-widget";
    setStyles(container, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: String(Z_INDEX),
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    });

    // Floating button
    button = document.createElement("button");
    button.setAttribute("aria-label", "Open chat");
    setStyles(button, {
      width: BUTTON_SIZE + "px",
      height: BUTTON_SIZE + "px",
      borderRadius: "50%",
      backgroundColor: brandColor,
      border: "none",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
      outline: "none",
      padding: "0",
    });

    // Chat icon SVG
    button.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      "</svg>";

    button.addEventListener("mouseenter", function () {
      button.style.transform = "scale(1.08)";
      button.style.boxShadow = "0 6px 20px rgba(0,0,0,0.2)";
    });
    button.addEventListener("mouseleave", function () {
      button.style.transform = "scale(1)";
      button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    });
    button.addEventListener("click", toggle);

    // Iframe (hidden initially)
    iframe = document.createElement("iframe");
    iframe.src = baseUrl + "/chat/" + encodeURIComponent(configSlug);
    iframe.setAttribute("title", "Chat");
    iframe.setAttribute("allow", "microphone");
    setStyles(iframe, {
      display: "none",
      border: "none",
      borderRadius: "12px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
      backgroundColor: "#ffffff",
      position: "fixed",
      bottom: "88px",
      right: "20px",
      width: IFRAME_WIDTH + "px",
      height: IFRAME_HEIGHT + "px",
      zIndex: String(Z_INDEX + 1),
      opacity: "0",
      transform: "translateY(10px) scale(0.95)",
      transition: "opacity 0.25s ease, transform 0.25s ease",
    });

    container.appendChild(button);
    document.body.appendChild(container);
    document.body.appendChild(iframe);

    // Listen for close message from iframe
    window.addEventListener("message", handleMessage);

    // Reposition on resize
    window.addEventListener("resize", reposition);
  }

  // ── Toggle ───────────────────────────────────────────────────

  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  function open() {
    isOpen = true;
    reposition();
    iframe.style.display = "block";

    // Force reflow before transition
    void iframe.offsetHeight;

    iframe.style.opacity = "1";
    iframe.style.transform = "translateY(0) scale(1)";

    // Swap button icon to X
    button.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>' +
      "</svg>";
    button.setAttribute("aria-label", "Close chat");
  }

  function close() {
    isOpen = false;

    iframe.style.opacity = "0";
    iframe.style.transform = "translateY(10px) scale(0.95)";

    setTimeout(function () {
      if (!isOpen) {
        iframe.style.display = "none";
        // Reset mobile styles
        reposition();
      }
    }, 250);

    // Swap button icon back to chat
    button.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      "</svg>";
    button.setAttribute("aria-label", "Open chat");
  }

  // ── Reposition (desktop vs mobile) ───────────────────────────

  function reposition() {
    if (isMobile() && isOpen) {
      setStyles(iframe, {
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        width: "100%",
        height: "100%",
        borderRadius: "0",
        boxShadow: "none",
      });
      button.style.display = "none";
    } else {
      setStyles(iframe, {
        top: "auto",
        left: "auto",
        right: "20px",
        bottom: "88px",
        width: IFRAME_WIDTH + "px",
        height: IFRAME_HEIGHT + "px",
        borderRadius: "12px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
      });
      button.style.display = "flex";
    }
  }

  // ── PostMessage listener ─────────────────────────────────────

  function handleMessage(event) {
    if (event.data && event.data.type === "leasing-widget-close") {
      close();
    }
  }

  // ── Init ─────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
