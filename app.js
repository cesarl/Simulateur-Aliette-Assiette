window.addEventListener("DOMContentLoaded", () => {
  const canvasElement = document.getElementById("canvas-assiette");
  const dropZoneElement =
    document.getElementById("plate-container") || canvasElement;
  const galleryElement = document.getElementById("gallery");
  const searchInput = document.getElementById("search");
  const categorySelect = document.getElementById("category-select");
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  const addTextBtn = document.getElementById("add-text-btn");

  if (
    !canvasElement ||
    !galleryElement ||
    !searchInput ||
    !categorySelect ||
    !undoBtn ||
    !redoBtn ||
    !addTextBtn
  ) {
    console.error("Certains éléments requis du DOM sont introuvables.");
    return;
  }

  const canvas = new fabric.Canvas("canvas-assiette", {
    selection: true,
  });

  // S'assurer de la taille exacte 600x600
  canvas.setWidth(600);
  canvas.setHeight(600);

  // Création d'une assiette de base en fond (cercle) non sélectionnable
  const plateRadius = 280;
  const plate = new fabric.Circle({
    left: canvas.getWidth() / 2,
    top: canvas.getHeight() / 2,
    radius: plateRadius,
    fill: "#f5f5f5",
    stroke: "#cccccc",
    strokeWidth: 4,
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false,
    isPlate: true,
  });

  canvas.add(plate);
  canvas.sendToBack(plate);

  // --- Historique Undo / Redo ---
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 75;
  let isRestoringHistory = false;
  let isRestoringFromUrl = false;

  function serializeCanvas() {
    return JSON.stringify(canvas.toDatalessJSON(["isPlate", "sourceUrl"]));
  }

  function updateHistoryButtons() {
    undoBtn.disabled = undoStack.length <= 1;
    redoBtn.disabled = redoStack.length === 0;
  }

  function enforcePlateRules() {
    canvas.getObjects().forEach((obj) => {
      if (obj.isPlate) {
        obj.set({
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
        });
        canvas.sendToBack(obj);
      }
    });
  }

  function saveHistoryState() {
    if (isRestoringHistory || isRestoringFromUrl) return;

    const state = serializeCanvas();
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === state) {
      return;
    }

    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack.length = 0;
    updateHistoryButtons();
  }

  function restoreState(state) {
    if (!state) return;

    isRestoringHistory = true;
    canvas.loadFromJSON(state, () => {
      enforcePlateRules();
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      isRestoringHistory = false;
      updateHistoryButtons();
      syncStateToUrl();
    });
  }

  function undo() {
    if (undoStack.length <= 1) return;

    const current = undoStack.pop();
    redoStack.push(current);
    const previous = undoStack[undoStack.length - 1];
    restoreState(previous);
  }

  function redo() {
    if (redoStack.length === 0) return;

    const next = redoStack.pop();
    undoStack.push(next);
    restoreState(next);
  }

  // Exposer le canvas pour les futures phases si besoin
  window.assietteCanvas = canvas;
  window.undoCanvas = undo;
  window.redoCanvas = redo;

  function encodeBase64Utf8(value) {
    return btoa(unescape(encodeURIComponent(value)));
  }

  function decodeBase64Utf8(value) {
    return decodeURIComponent(escape(atob(value)));
  }

  function getObjectSourceUrl(obj) {
    if (obj.sourceUrl) return obj.sourceUrl;
    if (obj._element?.currentSrc) return obj._element.currentSrc;
    if (obj._element?.src) return obj._element.src;
    return "";
  }

  function getMinimalCanvasState() {
    return canvas
      .getObjects()
      .filter((obj) => !obj.isPlate)
      .map((obj, zIndex) => {
        if (obj.type === "image") {
          return {
            type: "image",
            url: getObjectSourceUrl(obj),
            x: obj.left || 0,
            y: obj.top || 0,
            scaleX: obj.scaleX ?? 1,
            scaleY: obj.scaleY ?? 1,
            angle: obj.angle || 0,
            zIndex,
          };
        }

        if (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text") {
          return {
            type: "text",
            text: obj.text || "",
            x: obj.left || 0,
            y: obj.top || 0,
            scaleX: obj.scaleX ?? 1,
            scaleY: obj.scaleY ?? 1,
            angle: obj.angle || 0,
            zIndex,
          };
        }

        return null;
      })
      .filter(Boolean);
  }

  function syncStateToUrl() {
    if (isRestoringFromUrl) return;

    const minimalState = getMinimalCanvasState();
    const url = new URL(window.location.href);

    if (minimalState.length === 0) {
      url.searchParams.delete("state");
    } else {
      try {
        const stateJson = JSON.stringify(minimalState);
        const stateEncoded = encodeBase64Utf8(stateJson);
        url.searchParams.set("state", stateEncoded);
      } catch (error) {
        console.error("Impossible d'encoder l'état du canvas pour l'URL", error);
      }
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function restoreCanvasFromUrlState() {
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get("state");

    if (!encodedState) {
      saveHistoryState();
      updateHistoryButtons();
      syncStateToUrl();
      return;
    }

    let decodedState;
    try {
      decodedState = decodeBase64Utf8(encodedState);
    } catch (error) {
      console.error("Impossible de décoder l'état URL", error);
      saveHistoryState();
      updateHistoryButtons();
      return;
    }

    let parsedState;
    try {
      parsedState = JSON.parse(decodedState);
      if (!Array.isArray(parsedState)) {
        throw new Error("state URL invalide : format inattendu");
      }
    } catch (error) {
      console.error("Impossible de parser l'état URL", error);
      saveHistoryState();
      updateHistoryButtons();
      return;
    }

    isRestoringFromUrl = true;

    canvas.getObjects().forEach((obj) => {
      if (!obj.isPlate) {
        canvas.remove(obj);
      }
    });

    const restoreSequentially = async () => {
      const layeredState = [...parsedState].sort(
        (a, b) => (Number(a?.zIndex) || 0) - (Number(b?.zIndex) || 0)
      );

      for (const item of layeredState) {
        if (!item || !item.type) continue;

        if (item.type === "text") {
          const textObject = new fabric.IText(item.text || "Texte", {
            left: Number(item.x) || canvas.getWidth() / 2,
            top: Number(item.y) || canvas.getHeight() / 2,
            originX: "center",
            originY: "center",
            scaleX: Number(item.scaleX) || 1,
            scaleY: Number(item.scaleY) || 1,
            angle: Number(item.angle) || 0,
            fill: "#222222",
            fontSize: 28,
          });
          canvas.add(textObject);
          continue;
        }

        if (item.type === "image" && item.url) {
          // Chargement séquentiel pour préserver strictement l'ordre (z-index).
          await new Promise((resolve) => {
            fabric.Image.fromURL(
              item.url,
              (img) => {
                if (img) {
                  img.set({
                    left: Number(item.x) || canvas.getWidth() / 2,
                    top: Number(item.y) || canvas.getHeight() / 2,
                    originX: "center",
                    originY: "center",
                    scaleX: Number(item.scaleX) || 1,
                    scaleY: Number(item.scaleY) || 1,
                    angle: Number(item.angle) || 0,
                  });
                  img.sourceUrl = item.url;
                  canvas.add(img);
                }
                resolve();
              },
              { crossOrigin: "anonymous" }
            );
          });
        }
      }
    };

    restoreSequentially().finally(() => {
      enforcePlateRules();
      canvas.discardActiveObject();
      canvas.requestRenderAll();

      undoStack.length = 0;
      redoStack.length = 0;

      isRestoringFromUrl = false;
      saveHistoryState();
      updateHistoryButtons();
      syncStateToUrl();
    });
  }

  // --- Bibliothèque d'images & galerie ---
  let imageLibrary = [];

  function parseCategoriesFromImage(img) {
    if (!img) return [];
    const fromArray = Array.isArray(img.categories)
      ? img.categories.map((c) => String(c).trim()).filter(Boolean)
      : [];
    const fromLegacy = String(img.category || "")
      .split(/[;,]/)
      .map((c) => c.trim())
      .filter(Boolean);
    return Array.from(new Set([...fromArray, ...fromLegacy]));
  }

  function rebuildCategoryOptions() {
    const set = new Set();
    imageLibrary.forEach((img) => {
      parseCategoriesFromImage(img).forEach((cat) => set.add(cat));
    });

    const currentValue = categorySelect.value || "all";
    categorySelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Toutes les catégories";
    categorySelect.appendChild(allOption);

    Array.from(set)
      .sort((a, b) => a.localeCompare(b, "fr"))
      .forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
      });

    // Restaure si possible la sélection précédente
    if (
      currentValue !== "all" &&
      Array.from(categorySelect.options).some((o) => o.value === currentValue)
    ) {
      categorySelect.value = currentValue;
    } else {
      categorySelect.value = "all";
    }
  }

  function renderGallery(images) {
    galleryElement.innerHTML = "";

    images.forEach((imgData) => {
      const img = document.createElement("img");
      img.src = imgData.url;
      img.alt = imgData.id;
      img.className = "gallery-item";
      img.draggable = true;

      img.dataset.id = imgData.id;
      img.dataset.url = imgData.url;
      img.dataset.category = imgData.category;
      img.dataset.keywords = (imgData.keywords || []).join(",");

      img.addEventListener("dragstart", (event) => {
        const payload = {
          id: imgData.id,
          url: imgData.url,
          category: imgData.category,
          keywords: imgData.keywords || [],
        };
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      });

      galleryElement.appendChild(img);
    });
  }

  function filterAndRenderGallery() {
    const term = searchInput.value.trim().toLowerCase();
    const selectedCategory = categorySelect.value;

    const filtered = imageLibrary.filter((img) => {
      const imgCategories = parseCategoriesFromImage(img);
      const matchesCategory =
        selectedCategory === "all" ||
        imgCategories.includes(selectedCategory);

      if (!matchesCategory) return false;

      if (!term) return true;

      const keywordsString = (img.keywords || []).join(" ").toLowerCase();
      return keywordsString.includes(term);
    });

    renderGallery(filtered);
  }

  // Fetch du fichier data.json
  fetch("data.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Impossible de charger data.json");
      }
      return response.json();
    })
    .then((data) => {
      imageLibrary = Array.isArray(data) ? data : [];
      rebuildCategoryOptions();
      filterAndRenderGallery();
    })
    .catch((error) => {
      console.error(error);
    });

  // Mettre à jour la galerie en temps réel selon la recherche / catégorie
  searchInput.addEventListener("input", filterAndRenderGallery);
  categorySelect.addEventListener("change", filterAndRenderGallery);

  // --- Drag & drop vers le canvas Fabric.js ---
  dropZoneElement.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  });

  dropZoneElement.addEventListener("drop", (event) => {
    event.preventDefault();

    const data = event.dataTransfer?.getData("text/plain");
    if (!data) return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch (e) {
      console.error("Données de drop invalides", e);
      return;
    }

    const rect = canvasElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (!payload.url) return;

    fabric.Image.fromURL(
      payload.url,
      (img) => {
        if (!img) return;

        // Taille de départ maîtrisée pour faciliter la manipulation
        const maxInitialSize = 180;
        const maxDim = Math.max(img.width || 1, img.height || 1);
        if (maxDim > maxInitialSize) {
          const scale = maxInitialSize / maxDim;
          img.scale(scale);
        }

        img.set({
          left: x,
          top: y,
          originX: "center",
          originY: "center",
        });
        img.sourceUrl = payload.url;

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
      },
      {
        crossOrigin: "anonymous",
      }
    );
  });

  // Capturer toutes les mutations canvas pour l'historique
  canvas.on("object:modified", (event) => {
    // Aligne la couche réelle avec l'intention visuelle: un objet modifié passe devant.
    const target = event?.target;
    if (target && !target.isPlate) {
      canvas.bringToFront(target);
      canvas.requestRenderAll();
    }
  });
  canvas.on("object:added", saveHistoryState);
  canvas.on("object:removed", saveHistoryState);
  canvas.on("object:modified", saveHistoryState);
  canvas.on("object:added", syncStateToUrl);
  canvas.on("object:removed", syncStateToUrl);
  canvas.on("object:modified", syncStateToUrl);
  canvas.on("text:changed", syncStateToUrl);
  canvas.on("text:editing:exited", syncStateToUrl);

  // Suppression d'un objet sélectionné (hors assiette)
  window.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const isTypingContext =
      activeTag === "input" || activeTag === "textarea" || activeTag === "select";

    const ctrlOrCmd = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (ctrlOrCmd && key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if (ctrlOrCmd && key === "y") {
      event.preventDefault();
      redo();
      return;
    }

    if (
      !isTypingContext &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      if (activeObject.type === "activeSelection") {
        activeObject.forEachObject((obj) => {
          if (!obj.isPlate) {
            canvas.remove(obj);
          }
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        return;
      }

      if (!activeObject.isPlate) {
        canvas.remove(activeObject);
        canvas.requestRenderAll();
      }
    }
  });

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  addTextBtn.addEventListener("click", () => {
    const textObject = new fabric.IText("Votre texte", {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: "center",
      originY: "center",
      fill: "#222222",
      fontSize: 32,
    });

    canvas.add(textObject);
    canvas.setActiveObject(textObject);
    canvas.requestRenderAll();

    // Activer l'édition immédiatement après le rendu.
    setTimeout(() => {
      if (canvas.getActiveObject() === textObject) {
        textObject.enterEditing();
        textObject.selectAll();
      }
    }, 0);
  });

  restoreCanvasFromUrlState();
});

