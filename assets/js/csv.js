function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }

  return rows;
}

function truthy(v) {
  return ["1", "true", "yes", "y", "on"].includes(String(v ?? "").trim().toLowerCase());
}

function splitAuthors(authorsRaw) {
  const text = String(authorsRaw || "").trim();
  if (!text) return [];
  const separator = text.includes(";") ? ";" : ",";
  return text
    .split(separator)
    .map((name) => name.trim())
    .filter(Boolean);
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function isJapaneseText(text) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(String(text || ""));
}

function isDeadLinkMarker(text) {
  return String(text || "").trim().toLowerCase() === "dead link";
}

function getDisplayExtra(text) {
  return isDeadLinkMarker(text) ? "" : String(text || "").trim();
}

function hasLiveUrl(url, extra) {
  const normalizedUrl = String(url || "").trim();
  return Boolean(normalizedUrl) && normalizedUrl !== "#" && !isDeadLinkMarker(normalizedUrl) && !isDeadLinkMarker(extra);
}

function normalizeAuthorsForDisplay(authorsRaw) {
  const names = splitAuthors(authorsRaw);
  if (names.length <= 1) return names[0] || "";
  if (names.every(isJapaneseText)) return names.join(", ");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function normalizeAuthorsForBibtex(authorsRaw) {
  return splitAuthors(stripHtml(authorsRaw)).join(" and ");
}

function highlightMyName(authorsText) {
  if (!authorsText) return authorsText;
  return authorsText.replace(/T\.\s*Miki/g, "<u>T. Miki</u>");
}

function escapeBibtex(v) {
  return String(v || "")
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .trim();
}

function getBibtexKey(authorsRaw, year) {
  const firstAuthor = splitAuthors(stripHtml(authorsRaw))[0] || "key";
  const lastName = firstAuthor.split(/\s+/).slice(-1)[0] || "key";
  const y = String(year || "").trim() || "yyyy";
  return `${lastName}${y}`.replace(/[^a-zA-Z0-9_-]/g, "");
}

function extractArxivId(journal) {
  const m = String(journal || "").match(/arxiv\s*:?\s*([0-9.]+)(?:\s*\[[^\]]+\])?/i);
  return m ? m[1] : "";
}

function buildBibtexFromFields(pub) {
  if (!pub.title || !pub.authorsRaw) return "";

  const key = getBibtexKey(pub.authorsRaw, pub.year);
  const authors = normalizeAuthorsForBibtex(pub.authorsRaw);
  const isArxiv = /arxiv/i.test(pub.journal) || /arxiv/i.test(pub.url);
  const arxivId = extractArxivId(pub.journal);

  const lines = [isArxiv ? `@misc{${key},` : `@article{${key},`];
  lines.push(`  title={${escapeBibtex(pub.title)}},`);
  lines.push(`  author={${escapeBibtex(authors)}},`);

  if (!isArxiv && pub.journal) lines.push(`  journal={${escapeBibtex(pub.journal)}},`);
  if (!isArxiv && pub.volume) lines.push(`  volume={${escapeBibtex(pub.volume)}},`);
  if (!isArxiv && pub.page) lines.push(`  pages={${escapeBibtex(pub.page)}},`);
  if (pub.year) lines.push(`  year={${escapeBibtex(pub.year)}},`);
  if (pub.doi) lines.push(`  doi={${escapeBibtex(pub.doi)}},`);

  if (isArxiv) {
    if (arxivId) lines.push(`  eprint={${escapeBibtex(arxivId)}},`);
    lines.push("  archivePrefix={arXiv},");
  }

  if (pub.url) lines.push(`  url={${escapeBibtex(pub.url)}}`);

  lines.push("}");
  return lines.join("\n");
}

function makeHeaderIndex(headers) {
  return headers.reduce((acc, key, i) => {
    acc[key.trim()] = i;
    return acc;
  }, {});
}

function getCell(cols, idxMap, key) {
  const idx = idxMap[key];
  if (idx === undefined || idx < 0) return "";
  return (cols[idx] ?? "").trim();
}

function copyTextWithFallback(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

function setCopyButtonState(copyBtn, text, cssClass, delayMs) {
  copyBtn.textContent = text;
  copyBtn.classList.add(cssClass);
  setTimeout(() => {
    copyBtn.textContent = "Copy";
    copyBtn.classList.remove(cssClass);
  }, delayMs);
}

function createBibtexControls(bibtexText) {
  const tools = document.createElement("span");
  tools.className = "bibtex-tools";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "bibtex-btn";
  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.textContent = "BibTeX";

  const block = document.createElement("pre");
  block.className = "bibtex-block";
  block.textContent = bibtexText;
  block.hidden = true;

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "bibtex-copy";
  copyBtn.textContent = "Copy";

  toggleBtn.addEventListener("click", () => {
    block.hidden = !block.hidden;
    toggleBtn.setAttribute("aria-expanded", String(!block.hidden));
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await copyTextWithFallback(bibtexText);
      setCopyButtonState(copyBtn, "Copied!", "is-copied", 1500);
    } catch (_err) {
      setCopyButtonState(copyBtn, "Failed", "is-failed", 2000);
    }
  });

  tools.appendChild(toggleBtn);
  block.appendChild(copyBtn);

  return { tools, block };
}

function createPublicationMain(pub) {
  const main = document.createElement("div");
  main.className = "pub-main";
  const authors = highlightMyName(normalizeAuthorsForDisplay(pub.authorsRaw));
  const extra = getDisplayExtra(pub.extra);
  const journalHtml = hasLiveUrl(pub.url, pub.extra)
    ? `<a href="${pub.url}" target="_blank">${pub.journal}${pub.volume ? ` <b>${pub.volume}</b>,` : ""}${pub.page ? ` ${pub.page}` : ""}${pub.year ? ` (${pub.year})` : ""} </a>`
    : `${pub.journal}${pub.volume ? ` <b>${pub.volume}</b>,` : ""}${pub.page ? ` ${pub.page}` : ""}${pub.year ? ` (${pub.year})` : ""}`;

  main.innerHTML =
    `"${pub.title}", <br>` +
    `${authors}, ` +
    `${journalHtml}` +
    `${extra ? `<br> ${extra}` : ""}.`;

  return main;
}

function createPresentationMain(presentation) {
  const main = document.createElement("div");
  main.className = "pub-main";
  const authors = highlightMyName(normalizeAuthorsForDisplay(presentation.authorsRaw));
  const extra = getDisplayExtra(presentation.extra);
  const conferenceLabel = [
    presentation.conference,
    presentation.number,
    presentation.location
  ]
    .filter(Boolean)
    .join(", ");
  const presentationType = presentation.type ? `(${presentation.type})` : "";
  const trailingMeta = presentation.presentationDate && presentationType
    ? `${presentation.presentationDate} ${presentationType}`
    : presentation.presentationDate || presentationType;
  const conferenceHtml = hasLiveUrl(presentation.url, presentation.extra)
    ? `<a href="${presentation.url}" target="_blank">${conferenceLabel}</a>`
    : conferenceLabel;

  main.innerHTML =
    `"${presentation.title}", <br>` +
    `${authors}` +
    `${conferenceLabel ? `, ${conferenceHtml}` : ""}` +
    `${trailingMeta ? `, ${trailingMeta}` : ""}` +
    `${extra ? `<br>${extra}` : ""}.`;

  return main;
}

function createSeminarMain(seminar) {
  const main = document.createElement("div");
  main.className = "pub-main";
  const authors = highlightMyName(normalizeAuthorsForDisplay(seminar.authorsRaw));
  const extra = getDisplayExtra(seminar.extra);
  const seminarLabel = [seminar.seminar, seminar.location].filter(Boolean).join(", ");
  const seminarHtml = hasLiveUrl(seminar.url, seminar.extra)
    ? `<a href="${seminar.url}" target="_blank">${seminarLabel}</a>`
    : seminarLabel;

  main.innerHTML =
    `"${seminar.title}", <br>` +
    `${authors}` +
    `${seminarLabel ? `, ${seminarHtml}` : ""}` +
    `${seminar.date ? `, ${seminar.date}` : ""}` +
    `${extra ? `<br>${extra}` : ""}.`;

  return main;
}

function createPublicationRecord(cols, idxMap) {
  return {
    title: getCell(cols, idxMap, "title"),
    authorsRaw: getCell(cols, idxMap, "authors"),
    journal: getCell(cols, idxMap, "journal"),
    volume: getCell(cols, idxMap, "volume"),
    page: getCell(cols, idxMap, "page"),
    year: getCell(cols, idxMap, "year"),
    doi: getCell(cols, idxMap, "doi"),
    url: getCell(cols, idxMap, "url"),
    extra: getCell(cols, idxMap, "extra"),
    img: getCell(cols, idxMap, "img"),
    imgFlag: truthy(getCell(cols, idxMap, "img_flag")),
    bibtex: getCell(cols, idxMap, "bibtex")
  };
}

function createPresentationRecord(cols, idxMap) {
  return {
    title: getCell(cols, idxMap, "title"),
    authorsRaw: getCell(cols, idxMap, "authors"),
    conference: getCell(cols, idxMap, "conference"),
    number: getCell(cols, idxMap, "number"),
    location: getCell(cols, idxMap, "location"),
    startDate: getCell(cols, idxMap, "start_date"),
    endDate: getCell(cols, idxMap, "end_date"),
    presentationDate: getCell(cols, idxMap, "presentation_date"),
    type: getCell(cols, idxMap, "type"),
    review: getCell(cols, idxMap, "review"),
    url: getCell(cols, idxMap, "url"),
    extra: getCell(cols, idxMap, "extra")
  };
}

function createSeminarRecord(cols, idxMap) {
  return {
    title: getCell(cols, idxMap, "title"),
    authorsRaw: getCell(cols, idxMap, "authors"),
    seminar: getCell(cols, idxMap, "seminar"),
    location: getCell(cols, idxMap, "location"),
    date: getCell(cols, idxMap, "date"),
    url: getCell(cols, idxMap, "url"),
    extra: getCell(cols, idxMap, "extra")
  };
}

function isPresentationList(listId) {
  return ["seminarList", "internationalList", "domesticList"].includes(listId);
}

function isSeminarList(listId) {
  return listId === "seminarList";
}

function appendPublicationImage(ol, pub) {
  if (!pub.imgFlag || !pub.img) return;
  const imgEl = document.createElement("img");
  imgEl.className = "pub-img";
  imgEl.src = pub.img;
  imgEl.width = 140;
  imgEl.loading = "lazy";
  imgEl.alt = pub.title || "publication image";
  ol.appendChild(imgEl);
}

async function loadPublicationsFromOl(olSelector) {
  const ol = document.querySelector(olSelector);
  if (!ol) return;

  const csvPath = ol.dataset.csv;
  if (!csvPath) {
    console.warn("data-csv not found:", olSelector);
    return;
  }

  try {
    const csvCandidates = [csvPath];
    if (csvPath.includes("seminar.csv")) csvCandidates.push(csvPath.replace("seminar.csv", "seminars.csv"));
    if (csvPath.includes("seminars.csv")) csvCandidates.push(csvPath.replace("seminars.csv", "seminar.csv"));

    let res = null;
    let lastError = null;
    for (const candidate of csvCandidates) {
      const currentRes = await fetch(candidate, { cache: "no-store" });
      if (currentRes.ok) {
        res = currentRes;
        break;
      }
      lastError = new Error(`Failed to fetch CSV: ${candidate} (${currentRes.status})`);
    }
    if (!res) throw lastError || new Error(`Failed to fetch CSV: ${csvPath}`);

    const table = parseCSV(await res.text());
    if (table.length < 2) return;

    const idxMap = makeHeaderIndex(table[0]);
    ol.innerHTML = "";
    const presentationMode = isPresentationList(ol.id);
    const seminarMode = isSeminarList(ol.id);

    for (let r = table.length - 1; r >= 1; r--) {
      const li = document.createElement("li");
      if (presentationMode) {
        if (seminarMode) {
          const seminar = createSeminarRecord(table[r], idxMap);
          li.appendChild(createSeminarMain(seminar));
          ol.appendChild(li);
          continue;
        }
        const presentation = createPresentationRecord(table[r], idxMap);
        li.appendChild(createPresentationMain(presentation));
        ol.appendChild(li);
        continue;
      }

      const pub = createPublicationRecord(table[r], idxMap);
      const main = createPublicationMain(pub);

      let bibtex = pub.bibtex;
      if (!bibtex) bibtex = buildBibtexFromFields(pub);

      if (bibtex) {
        const bibtexUi = createBibtexControls(bibtex);
        main.appendChild(bibtexUi.tools);
        li.appendChild(main);
        li.appendChild(bibtexUi.block);
      } else {
        li.appendChild(main);
      }

      ol.appendChild(li);
      appendPublicationImage(ol, pub);
    }
  } catch (e) {
    console.error(e);
  }
}

window.loadPublicationsFromOl = loadPublicationsFromOl;
