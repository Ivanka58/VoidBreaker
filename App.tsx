import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  StatusBar,
  Vibration,
  PanResponder,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const CELL = Math.floor(W / 9);
const COLS = Math.floor(W / CELL);
const ROWS = Math.floor((H * 0.55) / CELL);
const TICK = 120; // ms per game tick

const COLORS = {
  bg: '#050508',
  panel: '#0d0d1a',
  void: '#08080f',
  accent: '#7c3aed',
  accentGlow: '#a855f7',
  danger: '#ef4444',
  dangerGlow: '#f87171',
  gold: '#f59e0b',
  goldGlow: '#fcd34d',
  cyan: '#06b6d4',
  cyanGlow: '#67e8f9',
  green: '#10b981',
  text: '#e2e8f0',
  muted: '#475569',
  border: 'rgba(124,58,237,0.25)',
};

const TILE_TYPES = {
  EMPTY: 0,
  WALL: 1,
  PLAYER: 2,
  ENEMY_DRONE: 3,
  ENEMY_TANK: 4,
  BULLET_PLAYER: 5,
  BULLET_ENEMY: 6,
  POWERUP_SHIELD: 7,
  POWERUP_RAPID: 8,
  POWERUP_BOMB: 9,
  EXPLOSION: 10,
  STAR: 11,
};

// ─── SCREENS ──────────────────────────────────────────────────────────────────

function MenuScreen({ onPlay, onHighScores, bestScore }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const titleY = useRef(new Animated.Value(-80)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(titleY, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 800, delay: 300, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const stars = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * W,
    y: Math.random() * H,
    size: Math.random() * 2.5 + 0.5,
    opacity: Math.random() * 0.6 + 0.2,
  }));

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      {/* Stars */}
      {stars.map(s => (
        <View key={s.id} style={[styles.star, { left: s.x, top: s.y, width: s.size, height: s.size, opacity: s.opacity }]} />
      ))}

      {/* Grid bg */}
      <View style={StyleSheet.absoluteFill}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={[styles.gridLine, { top: (H / 12) * i }]} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.gridLineV, { left: (W / 8) * i }]} />
        ))}
      </View>

      <Animated.View style={{ transform: [{ translateY: titleY }], alignItems: 'center', marginTop: H * 0.15 }}>
        <Text style={styles.titleSub}>// SECTOR ZERO //</Text>
        <Text style={styles.title}>VOID</Text>
        <Text style={styles.titleAccent}>BREAKER</Text>
        <View style={styles.titleLine} />
      </Animated.View>

      <Animated.View style={{ opacity: fadeIn, alignItems: 'center', marginTop: 40 }}>
        {bestScore > 0 && (
          <View style={styles.bestScoreBox}>
            <Text style={styles.bestScoreLabel}>BEST SCORE</Text>
            <Text style={styles.bestScoreVal}>{bestScore.toLocaleString()}</Text>
          </View>
        )}

        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity style={styles.btnPrimary} onPress={onPlay} activeOpacity={0.8}>
            <LinearGradient colors={['#7c3aed', '#a855f7']} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.btnPrimaryText}>▶  ЗАПУСТИТЬ</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity style={styles.btnSecondary} onPress={onHighScores} activeOpacity={0.8}>
          <Text style={styles.btnSecondaryText}>⬡  РЕКОРДЫ</Text>
        </TouchableOpacity>

        <Text style={styles.menuHint}>Уничтожь всё. Выживи.</Text>
      </Animated.View>

      {/* Corner decorations */}
      <View style={[styles.corner, { top: 20, left: 20 }]}>
        <View style={styles.cornerH} /><View style={styles.cornerV} />
      </View>
      <View style={[styles.corner, { top: 20, right: 20, transform: [{ scaleX: -1 }] }]}>
        <View style={styles.cornerH} /><View style={styles.cornerV} />
      </View>
      <View style={[styles.corner, { bottom: 20, left: 20, transform: [{ scaleY: -1 }] }]}>
        <View style={styles.cornerH} /><View style={styles.cornerV} />
      </View>
      <View style={[styles.corner, { bottom: 20, right: 20, transform: [{ scaleX: -1 }, { scaleY: -1 }] }]}>
        <View style={styles.cornerH} /><View style={styles.cornerV} />
      </View>
    </View>
  );
}

// ─── GAME ENGINE ──────────────────────────────────────────────────────────────

function useGameEngine(onGameOver) {
  const [gameState, setGameState] = useState(null);
  const stateRef = useRef(null);
  const tickRef = useRef(null);
  const frameRef = useRef(0);

  const initState = useCallback((level = 1) => {
    const playerX = Math.floor(COLS / 2);
    const playerY = ROWS - 2;

    const enemies = [];
    const count = Math.min(3 + level * 2, 20);
    for (let i = 0; i < count; i++) {
      const isTank = level > 2 && Math.random() < 0.3;
      enemies.push({
        id: Date.now() + i,
        x: 1 + Math.floor(Math.random() * (COLS - 2)),
        y: 1 + Math.floor(Math.random() * Math.floor(ROWS * 0.4)),
        type: isTank ? TILE_TYPES.ENEMY_TANK : TILE_TYPES.ENEMY_DRONE,
        hp: isTank ? 3 : 1,
        moveTimer: 0,
        shootTimer: Math.floor(Math.random() * 40),
        dir: Math.random() < 0.5 ? -1 : 1,
      });
    }

    const walls = [];
    for (let i = 0; i < 8 + level * 2; i++) {
      walls.push({
        x: 1 + Math.floor(Math.random() * (COLS - 2)),
        y: 2 + Math.floor(Math.random() * (ROWS - 4)),
      });
    }

    const state = {
      player: { x: playerX, y: playerY, hp: 3, maxHp: 3, shield: 0, rapidFire: 0, shootCooldown: 0 },
      enemies,
      bullets: [],
      explosions: [],
      powerups: [],
      score: 0,
      level,
      walls,
      tick: 0,
      gameOver: false,
      won: false,
      combo: 0,
      comboTimer: 0,
    };

    stateRef.current = state;
    setGameState({ ...state });
    return state;
  }, []);

  const movePlayer = useCallback((dx, dy) => {
    const s = stateRef.current;
    if (!s || s.gameOver) return;
    const nx = Math.max(0, Math.min(COLS - 1, s.player.x + dx));
    const ny = Math.max(0, Math.min(ROWS - 1, s.player.y + dy));
    const blocked = s.walls.some(w => w.x === nx && w.y === ny);
    if (!blocked) {
      s.player.x = nx;
      s.player.y = ny;
      setGameState(prev => ({ ...prev, player: { ...s.player } }));
    }
  }, []);

  const shoot = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.gameOver) return;
    if (s.player.shootCooldown > 0) return;
    const cooldown = s.player.rapidFire > 0 ? 3 : 8;
    s.player.shootCooldown = cooldown;
    s.bullets.push({
      id: Date.now() + Math.random(),
      x: s.player.x,
      y: s.player.y - 1,
      dy: -1,
      type: TILE_TYPES.BULLET_PLAYER,
    });
    Vibration.vibrate(20);
  }, []);

  const bomb = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.gameOver) return;
    let killed = 0;
    s.enemies.forEach(e => {
      s.explosions.push({ id: Date.now() + Math.random(), x: e.x, y: e.y, timer: 8 });
      killed++;
    });
    s.enemies = [];
    s.score += killed * 200;
    s.combo += killed;
    Vibration.vibrate([0, 50, 30, 50]);
    setGameState({ ...s });
  }, []);

  useEffect(() => {
    const tick = () => {
      const s = stateRef.current;
      if (!s || s.gameOver) return;

      s.tick++;
      frameRef.current++;

      // Cooldowns
      if (s.player.shootCooldown > 0) s.player.shootCooldown--;
      if (s.player.shield > 0) s.player.shield--;
      if (s.player.rapidFire > 0) s.player.rapidFire--;
      if (s.comboTimer > 0) s.comboTimer--;
      else s.combo = 0;

      // Move player bullets
      s.bullets = s.bullets.filter(b => {
        b.y += b.dy;
        if (b.y < 0 || b.y >= ROWS) return false;

        if (b.type === TILE_TYPES.BULLET_PLAYER) {
          // Hit wall
          if (s.walls.some(w => w.x === b.x && w.y === b.y)) return false;

          // Hit enemy
          let hit = false;
          s.enemies = s.enemies.filter(e => {
            if (e.x === b.x && e.y === b.y) {
              e.hp--;
              hit = true;
              if (e.hp <= 0) {
                s.explosions.push({ id: Date.now() + Math.random(), x: e.x, y: e.y, timer: 8 });
                s.combo++;
                s.comboTimer = 60;
                const baseScore = e.type === TILE_TYPES.ENEMY_TANK ? 300 : 100;
                s.score += baseScore * Math.max(1, s.combo);

                // Chance to drop powerup
                if (Math.random() < 0.25) {
                  const types = [TILE_TYPES.POWERUP_SHIELD, TILE_TYPES.POWERUP_RAPID, TILE_TYPES.POWERUP_BOMB];
                  s.powerups.push({
                    id: Date.now() + Math.random(),
                    x: e.x, y: e.y,
                    type: types[Math.floor(Math.random() * types.length)],
                    timer: 200,
                  });
                }
                return false;
              }
            }
            return true;
          });
          if (hit) return false;
        } else {
          // Enemy bullet hits player
          if (b.x === s.player.x && b.y === s.player.y) {
            if (s.player.shield > 0) {
              s.player.shield = 0;
            } else {
              s.player.hp--;
              Vibration.vibrate(100);
              if (s.player.hp <= 0) {
                s.gameOver = true;
                s.explosions.push({ id: Date.now(), x: s.player.x, y: s.player.y, timer: 20 });
                onGameOver(s.score, s.level);
              }
            }
            return false;
          }
        }
        return true;
      });

      // Powerup collection
      s.powerups = s.powerups.filter(p => {
        p.timer--;
        if (p.timer <= 0) return false;
        if (p.x === s.player.x && p.y === s.player.y) {
          if (p.type === TILE_TYPES.POWERUP_SHIELD) s.player.shield = 150;
          if (p.type === TILE_TYPES.POWERUP_RAPID) s.player.rapidFire = 150;
          if (p.type === TILE_TYPES.POWERUP_BOMB) bomb();
          Vibration.vibrate(40);
          return false;
        }
        return true;
      });

      // Explosions
      s.explosions = s.explosions.filter(e => { e.timer--; return e.timer > 0; });

      // Enemy AI
      s.enemies.forEach(e => {
        e.moveTimer++;
        e.shootTimer++;

        const moveInterval = e.type === TILE_TYPES.ENEMY_TANK ? 20 : 12;
        if (e.moveTimer >= moveInterval) {
          e.moveTimer = 0;
          // Move towards player with some randomness
          const dx = s.player.x - e.x;
          const dy = s.player.y - e.y;
          let mx = 0, my = 0;

          if (Math.random() < 0.6) {
            // Move toward player
            if (Math.abs(dx) > Math.abs(dy)) mx = dx > 0 ? 1 : -1;
            else my = dy > 0 ? 1 : -1;
          } else {
            // Random move
            const r = Math.floor(Math.random() * 4);
            if (r === 0) mx = 1; else if (r === 1) mx = -1;
            else if (r === 2) my = 1; else my = -1;
          }

          const nx = Math.max(0, Math.min(COLS - 1, e.x + mx));
          const ny = Math.max(0, Math.min(ROWS - 1, e.y + my));
          if (!s.walls.some(w => w.x === nx && w.y === ny) &&
              !s.enemies.some(o => o.id !== e.id && o.x === nx && o.y === ny)) {
            e.x = nx; e.y = ny;
          }
        }

        const shootInterval = e.type === TILE_TYPES.ENEMY_TANK ? 25 : 35;
        if (e.shootTimer >= shootInterval) {
          e.shootTimer = 0;
          // Shoot toward player
          const dx = s.player.x - e.x;
          const dy = s.player.y - e.y;
          if (Math.abs(dy) > Math.abs(dx) || Math.random() < 0.3) {
            s.bullets.push({
              id: Date.now() + Math.random(),
              x: e.x, y: e.y + 1,
              dy: 1,
              type: TILE_TYPES.BULLET_ENEMY,
            });
          }
        }

        // Enemy reaches player
        if (e.x === s.player.x && e.y === s.player.y) {
          if (s.player.shield > 0) s.player.shield = 0;
          else {
            s.player.hp--;
            if (s.player.hp <= 0) {
              s.gameOver = true;
              onGameOver(s.score, s.level);
            }
          }
        }
      });

      // Win condition
      if (s.enemies.length === 0 && !s.gameOver) {
        s.won = true;
        onGameOver(s.score, s.level, true);
      }

      // Spawn new enemies on wave clear (handled by won)
      setGameState({ ...s, player: { ...s.player } });
    };

    tickRef.current = setInterval(tick, TICK);
    return () => clearInterval(tickRef.current);
  }, [onGameOver, bomb]);

  return { gameState, initState, movePlayer, shoot, bomb };
}

// ─── GAME GRID ────────────────────────────────────────────────────────────────

const CELL_SIZE = CELL;

function GameGrid({ gameState }) {
  if (!gameState) return null;
  const { player, enemies, bullets, explosions, powerups, walls } = gameState;

  const getCell = (x, y) => {
    if (explosions.some(e => e.x === x && e.y === y)) return 'explosion';
    if (player.x === x && player.y === y) return 'player';
    const enemy = enemies.find(e => e.x === x && e.y === y);
    if (enemy) return enemy.type === TILE_TYPES.ENEMY_TANK ? 'tank' : 'drone';
    if (bullets.some(b => b.x === x && b.y === y && b.type === TILE_TYPES.BULLET_PLAYER)) return 'bulletP';
    if (bullets.some(b => b.x === x && b.y === y && b.type === TILE_TYPES.BULLET_ENEMY)) return 'bulletE';
    const pu = powerups.find(p => p.x === x && p.y === y);
    if (pu) return pu.type === TILE_TYPES.POWERUP_SHIELD ? 'puShield' : pu.type === TILE_TYPES.POWERUP_RAPID ? 'puRapid' : 'puBomb';
    if (walls.some(w => w.x === x && w.y === y)) return 'wall';
    return 'empty';
  };

  return (
    <View style={styles.grid}>
      {Array.from({ length: ROWS }).map((_, row) => (
        <View key={row} style={styles.gridRow}>
          {Array.from({ length: COLS }).map((_, col) => {
            const cell = getCell(col, row);
            return <GridCell key={col} type={cell} />;
          })}
        </View>
      ))}
    </View>
  );
}

function GridCell({ type }) {
  const style = [styles.cell];
  let inner = null;

  switch (type) {
    case 'player':
      inner = (
        <View style={styles.playerCell}>
          <Text style={styles.playerEmoji}>🚀</Text>
        </View>
      );
      break;
    case 'drone':
      inner = <View style={styles.droneCell}><Text style={styles.enemyEmoji}>👾</Text></View>;
      break;
    case 'tank':
      inner = <View style={styles.tankCell}><Text style={styles.enemyEmoji}>🤖</Text></View>;
      break;
    case 'bulletP':
      inner = <View style={styles.bulletP} />;
      break;
    case 'bulletE':
      inner = <View style={styles.bulletE} />;
      break;
    case 'explosion':
      inner = <View style={styles.explosionCell}><Text style={{ fontSize: CELL - 4 }}>💥</Text></View>;
      break;
    case 'wall':
      inner = <View style={styles.wallCell} />;
      break;
    case 'puShield':
      inner = <View style={styles.puCell}><Text style={{ fontSize: CELL - 8 }}>🛡️</Text></View>;
      break;
    case 'puRapid':
      inner = <View style={styles.puCell}><Text style={{ fontSize: CELL - 8 }}>⚡</Text></View>;
      break;
    case 'puBomb':
      inner = <View style={styles.puCell}><Text style={{ fontSize: CELL - 8 }}>💣</Text></View>;
      break;
    default:
      break;
  }

  return <View style={style}>{inner}</View>;
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function HUD({ gameState }) {
  if (!gameState) return null;
  const { player, score, level, enemies, combo } = gameState;

  return (
    <View style={styles.hud}>
      <View style={styles.hudLeft}>
        <Text style={styles.hudLabel}>УРОВЕНЬ</Text>
        <Text style={styles.hudValue}>{level}</Text>
      </View>

      <View style={styles.hudCenter}>
        <Text style={styles.hudLabel}>СЧЁТ</Text>
        <Text style={styles.hudScore}>{score.toLocaleString()}</Text>
        {combo > 1 && <Text style={styles.comboText}>x{combo} COMBO!</Text>}
      </View>

      <View style={styles.hudRight}>
        <Text style={styles.hudLabel}>ВРАГОВ</Text>
        <Text style={styles.hudValue}>{enemies.length}</Text>
      </View>

      {/* HP */}
      <View style={styles.hpRow}>
        {Array.from({ length: player.maxHp }).map((_, i) => (
          <Text key={i} style={{ fontSize: 18, opacity: i < player.hp ? 1 : 0.2 }}>❤️</Text>
        ))}
        {player.shield > 0 && <Text style={{ fontSize: 18 }}>🛡️</Text>}
        {player.rapidFire > 0 && <Text style={{ fontSize: 18 }}>⚡</Text>}
      </View>
    </View>
  );
}

// ─── CONTROLS ─────────────────────────────────────────────────────────────────

function Controls({ onMove, onShoot, onBomb }) {
  return (
    <View style={styles.controls}>
      <View style={styles.dpad}>
        <TouchableOpacity style={[styles.dpadBtn, styles.dpadUp]} onPress={() => onMove(0, -1)} activeOpacity={0.7}>
          <Text style={styles.dpadTxt}>▲</Text>
        </TouchableOpacity>
        <View style={styles.dpadMiddle}>
          <TouchableOpacity style={[styles.dpadBtn, styles.dpadLeft]} onPress={() => onMove(-1, 0)} activeOpacity={0.7}>
            <Text style={styles.dpadTxt}>◀</Text>
          </TouchableOpacity>
          <View style={styles.dpadCenter} />
          <TouchableOpacity style={[styles.dpadBtn, styles.dpadRight]} onPress={() => onMove(1, 0)} activeOpacity={0.7}>
            <Text style={styles.dpadTxt}>▶</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.dpadBtn, styles.dpadDown]} onPress={() => onMove(0, 1)} activeOpacity={0.7}>
          <Text style={styles.dpadTxt}>▼</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionBtns}>
        <TouchableOpacity style={styles.shootBtn} onPress={onShoot} activeOpacity={0.7}>
          <LinearGradient colors={['#7c3aed', '#a855f7']} style={styles.shootBtnGrad}>
            <Text style={styles.shootBtnTxt}>🔫{'\n'}ОГОНЬ</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bombBtn} onPress={onBomb} activeOpacity={0.7}>
          <Text style={styles.bombBtnTxt}>💣{'\n'}БОМБА</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── GAME OVER SCREEN ─────────────────────────────────────────────────────────

function GameOverScreen({ score, level, won, onRestart, onMenu }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      {/* Stars */}
      {Array.from({ length: 30 }).map((_, i) => (
        <View key={i} style={[styles.star, {
          left: Math.random() * W, top: Math.random() * H,
          width: Math.random() * 2 + 0.5, height: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.5 + 0.1,
        }]} />
      ))}

      <Animated.View style={[styles.gameOverCard, { transform: [{ scale }], opacity }]}>
        <Text style={styles.gameOverEmoji}>{won ? '🏆' : '💀'}</Text>
        <Text style={styles.gameOverTitle}>{won ? 'СЕКТОР ЗАЧИЩЕН' : 'GAME OVER'}</Text>

        <View style={styles.gameOverStats}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>СЧЁТ</Text>
            <Text style={styles.statVal}>{score.toLocaleString()}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>УРОВЕНЬ</Text>
            <Text style={styles.statVal}>{level}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btnPrimary} onPress={onRestart} activeOpacity={0.8}>
          <LinearGradient colors={['#7c3aed', '#a855f7']} style={styles.btnGrad}>
            <Text style={styles.btnPrimaryText}>↺  СНОВА</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} onPress={onMenu} activeOpacity={0.8}>
          <Text style={styles.btnSecondaryText}>⌂  МЕНЮ</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── HIGH SCORES ──────────────────────────────────────────────────────────────

function HighScoresScreen({ scores, onBack }) {
  return (
    <View style={styles.screen}>
      <View style={styles.hsHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnTxt}>← НАЗАД</Text>
        </TouchableOpacity>
        <Text style={styles.hsTitle}>РЕКОРДЫ</Text>
      </View>

      <ScrollView contentContainerStyle={styles.hsList}>
        {scores.length === 0 ? (
          <Text style={styles.noScores}>Нет рекордов. Сыграй!</Text>
        ) : (
          scores.map((s, i) => (
            <View key={i} style={[styles.hsRow, i === 0 && styles.hsRowFirst]}>
              <Text style={styles.hsRank}>{i === 0 ? '🏆' : `#${i + 1}`}</Text>
              <Text style={styles.hsScore}>{s.score.toLocaleString()}</Text>
              <Text style={styles.hsLevel}>LVL {s.level}</Text>
              <Text style={styles.hsDate}>{s.date}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

type Screen = 'menu' | 'game' | 'gameover' | 'highscores';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [gameResult, setGameResult] = useState({ score: 0, level: 1, won: false });
  const [highScores, setHighScores] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [bestScore, setBestScore] = useState(0);

  useEffect(() => {
    loadScores();
  }, []);

  const loadScores = async () => {
    try {
      const raw = await AsyncStorage.getItem('voidbreaker_scores');
      if (raw) {
        const scores = JSON.parse(raw);
        setHighScores(scores);
        if (scores.length > 0) setBestScore(scores[0].score);
      }
    } catch {}
  };

  const saveScore = async (score, level) => {
    try {
      const raw = await AsyncStorage.getItem('voidbreaker_scores');
      const scores = raw ? JSON.parse(raw) : [];
      const now = new Date();
      const date = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
      scores.push({ score, level, date });
      scores.sort((a, b) => b.score - a.score);
      const top = scores.slice(0, 10);
      await AsyncStorage.setItem('voidbreaker_scores', JSON.stringify(top));
      setHighScores(top);
      if (top.length > 0) setBestScore(top[0].score);
    } catch {}
  };

  const handleGameOver = useCallback(async (score, level, won = false) => {
    await saveScore(score, level);
    setGameResult({ score, level, won });
    setTimeout(() => setScreen('gameover'), won ? 1000 : 800);
  }, []);

  const { gameState, initState, movePlayer, shoot, bomb } = useGameEngine(handleGameOver);

  const startGame = useCallback((level = 1) => {
    setCurrentLevel(level);
    initState(level);
    setScreen('game');
  }, [initState]);

  const handleWin = useCallback(() => {
    startGame(currentLevel + 1);
  }, [currentLevel, startGame]);

  if (screen === 'menu') {
    return <MenuScreen onPlay={() => startGame(1)} onHighScores={() => setScreen('highscores')} bestScore={bestScore} />;
  }

  if (screen === 'highscores') {
    return <HighScoresScreen scores={highScores} onBack={() => setScreen('menu')} />;
  }

  if (screen === 'gameover') {
    return (
      <GameOverScreen
        score={gameResult.score}
        level={gameResult.level}
        won={gameResult.won}
        onRestart={() => startGame(1)}
        onMenu={() => setScreen('menu')}
      />
    );
  }

  // Game screen
  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <HUD gameState={gameState} />
      <GameGrid gameState={gameState} />
      <Controls onMove={movePlayer} onShoot={shoot} onBomb={bomb} />
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  star: { position: 'absolute', backgroundColor: '#fff', borderRadius: 99 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(124,58,237,0.05)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(124,58,237,0.05)' },

  // Menu
  titleSub: { fontSize: 11, letterSpacing: 6, color: COLORS.accentGlow, opacity: 0.7, fontFamily: 'monospace', marginBottom: 8 },
  title: { fontSize: 72, fontWeight: '900', color: COLORS.text, letterSpacing: 8, lineHeight: 72, fontFamily: 'monospace' },
  titleAccent: { fontSize: 72, fontWeight: '900', color: COLORS.accentGlow, letterSpacing: 8, lineHeight: 72, fontFamily: 'monospace' },
  titleLine: { width: 80, height: 2, backgroundColor: COLORS.accentGlow, marginTop: 16, opacity: 0.8 },

  bestScoreBox: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 24, paddingVertical: 10, marginBottom: 24, alignItems: 'center',
  },
  bestScoreLabel: { fontSize: 10, letterSpacing: 4, color: COLORS.muted, fontFamily: 'monospace' },
  bestScoreVal: { fontSize: 28, fontWeight: '900', color: COLORS.gold, fontFamily: 'monospace' },

  btnPrimary: { marginBottom: 14, borderRadius: 10, overflow: 'hidden', minWidth: 220 },
  btnGrad: { paddingVertical: 16, paddingHorizontal: 40, alignItems: 'center' },
  btnPrimaryText: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 4, fontFamily: 'monospace' },
  btnSecondary: {
    minWidth: 220, paddingVertical: 14, paddingHorizontal: 40,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, alignItems: 'center', marginBottom: 14,
  },
  btnSecondaryText: { fontSize: 16, fontWeight: '700', color: COLORS.accentGlow, letterSpacing: 3, fontFamily: 'monospace' },
  menuHint: { fontSize: 11, color: COLORS.muted, letterSpacing: 3, marginTop: 8, fontFamily: 'monospace' },

  corner: { position: 'absolute', width: 20, height: 20 },
  cornerH: { position: 'absolute', top: 0, left: 0, width: 20, height: 2, backgroundColor: COLORS.accentGlow, opacity: 0.6 },
  cornerV: { position: 'absolute', top: 0, left: 0, width: 2, height: 20, backgroundColor: COLORS.accentGlow, opacity: 0.6 },

  // HUD
  hud: {
    backgroundColor: COLORS.panel,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
  },
  hudLeft: { flex: 1, alignItems: 'flex-start' },
  hudCenter: { flex: 2, alignItems: 'center' },
  hudRight: { flex: 1, alignItems: 'flex-end' },
  hudLabel: { fontSize: 9, letterSpacing: 3, color: COLORS.muted, fontFamily: 'monospace' },
  hudValue: { fontSize: 20, fontWeight: '900', color: COLORS.text, fontFamily: 'monospace' },
  hudScore: { fontSize: 22, fontWeight: '900', color: COLORS.accentGlow, fontFamily: 'monospace' },
  comboText: { fontSize: 11, color: COLORS.gold, fontFamily: 'monospace', letterSpacing: 2 },
  hpRow: { flexDirection: 'row', width: '100%', justifyContent: 'center', marginTop: 4, gap: 4 },

  // Grid
  grid: { flex: 1, backgroundColor: COLORS.void },
  gridRow: { flexDirection: 'row' },
  cell: { width: CELL_SIZE, height: CELL_SIZE, justifyContent: 'center', alignItems: 'center' },
  playerCell: { width: CELL_SIZE - 2, height: CELL_SIZE - 2, justifyContent: 'center', alignItems: 'center' },
  playerEmoji: { fontSize: CELL_SIZE - 6 },
  droneCell: { justifyContent: 'center', alignItems: 'center' },
  tankCell: { justifyContent: 'center', alignItems: 'center' },
  enemyEmoji: { fontSize: CELL_SIZE - 8 },
  bulletP: { width: 4, height: 10, backgroundColor: COLORS.accentGlow, borderRadius: 2, shadowColor: COLORS.accentGlow, shadowRadius: 4, shadowOpacity: 1 },
  bulletE: { width: 4, height: 10, backgroundColor: COLORS.danger, borderRadius: 2, shadowColor: COLORS.danger, shadowRadius: 4, shadowOpacity: 1 },
  explosionCell: { justifyContent: 'center', alignItems: 'center' },
  wallCell: { width: CELL_SIZE - 2, height: CELL_SIZE - 2, backgroundColor: '#1e1e3a', borderRadius: 3, borderWidth: 1, borderColor: COLORS.border },
  puCell: { justifyContent: 'center', alignItems: 'center' },

  // Controls
  controls: {
    backgroundColor: COLORS.panel, borderTopWidth: 1, borderTopColor: COLORS.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  dpad: { alignItems: 'center' },
  dpadMiddle: { flexDirection: 'row', alignItems: 'center' },
  dpadBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(124,58,237,0.15)', borderWidth: 1, borderColor: COLORS.border },
  dpadUp: { marginBottom: 4 },
  dpadDown: { marginTop: 4 },
  dpadLeft: { marginRight: 4 },
  dpadRight: { marginLeft: 4 },
  dpadCenter: { width: 48, height: 48 },
  dpadTxt: { fontSize: 20, color: COLORS.accentGlow },

  actionBtns: { gap: 12 },
  shootBtn: { borderRadius: 12, overflow: 'hidden' },
  shootBtnGrad: { width: 80, height: 70, justifyContent: 'center', alignItems: 'center' },
  shootBtnTxt: { fontSize: 13, fontWeight: '900', color: '#fff', textAlign: 'center', fontFamily: 'monospace' },
  bombBtn: { width: 80, height: 58, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.1)' },
  bombBtnTxt: { fontSize: 13, fontWeight: '900', color: COLORS.danger, textAlign: 'center', fontFamily: 'monospace' },

  // Game Over
  gameOverCard: {
    backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 20, padding: 32, alignItems: 'center', width: W * 0.85,
  },
  gameOverEmoji: { fontSize: 56, marginBottom: 12 },
  gameOverTitle: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: 6, fontFamily: 'monospace', marginBottom: 20 },
  gameOverStats: { width: '100%', marginBottom: 24, gap: 8 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  statLabel: { fontSize: 12, letterSpacing: 3, color: COLORS.muted, fontFamily: 'monospace' },
  statVal: { fontSize: 20, fontWeight: '900', color: COLORS.accentGlow, fontFamily: 'monospace' },

  // High Scores
  hsHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 16 },
  backBtnTxt: { color: COLORS.accentGlow, fontFamily: 'monospace', fontSize: 13 },
  hsTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, letterSpacing: 6, fontFamily: 'monospace' },
  hsList: { padding: 20, gap: 10 },
  noScores: { color: COLORS.muted, fontFamily: 'monospace', textAlign: 'center', marginTop: 40, fontSize: 14 },
  hsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 14, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.05)', borderWidth: 1, borderColor: COLORS.border },
  hsRowFirst: { borderColor: COLORS.gold, backgroundColor: 'rgba(245,158,11,0.08)' },
  hsRank: { fontSize: 16, width: 36, textAlign: 'center' },
  hsScore: { fontSize: 20, fontWeight: '900', color: COLORS.accentGlow, fontFamily: 'monospace', flex: 1 },
  hsLevel: { fontSize: 12, color: COLORS.muted, fontFamily: 'monospace' },
  hsDate: { fontSize: 11, color: COLORS.muted, fontFamily: 'monospace' },
});
