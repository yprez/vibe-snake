#!/usr/bin/env node
// Benchmark the autopilot AI by simulating many full games headlessly.
//
//   node tools/ai-sim.mjs [games] [capTicks]
//
// It extracts the live ai* functions straight out of index.html and runs them in
// a vm sandbox, so it always tests the shipped autopilot (no drift). It reports,
// per board and mode, how often the snake dies, how often it survives to the tick
// cap, how often it wins (fills the board), and the average/biggest length it
// reaches. Boards are deliberately small and tight: games end fast (so the run is
// quick) and the snake fills a large share of the board, which is the stress case
// where a weak autopilot traps itself.
//
// Mirrors the game's grid, movement, growth queue, and collision rules. No deps.
// (The autopilot is the unbeatable-demo selling point, so changes to aiNextDir
// and friends should be re-benchmarked here before shipping.)
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

const INDEX = path.join(import.meta.dirname, "..", "index.html");
const GAMES = Math.max(1, Number(process.argv[2]) || 40);
const CAP = Math.max(200, Number(process.argv[3]) || 1200);
const START_LEN = 4, FOOD_GROW = 1;
const MODES = { classic:{wrap:false,maze:false}, wrap:{wrap:true,maze:false}, maze:{wrap:false,maze:true} };

// Pull the live autopilot (every function from aiNeighbors up to demoTick) out of
// the single file, so this benchmark tracks index.html automatically.
const html = readFileSync(INDEX, "utf8");
const lo = html.indexOf("function aiNeighbors"), hi = html.indexOf("function demoTick");
if (lo < 0 || hi < 0 || hi < lo) { console.error("could not locate the ai* functions in index.html"); process.exit(1); }
const aiSrc = html.slice(lo, hi);

// Shared sandbox: the ai* functions read these as globals; the harness mutates
// them in place each tick.
const ctx = vm.createContext({
  MODES, FOOD_GROW, bonusGrow: () => 0,
  COLS: 0, ROWS: 0, snake: [], food: null, bonus: null, obstacles: {}, pendingGrow: 0, dir: { x: 1, y: 0 }, currentMode: "classic",
});
vm.runInContext(aiSrc + "\nglobalThis.aiNextDir = aiNextDir;", ctx);

function mulberry32(s){ return function(){ s|=0; s=s+0x6D2B79F5|0; var t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }
function buildMaze(){ ctx.obstacles = {}; var blocks=[[0.25,0.3],[0.75,0.3],[0.5,0.5],[0.25,0.7],[0.75,0.7]];
  for (var i=0;i<blocks.length;i++){ var cx=Math.floor(blocks[i][0]*ctx.COLS), cy=Math.floor(blocks[i][1]*ctx.ROWS);
    for (var dx=-1;dx<=1;dx++) ctx.obstacles[(cx+dx)+","+cy]=1; } }
function placeFood(rnd){ var occ={}; for (var i=0;i<ctx.snake.length;i++) occ[ctx.snake[i].x+","+ctx.snake[i].y]=1; for (var k in ctx.obstacles) occ[k]=1;
  var cells=[]; for (var y=0;y<ctx.ROWS;y++) for (var x=0;x<ctx.COLS;x++){ var kk=x+","+y; if(!occ[kk]) cells.push({x:x,y:y}); }
  if(!cells.length){ ctx.food=null; return false; } ctx.food = cells[(rnd()*cells.length)|0]; return true; }

function runGame(cols, rows, maze, seed){
  ctx.COLS=cols; ctx.ROWS=rows; ctx.currentMode = maze?"maze":"classic"; ctx.obstacles={}; if(maze) buildMaze();
  var rnd = mulberry32(seed);
  ctx.snake=[]; var mx=cols>>1, my=rows>>1; for(var i=0;i<START_LEN;i++) ctx.snake.push({x:mx-i,y:my});
  for (var s=0;s<ctx.snake.length;s++) delete ctx.obstacles[ctx.snake[s].x+","+ctx.snake[s].y];
  ctx.dir={x:1,y:0}; ctx.pendingGrow=0; ctx.bonus=null; placeFood(rnd);
  var ticks=0, died=false, won=false, maxLen=ctx.snake.length;
  for(; ticks<CAP; ticks++){
    if(!ctx.food){ won=true; break; }
    var d = ctx.aiNextDir(); if(d) ctx.dir=d;
    var wrap = MODES[ctx.currentMode].wrap;
    var nx=ctx.snake[0].x+ctx.dir.x, ny=ctx.snake[0].y+ctx.dir.y;
    if(wrap){ nx=(nx+cols)%cols; ny=(ny+rows)%rows; }
    if(!wrap && (nx<0||ny<0||nx>=cols||ny>=rows)){ died=true; break; }
    if(ctx.obstacles[nx+","+ny]){ died=true; break; }
    var willGrow = ctx.pendingGrow>0, hit=false, tailIdx=ctx.snake.length-1;
    for(var i2=0;i2<ctx.snake.length;i2++){ if(i2===tailIdx && !willGrow) continue; if(ctx.snake[i2].x===nx&&ctx.snake[i2].y===ny){ hit=true; break; } }
    if(hit){ died=true; break; }
    ctx.snake.unshift({x:nx,y:ny});
    var ate = (ctx.food && nx===ctx.food.x && ny===ctx.food.y);
    if(ate) ctx.pendingGrow += FOOD_GROW;
    if(ctx.pendingGrow>0){ ctx.pendingGrow--; } else { ctx.snake.pop(); }
    if(ctx.snake.length>maxLen) maxLen=ctx.snake.length;
    if(ate){ if(!placeFood(rnd)){ won=true; break; } }
  }
  return { died, won, maxLen, ticks };
}

function bench(cols, rows, maze, name){
  var deaths=0, wins=0, timeouts=0, sumLen=0, maxLen=0;
  for(var g=0; g<GAMES; g++){ var r=runGame(cols, rows, maze, g+1);
    if(r.died) deaths++; else if(r.won) wins++; else timeouts++;
    sumLen+=r.maxLen; if(r.maxLen>maxLen) maxLen=r.maxLen; }
  var rate = deaths/GAMES;
  console.log(`  ${name.padEnd(14)} deaths ${String(deaths).padStart(3)}/${GAMES} (${(100*rate).toFixed(1).padStart(5)}%)  survived ${String(timeouts).padStart(3)}  wins ${String(wins).padStart(3)}  avgMaxLen ${(sumLen/GAMES).toFixed(1).padStart(6)}  maxLen ${maxLen}`);
  return rate;
}

console.log(`autopilot benchmark: ${GAMES} games/config, ${CAP} tick cap\n`);
var worst = 0;
for (const [cols,rows,maze,name] of [[13,9,false,"classic 13x9"],[11,11,false,"classic 11x11"],[15,11,true,"maze 15x11"]]){
  worst = Math.max(worst, bench(cols, rows, maze, name));
}
// Regression guard: even on tight boards the autopilot should almost never die.
console.log("");
if (worst > 0.10){ console.error(`FAIL: autopilot death rate ${(100*worst).toFixed(1)}% exceeds 10%`); process.exit(1); }
console.log("OK: autopilot death rate within bounds");
