// Grass Munch loading screen: a muncher mows a strip of lawn while the game downloads.
// Unity reports download progress from 0 to 1, then spends a moment starting up; the strip creeps on
// through the start-up so it never looks stuck, and finishes when the game is ready.
var LoaderScreen = (function () {
  var TILES = 7;
  var TIPS = [
    "Two munchers on the lawn can trade places for just 1 gold.",
    "Swapping with a muncher in the shop costs 2 gold.",
    "Each muncher only eats blocks of its own colour.",
    "Spend less gold to earn more stars.",
    "Hold the left or right edge of the screen to play at double speed.",
    "Tap a glowing arrow to send a waiting muncher across.",
    "Stuck? Look for a muncher that can't reach its blocks, and swap it."
  ];

  var loader = document.getElementById("loader");
  var lawn = loader.querySelector(".lawn");
  var tilesBox = loader.querySelector(".tiles");
  var muncher = loader.querySelector(".muncher");
  var statusText = loader.querySelector(".status-text");
  var statusPct = loader.querySelector(".status-pct");
  var tipText = loader.querySelector(".tip-text");
  var failure = loader.querySelector(".failure");
  var failureDetail = loader.querySelector(".failure-detail");
  var drift = loader.querySelector(".drift");

  var tiles = [];
  var downloaded = 0;      // what Unity reported
  var ready = false;       // the game is running
  var failed = false;
  var shown = 0;           // what the strip shows, eased towards the target
  var startupSince = 0;    // when downloading finished and start-up began
  var lastTime = 0;
  var finishing = false;

  // ---------- build the strip ----------

  var tuftPaths = [
    "M6 20 C6 14 4 10 1 6 M11 20 C11 13 11 8 11 2 M16 20 C16 14 18 10 21 6",
    "M7 20 C7 14 5 9 3 5 M12 20 C12 13 13 8 15 3",
    "M8 20 C8 13 8 8 7 3 M13 20 C13 14 15 10 18 7"
  ];
  for (var i = 0; i < TILES; i++) {
    var tile = document.createElement("div");
    tile.className = "tile";
    if (i % 3 !== 1) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 22 22");
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", tuftPaths[i % tuftPaths.length]);
      svg.appendChild(path);
      svg.style.left = (14 + ((i * 37) % 22)) + "%";
      svg.style.top = (12 + ((i * 53) % 16)) + "%";
      tile.appendChild(svg);
    }
    tilesBox.appendChild(tile);
    tiles.push(tile);
  }

  // Faint grass bits drifting up the background.
  for (var m = 0; m < 16; m++) {
    var mote = document.createElement("div");
    mote.className = "mote";
    var size = 3 + Math.random() * 5;
    mote.style.width = mote.style.height = size + "px";
    mote.style.left = Math.random() * 100 + "%";
    mote.style.setProperty("--o", (0.06 + Math.random() * 0.16).toFixed(2));
    var duration = 10 + Math.random() * 10;
    mote.style.animationDuration = duration + "s";
    mote.style.animationDelay = -Math.random() * duration + "s";
    drift.appendChild(mote);
  }

  // ---------- tips ----------

  var tipOrder = TIPS.slice().sort(function () { return Math.random() - 0.5; });
  var tipIndex = 0;
  tipText.textContent = tipOrder[0];
  var tipTimer = setInterval(function () {
    tipText.classList.add("out");
    setTimeout(function () {
      tipIndex = (tipIndex + 1) % tipOrder.length;
      tipText.textContent = tipOrder[tipIndex];
      tipText.classList.remove("out");
    }, 350);
  }, 4200);

  // ---------- blinking ----------

  function blinkLater() {
    setTimeout(function () {
      if (finishing || failed) return;
      muncher.classList.remove("blink");
      void muncher.offsetWidth;
      muncher.classList.add("blink");
      blinkLater();
    }, 1800 + Math.random() * 3200);
  }
  blinkLater();

  // ---------- the strip ----------

  function mow(tile) {
    if (tile.classList.contains("mowed")) return;
    tile.classList.add("mowed");
    var lawnBox = lawn.getBoundingClientRect();
    var box = tile.getBoundingClientRect();
    var cx = box.left - lawnBox.left + box.width / 2;
    var cy = box.top - lawnBox.top + box.height / 2;
    for (var b = 0; b < 6; b++) {
      var bit = document.createElement("div");
      bit.className = "bit";
      bit.style.left = cx + "px";
      bit.style.top = cy + "px";
      var angle = -Math.PI * (0.15 + Math.random() * 0.7);
      var reach = box.width * (0.5 + Math.random() * 0.6);
      bit.style.setProperty("--dx", (Math.cos(angle) * reach - box.width * 0.35).toFixed(1) + "px");
      bit.style.setProperty("--dy", (Math.sin(angle) * reach).toFixed(1) + "px");
      lawn.appendChild(bit);
      setTimeout(function (el) { return function () { el.remove(); }; }(bit), 750);
    }
  }

  function target(now) {
    if (ready) return 1;
    if (downloaded < 1) return downloaded * 0.9;
    // Start-up: creep from 90% towards 99% so the muncher keeps going.
    if (!startupSince) startupSince = now;
    var t = (now - startupSince) / 1000;
    return 0.9 + 0.09 * (1 - Math.exp(-t / 3));
  }

  function frame(now) {
    if (failed) return;
    var dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;

    var goal = target(now);
    // Ease towards the goal, but never slower than a gentle walk, so big jumps still look like walking.
    var step = Math.max((goal - shown) * Math.min(1, dt * 5), dt * 0.12);
    shown = Math.min(goal, shown + step);
    if (ready && goal - shown < 0.004) shown = 1;

    var tileW = tiles[0].offsetWidth;
    var stride = tiles.length > 1 ? tiles[1].offsetLeft - tiles[0].offsetLeft : tileW;
    var travel = stride * (TILES - 1);
    var x = shown * travel;
    muncher.style.transform = "translateX(" + x.toFixed(1) + "px)";
    for (var i = 0; i < TILES; i++)
      if (x >= i * stride - stride * 0.2 && (i > 0 || shown > 0.012)) mow(tiles[i]);

    var pct = Math.round(shown * 100);
    statusPct.textContent = pct + "%";
    loader.setAttribute("aria-valuenow", pct);

    if (shown >= 1 && ready && !finishing) finish();
    if (!finishing) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function finish() {
    finishing = true;
    clearInterval(tipTimer);
    statusText.textContent = "Let's munch!";
    muncher.classList.add("happy");
    setTimeout(function () {
      loader.classList.add("gone");
      var canvas = document.getElementById("unity-canvas");
      if (canvas) canvas.focus();
      setTimeout(function () { loader.remove(); }, 700);
    }, 650);
  }

  // ---------- canvas size ----------

  function isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  }

  function fitCanvas(canvas, baseW, baseH) {
    var mobile = isMobile();
    function fit() {
      var W = window.innerWidth, H = window.innerHeight;
      if (mobile) {
        canvas.classList.remove("framed");
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        return;
      }
      // Desktop: keep the portrait shape. When there is plenty of room around it (a big window), frame it
      // like a phone; when the page is about the game's size (an itch.io embed), fill it edge to edge.
      var s = Math.min(W / baseW, H / baseH);
      var framed = W - baseW * s > 80;
      if (framed) s = Math.min(W / baseW, (H - 48) / baseH);
      canvas.classList.toggle("framed", framed);
      canvas.style.width = Math.floor(baseW * s) + "px";
      canvas.style.height = Math.floor(baseH * s) + "px";
    }
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", function () { setTimeout(fit, 250); });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);
  }

  // ---------- messages ----------

  function fail(message) {
    if (failed) return;
    failed = true;
    clearInterval(tipTimer);
    failureDetail.textContent = message ? String(message).slice(0, 400) : "";
    failure.hidden = false;
    loader.classList.remove("gone");
  }

  function banner(message, type) {
    if (type === "error") { fail(message); return; }
    var box = document.getElementById("toasts");
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = String(message).replace(/<[^>]*>/g, "");
    box.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 5000);
  }

  return {
    progress: function (p) {
      downloaded = Math.max(downloaded, Math.min(1, p));
      if (downloaded >= 1 && !ready) statusText.textContent = "Waking up the munchers…";
    },
    done: function () { ready = true; },
    fail: fail,
    banner: banner,
    fitCanvas: fitCanvas
  };
})();
