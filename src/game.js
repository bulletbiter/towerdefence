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

function preload() {
  // textures generated at runtime
}

function create() {
  // generate simple textures
  const g = this.add.graphics();
  g.fillStyle(0xff3333, 1);
  g.fillCircle(10, 10, 10);
  g.generateTexture('enemy', 20, 20);
  g.clear();

  g.fillStyle(0x66ccff, 1);
  g.fillCircle(12, 12, 12);
  g.generateTexture('tower', 24, 24);
  g.clear();

  g.fillStyle(0xffff66, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture('bullet', 8, 8);
  g.destroy();

  mapCols = Math.floor(config.width / gridSize);
  mapRows = Math.floor((config.height - topBarHeight) / gridSize);

  // simple hardcoded path
  pathPoints = [
    { x: 0, y: 300 },
    { x: 200, y: 300 },
    { x: 200, y: 100 },
    { x: 600, y: 100 },
    { x: 600, y: 450 },
    { x: 800, y: 450 }
  ];

  // draw path
  const graphics = this.add.graphics();
  graphics.lineStyle(6, 0x444444, 1);
  for (let i = 0; i < pathPoints.length - 1; i++) {
    graphics.strokeLineShape(new Phaser.Geom.Line(pathPoints[i].x, pathPoints[i].y, pathPoints[i+1].x, pathPoints[i+1].y));
  }

  // path for followers
  path = this.add.path(pathPoints[0].x, pathPoints[0].y);
  for (let i = 1; i < pathPoints.length; i++) path.lineTo(pathPoints[i].x, pathPoints[i].y);

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
  if (gameOver) return; // pause all game updates if game over
  
  // remove enemies that reached end handled by follower
  for (let i = enemyGroup.length - 1; i >= 0; i--) {
    const e = enemyGroup[i];
    if (!e.active) continue;
    // check if enemy reached end of path (last point)
    const endPoint = pathPoints[pathPoints.length - 1];
    const distToEnd = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, endPoint.x, endPoint.y);
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
          money += 10;
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
function canPlaceTowerAt(x, y) {
  for (let i = 0; i < pathPoints.length-1; i++) {
    const p1 = pathPoints[i];
    const p2 = pathPoints[i+1];
    const line = new Phaser.Geom.Line(p1.x, p1.y, p2.x, p2.y);
    const dist = Phaser.Geom.Line.GetShortestDistance(line, new Phaser.Geom.Point(x, y));
    if (dist < 20) return false;
  }
  if (money < 50) return false;
  for (let t of towerGroup) if (Phaser.Math.Distance.Between(t.x, t.y, x, y) < 20) return false;
  return true;
}

function placeTower(x, y) {
  if (money < 50) return;
  money -= 50;
  ui.moneyText.setText(`Money: ${money}`);
  const sprite = this.add.image(x, y, 'tower');
  const tower = { sprite, x, y, range: 120, fireRate: 600, cooldown: 0 };
  towerGroup.push(tower);
}

function spawnEnemy(scene) {
  const follower = scene.add.follower(path, pathPoints[0].x, pathPoints[0].y, 'enemy');
  const tween = follower.startFollow({ duration: 8000, rotateToPath: false, onComplete: () => {} });
  const enemy = { sprite: follower, hp: 30, active: true, tween: tween };
  enemyGroup.push(enemy);
}

function startWave() {
  wave += 1;
  ui.waveText.setText(`Wave: ${wave}`);
  const count = 5 + wave * 2;
  for (let i = 0; i < count; i++) this.time.delayedCall(i * 600, () => spawnEnemy(this));
}

function resetGame() {
  // clear all sprites
  for (let e of enemyGroup) e.sprite.destroy();
  for (let t of towerGroup) t.sprite.destroy();
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
  const speed = 300;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const bSprite = this.add.image(sx, sy, 'bullet');
  const bullet = { sprite: bSprite, vx, vy, life: 2000, damage: 30 };
  bulletGroup.push(bullet);
}
