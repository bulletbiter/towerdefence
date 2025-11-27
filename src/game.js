// Simple Phaser 3 Tower Defence starter (single-file, no external assets)

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  backgroundColor: '#1a1a1a',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

let pathPoints;
let enemyGroup = [];
let towerGroup = [];
let bulletGroup = [];
let money = 100;
let lives = 10;
let wave = 0;
let ui = {};
let gridSize = 40;
let mapCols, mapRows;
let path;
let gameOver = false;
let topBarHeight = 64;

// helper: convert grid (col, row) to pixel (x, y)
function gridToPixel(col, row) {
  return {
    x: col * gridSize + gridSize / 2,
    y: topBarHeight + row * gridSize + gridSize / 2
  };
}

function preload() {
  // textures generated at runtime
  // load turret sprite for towers
  this.load.image('turret', 'src/assets/tank_blue.png');
  // load terrain tileset (40x40 tiles, pre-scaled)
  this.load.image('terrain', 'src/assets/terrainTiles_default_40.png');
}

function create() {
  // generate simple textures
  const g = this.add.graphics();
  g.fillStyle(0xff3333, 1);
  g.fillCircle(10, 10, 10);
  g.generateTexture('enemy', 20, 20);
  g.clear();

  g.fillStyle(0x00cc44, 1);
  g.fillCircle(14, 14, 14);
  g.generateTexture('heavyEnemy', 28, 28);
  g.clear();

  // big heavy enemy (boss-like) - larger & purple
  g.fillStyle(0x8833ff, 1);
  g.fillCircle(20, 20, 20);
  g.generateTexture('bigHeavy', 40, 40);
  g.clear();

  g.fillStyle(0xffcc00, 1);
  g.fillCircle(9, 9, 9);
  g.generateTexture('fastEnemy', 18, 18);
  g.clear();

  g.fillStyle(0x66ccff, 1);
  g.fillCircle(12, 12, 12);
  g.generateTexture('tower', 24, 24);
  g.clear();

  g.fillStyle(0xffff66, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture('bullet', 8, 8);
  g.destroy();

  // debug: log whether external turret texture loaded
  if (!this.textures.exists('turret')) {
    console.warn('turret texture not found at preload-time: src/assets/tank_blue.png');
  } else {
    console.log('turret texture loaded');
  }

  mapCols = Math.floor(config.width / gridSize);
  mapRows = Math.floor((config.height - topBarHeight) / gridSize);

  // path using grid coordinates (col, row) - much cleaner
  // note: row is relative to playable area (below topBar)
  pathPoints = [
    { col: 0, row: 7 },
    { col: 5, row: 7 },
    { col: 5, row: 3 },
    { col: 15, row: 3 },
    { col: 15, row: 11 },
    { col: 19, row: 11 }
  ];

  // draw path using pixel coords
  const graphics = this.add.graphics();
  graphics.lineStyle(6, 0x444444, 1);
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = gridToPixel(pathPoints[i].col, pathPoints[i].row);
    const p2 = gridToPixel(pathPoints[i + 1].col, pathPoints[i + 1].row);
    graphics.strokeLineShape(new Phaser.Geom.Line(p1.x, p1.y, p2.x, p2.y));
  }

  // convert grid pathPoints to pixel pathPoints for tilemap and followers
  const pixelPathPoints = pathPoints.map(p => gridToPixel(p.col, p.row));

  // create tilemap layer for terrain tiles along path
  if (this.textures.exists('terrain')) {
    createPathTilemap.call(this, pathPoints);
  }

  // path for followers (use pixel coords)
  const startPixel = gridToPixel(pathPoints[0].col, pathPoints[0].row);
  path = this.add.path(startPixel.x, startPixel.y);
  for (let i = 1; i < pixelPathPoints.length; i++) path.lineTo(pixelPathPoints[i].x, pixelPathPoints[i].y);

  // top bar background
  const topBar = this.add.rectangle(config.width / 2, topBarHeight / 2, config.width, topBarHeight, 0x0e0e0e, 1).setDepth(4);

  // UI (placed in top bar)
  ui.moneyText = this.add.text(12, 18, `Money: ${money}`, { font: '16px sans-serif', fill: '#fff' }).setDepth(10);
  ui.livesText = this.add.text(140, 18, `Lives: ${lives}`, { font: '16px sans-serif', fill: '#fff' }).setDepth(10);
  ui.waveText = this.add.text(260, 18, `Wave: ${wave}`, { font: '16px sans-serif', fill: '#fff' }).setDepth(10);
  ui.startText = this.add.text(600, 18, 'Start Wave', { font: '18px sans-serif', fill: '#fff', backgroundColor: '#2266aa' }).setPadding(8).setInteractive().setDepth(10);
  ui.startText.on('pointerdown', () => startWave.call(this));
  ui.resetText = this.add.text(710, 18, 'Reset', { font: '18px sans-serif', fill: '#fff', backgroundColor: '#aa2222' }).setPadding(8).setInteractive().setDepth(10);
  ui.resetText.on('pointerdown', () => resetGame.call(this));

  // debug overlay for blocked placement cells
  ui.showBlocked = false;
  ui.blockGraphics = this.add.graphics().setDepth(2);
  ui.debugText = this.add.text(360, 18, 'Debug: Off', { font: '16px sans-serif', fill: '#fff', backgroundColor: '#444' }).setPadding(6).setInteractive().setDepth(10);
  ui.debugText.on('pointerdown', () => {
    ui.showBlocked = !ui.showBlocked;
    ui.debugText.setText(`Debug: ${ui.showBlocked ? 'On' : 'Off'}`);
    if (!ui.showBlocked) ui.blockGraphics.clear();
  });

  // place tower on click (only on game grid, not the top bar)
  this.input.on('pointerdown', (pointer) => {
    if (gameOver) return; // prevent placing towers after game over
    if (pointer.y < topBarHeight) return; // clicks on top bar should not place towers
    const wx = Math.floor(pointer.x / gridSize) * gridSize + gridSize/2;
    const row = Math.floor((pointer.y - topBarHeight) / gridSize);
    const wy = topBarHeight + row * gridSize + gridSize/2;
    if (canPlaceTowerAt(wx, wy)) placeTower.call(this, wx, wy);
  });

  // subtle grid (starts below the top bar)
  const gridG = this.add.graphics();
  gridG.lineStyle(1, 0x222222, 1);
  for (let i = 0; i <= mapCols; i++) gridG.strokeLineShape(new Phaser.Geom.Line(i*gridSize, topBarHeight, i*gridSize, config.height));
  for (let j = 0; j <= mapRows; j++) gridG.strokeLineShape(new Phaser.Geom.Line(0, topBarHeight + j*gridSize, config.width, topBarHeight + j*gridSize));
}

function update(time, delta) {
  // draw blocked-cell overlay (cleared when hidden or game over)
  if (ui.blockGraphics) {
    ui.blockGraphics.clear();
    if (ui.showBlocked && !gameOver) {
      ui.blockGraphics.fillStyle(0xff0000, 0.28);
      for (let col = 0; col < mapCols; col++) {
        for (let row = 0; row < mapRows; row++) {
          const cx = col * gridSize + gridSize/2;
          const cy = topBarHeight + row * gridSize + gridSize/2;
          if (isCellBlocked(cx, cy)) {
            ui.blockGraphics.fillRect(col * gridSize, topBarHeight + row * gridSize, gridSize, gridSize);
          }
        }
      }
    }
  }

  if (gameOver) return; // pause all game updates if game over
  
  // remove enemies that reached end handled by follower
  for (let i = enemyGroup.length - 1; i >= 0; i--) {
    const e = enemyGroup[i];
    if (!e.active) continue;
    // check if enemy reached end of path (last point)
    const lastPathPoint = pathPoints[pathPoints.length - 1];
    const endPixel = {
      x: lastPathPoint.col * gridSize + gridSize / 2,
      y: topBarHeight + lastPathPoint.row * gridSize + gridSize / 2
    };
    const distToEnd = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, endPixel.x, endPixel.y);
    if (distToEnd < 30) {
      e.active = false;
      e.sprite.destroy();
      enemyGroup.splice(i, 1);
      lives -= 1;
      ui.livesText.setText(`Lives: ${lives}`);
      if (lives <= 0) {
        endGame.call(this);
        return;
      }
    }
  }

  // towers
  for (let t of towerGroup) {
    t.cooldown -= delta;
    if (t.cooldown <= 0) {
      const target = findNearestEnemyInRange(t, t.range);
      if (target) {
        shootBullet.call(this, t, target);
        t.cooldown = t.fireRate;
      }
    }
    // keep the small level label positioned above the tower
    try {
      if (t.lvText) t.lvText.setPosition(t.x, t.y - (gridSize/2) - 8);
    } catch (e) {}
  }

  // bullets
  for (let i = bulletGroup.length - 1; i >= 0; i--) {
    const b = bulletGroup[i];
    b.life -= delta;
    b.sprite.x += b.vx * (delta/1000);
    b.sprite.y += b.vy * (delta/1000);
    let hit = false;
    for (let j = 0; j < enemyGroup.length; j++) {
      const e = enemyGroup[j];
      const dx = e.sprite.x - b.sprite.x;
      const dy = e.sprite.y - b.sprite.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 12) {
        e.hp -= b.damage;
        if (e.hp <= 0) {
          e.active = false;
          e.sprite.destroy();
          enemyGroup.splice(j, 1);
          // reward based on enemy type: basic red 'enemy' gives 5, others give 10
          let reward = 10;
          try {
            const key = e.sprite.texture && e.sprite.texture.key;
            if (key === 'enemy') reward = 5;
          } catch (err) {}
          money += reward;
          ui.moneyText.setText(`Money: ${money}`);
        }
        hit = true;
        break;
      }
    }
    if (hit || b.life <= 0) {
      b.sprite.destroy();
      bulletGroup.splice(i, 1);
    }
  }
}

// Helpers
// return shortest distance from point (px,py) to segment (x1,y1)-(x2,y2)
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) {
    const dx = px - x1; const dy = py - y1;
    return Math.sqrt(dx*dx + dy*dy);
  }
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) {
    const dx = px - x2; const dy = py - y2;
    return Math.sqrt(dx*dx + dy*dy);
  }
  const b = c1 / c2;
  const bx = x1 + b * vx;
  const by = y1 + b * vy;
  const dx = px - bx; const dy = py - by;
  return Math.sqrt(dx*dx + dy*dy);
}

function isCellBlocked(x, y) {
  // blocked by path (convert grid pathPoints to pixels for distance check)
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = {
      x: pathPoints[i].col * gridSize + gridSize / 2,
      y: topBarHeight + pathPoints[i].row * gridSize + gridSize / 2
    };
    const p2 = {
      x: pathPoints[i + 1].col * gridSize + gridSize / 2,
      y: topBarHeight + pathPoints[i + 1].row * gridSize + gridSize / 2
    };
    const dist = pointToSegmentDistance(x, y, p1.x, p1.y, p2.x, p2.y);
    if (dist < 20) return true;
  }
  // blocked by existing towers
  for (let t of towerGroup) if (Phaser.Math.Distance.Between(t.x, t.y, x, y) < 20) return true;
  return false;
}

function canPlaceTowerAt(x, y) {
  if (isCellBlocked(x, y)) return false;
  if (money < 50) return false;
  return true;
}

function placeTower(x, y) {
  if (money < 50) return;
  money -= 50;
  ui.moneyText.setText(`Money: ${money}`);
  // use turret sprite if loaded, fall back to generated 'tower'
  const tex = this.textures.exists('turret') ? 'turret' : 'tower';
  if (tex === 'tower') console.warn('Using fallback generated tower texture (turret image not available)');
  const sprite = this.add.image(x, y, tex).setDepth(3);
  sprite.setOrigin(0.5, 0.5);
  // ensure turret fits the grid cell
  try { sprite.setDisplaySize(gridSize - 8, gridSize - 8); } catch (e) {}
  // make towers interactive so we can upgrade them
  try { sprite.setInteractive({ useHandCursor: true }); } catch (e) {}

  // If your turret image points down by default, apply a -90° offset so
  // setting rotation to the angle (radians) aims the sprite correctly.
  const tower = { sprite, x, y, range: 120, fireRate: 600, cooldown: 0, rotationOffset: -Math.PI/2, level: 1, damage: 30 };

  // level label (small text) above tower
  try {
    tower.lvText = this.add.text(x, y - (gridSize/2) - 8, 'LV1', { font: '12px sans-serif', fill: '#fff' }).setOrigin(0.5, 0.5).setDepth(6);
  } catch (e) {}

  // upgrade to level 2 on click (cost 150)
  if (sprite.on) {
    sprite.on('pointerdown', (pointer) => {
      try { pointer.event.stopPropagation(); } catch (e) {}
      if (tower.level >= 2) return;
      if (money < 150) return; // not enough
      money -= 150;
      ui.moneyText.setText(`Money: ${money}`);
      tower.level = 2;
      tower.damage = 60;
      // make it shoot faster
      tower.fireRate = Math.max(200, tower.fireRate - 200);
      // visual - tint to gold and update level label
      try { tower.sprite.setTint(0xffcc00); } catch (e) {}
      try { if (tower.lvText) tower.lvText.setText('LV2'); } catch (e) {}
    });
  }
  towerGroup.push(tower);
}

function spawnEnemy(scene) {
  const startPixel = gridToPixel(pathPoints[0].col, pathPoints[0].row);
  const follower = scene.add.follower(path, startPixel.x, startPixel.y, 'enemy');
  follower.setDepth(2); // above terrain
  const tween = follower.startFollow({ duration: 8000, rotateToPath: false, onComplete: () => {} });
  const enemy = { sprite: follower, hp: 30, active: true, tween: tween };
  enemyGroup.push(enemy);
}

function spawnHeavyEnemy(scene) {
  const startPixel = gridToPixel(pathPoints[0].col, pathPoints[0].row);
  const follower = scene.add.follower(path, startPixel.x, startPixel.y, 'heavyEnemy');
  follower.setDepth(2); // above terrain
  const tween = follower.startFollow({ duration: 12000, rotateToPath: false, onComplete: () => {} });
  const enemy = { sprite: follower, hp: 90, active: true, tween: tween };
  enemyGroup.push(enemy);
}

function spawnFastEnemy(scene) {
  const startPixel = gridToPixel(pathPoints[0].col, pathPoints[0].row);
  const follower = scene.add.follower(path, startPixel.x, startPixel.y, 'fastEnemy');
  follower.setDepth(2); // above terrain
  const tween = follower.startFollow({ duration: 6000, rotateToPath: false, onComplete: () => {} });
  const enemy = { sprite: follower, hp: 60, active: true, tween: tween };
  enemyGroup.push(enemy);
}

function spawnBigHeavyEnemy(scene) {
  const startPixel = gridToPixel(pathPoints[0].col, pathPoints[0].row);
  const follower = scene.add.follower(path, startPixel.x, startPixel.y, 'bigHeavy');
  follower.setDepth(2); // above terrain
  // very slow, big HP
  const tween = follower.startFollow({ duration: 16000, rotateToPath: false, onComplete: () => {} });
  const enemy = { sprite: follower, hp: 300, active: true, tween: tween };
  enemyGroup.push(enemy);
}

function startWave() {
  wave += 1;
  ui.waveText.setText(`Wave: ${wave}`);
  const count = 5 + wave * 2;
  let enemyIndex = 0;
  for (let i = 0; i < count; i++) {
    // big heavy has highest priority: spawn every 10th enemy from wave 7 onwards
    const isBig = wave >= 7 && enemyIndex % 10 === 9;
    // then older special types
    const isHeavy = !isBig && wave > 1 && enemyIndex % 5 === 4; // spawn heavy every 5th enemy starting wave 2
    const isFast = !isBig && wave >= 3 && enemyIndex % 4 === 3; // spawn fast every 4th enemy starting wave 3
    this.time.delayedCall(i * 600, () => {
      if (isBig) spawnBigHeavyEnemy(this);
      else if (isHeavy) spawnHeavyEnemy(this);
      else if (isFast) spawnFastEnemy(this);
      else spawnEnemy(this);
    });
    enemyIndex++;
  }
}

function resetGame() {
  // clear all sprites
  for (let e of enemyGroup) e.sprite.destroy();
  for (let t of towerGroup) {
    if (t.sprite) t.sprite.destroy();
    if (t.lvText) t.lvText.destroy();
  }
  for (let b of bulletGroup) b.sprite.destroy();
  if (ui.gameOverScreen) ui.gameOverScreen.destroy();
  
  // reset state
  enemyGroup = [];
  towerGroup = [];
  bulletGroup = [];
  money = 100;
  lives = 10;
  wave = 0;
  gameOver = false;
  
  // update UI
  ui.moneyText.setText(`Money: ${money}`);
  ui.livesText.setText(`Lives: ${lives}`);
  ui.waveText.setText(`Wave: ${wave}`);
}

function endGame() {
  gameOver = true;
  // create game over screen
  const gameOverScreen = this.add.rectangle(config.width / 2, config.height / 2, config.width, config.height, 0x000000, 0.8);
  gameOverScreen.setDepth(100);
  const gameOverText = this.add.text(config.width / 2, config.height / 2 - 40, 'GAME OVER', { font: '48px sans-serif', fill: '#ff3333' }).setOrigin(0.5, 0.5).setDepth(101);
  const finalScoreText = this.add.text(config.width / 2, config.height / 2 + 20, `Final Wave: ${wave}`, { font: '24px sans-serif', fill: '#fff' }).setOrigin(0.5, 0.5).setDepth(101);
  const resetPromptText = this.add.text(config.width / 2, config.height / 2 + 80, 'Click Reset to Play Again', { font: '18px sans-serif', fill: '#aaa' }).setOrigin(0.5, 0.5).setDepth(101);
  ui.gameOverScreen = gameOverScreen;
}

function createPathTilemap(pathPoints) {
  // Create a tilemap that matches our grid system
  // Use our grid dimensions directly
  const map = this.make.tilemap({ 
    width: mapCols, 
    height: mapRows, 
    tileWidth: gridSize, 
    tileHeight: gridSize 
  });
  
  // Add tileset - terrain tiles are already 40x40, matching our grid
  const tileset = map.addTilesetImage('terrain', 'terrain', gridSize, gridSize);
  const layer = map.createBlankLayer('path', tileset);
  
  // Position the layer to start below the top bar
  layer.setPosition(0, topBarHeight);
  layer.setDepth(0); // behind everything else

  // fill entire grid with grass tiles using (0,0) and (0,1)
  // compute tiles-per-row from the loaded texture so we can reference (0,1)
  let tilesPerRow = 1;
  try {
    const tex = this.textures.get('terrain');
    const src = tex && tex.source && tex.source[0] && tex.source[0].image;
    if (src && src.width && gridSize > 0) tilesPerRow = Math.floor(src.width / gridSize);
  } catch (e) {}

  const grassA = 0; // tile at (0,0)
  const grassB = tilesPerRow; // tile at (0,1)
  for (let r = 0; r < mapRows; r++) {
    for (let c = 0; c < mapCols; c++) {
      const idx = ((c + r) % 2 === 0) ? grassA : grassB;
      map.putTileAt(idx, c, r, false, layer);
    }
  }
  
  // pathPoints are in grid coordinates (col, row), so we can use them directly
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i]; // {col, row}
    const p2 = pathPoints[i + 1]; // {col, row}
    
    // determine direction
    const isVertical = p1.col === p2.col; // same column = vertical movement
    const isHorizontal = p1.row === p2.row; // same row = horizontal movement
    
    // tile indices from terrain tileset: assume (1,0) for vertical path, (2,0) for horizontal
    const tileIndex = isVertical ? 1 : 2;
    
    // place tiles along the segment using grid coordinates
    if (isVertical) {
      const minRow = Math.min(p1.row, p2.row);
      const maxRow = Math.max(p1.row, p2.row);
      for (let row = minRow; row <= maxRow; row++) {
        map.putTileAt(tileIndex, p1.col, row, false, layer);
      }
    } else if (isHorizontal) {
      const minCol = Math.min(p1.col, p2.col);
      const maxCol = Math.max(p1.col, p2.col);
      for (let col = minCol; col <= maxCol; col++) {
        map.putTileAt(tileIndex, col, p1.row, false, layer);
      }
    }
  }
  
  // No scaling needed - tiles are already the correct size
}

function findNearestEnemyInRange(tower, range) {
  let best = null; let bestDist = 9999;
  for (let e of enemyGroup) {
    const d = Phaser.Math.Distance.Between(tower.x, tower.y, e.sprite.x, e.sprite.y);
    if (d <= range && d < bestDist) { best = e; bestDist = d; }
  }
  return best;
}

function shootBullet(tower, target) {
  const sx = tower.x; const sy = tower.y;
  const tx = target.sprite.x; const ty = target.sprite.y;
  const angle = Math.atan2(ty - sy, tx - sx);
  // rotate turret sprite to face target (Phaser rotation uses radians)
  if (tower.sprite && tower.sprite.setRotation) {
    const offset = typeof tower.rotationOffset === 'number' ? tower.rotationOffset : 0;
    tower.sprite.setRotation(angle + offset);
  }
  const speed = 300;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const bSprite = this.add.image(sx, sy, 'bullet').setDepth(4); // above everything
  // use tower-specific damage when firing
  const bullet = { sprite: bSprite, vx, vy, life: 2000, damage: (tower && tower.damage) ? tower.damage : 30 };
  bulletGroup.push(bullet);
}
