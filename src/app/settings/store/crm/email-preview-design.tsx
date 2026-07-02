"use client";

import * as React from "react";
import { MousePointerClick } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { applyMergeTags, restoreMergeTags } from "@/lib/crm/merge-tags";
import { getStoredCampaignHtml, htmlToPlainText, replaceCampaignHtmlBody } from "@/lib/crm/campaign-html";
import { renderCampaignEmail, type StoreBranding } from "@/lib/crm/templates";
import type { CampaignContent } from "@/lib/crm/types";

const PREVIEW_UNSUBSCRIBE_PLACEHOLDER = "https://example.com/unsubscribe";

export type EmailPreviewDesignSelection = {
  label: string;
  tagName: string;
  selector: string;
  text: string;
  htmlSnippet: string;
};

export type EmailInlineEditState = {
  label: string;
  tagName: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  isImage: boolean;
};

export type EmailPreviewEditorHandle = {
  applyStyles: (styles: Partial<Pick<EmailInlineEditState, "fontFamily" | "fontSize" | "color">>) => void;
  finishEdit: () => void;
  cancelEdit: () => void;
  deleteElement: () => void;
};

const DESIGN_MODE_SCRIPT = `<script>
(function () {
  var active = false;
  var hoverEl = null;
  var selectedElements = [];
  var popupEl = null;
  var popupInput = null;
  var popupChips = null;
  var anchorEl = null;
  var clickTimer = null;
  var editingEl = null;
  var editingOriginalHtml = null;
  var HOVER = "crm-design-hover";
  var SELECTED = "crm-design-selected";
  var EDITING = "crm-design-editing";
  var EDITABLE_TAGS = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, A: 1, SPAN: 1, TD: 1, TH: 1, LI: 1, STRONG: 1, EM: 1, DIV: 1, BUTTON: 1 };

  function injectStyles() {
    if (document.getElementById("crm-design-styles")) return;
    var style = document.createElement("style");
    style.id = "crm-design-styles";
    style.textContent =
      "." + HOVER + " { outline: 2px solid #2563eb !important; outline-offset: 2px !important; cursor: crosshair !important; }" +
      "." + SELECTED + " { outline: 2px solid #18181b !important; outline-offset: 2px !important; }" +
      "." + EDITING + " { outline: 2px solid #2563eb !important; outline-offset: 2px !important; cursor: text !important; }" +
      "#crm-design-popup { position: fixed; z-index: 2147483647; width: min(280px, calc(100vw - 16px)); padding: 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.12); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }" +
      "#crm-design-popup-chips { display: none; margin-bottom: 6px; font-size: 11px; line-height: 1.3; color: #6b7280; }" +
      "#crm-design-popup-chips.is-visible { display: block; }" +
      "#crm-design-popup input { display: block; width: 100%; border: 0; outline: none; background: transparent; font-size: 13px; line-height: 1.4; color: #18181b; }" +
      "#crm-design-popup input::placeholder { color: #9ca3af; }";
    document.head.appendChild(style);
  }

  function clearHover() {
    if (hoverEl) hoverEl.classList.remove(HOVER);
    hoverEl = null;
  }

  function clearSelectedAll() {
    selectedElements.forEach(function (el) {
      el.classList.remove(SELECTED);
    });
    selectedElements = [];
  }

  function removePopup() {
    if (popupEl) popupEl.remove();
    popupEl = null;
    popupInput = null;
    popupChips = null;
    anchorEl = null;
    window.removeEventListener("scroll", onReposition, true);
    window.removeEventListener("resize", onReposition);
  }

  function cleanup() {
    cancelInlineEdit(false);
    clearHover();
    clearSelectedAll();
    removePopup();
  }

  function isDesignUi(el) {
    if (!(el instanceof Element)) return false;
    if (popupEl && popupEl.contains(el)) return true;
    return false;
  }

  function findInteractiveAncestor(el) {
    var node = el;
    while (node && node !== document.body) {
      if (!(node instanceof Element)) break;
      if (node.tagName === "A" || node.tagName === "BUTTON") return node;
      node = node.parentElement;
    }
    return null;
  }

  function onPreventPreviewNavigation(event) {
    if (isDesignUi(event.target)) return;
    var el = event.target;
    if (!(el instanceof Element)) return;
    if (!findInteractiveAncestor(el)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function disableInteractiveNavigation(el) {
    if (!(el instanceof Element)) return;
    if (el.tagName === "A") {
      el.dataset.crmEditHref = el.getAttribute("href") || "";
      el.removeAttribute("href");
      el.removeAttribute("target");
    }
    if (el.tagName === "BUTTON") {
      el.dataset.crmEditDisabled = el.disabled ? "1" : "0";
      el.disabled = true;
    }
  }

  function restoreInteractiveNavigation(el) {
    if (!(el instanceof Element)) return;
    if (el.tagName === "A" && el.dataset.crmEditHref != null) {
      if (el.dataset.crmEditHref) el.setAttribute("href", el.dataset.crmEditHref);
      else el.removeAttribute("href");
      delete el.dataset.crmEditHref;
    }
    if (el.tagName === "BUTTON" && el.dataset.crmEditDisabled != null) {
      el.disabled = el.dataset.crmEditDisabled === "1";
      delete el.dataset.crmEditDisabled;
    }
  }

  function findEditableTarget(el) {
    var node = el;
    while (node && node !== document.body) {
      if (!(node instanceof Element)) {
        node = node.parentElement;
        continue;
      }
      if (node.tagName === "IMG") return node;
      if (node.tagName === "A" || node.tagName === "BUTTON") {
        var label = (node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
        if (label) return node;
      }
      if (EDITABLE_TAGS[node.tagName]) {
        var text = (node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
        if (text) return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function stripDesignArtifactsFromBody() {
    var clone = document.body.cloneNode(true);
    clone.querySelectorAll("script").forEach(function (node) { node.remove(); });
    clone.querySelectorAll("#crm-design-popup").forEach(function (node) {
      node.remove();
    });
    clone.querySelectorAll("." + HOVER + ", ." + SELECTED + ", ." + EDITING).forEach(function (node) {
      node.classList.remove(HOVER, SELECTED, EDITING);
    });
    clone.querySelectorAll("[contenteditable='true']").forEach(function (node) {
      node.removeAttribute("contenteditable");
    });
    return clone.innerHTML;
  }

  function publishBodyHtml() {
    parent.postMessage(
      { type: "crm-email-direct-edit", payload: { bodyHtml: stripDesignArtifactsFromBody() } },
      "*",
    );
  }

  function rgbToHex(value) {
    if (!value) return "#18181b";
    var trimmed = String(value).trim();
    if (trimmed.charAt(0) === "#") {
      if (trimmed.length === 4) {
        return "#" + trimmed.charAt(1) + trimmed.charAt(1) + trimmed.charAt(2) + trimmed.charAt(2) + trimmed.charAt(3) + trimmed.charAt(3);
      }
      return trimmed.slice(0, 7);
    }
    var match = trimmed.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!match) return "#18181b";
    function hex(n) {
      var h = Number(n).toString(16);
      return h.length === 1 ? "0" + h : h;
    }
    return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
  }

  function parseFontSizePx(value) {
    var num = parseFloat(value);
    if (isNaN(num)) return 16;
    return Math.round(num);
  }

  function getElementEditState(el) {
    var computed = window.getComputedStyle(el);
    return {
      label: labelFor(el),
      tagName: el.tagName.toLowerCase(),
      fontFamily: computed.fontFamily || "",
      fontSize: parseFontSizePx(computed.fontSize),
      color: rgbToHex(computed.color),
      isImage: el.tagName === "IMG",
    };
  }

  function notifyInlineEditStart(el) {
    parent.postMessage({ type: "crm-email-inline-edit-start", payload: getElementEditState(el) }, "*");
  }

  function notifyInlineEditEnd() {
    parent.postMessage({ type: "crm-email-inline-edit-end" }, "*");
  }

  function applyInlineStyles(styles) {
    if (!editingEl || !styles) return;
    if (styles.fontFamily) editingEl.style.fontFamily = styles.fontFamily;
    if (styles.fontSize) editingEl.style.fontSize = String(styles.fontSize) + "px";
    if (styles.color) editingEl.style.color = styles.color;
  }

  function cancelInlineEdit(restore, silent) {
    if (!editingEl) return;
    var el = editingEl;
    el.removeEventListener("keydown", onInlineEditKeyDown);
    restoreInteractiveNavigation(el);
    el.contentEditable = "false";
    el.classList.remove(EDITING);
    if (restore && editingOriginalHtml != null) {
      el.outerHTML = editingOriginalHtml;
    }
    editingEl = null;
    editingOriginalHtml = null;
    if (!silent) notifyInlineEditEnd();
  }

  function finishInlineEdit() {
    if (!editingEl) return;
    var el = editingEl;
    el.removeEventListener("keydown", onInlineEditKeyDown);
    el.contentEditable = "false";
    el.classList.remove(EDITING);
    restoreInteractiveNavigation(el);
    editingEl = null;
    editingOriginalHtml = null;
    publishBodyHtml();
    notifyInlineEditEnd();
  }

  function deleteInlineElement() {
    if (!editingEl) return;
    var el = editingEl;
    el.removeEventListener("keydown", onInlineEditKeyDown);
    restoreInteractiveNavigation(el);
    el.contentEditable = "false";
    el.classList.remove(EDITING);
    editingEl = null;
    editingOriginalHtml = null;
    el.remove();
    publishBodyHtml();
    notifyInlineEditEnd();
  }

  function startInlineEdit(el) {
    if (!el || editingEl === el) return;
    cancelInlineEdit(true, true);
    removePopup();
    clearHover();
    clearSelectedAll();

    injectStyles();
    editingEl = el;
    editingOriginalHtml = el.outerHTML;
    el.classList.add(EDITING);
    disableInteractiveNavigation(el);
    notifyInlineEditStart(el);

    if (el.tagName === "IMG") return;

    el.contentEditable = "true";
    el.addEventListener("keydown", onInlineEditKeyDown);

    window.requestAnimationFrame(function () {
      if (!editingEl) return;
      editingEl.focus();
      try {
        document.execCommand("selectAll", false, null);
      } catch (err) {
        // non-fatal
      }
    });
  }

  function onInlineEditKeyDown(event) {
    if (!editingEl) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finishInlineEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEdit(true);
    }
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + el.id;
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node.tagName !== "HTML") {
      var part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) {
        part += "." + Array.prototype.slice.call(node.classList, 0, 2).join(".");
      } else {
        var parent = node.parentElement;
        if (parent) {
          var siblings = Array.prototype.filter.call(parent.children, function (child) {
            return child.tagName === node.tagName;
          });
          if (siblings.length > 1) {
            part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
          }
        }
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function labelFor(el) {
    var tag = el.tagName.toLowerCase();
    var text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 48);
    if (tag === "img") return "Image" + (el.alt ? ': "' + el.alt.slice(0, 40) + '"' : "");
    if (tag === "a") return "Link" + (text ? ': "' + text + '"' : "");
    if (tag === "h1" || tag === "h2" || tag === "h3") return "Heading: " + (text || tag);
    if (tag === "p") return "Paragraph" + (text ? ': "' + text + '"' : "");
    if (tag === "td" || tag === "th") return "Cell" + (text ? ': "' + text + '"' : "");
    return tag + (text ? ': "' + text + '"' : "");
  }

  function elementPayload(el) {
    return {
      label: labelFor(el),
      tagName: el.tagName.toLowerCase(),
      selector: cssPath(el),
      text: (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 240),
      htmlSnippet: el.outerHTML.slice(0, 400),
    };
  }

  function getSelections() {
    return selectedElements.map(elementPayload);
  }

  function onReposition() {
    if (anchorEl && popupEl) positionPopup(anchorEl);
  }

  function positionPopup(el) {
    if (!popupEl) return;
    var rect = el.getBoundingClientRect();
    var popupRect = popupEl.getBoundingClientRect();
    var top = rect.bottom + 8;
    var left = rect.left;
    if (top + popupRect.height > window.innerHeight - 8) {
      top = rect.top - popupRect.height - 8;
    }
    if (left + popupRect.width > window.innerWidth - 8) {
      left = window.innerWidth - popupRect.width - 8;
    }
    popupEl.style.top = Math.max(8, top) + "px";
    popupEl.style.left = Math.max(8, left) + "px";
  }

  function updatePopupChips() {
    if (!popupChips) return;
    if (selectedElements.length > 1) {
      popupChips.textContent =
        selectedElements.length + " elements selected · Shift+click to add more";
      popupChips.classList.add("is-visible");
    } else {
      popupChips.textContent = "";
      popupChips.classList.remove("is-visible");
    }
  }

  function showPopup(el) {
    anchorEl = el;
    if (!popupEl) {
      popupEl = document.createElement("div");
      popupEl.id = "crm-design-popup";
      popupChips = document.createElement("div");
      popupChips.id = "crm-design-popup-chips";
      popupInput = document.createElement("input");
      popupInput.type = "text";
      popupInput.placeholder = "Describe the change…";
      popupInput.setAttribute("aria-label", "Describe the change");
      popupEl.appendChild(popupChips);
      popupEl.appendChild(popupInput);
      document.body.appendChild(popupEl);

      popupInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          var text = (popupInput.value || "").trim();
          if (!text || selectedElements.length === 0) return;
          parent.postMessage(
            {
              type: "crm-email-edit-submit",
              payload: { selections: getSelections(), text: text },
            },
            "*",
          );
          cleanup();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup();
        }
      });

      popupEl.addEventListener("mousedown", function (event) {
        event.stopPropagation();
      });
      popupEl.addEventListener("click", function (event) {
        event.stopPropagation();
      });

      window.addEventListener("scroll", onReposition, true);
      window.addEventListener("resize", onReposition);
    }

    updatePopupChips();
    positionPopup(el);
    window.requestAnimationFrame(function () {
      if (popupInput) {
        popupInput.focus();
        popupInput.select();
      }
    });
  }

  function onMouseOver(event) {
    if (!active || editingEl) return;
    var el = event.target;
    if (!(el instanceof Element) || el.tagName === "HTML" || el.tagName === "BODY") return;
    if (isDesignUi(el)) return;
    if (el === hoverEl) return;
    clearHover();
    hoverEl = el;
    hoverEl.classList.add(HOVER);
  }

  function onMouseOut() {
    clearHover();
  }

  function onClick(event) {
    if (!active) return;
    var el = event.target;
    if (!(el instanceof Element) || el.tagName === "HTML" || el.tagName === "BODY") return;
    if (isDesignUi(el)) return;
    event.preventDefault();
    event.stopPropagation();
    clearHover();

    if (clickTimer) clearTimeout(clickTimer);
    var shiftKey = event.shiftKey;
    clickTimer = window.setTimeout(function () {
      clickTimer = null;
      handleDesignClick({ shiftKey: shiftKey }, el);
    }, 220);
  }

  function handleDesignClick(event, el) {
    if (event.shiftKey) {
      var index = selectedElements.indexOf(el);
      if (index >= 0) {
        selectedElements.splice(index, 1);
        el.classList.remove(SELECTED);
        if (selectedElements.length === 0) {
          removePopup();
          return;
        }
        showPopup(selectedElements[selectedElements.length - 1]);
      } else {
        selectedElements.push(el);
        el.classList.add(SELECTED);
        showPopup(el);
      }
      return;
    }

    clearSelectedAll();
    selectedElements = [el];
    el.classList.add(SELECTED);
    showPopup(el);
  }

  function onDoubleClick(event) {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    var el = event.target;
    if (!(el instanceof Element) || el.tagName === "HTML" || el.tagName === "BODY") return;
    if (isDesignUi(el)) return;

    var target = findEditableTarget(el);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    removePopup();
    clearHover();
    clearSelectedAll();
    startInlineEdit(target);
  }

  function setActive(next) {
    active = !!next;
    injectStyles();
    if (!active) cleanup();
    else document.body.style.cursor = "crosshair";
    if (!active) document.body.style.cursor = "";
  }

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type === "crm-design-mode-set") setActive(!!data.active);
    if (data.type === "crm-email-inline-edit-apply-styles") applyInlineStyles(data.payload || {});
    if (data.type === "crm-email-inline-edit-finish") finishInlineEdit();
    if (data.type === "crm-email-inline-edit-cancel") cancelInlineEdit(true);
    if (data.type === "crm-email-inline-edit-delete") deleteInlineElement();
  });

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("mousedown", onPreventPreviewNavigation, true);
  document.addEventListener("click", onPreventPreviewNavigation, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("dblclick", onDoubleClick, true);
})();
</script>`;

export function withEmailDesignModeScript(html: string): string {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${DESIGN_MODE_SCRIPT}</body>`);
  }
  return `${html}${DESIGN_MODE_SCRIPT}`;
}

export function formatDesignTargetPrompt(
  selections: EmailPreviewDesignSelection[],
  userText: string,
): string {
  const targets = selections
    .map(
      (selection, index) =>
        `Target ${index + 1}: ${selection.label}
Tag: ${selection.tagName}
Selector: ${selection.selector}
Current text: ${selection.text || "(none)"}`,
    )
    .join("\n\n");

  return `[Visual edit targets in the live email preview]
${targets}

Request: ${userText}`;
}

export function VisualEditUserBubble(props: {
  content: string;
  selections: EmailPreviewDesignSelection[];
}) {
  return (
    <div className="genie-chat-selectable max-w-[92%] cursor-text rounded-md border border-border/70 bg-white px-3.5 py-2.5 text-sm leading-snug text-foreground shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MousePointerClick className="size-3.5 shrink-0" />
        Visual edit
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {props.selections.map((selection) => (
          <span
            key={selection.selector}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-foreground"
          >
            <span className="truncate">{selection.label}</span>
          </span>
        ))}
      </div>
      <span className="whitespace-pre-wrap">{props.content}</span>
    </div>
  );
}

export function patchCampaignHtmlBody(args: {
  content: CampaignContent;
  bodyHtml: string;
  previewFirstName?: string | null;
}): CampaignContent | null {
  const stored = getStoredCampaignHtml(args.content);
  if (!stored) return null;

  const restoredBody = restoreMergeTags(args.bodyHtml, { firstName: args.previewFirstName });
  const nextHtml = replaceCampaignHtmlBody(stored, restoredBody);

  return {
    ...args.content,
    body: htmlToPlainText(nextHtml).slice(0, 4000),
    design: {
      ...args.content.design!,
      html: nextHtml,
    },
  };
}

export const DesignModeEmailPreview = React.forwardRef<
  EmailPreviewEditorHandle,
  {
    templateKey: string;
    content: CampaignContent;
    store: StoreBranding;
    className?: string;
    previewFirstName?: string | null;
    designModeActive: boolean;
    onDesignModeActiveChange: (active: boolean) => void;
    onSubmitVisualEdit: (selections: EmailPreviewDesignSelection[], text: string) => void;
    onDirectHtmlEdit?: (bodyHtml: string) => void;
    onInlineEditStart?: (state: EmailInlineEditState) => void;
    onInlineEditEnd?: () => void;
  }
>(function DesignModeEmailPreview(
  {
    templateKey,
    content,
    store,
    className,
    previewFirstName,
    designModeActive,
    onDesignModeActiveChange,
    onSubmitVisualEdit,
    onDirectHtmlEdit,
    onInlineEditStart,
    onInlineEditEnd,
  },
  ref,
) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const deferredContent = React.useDeferredValue(content);

  const previewHtml = React.useMemo(
    () =>
      withEmailDesignModeScript(
        applyMergeTags(
          renderCampaignEmail({
            templateKey,
            content: deferredContent,
            store,
            unsubscribeUrl: PREVIEW_UNSUBSCRIBE_PLACEHOLDER,
          }).html,
          { firstName: previewFirstName },
        ),
      ),
    [templateKey, deferredContent, store, previewFirstName],
  );

  const syncDesignMode = React.useCallback((active: boolean) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "crm-design-mode-set", active }, "*");
  }, []);

  const postToIframe = React.useCallback((type: string, payload?: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ type, payload }, "*");
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      applyStyles: (styles) => postToIframe("crm-email-inline-edit-apply-styles", styles),
      finishEdit: () => postToIframe("crm-email-inline-edit-finish"),
      cancelEdit: () => postToIframe("crm-email-inline-edit-cancel"),
      deleteElement: () => postToIframe("crm-email-inline-edit-delete"),
    }),
    [postToIframe],
  );

  React.useEffect(() => {
    syncDesignMode(designModeActive);
  }, [designModeActive, previewHtml, syncDesignMode]);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "crm-email-edit-submit") {
        const payload = event.data.payload as {
          selections?: EmailPreviewDesignSelection[];
          text?: string;
        };
        const selections = payload?.selections ?? [];
        const text = payload?.text?.trim() ?? "";
        if (!text || selections.length === 0) return;
        onSubmitVisualEdit(selections, text);
        onDesignModeActiveChange(false);
        return;
      }

      if (event.data?.type === "crm-email-inline-edit-start") {
        const payload = event.data.payload as EmailInlineEditState | undefined;
        if (payload) onInlineEditStart?.(payload);
        return;
      }

      if (event.data?.type === "crm-email-inline-edit-end") {
        onInlineEditEnd?.();
        return;
      }

      if (event.data?.type === "crm-email-direct-edit") {
        const bodyHtml = (event.data.payload as { bodyHtml?: string } | undefined)?.bodyHtml?.trim();
        if (!bodyHtml || !onDirectHtmlEdit) return;
        onDirectHtmlEdit(bodyHtml);
        return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onDesignModeActiveChange, onDirectHtmlEdit, onInlineEditEnd, onInlineEditStart, onSubmitVisualEdit]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-b-xl border border-border/60 bg-white shadow-sm transition-shadow",
        designModeActive && "ring-2 ring-zinc-900/80 ring-offset-2",
        className,
      )}
    >
      {designModeActive ? (
        <div className="border-b border-border/40 bg-gray-50 px-3 py-1.5 text-center text-xs text-muted-foreground">
          Click an element to edit with AI · Shift+click to add more · Double-click text to edit directly
        </div>
      ) : (
        <div className="border-b border-border/40 bg-gray-50 px-3 py-1.5 text-center text-xs text-muted-foreground">
          Double-click any text to edit · Format in the panel on the right
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Campaign email preview"
        sandbox="allow-scripts allow-same-origin"
        srcDoc={previewHtml}
        onLoad={() => syncDesignMode(designModeActive)}
        className="h-full min-h-[480px] w-full bg-white"
      />
    </div>
  );
});
