// Etat global simple pour l'outil admin
let existingData = null; // contenu JSON du data.json
let folderImages = []; // File[] des images du dossier
let newImages = []; // File[] des nouvelles images
let editableItems = []; // entrées éditables (existant + nouvelles)
let knownCategories = []; // catégories connues pour auto-complétion
let projectRootSegment = ""; // premier segment webkitRelativePath (dossier racine choisi)

const projectInput = document.getElementById("project-upload");
const projectStatus = document.getElementById("project-status");
const taggingZone = document.getElementById("tagging-zone");
const generateBtn = document.getElementById("generate-json-btn");
const categoriesDatalist = document.getElementById("categories");
const categoryList = document.getElementById("category-list");
const newCategoryInput = document.getElementById("new-category-input");
const addCategoryBtn = document.getElementById("add-category-btn");

function updateProjectStatus(message) {
  if (projectStatus) {
    projectStatus.textContent = message;
  }
}

function extractFilenameFromUrl(url) {
  if (!url || typeof url !== "string") return "";

  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const u = new URL(url);
      return decodeURIComponent(u.pathname.split("/").pop() || "").toLowerCase();
    }
  } catch (_e) {}

  const parts = url.split("/");
  return decodeURIComponent(parts[parts.length - 1] || "").toLowerCase();
}

function normalizePath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .toLowerCase();
}

function getFileRelativePath(file) {
  return normalizePath(file.webkitRelativePath || file.name);
}

function stripProjectRoot(path) {
  const normalized = normalizePath(path);
  if (!projectRootSegment) return normalized;
  const prefix = `${projectRootSegment}/`;
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
}

function toCatalogUrl(path) {
  const withoutRoot = stripProjectRoot(path);
  return withoutRoot ? `./${withoutRoot}` : "";
}

function getExistingItemsArray() {
  if (!existingData) return [];
  if (Array.isArray(existingData)) return existingData;
  if (Array.isArray(existingData.data)) return existingData.data;
  if (Array.isArray(existingData.images)) return existingData.images;
  return [];
}

function parseCategoriesFromItem(item) {
  if (!item) return [];
  // Fusionne toujours "categories" (nouveau format) + "category" (compat).
  const fromArray = Array.isArray(item.categories)
    ? item.categories.map((c) => String(c).trim()).filter(Boolean)
    : [];

  const fromLegacy = String(item.category || "")
    .split(/[;,]/)
    .map((c) => c.trim())
    .filter(Boolean);

  return Array.from(new Set([...fromArray, ...fromLegacy]));
}

function buildExistingPathsSet() {
  const set = new Set();

  getExistingItemsArray().forEach((item) => {
    if (!item || !item.url) return;
    const rawUrl = String(item.url);
    const filename = extractFilenameFromUrl(rawUrl);
    const normalizedUrl = normalizePath(rawUrl);
    const strippedUrl = stripProjectRoot(rawUrl);
    if (filename) set.add(filename);
    if (normalizedUrl) set.add(normalizedUrl);
    if (strippedUrl) set.add(strippedUrl);
  });

  return set;
}

function collectExistingCategories() {
  if (!categoriesDatalist) return;

  const set = new Set();
  getExistingItemsArray().forEach((item) => {
    const categories = parseCategoriesFromItem(item);
    categories.forEach((cat) => set.add(cat));
  });

  categoriesDatalist.innerHTML = "";
  knownCategories = Array.from(set).sort();
  knownCategories
    .sort()
    .forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      categoriesDatalist.appendChild(option);
    });
}

function renderCategoryEditor() {
  if (!categoryList) return;

  categoryList.innerHTML = "";
  if (knownCategories.length === 0) {
    const empty = document.createElement("span");
    empty.className = "status";
    empty.textContent = "Aucune catégorie pour l'instant.";
    categoryList.appendChild(empty);
    return;
  }

  knownCategories.forEach((cat) => {
    const chip = document.createElement("span");
    chip.className = "category-chip";
    chip.textContent = cat;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.title = `Supprimer ${cat}`;
    removeBtn.addEventListener("click", () => {
      knownCategories = knownCategories.filter((c) => c !== cat);
      editableItems.forEach((item) => {
        item.categories = (item.categories || []).filter((c) => c !== cat);
      });
      renderCategoryEditor();
      renderTaggingCards();
    });

    chip.appendChild(removeBtn);
    categoryList.appendChild(chip);
  });
}

function addCategory(categoryName) {
  const clean = String(categoryName || "").trim();
  if (!clean) return;
  if (knownCategories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return;
  }
  knownCategories.push(clean);
  knownCategories.sort((a, b) => a.localeCompare(b, "fr"));
  renderCategoryEditor();
  renderTaggingCards();
}

function renderTaggingCards() {
  if (!taggingZone) return;
  taggingZone.innerHTML = "";

  if (!existingData) {
    const info = document.createElement("div");
    info.className = "status";
    info.textContent = "Chargez d'abord un dossier projet contenant data.json.";
    taggingZone.appendChild(info);
    return;
  }

  if (editableItems.length === 0) {
    const info = document.createElement("div");
    info.className = "status";
    info.textContent = "Aucune entrée à éditer pour l'instant.";
    taggingZone.appendChild(info);
    return;
  }

  editableItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "tag-card";
    card.dataset.filename = item.id || "";
    card.dataset.filepath = item.url || "";
    card.dataset.index = String(index);

    const badge = document.createElement("span");
    badge.className = `card-badge ${item.isNew ? "new" : ""}`;
    badge.textContent = item.isNew ? "Nouveau" : "Existant";

    const img = document.createElement("img");
    if (item.previewUrl) {
      img.src = item.previewUrl;
    } else {
      img.src = "https://dummyimage.com/300x200/efefef/777&text=No+Preview";
    }
    img.alt = item.id || item.url || "image";

    const filenameEl = document.createElement("div");
    filenameEl.className = "tag-card-filename";
    filenameEl.textContent = item.url || item.id || "";

    const keywordsLabel = document.createElement("div");
    keywordsLabel.className = "field-label";
    keywordsLabel.textContent = "Mots-clés (séparés par virgules)";
    const keywordsInput = document.createElement("input");
    keywordsInput.type = "text";
    keywordsInput.className = "tag-keywords";
    keywordsInput.placeholder = "mots-clés, séparés, par des virgules";
    keywordsInput.value = (item.keywords || []).join(", ");

    const categoriesLabel = document.createElement("div");
    categoriesLabel.className = "field-label";
    categoriesLabel.textContent = "Catégories (multi-sélection)";
    const categoriesBoxes = document.createElement("div");
    categoriesBoxes.className = "category-boxes";
    const selectedCategories = new Set(item.categories || []);

    knownCategories.forEach((cat) => {
      const label = document.createElement("label");
      label.className = "category-box";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "category-checkbox";
      checkbox.value = cat;
      checkbox.checked = selectedCategories.has(cat);

      const text = document.createElement("span");
      text.textContent = cat;

      label.appendChild(checkbox);
      label.appendChild(text);
      categoriesBoxes.appendChild(label);
    });

    card.appendChild(badge);
    card.appendChild(img);
    card.appendChild(filenameEl);
    card.appendChild(keywordsLabel);
    card.appendChild(keywordsInput);
    card.appendChild(categoriesLabel);
    card.appendChild(categoriesBoxes);
    taggingZone.appendChild(card);
  });
}

function runDiff() {
  const existingItems = getExistingItemsArray();
  const existingPaths = buildExistingPathsSet();

  // Indexation de tous les fichiers d'images disponibles dans le projet.
  const fileByPath = new Map();
  folderImages.forEach((file) => {
    const rel = getFileRelativePath(file);
    const nameOnly = normalizePath(file.name);
    fileByPath.set(rel, file);
    fileByPath.set(nameOnly, file);
  });

  newImages = folderImages.filter((file) => {
    const filename = normalizePath(file.name);
    const relativePath = getFileRelativePath(file);
    return !existingPaths.has(filename) && !existingPaths.has(relativePath);
  });

  editableItems = [];

  // Entrées existantes (éditables)
  existingItems.forEach((item) => {
    if (!item) return;
    const url = String(item.url || "").trim();
    const normalizedUrl = normalizePath(url);
    const strippedUrl = stripProjectRoot(url);
    const filenameFromUrl = extractFilenameFromUrl(url);
    const linkedFile =
      fileByPath.get(normalizedUrl) ||
      fileByPath.get(strippedUrl) ||
      fileByPath.get(normalizePath(filenameFromUrl));

    const categories = parseCategoriesFromItem(item);

    editableItems.push({
      isNew: false,
      id: String(item.id || extractFilenameFromUrl(url) || ""),
      url: linkedFile ? toCatalogUrl(getFileRelativePath(linkedFile)) : toCatalogUrl(url),
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
      categories,
      previewUrl: linkedFile ? URL.createObjectURL(linkedFile) : "",
    });
  });

  // Entrées nouvelles
  newImages.forEach((file) => {
    const relativePath = getFileRelativePath(file);
    editableItems.push({
      isNew: true,
      id: file.name,
      url: toCatalogUrl(relativePath),
      keywords: [],
      categories: [],
      previewUrl: URL.createObjectURL(file),
    });
  });

  console.group("[Admin Tool] Résultat du diff d'images");
  console.log("Total images dans le dossier :", folderImages.length);
  console.log("Nouvelles images détectées :", newImages.length);
  console.log("Entrées éditables (total) :", editableItems.length);
  if (newImages.length > 0) {
    console.log(
      "Liste des nouvelles images :",
      newImages.map((f) => getFileRelativePath(f))
    );
  }
  console.groupEnd();

  collectExistingCategories();
  renderCategoryEditor();
  renderTaggingCards();
}

function processProjectFolder(files) {
  const allFiles = Array.from(files || []);
  const allowedExtensions = ["png", "jpg", "jpeg"];

  const jsonFile =
    allFiles.find((file) => file.name.toLowerCase() === "data.json") || null;

  folderImages = allFiles.filter((file) => {
    const ext = file.name.toLowerCase().split(".").pop();
    return !!ext && allowedExtensions.includes(ext);
  });

  if (!jsonFile) {
    existingData = null;
    newImages = [];
    updateProjectStatus(
      "data.json introuvable dans le dossier sélectionné. Vérifiez le dossier racine."
    );
    renderTaggingCards();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      existingData = JSON.parse(reader.result);
      const existingCount = getExistingItemsArray().length;

      updateProjectStatus(
        `Dossier chargé : ${allFiles.length} fichier(s), ${folderImages.length} image(s), ${existingCount} entrée(s) dans data.json.`
      );

      console.log("[Admin Tool] data.json chargé automatiquement :", jsonFile.name);
      runDiff();
    } catch (error) {
      existingData = null;
      newImages = [];
      updateProjectStatus("Erreur de parsing du data.json. Voir la console.");
      console.error("[Admin Tool] Erreur de parsing JSON :", error);
      renderTaggingCards();
    }
  };

  reader.onerror = () => {
    existingData = null;
    newImages = [];
    updateProjectStatus("Erreur de lecture du data.json. Voir la console.");
    console.error("[Admin Tool] Erreur de lecture FileReader :", reader.error);
    renderTaggingCards();
  };

  reader.readAsText(jsonFile, "utf-8");
}

if (projectInput) {
  projectInput.addEventListener("change", (event) => {
    const firstRelPath = String(event.target.files?.[0]?.webkitRelativePath || "");
    projectRootSegment = normalizePath(firstRelPath).split("/")[0] || "";
    processProjectFolder(event.target.files);
  });
}

if (addCategoryBtn && newCategoryInput) {
  addCategoryBtn.addEventListener("click", () => {
    addCategory(newCategoryInput.value);
    newCategoryInput.value = "";
    newCategoryInput.focus();
  });

  newCategoryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCategory(newCategoryInput.value);
      newCategoryInput.value = "";
    }
  });
}

if (generateBtn) {
  generateBtn.addEventListener("click", () => {
    if (!existingData) {
      alert("Veuillez d'abord charger un dossier projet contenant data.json.");
      return;
    }

    const cards = Array.from(document.querySelectorAll(".tag-card"));
    if (cards.length === 0) {
      alert("Aucune entrée à exporter.");
      return;
    }

    const merged = cards.map((card) => {
      const keywordsInput = card.querySelector(".tag-keywords");
      const checkedCategories = Array.from(
        card.querySelectorAll(".category-checkbox:checked")
      ).map((input) => input.value);

      const id = String(card.dataset.filename || "").trim();
      const url = String(card.dataset.filepath || id).trim();

      const keywords = String((keywordsInput && keywordsInput.value) || "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const categories = checkedCategories;

      const category = categories[0] || "";

      return {
        id,
        url,
        keywords,
        categories,
        category,
      };
    });
    const jsonString = JSON.stringify(merged, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(
      "[Admin Tool] Nouveau data.json généré. Ancien:",
      getExistingItemsArray().length,
      "Nouvelles images détectées:",
      newImages.length,
      "Total:",
      merged.length
    );
  });
}

