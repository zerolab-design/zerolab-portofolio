/* ============================================================
   TEMPORARY — GUI editor untuk mengganti nama project.
   Hapus <script src="editor.js"> di index.html (dan file ini)
   kalau sudah tidak dibutuhkan.

   - Edit langsung terlihat di halaman (live).
   - Tersimpan di localStorage browser, jadi bertahan saat reload.
   - "Copy JSON" menyalin konfigurasi untuk ditempel ke config.js.
   - "Reset" kembali ke isi config.js.
   ============================================================ */

(function () {
  "use strict";

  if (!window.ZL) return;

  var btn = document.createElement("button");
  btn.className = "zl-edit-btn";
  btn.type = "button";
  btn.textContent = "✎ Edit";

  var panel = document.createElement("div");
  panel.className = "zl-editor";
  panel.innerHTML =
    "<h2>Project names</h2>" +
    '<p class="zl-hint">Editor sementara — perubahan tersimpan di browser ini (localStorage). ' +
    "Klik <b>Copy JSON</b> lalu tempel ke <b>config.js</b> untuk membuatnya permanen.</p>" +
    '<div class="zl-rows"></div>' +
    '<div class="zl-editor-actions">' +
    '<button type="button" data-action="copy">Copy JSON</button>' +
    '<button type="button" data-action="reset">Reset</button>' +
    "</div>";

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var rowsEl = panel.querySelector(".zl-rows");

  function buildRows() {
    rowsEl.innerHTML = "";
    window.ZL.getProjects().forEach(function (p, i) {
      var row = document.createElement("div");
      row.className = "zl-row";

      var thumb = document.createElement("img");
      thumb.src = p.image;
      thumb.alt = "";

      var fields = document.createElement("div");
      fields.className = "zl-fields";

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = p.name;
      nameInput.placeholder = "Nama project";
      nameInput.dataset.index = String(i);
      nameInput.dataset.field = "name";

      var subInput = document.createElement("input");
      subInput.type = "text";
      subInput.value = p.subtitle;
      subInput.placeholder = "Subtitle";
      subInput.dataset.index = String(i);
      subInput.dataset.field = "subtitle";

      fields.appendChild(nameInput);
      fields.appendChild(subInput);
      row.appendChild(thumb);
      row.appendChild(fields);
      rowsEl.appendChild(row);
    });
  }

  function currentValues() {
    return window.ZL.getProjects().map(function (p) {
      return { name: p.name, subtitle: p.subtitle, image: p.image };
    });
  }

  function persist() {
    try {
      localStorage.setItem(window.ZL.storageKey, JSON.stringify(currentValues()));
    } catch (e) {
      /* storage unavailable — edits stay for this session only */
    }
  }

  btn.addEventListener("click", function () {
    panel.classList.toggle("is-open");
  });

  rowsEl.addEventListener("input", function (e) {
    var input = e.target;
    if (!input.dataset || input.dataset.index === undefined) return;
    var updated = currentValues();
    updated[parseInt(input.dataset.index, 10)][input.dataset.field] = input.value;
    window.ZL.applyProjects(updated);
    persist();
  });

  panel.addEventListener("click", function (e) {
    var action = e.target.dataset && e.target.dataset.action;
    if (action === "copy") {
      var json = "window.PROJECTS = " + JSON.stringify(currentValues(), null, 2) + ";";
      navigator.clipboard.writeText(json).then(function () {
        e.target.textContent = "Copied!";
        setTimeout(function () {
          e.target.textContent = "Copy JSON";
        }, 1200);
      });
    }
    if (action === "reset") {
      try {
        localStorage.removeItem(window.ZL.storageKey);
      } catch (err) {}
      var base = (window.PROJECTS || []).map(function (p) {
        return { name: p.name, subtitle: p.subtitle, image: p.image };
      });
      window.ZL.applyProjects(base);
      buildRows();
    }
  });

  buildRows();
})();
