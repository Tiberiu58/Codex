(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const ui = {
    health: document.getElementById("health"),
    ammo: document.getElementById("ammo"),
    enemies: document.getElementById("enemies"),
    pace: document.getElementById("pace"),
    status: document.getElementById("status"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlay-title"),
    overlayText: document.getElementById("overlay-text"),
    startButton: document.getElementById("start-button"),
  };

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const HALF_HEIGHT = HEIGHT / 2;
  const FOV = Math.PI / 3;
  const HALF_FOV = FOV / 2;
  const MAX_DEPTH = 24;
  const PLAYER_RADIUS = 0.2;
  const LOOK_SENSITIVITY = 0.0024;

  const MAP_TEMPLATE = [
    "##############",
    "#..A.....B...#",
    "#..##....B...#",
    "#............#",
    "#....#..C....#",
    "#..P......CC.#",
    "#......##....#",
    "#....A.......#",
    "#.....#....B.#",
    "#..........B.#",
    "#...C........#",
    "##############",
  ];

  const ENEMY_SPAWNS = [
    { x: 2.6, y: 2.6 },
    { x: 10.4, y: 2.8 },
    { x: 9.4, y: 4.5 },
    { x: 3.5, y: 7.4 },
    { x: 10.8, y: 8.5 },
    { x: 6.4, y: 9.8 },
  ];

  const input = {
    keys: Object.create(null),
    shootQueued: false,
    lookDelta: 0,
  };

  const state = {
    mode: "menu",
    flash: 0,
    muzzleFlash: 0,
    hitMarker: 0,
    message: "Click start, lock the mouse, and clear the map.",
    lastTime: performance.now(),
  };

  let world = null;
  let player = null;
  let enemies = [];
  let depthBuffer = new Array(WIDTH).fill(MAX_DEPTH);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function wrapAngle(angle) {
    while (angle <= -Math.PI) {
      angle += Math.PI * 2;
    }
    while (angle > Math.PI) {
      angle -= Math.PI * 2;
    }
    return angle;
  }

  function getWallPalette(cell) {
    if (cell === "A") {
      return { light: [165, 135, 92], dark: [92, 73, 44] };
    }
    if (cell === "B") {
      return { light: [117, 130, 144], dark: [61, 68, 77] };
    }
    if (cell === "C") {
      return { light: [142, 92, 86], dark: [80, 48, 44] };
    }
    return { light: [128, 111, 88], dark: [67, 57, 44] };
  }

  function isWallCell(cell) {
    return cell && cell !== ".";
  }

  function createMap() {
    let spawn = { x: 5.5, y: 5.5 };
    const cells = MAP_TEMPLATE.map(function (row, y) {
      return row.split("").map(function (cell, x) {
        if (cell === "P") {
          spawn = { x: x + 0.5, y: y + 0.5 };
          return ".";
        }
        return cell;
      });
    });
    return { cells: cells, spawn: spawn };
  }

  function createEnemy(spawn, index) {
    return {
      id: index,
      x: spawn.x,
      y: spawn.y,
      radius: 0.23,
      hp: 3,
      alive: true,
      hurtTimer: 0,
      shootCooldown: 0.7 + index * 0.13,
      stride: Math.random() * Math.PI * 2,
      strafe: index % 2 === 0 ? 1 : -1,
      muzzleTimer: 0,
    };
  }

  function resetGame() {
    world = createMap();
    player = {
      x: world.spawn.x,
      y: world.spawn.y,
      radius: PLAYER_RADIUS,
      angle: -0.22,
      health: 100,
      clip: 12,
      reserve: 48,
      maxClip: 12,
      fireCooldown: 0,
      reloadTimer: 0,
      vx: 0,
      vy: 0,
      bob: 0,
      bobPhase: 0,
      sway: 0,
      recoil: 0,
      speedVisual: 0,
      sprinting: false,
    };
    enemies = ENEMY_SPAWNS.map(createEnemy);
    state.flash = 0;
    state.muzzleFlash = 0;
    state.hitMarker = 0;
    state.message = "Round live. Clear the six bots.";
    updateHud();
  }

  function cellAt(x, y) {
    const mapX = Math.floor(x);
    const mapY = Math.floor(y);
    const row = world.cells[mapY];
    if (!row || row[mapX] == null) {
      return "#";
    }
    return row[mapX];
  }

  function isWall(x, y) {
    return isWallCell(cellAt(x, y));
  }

  function tryMove(entity, nextX, nextY) {
    const radius = entity.radius || PLAYER_RADIUS;
    if (
      !isWall(nextX - radius, entity.y - radius) &&
      !isWall(nextX + radius, entity.y - radius) &&
      !isWall(nextX - radius, entity.y + radius) &&
      !isWall(nextX + radius, entity.y + radius)
    ) {
      entity.x = nextX;
    }
    if (
      !isWall(entity.x - radius, nextY - radius) &&
      !isWall(entity.x + radius, nextY - radius) &&
      !isWall(entity.x - radius, nextY + radius) &&
      !isWall(entity.x + radius, nextY + radius)
    ) {
      entity.y = nextY;
    }
  }

  function castRay(originX, originY, angle) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let mapX = Math.floor(originX);
    let mapY = Math.floor(originY);

    const deltaDistX = Math.abs(1 / (dirX || 0.0001));
    const deltaDistY = Math.abs(1 / (dirY || 0.0001));

    let sideDistX;
    let sideDistY;
    let stepX;
    let stepY;
    let side = 0;

    if (dirX < 0) {
      stepX = -1;
      sideDistX = (originX - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - originX) * deltaDistX;
    }

    if (dirY < 0) {
      stepY = -1;
      sideDistY = (originY - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - originY) * deltaDistY;
    }

    let distance = MAX_DEPTH;
    let cell = "#";

    for (let steps = 0; steps < 96; steps += 1) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      cell = cellAt(mapX + 0.01, mapY + 0.01);
      if (isWallCell(cell)) {
        distance =
          side === 0
            ? (mapX - originX + (1 - stepX) / 2) / (dirX || 0.0001)
            : (mapY - originY + (1 - stepY) / 2) / (dirY || 0.0001);
        break;
      }
    }

    const hitX = originX + dirX * distance;
    const hitY = originY + dirY * distance;
    const texture =
      side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);

    return {
      distance: Math.max(0.0001, distance),
      side: side,
      cell: cell,
      texture: texture,
      hitX: hitX,
      hitY: hitY,
    };
  }

  function lineOfSight(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.ceil(distance / 0.08);

    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (isWall(fromX + dx * t, fromY + dy * t)) {
        return false;
      }
    }
    return true;
  }

  function livingEnemies() {
    return enemies.filter(function (enemy) {
      return enemy.alive;
    }).length;
  }

  function updateHud() {
    ui.health.textContent = String(Math.max(0, Math.ceil(player.health)));
    ui.ammo.textContent = player.clip + " / " + player.reserve;
    ui.enemies.textContent = String(livingEnemies());

    let pace = "Idle";
    if (state.mode === "paused") {
      pace = "Pause";
    } else if (player.reloadTimer > 0) {
      pace = "Reload";
    } else if (player.sprinting) {
      pace = "Sprint";
    } else if (player.speedVisual > 0.35) {
      pace = "Strafe";
    } else {
      pace = "Walk";
    }

    ui.pace.textContent = pace;
    ui.status.textContent = state.message;
  }

  function finishRound(result) {
    state.mode = result === "win" ? "win" : "lose";
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    ui.overlay.classList.remove("hidden");

    if (result === "win") {
      ui.overlayTitle.textContent = "Round Won";
      ui.overlayText.textContent = "You cleared the arena. The scrappy little prototype survives another round.";
      ui.startButton.textContent = "Play Again";
      state.message = "Arena cleared.";
    } else {
      ui.overlayTitle.textContent = "You Were Eliminated";
      ui.overlayText.textContent = "The bots got you first. Click below to restart the homemade firefight.";
      ui.startButton.textContent = "Restart Match";
      state.message = "You were eliminated.";
    }

    updateHud();
  }

  function resumeGame() {
    if (state.mode === "menu" || state.mode === "win" || state.mode === "lose") {
      resetGame();
    }
    state.mode = "playing";
    ui.overlay.classList.add("hidden");
    ui.overlayTitle.textContent = "Mini Strike";
    ui.overlayText.textContent = "A tiny homemade counter-strike-ish toy. Clear every red bot in the arena.";
    ui.startButton.textContent = "Start Match";
    canvas.requestPointerLock();
  }

  function pauseGame() {
    if (state.mode !== "playing") {
      return;
    }
    state.mode = "paused";
    ui.overlay.classList.remove("hidden");
    ui.overlayTitle.textContent = "Paused";
    ui.overlayText.textContent = "Mouse unlocked. Click below to hop back into the rough little arena.";
    ui.startButton.textContent = "Resume Match";
    state.message = "Paused.";
    updateHud();
  }

  function startReload() {
    if (state.mode !== "playing") {
      return;
    }
    if (player.reloadTimer > 0 || player.clip === player.maxClip || player.reserve <= 0) {
      return;
    }
    player.reloadTimer = 1.05;
    state.message = "Reloading...";
    updateHud();
  }

  function shoot() {
    if (state.mode !== "playing") {
      return;
    }
    if (player.reloadTimer > 0 || player.fireCooldown > 0) {
      return;
    }
    if (player.clip <= 0) {
      state.message = player.reserve > 0 ? "Clip empty. Press R to reload." : "Out of ammo.";
      updateHud();
      return;
    }

    player.clip -= 1;
    player.fireCooldown = 0.16;
    player.recoil = Math.min(0.3, player.recoil + 0.12);
    state.flash = 0.38;
    state.muzzleFlash = 0.12;
    state.message = "Shot fired.";

    const movementSpread = clamp(player.speedVisual * 0.024, 0, 0.03);
    const spread = 0.008 + movementSpread + player.recoil * 0.06;
    const shotAngle = player.angle + randRange(-spread, spread);
    const wallHit = castRay(player.x, player.y, shotAngle).distance;
    const rayCos = Math.cos(shotAngle);
    const raySin = Math.sin(shotAngle);

    let bestEnemy = null;
    let bestDistance = Infinity;

    enemies.forEach(function (enemy) {
      if (!enemy.alive) {
        return;
      }

      const relX = enemy.x - player.x;
      const relY = enemy.y - player.y;
      const along = relX * rayCos + relY * raySin;
      const perp = Math.abs(-relX * raySin + relY * rayCos);

      if (along <= 0 || along >= wallHit || perp > enemy.radius + 0.05) {
        return;
      }

      if (along < bestDistance) {
        bestDistance = along;
        bestEnemy = enemy;
      }
    });

    if (bestEnemy) {
      bestEnemy.hp -= 1;
      bestEnemy.hurtTimer = 0.2;
      state.hitMarker = 0.16;
      state.message = "Hit confirmed.";

      if (bestEnemy.hp <= 0) {
        bestEnemy.alive = false;
        state.message = "Bot down.";
      }
    } else {
      state.message = "Miss.";
    }

    if (livingEnemies() === 0) {
      finishRound("win");
      return;
    }

    updateHud();
  }

  function updatePlayer(dt) {
    const lookStep = input.lookDelta * Math.min(1, dt * 18);
    player.angle = wrapAngle(player.angle + lookStep);
    input.lookDelta -= lookStep;

    if (input.keys.ArrowLeft) {
      input.lookDelta -= 0.06;
    }
    if (input.keys.ArrowRight) {
      input.lookDelta += 0.06;
    }

    let moveX = 0;
    let moveY = 0;

    if (input.keys.KeyW) {
      moveX += Math.cos(player.angle);
      moveY += Math.sin(player.angle);
    }
    if (input.keys.KeyS) {
      moveX -= Math.cos(player.angle);
      moveY -= Math.sin(player.angle);
    }
    if (input.keys.KeyA) {
      moveX += Math.cos(player.angle - Math.PI / 2);
      moveY += Math.sin(player.angle - Math.PI / 2);
    }
    if (input.keys.KeyD) {
      moveX += Math.cos(player.angle + Math.PI / 2);
      moveY += Math.sin(player.angle + Math.PI / 2);
    }

    const moveLength = Math.hypot(moveX, moveY);
    const sprinting = input.keys.ShiftLeft || input.keys.ShiftRight;
    const maxSpeed = sprinting ? 3.8 : 2.55;
    const accel = sprinting ? 11.5 : 15;

    player.sprinting = sprinting && moveLength > 0.1;

    let targetVX = 0;
    let targetVY = 0;

    if (moveLength > 0.001) {
      targetVX = (moveX / moveLength) * maxSpeed;
      targetVY = (moveY / moveLength) * maxSpeed;
    }

    player.vx += (targetVX - player.vx) * Math.min(1, accel * dt);
    player.vy += (targetVY - player.vy) * Math.min(1, accel * dt);

    if (moveLength < 0.001) {
      player.vx *= Math.max(0, 1 - 8 * dt);
      player.vy *= Math.max(0, 1 - 8 * dt);
    }

    tryMove(player, player.x + player.vx * dt, player.y + player.vy * dt);

    player.speedVisual = Math.hypot(player.vx, player.vy) / 3.8;
    player.bobPhase += dt * (5 + player.speedVisual * 8);
    player.bob = Math.sin(player.bobPhase) * player.speedVisual * 6;
    player.sway = lerp(player.sway, clamp(input.lookDelta * 20, -6, 6), Math.min(1, dt * 12));

    if (player.fireCooldown > 0) {
      player.fireCooldown -= dt;
    }
    player.recoil = Math.max(0, player.recoil - dt * 3.1);

    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) {
        const needed = player.maxClip - player.clip;
        const amount = Math.min(needed, player.reserve);
        player.clip += amount;
        player.reserve -= amount;
        state.message = "Reload complete.";
      }
    }

    if (input.shootQueued) {
      input.shootQueued = false;
      shoot();
    }
  }

  function updateEnemies(dt) {
    enemies.forEach(function (enemy) {
      if (!enemy.alive) {
        return;
      }

      enemy.stride += dt * 6;
      enemy.muzzleTimer = Math.max(0, enemy.muzzleTimer - dt * 5);

      if (enemy.hurtTimer > 0) {
        enemy.hurtTimer -= dt;
      }

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const dirX = dx / (distance || 1);
      const dirY = dy / (distance || 1);
      const perpX = -dirY;
      const perpY = dirX;
      const canSeePlayer = lineOfSight(enemy.x, enemy.y, player.x, player.y);

      let moveSpeed = 0;
      if (distance > 4.5) {
        moveSpeed = 1.15;
      } else if (distance > 2) {
        moveSpeed = 0.72;
      } else {
        moveSpeed = -0.35;
      }

      if (canSeePlayer) {
        const strafeAmount = Math.sin(enemy.stride) * 0.55 * enemy.strafe;
        tryMove(
          enemy,
          enemy.x + (dirX * moveSpeed + perpX * strafeAmount) * dt,
          enemy.y + (dirY * moveSpeed + perpY * strafeAmount) * dt
        );
      } else {
        tryMove(enemy, enemy.x + dirX * 0.45 * dt, enemy.y + dirY * 0.45 * dt);
      }

      enemy.shootCooldown -= dt;
      if (canSeePlayer && distance < 8.5 && enemy.shootCooldown <= 0) {
        enemy.shootCooldown = 0.85 + Math.random() * 0.8;
        enemy.muzzleTimer = 0.18;
        const missChance = clamp(distance * 0.055 + player.speedVisual * 0.18, 0.1, 0.42);

        if (Math.random() > missChance) {
          player.health -= 9;
          state.flash = 0.75;
          state.message = "You were hit.";
          if (player.health <= 0) {
            player.health = 0;
            finishRound("lose");
            return;
          }
        } else {
          state.message = "A bot missed.";
        }
      }
    });
  }

  function drawSkyline() {
    const offset = ((player.angle / (Math.PI * 2)) * WIDTH * 0.8) % WIDTH;
    const bands = [
      { base: HALF_HEIGHT - 20, color: "#876845", step: 58, heights: [22, 36, 26, 44, 30] },
      { base: HALF_HEIGHT - 12, color: "#4d4030", step: 42, heights: [14, 22, 18, 26, 17] },
    ];

    bands.forEach(function (band) {
      for (let x = -WIDTH; x < WIDTH * 2; x += band.step) {
        const idx = Math.abs(Math.floor((x + offset) / band.step)) % band.heights.length;
        const height = band.heights[idx];
        ctx.fillStyle = band.color;
        ctx.fillRect(x - (offset % band.step), band.base - height, band.step - 6, height);
      }
    });
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, HALF_HEIGHT);
    sky.addColorStop(0, "#a68f6d");
    sky.addColorStop(0.6, "#7c6f61");
    sky.addColorStop(1, "#655c58");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HALF_HEIGHT);

    drawSkyline();

    const haze = ctx.createLinearGradient(0, HALF_HEIGHT - 30, 0, HALF_HEIGHT + 20);
    haze.addColorStop(0, "rgba(255, 212, 150, 0)");
    haze.addColorStop(1, "rgba(32, 22, 16, 0.32)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, HALF_HEIGHT - 30, WIDTH, 50);

    ctx.fillStyle = "#2a261f";
    ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT);
  }

  function drawFloor() {
    const leftAngle = player.angle - HALF_FOV;
    const rightAngle = player.angle + HALF_FOV;

    for (let y = HALF_HEIGHT; y < HEIGHT; y += 2) {
      const rowDistance = (HEIGHT * 0.82) / (y - HALF_HEIGHT + 1);
      const startX = player.x + Math.cos(leftAngle) * rowDistance;
      const startY = player.y + Math.sin(leftAngle) * rowDistance;
      const endX = player.x + Math.cos(rightAngle) * rowDistance;
      const endY = player.y + Math.sin(rightAngle) * rowDistance;
      const stepX = (endX - startX) / WIDTH * 4;
      const stepY = (endY - startY) / WIDTH * 4;

      let sampleX = startX;
      let sampleY = startY;

      for (let x = 0; x < WIDTH; x += 4) {
        const checker = ((Math.floor(sampleX * 2) + Math.floor(sampleY * 2)) & 1) === 0;
        const tile = ((Math.floor(sampleX * 5) ^ Math.floor(sampleY * 5)) & 1) === 0;
        const shade = clamp(1 - rowDistance / 15, 0.16, 0.9);
        const red = Math.floor((checker ? 92 : 70) * shade + (tile ? 8 : 0));
        const green = Math.floor((checker ? 86 : 63) * shade + (tile ? 6 : 0));
        const blue = Math.floor((checker ? 71 : 54) * shade);

        ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";
        ctx.fillRect(x, y, 4, 2);

        sampleX += stepX;
        sampleY += stepY;
      }
    }
  }

  function drawWalls() {
    depthBuffer.fill(MAX_DEPTH);

    for (let x = 0; x < WIDTH; x += 1) {
      const cameraOffset = x / WIDTH - 0.5;
      const angle = player.angle + cameraOffset * FOV;
      const ray = castRay(player.x, player.y, angle);
      const correctedDistance = ray.distance * Math.cos(angle - player.angle);
      const wallHeight = Math.min(HEIGHT * 1.2, HEIGHT / Math.max(correctedDistance, 0.0001));
      const top = Math.floor(HALF_HEIGHT - wallHeight / 2 + player.bob * 0.25);
      const bottom = Math.min(HEIGHT, top + wallHeight);
      const textureColumn = Math.floor(ray.texture * 8);
      const palette = getWallPalette(ray.cell);
      const baseShade = clamp(1 - correctedDistance / 13, 0.2, 1);
      const sideShade = ray.side === 1 ? 0.78 : 1;

      for (let y = Math.max(0, top); y < bottom; y += 1) {
        const vertical = (y - top) / Math.max(1, wallHeight);
        const brickBand = Math.floor(vertical * 9);
        const mortar =
          vertical % 0.22 < 0.015 ||
          (textureColumn + brickBand) % 4 === 0;
        const source = mortar ? palette.dark : palette.light;
        const grime = ((brickBand + textureColumn) & 1) === 0 ? -10 : 0;
        const shade = baseShade * sideShade;
        const red = clamp(Math.floor(source[0] * shade + grime), 0, 255);
        const green = clamp(Math.floor(source[1] * shade + grime), 0, 255);
        const blue = clamp(Math.floor(source[2] * shade + grime), 0, 255);

        ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";
        ctx.fillRect(x, y, 1, 1);
      }

      depthBuffer[x] = correctedDistance;
    }
  }

  function drawEnemies() {
    const visible = enemies
      .filter(function (enemy) {
        return enemy.alive;
      })
      .map(function (enemy) {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        return {
          enemy: enemy,
          distance: Math.hypot(dx, dy),
          angle: wrapAngle(Math.atan2(dy, dx) - player.angle),
        };
      })
      .filter(function (entry) {
        return Math.abs(entry.angle) < HALF_FOV * 1.25 && entry.distance < MAX_DEPTH;
      })
      .sort(function (a, b) {
        return b.distance - a.distance;
      });

    visible.forEach(function (entry) {
      const enemy = entry.enemy;
      const size = HEIGHT / Math.max(entry.distance, 0.0001);
      const screenX = Math.round((0.5 + entry.angle / FOV) * WIDTH);
      const spriteWidth = Math.max(10, Math.floor(size * 0.45));
      const spriteHeight = Math.max(22, Math.floor(size * 0.95));
      const left = Math.floor(screenX - spriteWidth / 2);
      const top = Math.floor(HALF_HEIGHT - spriteHeight / 2 + Math.sin(enemy.stride) * 1.5 + player.bob * 0.15);
      const bottom = top + spriteHeight;

      if (screenX < 0 || screenX >= WIDTH || entry.distance > depthBuffer[screenX]) {
        return;
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.beginPath();
      ctx.ellipse(screenX, bottom - 2, spriteWidth * 0.45, spriteHeight * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = enemy.hurtTimer > 0 ? "#ffe5de" : "#bc544b";
      ctx.fillRect(left, top + 8, spriteWidth, spriteHeight - 8);

      ctx.fillStyle = "#8c352f";
      ctx.fillRect(left + 2, top + 10, spriteWidth - 4, Math.max(5, Math.floor(spriteHeight * 0.18)));

      ctx.fillStyle = enemy.hurtTimer > 0 ? "#fff3dc" : "#ccb48a";
      ctx.fillRect(left + Math.floor(spriteWidth * 0.2), top, Math.floor(spriteWidth * 0.6), Math.floor(spriteHeight * 0.28));

      ctx.fillStyle = "#161616";
      ctx.fillRect(left + Math.floor(spriteWidth * 0.28), top + Math.floor(spriteHeight * 0.11), 3, 3);
      ctx.fillRect(left + Math.floor(spriteWidth * 0.58), top + Math.floor(spriteHeight * 0.11), 3, 3);

      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(left + spriteWidth - 4, top + Math.floor(spriteHeight * 0.44), Math.max(6, Math.floor(spriteWidth * 0.35)), 4);

      if (enemy.muzzleTimer > 0 && entry.distance < MAX_DEPTH) {
        ctx.fillStyle = "rgba(255, 208, 112, 0.85)";
        ctx.fillRect(left + spriteWidth + 2, top + Math.floor(spriteHeight * 0.4), 5, 5);
      }
    });
  }

  function drawCrosshair() {
    const gap = 7 + player.speedVisual * 10 + player.recoil * 20;
    const centerX = WIDTH / 2;
    const centerY = HALF_HEIGHT + player.bob * 0.15;

    ctx.strokeStyle = "#f8f0db";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - gap - 6, centerY);
    ctx.lineTo(centerX - gap, centerY);
    ctx.moveTo(centerX + gap, centerY);
    ctx.lineTo(centerX + gap + 6, centerY);
    ctx.moveTo(centerX, centerY - gap - 6);
    ctx.lineTo(centerX, centerY - gap);
    ctx.moveTo(centerX, centerY + gap);
    ctx.lineTo(centerX, centerY + gap + 6);
    ctx.stroke();

    if (state.hitMarker > 0) {
      ctx.strokeStyle = "rgba(255,255,255," + clamp(state.hitMarker * 4, 0, 1) + ")";
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY - 10);
      ctx.lineTo(centerX - 4, centerY - 4);
      ctx.moveTo(centerX + 10, centerY - 10);
      ctx.lineTo(centerX + 4, centerY - 4);
      ctx.moveTo(centerX - 10, centerY + 10);
      ctx.lineTo(centerX - 4, centerY + 4);
      ctx.moveTo(centerX + 10, centerY + 10);
      ctx.lineTo(centerX + 4, centerY + 4);
      ctx.stroke();
    }
  }

  function drawWeapon() {
    const bobX = Math.sin(player.bobPhase * 0.5) * 8 + player.sway * 0.6;
    const bobY = player.bob + player.recoil * -28;
    const baseX = WIDTH / 2 - 48 + bobX;
    const baseY = HEIGHT - 42 + bobY;

    if (state.muzzleFlash > 0) {
      ctx.fillStyle = "rgba(255, 207, 122, " + clamp(state.muzzleFlash * 8, 0, 0.8) + ")";
      ctx.beginPath();
      ctx.moveTo(baseX + 90, baseY - 26);
      ctx.lineTo(baseX + 122, baseY - 18);
      ctx.lineTo(baseX + 88, baseY - 8);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#1d160f";
    ctx.fillRect(baseX - 8, baseY + 14, 56, 38);
    ctx.fillRect(baseX + 12, baseY - 4, 88, 30);

    ctx.fillStyle = "#64584d";
    ctx.fillRect(baseX + 8, baseY - 10, 76, 22);

    ctx.fillStyle = "#a2907a";
    ctx.fillRect(baseX + 58, baseY - 8, 46, 10);

    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(baseX + 14, baseY - 2, 64, 6);
    ctx.fillRect(baseX + 64, baseY - 4, 24, 4);

    ctx.fillStyle = "#3d2c1c";
    ctx.fillRect(baseX + 4, baseY + 18, 22, 30);
  }

  function drawMinimap() {
    const scale = 9;
    const offsetX = 14;
    const offsetY = 14;

    ctx.fillStyle = "rgba(12, 10, 8, 0.68)";
    ctx.fillRect(offsetX - 6, offsetY - 6, world.cells[0].length * scale + 12, world.cells.length * scale + 12);

    world.cells.forEach(function (row, y) {
      row.forEach(function (cell, x) {
        ctx.fillStyle = isWallCell(cell) ? "#4c4031" : "rgba(255,255,255,0.06)";
        ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale - 1, scale - 1);
      });
    });

    enemies.forEach(function (enemy) {
      if (!enemy.alive) {
        return;
      }
      ctx.fillStyle = "#d9685d";
      ctx.fillRect(offsetX + enemy.x * scale - 2, offsetY + enemy.y * scale - 2, 4, 4);
    });

    ctx.fillStyle = "#d8a959";
    ctx.fillRect(offsetX + player.x * scale - 2, offsetY + player.y * scale - 2, 4, 4);
    ctx.strokeStyle = "#f4d79d";
    ctx.beginPath();
    ctx.moveTo(offsetX + player.x * scale, offsetY + player.y * scale);
    ctx.lineTo(
      offsetX + (player.x + Math.cos(player.angle) * 0.8) * scale,
      offsetY + (player.y + Math.sin(player.angle) * 0.8) * scale
    );
    ctx.stroke();
  }

  function drawDamageFlash() {
    if (state.flash > 0) {
      ctx.fillStyle = "rgba(255, 86, 74, " + clamp(state.flash * 0.22, 0, 0.22) + ")";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const vignette = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      HEIGHT * 0.25,
      WIDTH / 2,
      HEIGHT / 2,
      HEIGHT * 0.75
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function render() {
    drawBackground();
    drawFloor();
    drawWalls();
    drawEnemies();
    drawWeapon();
    drawCrosshair();
    drawMinimap();
    drawDamageFlash();
  }

  function step(timestamp) {
    const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000 || 0);
    state.lastTime = timestamp;

    if (state.mode === "playing") {
      updatePlayer(dt);
      updateEnemies(dt);
      updateHud();
    }

    state.flash = Math.max(0, state.flash - dt * 2.2);
    state.muzzleFlash = Math.max(0, state.muzzleFlash - dt);
    state.hitMarker = Math.max(0, state.hitMarker - dt);

    render();
    requestAnimationFrame(step);
  }

  ui.startButton.addEventListener("click", function () {
    resumeGame();
  });

  canvas.addEventListener("click", function () {
    if (state.mode === "paused") {
      resumeGame();
    }
  });

  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement === canvas) {
      if (state.mode === "menu" || state.mode === "paused") {
        state.mode = "playing";
        ui.overlay.classList.add("hidden");
        state.message = "Round live. Clear the six bots.";
        updateHud();
      }
      return;
    }

    if (state.mode === "playing") {
      pauseGame();
    }
  });

  window.addEventListener("mousemove", function (event) {
    if (document.pointerLockElement !== canvas || state.mode !== "playing") {
      return;
    }
    input.lookDelta += event.movementX * LOOK_SENSITIVITY;
  });

  window.addEventListener("keydown", function (event) {
    if (
      ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"].includes(
        event.code
      )
    ) {
      event.preventDefault();
    }

    input.keys[event.code] = true;

    if (event.code === "KeyR") {
      startReload();
    }

    if (event.code === "Space") {
      input.shootQueued = true;
    }
  });

  window.addEventListener("keyup", function (event) {
    input.keys[event.code] = false;
  });

  window.addEventListener("mousedown", function (event) {
    if (event.button === 0 && document.pointerLockElement === canvas) {
      input.shootQueued = true;
    }
  });

  window.addEventListener("blur", function () {
    Object.keys(input.keys).forEach(function (key) {
      input.keys[key] = false;
    });
    input.shootQueued = false;
    input.lookDelta = 0;
  });

  resetGame();
  ui.overlay.classList.remove("hidden");
  requestAnimationFrame(step);
})();
